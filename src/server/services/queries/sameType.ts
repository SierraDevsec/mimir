import { getDb } from "../../db.js";
import { safeQuery, type AgentRow } from "./types.js";

/**
 * Get completed agents with the same agent_type from any session.
 * Helps agents learn from predecessors with similar roles.
 */
export async function getSameTypeAgents(
  agentType: string,
  sessionId: string,
  parentAgentId: string | null
): Promise<AgentRow[]> {
  const db = await getDb();
  return safeQuery<AgentRow>("same-type", () => db.all(
    `SELECT agent_name, context_summary, session_id
     FROM agents
     WHERE agent_type = ? AND status = 'completed' AND context_summary IS NOT NULL
       AND id NOT IN (
         SELECT id FROM agents WHERE session_id = ? AND parent_agent_id = ?
       )
     ORDER BY completed_at DESC
     LIMIT 3`,
    agentType, sessionId, parentAgentId ?? ""
  ));
}
