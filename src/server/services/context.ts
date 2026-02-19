import { getDb, extractCount, toVarcharArraySql } from "../db.js";

export async function addContextEntry(
  sessionId: string,
  agentId: string | null,
  entryType: string,
  content: string,
  tags: string[] | null
): Promise<void> {
  const db = await getDb();
  // DuckDB does not support bind parameters for VARCHAR[] literals.
  // toVarcharArraySql() produces a safe literal via escapeForVarcharArray()
  // (strips NUL/control chars, escapes backslashes and single-quotes).
  const tagsSql = tags && tags.length > 0 ? toVarcharArraySql(tags) : "NULL";
  await db.run(
    `INSERT INTO context_entries (session_id, agent_id, entry_type, content, tags)
     VALUES (?, ?, ?, ?, ${tagsSql})`,
    sessionId, agentId, entryType, content
  );
}

export async function getContextBySession(sessionId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM context_entries WHERE session_id = ? ORDER BY created_at DESC`,
    sessionId
  );
}

export async function getContextByAgent(agentId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM context_entries WHERE agent_id = ? ORDER BY created_at DESC`,
    agentId
  );
}

export async function getContextByType(sessionId: string, entryType: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM context_entries WHERE session_id = ? AND entry_type = ? ORDER BY created_at DESC`,
    sessionId, entryType
  );
}

export async function getRecentContext(sessionId: string, limit: number = 20) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM context_entries WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
    sessionId, limit
  );
}

export async function getCrossSessionContext(sessionId: string, limit: number = 10) {
  const db = await getDb();
  return db.all(
    `SELECT ce.*, s.id as source_session_id
     FROM context_entries ce
     JOIN sessions s ON ce.session_id = s.id
     WHERE s.project_id IN (SELECT project_id FROM sessions WHERE id = ?)
       AND ce.session_id != ?
     ORDER BY ce.created_at DESC
     LIMIT ?`,
    sessionId, sessionId, limit
  );
}

/** Delete context entries by type. Returns count of deleted rows.
 *  Uses DELETE ... RETURNING for atomicity (single query instead of COUNT + DELETE). */
export async function deleteContextByType(sessionId: string, entryType: string): Promise<number> {
  const db = await getDb();
  const result = await db.all(
    `DELETE FROM context_entries WHERE session_id = ? AND entry_type = ? RETURNING id`,
    sessionId, entryType
  );
  return result.length;
}

export async function getTotalContextEntriesCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM context_entries`);
  return extractCount(result);
}

export async function getContextEntriesCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(
    `SELECT COUNT(*) as count FROM context_entries
     JOIN sessions ON context_entries.session_id = sessions.id
     WHERE sessions.project_id = ?`,
    projectId
  );
  return extractCount(result);
}
