import { getDb, extractCount } from "../db.js";

export interface AgentRow {
  id: string;
  session_id: string;
  agent_name: string;
  agent_type: string | null;
  parent_agent_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  context_summary: string | null;
  input_tokens: number;
  output_tokens: number;
}

export async function startAgent(
  id: string,
  sessionId: string,
  agentName: string,
  agentType: string | null,
  parentAgentId: string | null
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO agents (id, session_id, agent_name, agent_type, parent_agent_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET status = 'active', started_at = now()`,
    id, sessionId, agentName, agentType, parentAgentId
  );
}

export async function stopAgent(
  id: string,
  contextSummary: string | null,
  inputTokens?: number,
  outputTokens?: number
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE agents SET
       status = 'completed',
       completed_at = now(),
       context_summary = ?,
       input_tokens = COALESCE(?, input_tokens),
       output_tokens = COALESCE(?, output_tokens)
     WHERE id = ?`,
    contextSummary, inputTokens ?? null, outputTokens ?? null, id
  );
}

export async function updateAgentSummary(id: string, contextSummary: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE agents SET context_summary = ? WHERE id = ?`,
    contextSummary, id
  );
}

export async function getAgent(id: string): Promise<AgentRow | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM agents WHERE id = ?`, id) as AgentRow[];
  return rows[0] ?? null;
}

export async function getAgentsBySession(sessionId: string): Promise<AgentRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT * FROM agents WHERE session_id = ? ORDER BY started_at DESC`, sessionId
  ) as Promise<AgentRow[]>;
}

export async function getActiveAgents(): Promise<AgentRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM agents WHERE status = 'active' ORDER BY started_at DESC`) as Promise<AgentRow[]>;
}

export async function getAllAgents(): Promise<AgentRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM agents ORDER BY started_at DESC`) as Promise<AgentRow[]>;
}

export async function getTotalAgentsCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM agents`);
  return extractCount(result);
}

export async function getActiveAgentsCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM agents WHERE status = 'active'`);
  return extractCount(result);
}

export async function deleteAgent(id: string): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM activity_log WHERE agent_id = ?`, id);
  await db.run(`DELETE FROM context_entries WHERE agent_id = ?`, id);
  await db.run(`DELETE FROM file_changes WHERE agent_id = ?`, id);
  await db.run(`DELETE FROM agents WHERE id = ?`, id);
}

export async function getAgentsByProject(projectId: string): Promise<AgentRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT agents.* FROM agents
     JOIN sessions ON agents.session_id = sessions.id
     WHERE sessions.project_id = ?
     ORDER BY agents.started_at DESC`,
    projectId
  ) as Promise<AgentRow[]>;
}

export async function getActiveAgentsByProject(projectId: string): Promise<AgentRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT agents.* FROM agents
     JOIN sessions ON agents.session_id = sessions.id
     WHERE sessions.project_id = ? AND agents.status = 'active'
     ORDER BY agents.started_at DESC`,
    projectId
  ) as Promise<AgentRow[]>;
}

export async function getAgentsCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(
    `SELECT COUNT(*) as count FROM agents
     JOIN sessions ON agents.session_id = sessions.id
     WHERE sessions.project_id = ?`,
    projectId
  );
  return extractCount(result);
}

export async function getActiveAgentsCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(
    `SELECT COUNT(*) as count FROM agents
     JOIN sessions ON agents.session_id = sessions.id
     WHERE sessions.project_id = ? AND agents.status = 'active'`,
    projectId
  );
  return extractCount(result);
}
