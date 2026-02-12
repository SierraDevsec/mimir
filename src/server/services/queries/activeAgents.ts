import { getDb } from "../../db.js";
import { safeQuery, type AgentRow } from "./types.js";

/**
 * Get currently active agents in the session.
 * Used for project context to show who is working.
 */
export async function getActiveAgents(sessionId: string): Promise<AgentRow[]> {
  const db = await getDb();
  return safeQuery<AgentRow>("prompt-agents", () => db.all(
    `SELECT agent_name, agent_type, started_at
     FROM agents
     WHERE session_id = ? AND status = 'active'
     ORDER BY started_at DESC`,
    sessionId
  ));
}
