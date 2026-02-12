import { getDb } from "../../db.js";
import { safeQuery, type AgentRow } from "./types.js";

/**
 * Get completed agents from current session with their summaries.
 * Used for project context to show what work has been done.
 */
export async function getCompletedAgents(
  sessionId: string,
  limit: number = 5
): Promise<AgentRow[]> {
  const db = await getDb();
  return safeQuery<AgentRow>("prompt-completed", () => db.all(
    `SELECT agent_name, context_summary
     FROM agents
     WHERE session_id = ? AND status = 'completed' AND context_summary IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT ?`,
    sessionId, limit
  ));
}
