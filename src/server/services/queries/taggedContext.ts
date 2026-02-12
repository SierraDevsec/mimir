import { getDb } from "../../db.js";
import { safeQuery, type ContextRow } from "./types.js";

/**
 * Get context entries from current session that are tagged for this agent.
 * Uses DuckDB's list_contains() to match agent name, type, or 'all' tag.
 * Also includes important entry types (decision, blocker, handoff).
 */
export async function getTaggedContext(
  sessionId: string,
  agentName: string,
  agentType: string | null
): Promise<ContextRow[]> {
  const db = await getDb();
  const tagParams = [sessionId, agentName, agentType ?? ""];

  return safeQuery<ContextRow>("tagged", () => db.all(
    `SELECT entry_type, content, tags
     FROM context_entries
     WHERE session_id = ?
       AND (
         (tags IS NOT NULL AND (list_contains(tags, ?) OR list_contains(tags, ?) OR list_contains(tags, 'all')))
         OR entry_type IN ('decision', 'blocker', 'handoff')
       )
     ORDER BY created_at DESC
     LIMIT 5`,
    ...tagParams
  ));
}
