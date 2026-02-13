import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { getDb } from "../db.js";
import { registerAgent } from "./registry.js";

const execFileAsync = promisify(execFile);

/** All tmux commands use a dedicated socket so mimir sessions are isolated */
const TMUX_SOCKET = "mimir";

export interface TmuxSession {
  session_name: string;
  project_id: string;
  status: string;
  created_at: string;
}

export interface TmuxPane {
  id: number;
  pane_id: string;
  session_name: string;
  window_id: string | null;
  agent_name: string | null;
  status: string;
  created_at: string;
}

/**
 * Create a new tmux session for a project.
 * Session name format: mimir-{project_id}
 */
export async function createTmuxSession(projectId: string): Promise<string> {
  const sessionName = `mimir-${projectId}`;
  const db = await getDb();

  // Check if session already exists (active or inactive)
  const existing = await db.all(
    `SELECT session_name, status FROM tmux_sessions WHERE session_name = ?`,
    sessionName
  );

  if (existing.length > 0) {
    const status = (existing[0] as { status: string }).status;
    if (status === 'active') {
      throw new Error(`Tmux session "${sessionName}" already exists`);
    }
    // Delete inactive session to reuse the name
    await db.run(`DELETE FROM tmux_sessions WHERE session_name = ?`, sessionName);
    await db.run(`DELETE FROM tmux_panes WHERE session_name = ?`, sessionName);
  }

  // Create tmux session (detached)
  try {
    await execFileAsync("tmux", [
      "-L", TMUX_SOCKET,
      "new-session",
      "-d",
      "-s",
      sessionName,
      "-n",
      "main",
    ]);
  } catch (error) {
    throw new Error(`Failed to create tmux session: ${error}`);
  }

  // Store in DB
  await db.run(
    `INSERT INTO tmux_sessions (session_name, project_id) VALUES (?, ?)`,
    sessionName,
    projectId
  );

  return sessionName;
}

/**
 * Create a new pane in a tmux session and optionally start a Claude session.
 */
export async function createPane(
  sessionName: string,
  agentName?: string,
  startClaude = false,
  skipPermissions = false
): Promise<string> {
  const db = await getDb();

  // Split window to create new pane
  try {
    const { stdout } = await execFileAsync("tmux", [
      "-L", TMUX_SOCKET,
      "split-window",
      "-t",
      `${sessionName}:main`,
      "-h",
      "-P",
      "-F",
      "#{pane_id}",
    ]);

    const paneId = stdout.trim();

    // Get window ID
    const { stdout: windowStdout } = await execFileAsync("tmux", [
      "-L", TMUX_SOCKET,
      "display-message",
      "-t",
      paneId,
      "-p",
      "#{window_id}",
    ]);
    const windowId = windowStdout.trim();

    // Store in DB
    await db.run(
      `INSERT INTO tmux_panes (pane_id, session_name, window_id, agent_name)
       VALUES (?, ?, ?, ?)`,
      paneId,
      sessionName,
      windowId,
      agentName ?? null
    );

    // Start Claude session if requested
    if (startClaude && agentName) {
      await startClaudeSession(paneId, agentName, sessionName, skipPermissions);
    }

    return paneId;
  } catch (error) {
    throw new Error(`Failed to create pane: ${error}`);
  }
}

/**
 * Start a Claude Code session in a tmux pane with agent-specific environment.
 */
export async function startClaudeSession(
  paneId: string,
  agentName: string,
  sessionName: string,
  skipPermissions = false
): Promise<void> {
  const db = await getDb();

  // Extract project_id from session_name (format: mimir-{project_id})
  const result = await db.all(
    `SELECT project_id FROM tmux_sessions WHERE session_name = ?`,
    sessionName
  );

  if (result.length === 0) {
    throw new Error(`Session ${sessionName} not found`);
  }

  const projectId = (result[0] as { project_id: string }).project_id;

  // Get project path from DB (try id first, then name as fallback)
  const projectResult = await db.all(
    `SELECT path FROM projects WHERE id = ? OR name = ?`,
    projectId,
    projectId
  );

  if (projectResult.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }

  const projectPath = (projectResult[0] as { path: string }).path;

  // Send command to pane
  // Change to project directory, set environment variables, and start claude session
  const claudeCmd = skipPermissions ? `claude --dangerously-skip-permissions` : `claude`;
  const command = [
    `cd "${projectPath}"`,
    `unset CLAUDECODE`,
    `export MIMIR_AGENT_NAME="${agentName}"`,
    `export MIMIR_PROJECT_ID="${projectId}"`,
    claudeCmd,
  ].join(" && ");

  try {
    execFileSync("tmux", ["-L", TMUX_SOCKET, "send-keys", "-t", paneId, "-l", command], {
      timeout: 3000,
    });
    execFileSync("tmux", ["-L", TMUX_SOCKET, "send-keys", "-t", paneId, "Enter"], {
      timeout: 3000,
    });

    // Register agent with the pane
    await registerAgent(agentName, projectId, paneId, null);
  } catch (error) {
    throw new Error(`Failed to start Claude session: ${error}`);
  }
}

/**
 * Kill a tmux pane and mark it as inactive in DB.
 */
export async function killPane(paneId: string): Promise<void> {
  const db = await getDb();

  try {
    await execFileAsync("tmux", ["-L", TMUX_SOCKET, "kill-pane", "-t", paneId]);

    // Mark as inactive in DB
    await db.run(
      `UPDATE tmux_panes SET status = 'inactive' WHERE pane_id = ?`,
      paneId
    );
  } catch (error) {
    throw new Error(`Failed to kill pane: ${error}`);
  }
}

/**
 * Kill a tmux session and all its panes.
 */
export async function killSession(sessionName: string): Promise<void> {
  const db = await getDb();

  // Try to kill tmux session (ignore if session doesn't exist)
  try {
    await execFileAsync("tmux", ["-L", TMUX_SOCKET, "kill-session", "-t", sessionName]);
  } catch (error) {
    // Session may not exist in tmux, but we still need to clean up DB
    console.warn(`[tmux] Session ${sessionName} not found in tmux, cleaning up DB only`);
  }

  // Always mark session and panes as inactive in DB
  await db.run(
    `UPDATE tmux_sessions SET status = 'inactive' WHERE session_name = ?`,
    sessionName
  );
  await db.run(
    `UPDATE tmux_panes SET status = 'inactive' WHERE session_name = ?`,
    sessionName
  );

  // Get agent names belonging to this tmux session
  const panes = await db.all(
    `SELECT agent_name FROM tmux_panes WHERE session_name = ? AND agent_name IS NOT NULL`,
    sessionName
  ) as Array<{ agent_name: string }>;
  const agentNames = panes.map(p => p.agent_name);

  // Mark only these agents as inactive in registry
  const session = await db.all(
    `SELECT project_id FROM tmux_sessions WHERE session_name = ?`,
    sessionName
  );
  if (session.length > 0) {
    const projectId = (session[0] as { project_id: string }).project_id;

    for (const name of agentNames) {
      await db.run(
        `UPDATE agent_registry SET status = 'inactive'
         WHERE agent_name = ? AND project_id = ?`,
        name, projectId
      );
    }

    // End only Claude sessions that contain agents from this tmux session
    if (agentNames.length > 0) {
      const placeholders = agentNames.map(() => "?").join(",");
      // Find session IDs that have matching agents
      const matchingSessions = await db.all(
        `SELECT DISTINCT session_id FROM agents
         WHERE agent_name IN (${placeholders})
           AND session_id IN (SELECT id FROM sessions WHERE project_id = ? AND status = 'active')
           AND status = 'active'`,
        ...agentNames, projectId
      ) as Array<{ session_id: string }>;

      const sessionIds = matchingSessions.map(s => s.session_id);

      if (sessionIds.length > 0) {
        const sPlaceholders = sessionIds.map(() => "?").join(",");
        await db.run(
          `UPDATE agents SET status = 'completed', completed_at = now()
           WHERE session_id IN (${sPlaceholders}) AND status = 'active'`,
          ...sessionIds
        );
        await db.run(
          `UPDATE sessions SET status = 'ended', ended_at = now()
           WHERE id IN (${sPlaceholders})`,
          ...sessionIds
        );
      }
    }
  }
}

/**
 * List all panes in a session.
 */
export async function listPanes(sessionName?: string): Promise<TmuxPane[]> {
  const db = await getDb();

  if (sessionName) {
    return (await db.all(
      `SELECT * FROM tmux_panes WHERE session_name = ? AND status = 'active' ORDER BY created_at`,
      sessionName
    )) as TmuxPane[];
  }

  return (await db.all(
    `SELECT * FROM tmux_panes WHERE status = 'active' ORDER BY created_at`
  )) as TmuxPane[];
}

/**
 * List all tmux sessions.
 */
export async function listSessions(projectId?: string): Promise<TmuxSession[]> {
  const db = await getDb();

  if (projectId) {
    return (await db.all(
      `SELECT * FROM tmux_sessions WHERE project_id = ? AND status = 'active' ORDER BY created_at`,
      projectId
    )) as TmuxSession[];
  }

  return (await db.all(
    `SELECT * FROM tmux_sessions WHERE status = 'active' ORDER BY created_at`
  )) as TmuxSession[];
}

/**
 * Get a specific pane by ID.
 */
export async function getTmuxPane(paneId: string): Promise<TmuxPane | null> {
  const db = await getDb();
  const result = await db.all(
    `SELECT * FROM tmux_panes WHERE pane_id = ?`,
    paneId
  );
  return result.length > 0 ? (result[0] as TmuxPane) : null;
}

/**
 * Get a specific session by name.
 */
export async function getTmuxSession(
  sessionName: string
): Promise<TmuxSession | null> {
  const db = await getDb();
  const result = await db.all(
    `SELECT * FROM tmux_sessions WHERE session_name = ?`,
    sessionName
  );
  return result.length > 0 ? (result[0] as TmuxSession) : null;
}
