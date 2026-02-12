import { getDb } from "../../db.js";
import { safeQuery, type AgentRow } from "./types.js";

/**
 * Get completed sibling agents (same parent, same session).
 * Most relevant context for a new agent - shows what parallel agents did.
 */
export async function getSiblingAgents(
  sessionId: string,
  parentAgentId: string
): Promise<AgentRow[]> {
  const db = await getDb();
  return safeQuery<AgentRow>("siblings", () => db.all(
    `SELECT agent_name, agent_type, context_summary
     FROM agents
     WHERE session_id = ? AND parent_agent_id = ? AND status = 'completed' AND context_summary IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT 5`,
    sessionId, parentAgentId
  ));
}
