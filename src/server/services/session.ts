import { getDb, extractCount } from "../db.js";

export async function startSession(id: string, projectId: string | null): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO sessions (id, project_id) VALUES (?, ?)
     ON CONFLICT (id) DO UPDATE SET status = 'active', started_at = now(),
       project_id = COALESCE(EXCLUDED.project_id, sessions.project_id)`,
    id, projectId
  );
}

export async function endSession(id: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE sessions SET status = 'ended', ended_at = now() WHERE id = ?`, id
  );
  await db.run(
    `UPDATE agents SET status = 'completed', completed_at = now()
     WHERE session_id = ? AND status = 'active'`, id
  );
}

export async function getActiveSessions() {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC`);
}

export async function getAllSessions() {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions ORDER BY started_at DESC`);
}

export async function getSession(id: string) {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM sessions WHERE id = ?`, id);
  return rows[0] ?? null;
}

export async function getTotalSessionsCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM sessions`);
  return extractCount(result);
}

export async function getActiveSessionsCount() {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM sessions WHERE status = 'active'`);
  return extractCount(result);
}

export async function getSessionsByProject(projectId: string) {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC`, projectId);
}

export async function getActiveSessionsByProject(projectId: string) {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE project_id = ? AND status = 'active' ORDER BY started_at DESC`, projectId);
}

export async function getSessionsCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM sessions WHERE project_id = ?`, projectId);
  return extractCount(result);
}

export async function getActiveSessionsCountByProject(projectId: string) {
  const db = await getDb();
  const result = await db.all(`SELECT COUNT(*) as count FROM sessions WHERE project_id = ? AND status = 'active'`, projectId);
  return extractCount(result);
}
