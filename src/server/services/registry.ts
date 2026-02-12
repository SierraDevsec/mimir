import { getDb } from "../db.js";

export async function registerAgent(
  agentName: string,
  projectId: string,
  tmuxPane: string | null,
  sessionId: string | null = null
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO agent_registry (agent_name, project_id, tmux_pane, session_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (agent_name, project_id)
     DO UPDATE SET tmux_pane = EXCLUDED.tmux_pane,
                   session_id = EXCLUDED.session_id,
                   status = 'active',
                   last_seen_at = now()`,
    agentName, projectId, tmuxPane, sessionId
  );
}

export async function unregisterAgent(
  agentName: string,
  projectId: string
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE agent_registry SET status = 'inactive'
     WHERE agent_name = ? AND project_id = ?`,
    agentName, projectId
  );
}

export async function getAgentPane(
  agentName: string,
  projectId: string
): Promise<string | null> {
  const db = await getDb();
  const result = await db.all(
    `SELECT tmux_pane FROM agent_registry
     WHERE agent_name = ? AND project_id = ? AND status = 'active'`,
    agentName, projectId
  );
  return (result[0] as { tmux_pane: string } | undefined)?.tmux_pane ?? null;
}

export async function getRegisteredAgents(projectId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM agent_registry WHERE project_id = ? AND status = 'active'
     ORDER BY last_seen_at DESC`,
    projectId
  );
}

export async function deleteRegistration(
  agentName: string,
  projectId: string
): Promise<boolean> {
  const db = await getDb();
  const result = await db.all(
    `DELETE FROM agent_registry
     WHERE agent_name = ? AND project_id = ?
     RETURNING agent_name`,
    agentName, projectId
  );
  return result.length > 0;
}
