import { getDb } from "../../db.js";
import { safeQuery, type ContextRow } from "./types.js";

/**
 * Get recent decisions, blockers, and handoffs from current session.
 * Used for project context to show important project decisions.
 */
export async function getDecisions(
  sessionId: string,
  limit: number = 5
): Promise<ContextRow[]> {
  const db = await getDb();
  return safeQuery<ContextRow>("prompt-decisions", () => db.all(
    `SELECT entry_type, content
     FROM context_entries
     WHERE session_id = ?
       AND entry_type IN ('decision', 'blocker', 'handoff')
     ORDER BY created_at DESC
     LIMIT ?`,
    sessionId, limit
  ));
}
