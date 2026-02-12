import { getDb } from "../../db.js";
import { safeQuery, type ContextRow } from "./types.js";

export interface CrossSessionContext extends ContextRow {
  agent_name?: string;
}

/**
 * Get context entries from previous sessions in the same project.
 * Focuses on high-value entry types (summaries, decisions, blockers, handoffs).
 */
export async function getCrossSessionContext(
  sessionId: string
): Promise<CrossSessionContext[]> {
  const db = await getDb();
  return safeQuery<CrossSessionContext>("cross-session", () => db.all(
    `SELECT ce.entry_type, ce.content, ce.tags, a.agent_name
     FROM context_entries ce
     LEFT JOIN agents a ON ce.agent_id = a.id
     JOIN sessions s ON ce.session_id = s.id
     WHERE s.project_id IN (SELECT project_id FROM sessions WHERE id = ?)
       AND ce.session_id != ?
       AND ce.entry_type IN ('agent_summary', 'decision', 'blocker', 'handoff')
     ORDER BY ce.created_at DESC
     LIMIT 5`,
    sessionId, sessionId
  ));
}
