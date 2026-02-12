import { getDb } from "../../db.js";
import { safeQuery, type ContextRow } from "./types.js";

/**
 * Get recent context entries from current session (fallback).
 * Used when no specialized context is found (siblings, same-type, tagged).
 */
export async function getRecentContext(
  sessionId: string,
  limit: number = 5
): Promise<ContextRow[]> {
  const db = await getDb();
  return safeQuery<ContextRow>("recent-fallback", () => db.all(
    `SELECT entry_type, content
     FROM context_entries
     WHERE session_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    sessionId, limit
  ));
}
