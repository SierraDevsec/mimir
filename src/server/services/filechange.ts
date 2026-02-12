import { getDb, extractCount } from "../db.js";

export async function recordFileChange(
  sessionId: string,
  agentId: string | null,
  filePath: string,
  changeType: string
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO file_changes (session_id, agent_id, file_path, change_type)
     VALUES (?, ?, ?, ?)`,
    sessionId, agentId, filePath, changeType
  );
}

export async function getFileChangesBySession(sessionId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM file_changes WHERE session_id = ? ORDER BY created_at DESC`,
    sessionId
  );
}

export async function getFileChangesByAgent(agentId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM file_changes WHERE agent_id = ? ORDER BY created_at DESC`,
    agentId
  );
}

export async function getTotalFileChangesCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM file_changes`);
  return extractCount(result);
}

export async function getFileChangesCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(
    `SELECT COUNT(*) as count FROM file_changes
     JOIN sessions ON file_changes.session_id = sessions.id
     WHERE sessions.project_id = ?`,
    projectId
  );
  return extractCount(result);
}
