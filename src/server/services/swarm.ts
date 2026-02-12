import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db.js";
import { createTmuxSession, createPane, startClaudeSession, getTmuxSession, listPanes } from "./tmux.js";
import { sendMessage } from "./message.js";
export interface SwarmConfig {
  projectId: string;
  agents: Array<{ name: string; model: string; persona?: string }>;
  leaderModel?: string;
  initialTask?: string;
  skipPermissions?: boolean;
}

export interface SwarmSession {
  sessionName: string;
  projectId: string;
  agents: Array<{ name: string; model: string; paneId?: string }>;
  status: string;
  createdAt: string;
}

/**
 * Start a new swarm with multiple agents in tmux panes.
 */
export async function startSwarm(config: SwarmConfig): Promise<SwarmSession> {
  const { projectId, agents, leaderModel = "claude-opus-4-6", initialTask, skipPermissions = false } = config;

  // Register agent files in project .claude/ directory
  await registerAgentFiles(projectId, agents);

  // Create tmux session (this creates the first pane automatically)
  const sessionName = await createTmuxSession(projectId);

  // Wait for session to be fully created
  await new Promise(r => setTimeout(r, 500));

  // Get the first pane and start leader
  const firstPaneId = await getFirstPaneId(sessionName);

  // Register the first pane (auto-created by tmux) in DB so killSession can find it
  const db = await getDb();
  await db.run(
    `INSERT INTO tmux_panes (pane_id, session_name, agent_name) VALUES (?, ?, ?)`,
    firstPaneId, sessionName, "orchestrator"
  );

  await startClaudeSession(firstPaneId, "orchestrator", sessionName, skipPermissions);

  // Create agent panes (include leader in the list)
  const agentData: Array<{ name: string; model: string; paneId?: string }> = [
    { name: "orchestrator", model: leaderModel, paneId: firstPaneId },
  ];
  for (const agent of agents) {
    const paneId = await createPane(sessionName, agent.name, true, skipPermissions);
    agentData.push({ ...agent, paneId });
  }

  // Store swarm session info with agent models in DB
  await db.run(
    `UPDATE tmux_sessions SET agents_json = ? WHERE session_name = ?`,
    JSON.stringify(agentData),
    sessionName
  );

  // Wait for Claude sessions to initialize
  await new Promise(r => setTimeout(r, 3000));

  const agentNames = agents.map(a => a.name);
  const teamList = agents.map(a => `${a.name}(${getModelShortName(a.model)})`).join(", ");

  // Always send role instructions to each agent
  for (const agent of agents) {
    const otherAgents = agentNames.filter(a => a !== agent.name);
    const lines = [
      `[System] You are agent "${agent.name}" in an orchestrated team.`,
      ``,
      `Team: ${teamList}`,
      `Collaborators: ${otherAgents.join(", ")}`,
      ``,
      `Rules:`,
      `- When done, send a brief result summary to orchestrator via send_message`,
      `- Only message other agents when coordination is needed`,
      `- After reporting, use read_messages to check for follow-up instructions`,
      `- Always respond to incoming messages promptly`,
      ``,
      `IMPORTANT: Use mcp__clnode-messaging__send_message for ALL communication.`,
      `Plain text responses are NOT visible to other agents.`,
    ];
    if (initialTask) {
      lines.splice(1, 0, ``, `[Task Assignment] ${initialTask}`);
    }
    await sendMessage(projectId, "system", agent.name, lines.join("\n"), "high");
  }

  // Always send orchestrator role instructions
  const orchestratorLines = [
    `[System] You are the orchestrator. You MUST delegate tasks to your team agents.`,
    `DO NOT do the work yourself. Use send_message to assign work to agents.`,
    ``,
    `Team: ${teamList}`,
    ``,
    `Your role:`,
    `- Receive tasks from the user`,
    `- Break down and delegate subtasks to appropriate agents via send_message`,
    `- Use read_messages to check for agent reports`,
    `- Compile results and report back to the user via send_message (to_name: "user")`,
    `- After processing each message, check read_messages again for new ones`,
    ``,
    `NEVER do implementation or review work directly. Always delegate to agents.`,
  ];
  if (initialTask) {
    orchestratorLines.push(``, `[Current Task] ${initialTask}`);
  }
  await sendMessage(projectId, "system", "orchestrator", orchestratorLines.join("\n"), "high");

  return {
    sessionName,
    projectId,
    agents: agentData,
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get list of active swarm sessions.
 */
export async function listSwarmSessions(projectId?: string): Promise<SwarmSession[]> {
  const db = await getDb();

  let query = `
    SELECT
      ts.session_name,
      ts.project_id,
      ts.status,
      ts.agents_json,
      ts.created_at
    FROM tmux_sessions ts
    WHERE ts.status = 'active'
  `;

  const params: string[] = [];
  if (projectId) {
    query += ` AND ts.project_id = ?`;
    params.push(projectId);
  }

  query += ` ORDER BY ts.created_at DESC`;

  const sessions = await db.all(query, ...params) as Array<{
    session_name: string;
    project_id: string;
    status: string;
    agents_json: string | null;
    created_at: string;
  }>;

  // Get panes for each session
  const result: SwarmSession[] = [];
  for (const session of sessions) {
    // Try to get agents from stored JSON first
    let agents: Array<{ name: string; model: string; paneId?: string }> = [];

    if (session.agents_json) {
      try {
        agents = JSON.parse(session.agents_json);
      } catch (error) {
        console.warn(`Failed to parse agents_json for session ${session.session_name}:`, error);
      }
    }

    // Fallback to querying panes if JSON not available
    if (agents.length === 0) {
      const panes = await listPanes(session.session_name);
      agents = panes
        .filter(p => p.agent_name && p.agent_name !== "orchestrator")
        .map(p => ({
          name: p.agent_name!,
          model: "unknown",
          paneId: p.pane_id,
        }));
    }

    result.push({
      sessionName: session.session_name,
      projectId: session.project_id,
      agents,
      status: session.status,
      createdAt: session.created_at,
    });
  }

  return result;
}

/**
 * Get the first pane ID of a tmux session (the leader pane).
 * Uses tmux command directly to get the actual pane ID.
 */
async function getFirstPaneId(sessionName: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("tmux", [
      "list-panes",
      "-t",
      sessionName,
      "-F",
      "#{pane_id}",
    ]);

    const paneIds = stdout.trim().split("\n");
    if (paneIds.length === 0 || !paneIds[0]) {
      throw new Error(`No panes found in session ${sessionName}`);
    }

    return paneIds[0];
  } catch (error) {
    throw new Error(`Failed to get first pane ID: ${error}`);
  }
}

/**
 * Verify agent definition files exist and set up supporting files.
 * Agent .md files are expected to already exist (managed via Agent Definitions page).
 * Creates agent-memory directories, rules/team.md, and .mcp.json for selected agents.
 */
async function registerAgentFiles(
  projectId: string,
  agents: Array<{ name: string; model: string; persona?: string }>
): Promise<void> {
  // Get project path from DB
  const db = await getDb();
  const rows = await db.all(`SELECT path FROM projects WHERE id = ?`, projectId) as Array<{ path: string }>;
  if (rows.length === 0) return;
  const projectPath = rows[0].path;

  const claudeDir = path.join(projectPath, ".claude");
  const memoryDir = path.join(claudeDir, "agent-memory");
  const rulesDir = path.join(claudeDir, "rules");

  // Ensure rules directory exists
  fs.mkdirSync(rulesDir, { recursive: true });

  // Setup .mcp.json with clnode-messaging MCP server
  const mcpConfigPath = path.join(projectPath, ".mcp.json");
  const mcpServerPath = new URL("../../../src/mcp/server.ts", import.meta.url).pathname;

  let mcpConfig: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpConfigPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    } catch {
      // ignore parse errors
    }
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
  mcpConfig.mcpServers["clnode-messaging"] = {
    command: "npx",
    args: ["tsx", mcpServerPath],
    env: { CLNODE_PROJECT_ID: projectId },
  };

  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

  // Add MCP tool permissions to settings.local.json
  const settingsPath = path.join(claudeDir, "settings.local.json");
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      // ignore parse errors
    }
  }

  const mcpPermissions = [
    "mcp__clnode-messaging__send_message",
    "mcp__clnode-messaging__read_messages",
    "mcp__clnode-messaging__list_agents",
    "mcp__clnode-messaging__register_agent",
  ];

  const perms = (settings.permissions ?? {}) as { allow?: string[] };
  const existing = new Set(perms.allow ?? []);
  for (const perm of mcpPermissions) {
    existing.add(perm);
  }
  perms.allow = [...existing];
  settings.permissions = perms;

  // Auto-enable MCP servers from .mcp.json
  settings.enableAllProjectMcpServers = true;

  // Use headless statusline if available (no terminal output, POST to daemon only)
  const headlessScript = path.join(claudeDir, "statusline-headless.sh");
  if (fs.existsSync(headlessScript)) {
    settings.statusLine = { type: "command", command: headlessScript, padding: 0 };
  } else {
    settings.statusLine = { type: "command", command: "true", padding: 0 };
  }

  // Agent Teams required settings
  const env = (settings.env ?? {}) as Record<string, string>;
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  settings.env = env;
  settings.teammateMode = "tmux";

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  // Ensure agent-memory directories exist
  for (const agent of agents) {
    const agentMemDir = path.join(memoryDir, agent.name);
    const memFile = path.join(agentMemDir, "MEMORY.md");
    if (!fs.existsSync(memFile)) {
      fs.mkdirSync(agentMemDir, { recursive: true });
      fs.writeFileSync(memFile, `# ${agent.name} Memory\n\n<!-- Agent learnings will be recorded here -->\n`);
    }
  }

  // Generate rules/team.md with actual team structure
  const teamTree = agents
    .map(a => `├── ${a.name} (${getModelShortName(a.model)}) — ${a.persona || "agent"}`)
    .join("\n");

  const teamRules = [
    `# Orchestration Team Structure`,
    ``,
    `\`\`\``,
    `Leader (orchestrator / opus)`,
    teamTree,
    `\`\`\``,
    ``,
    `## Communication`,
    ``,
    `- Use \`mcp__clnode-messaging__send_message\` for all inter-agent messaging`,
    `- Report results to orchestrator when task is complete`,
    `- Only message other agents when coordination is needed`,
    ``,
  ].join("\n");

  fs.writeFileSync(path.join(rulesDir, "team.md"), teamRules);
}

/**
 * Get short model name (opus, sonnet, haiku).
 */
function getModelShortName(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("haiku")) return "haiku";
  return "sonnet";
}
