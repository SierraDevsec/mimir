import { getDb, extractCount } from "../db.js";

export async function startSession(id: string, projectId: string | null): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO sessions (id, project_id) VALUES (?, ?)
     ON CONFLICT (id) DO UPDATE SET status = 'active', started_at = now(), ended_at = NULL,
       project_id = COALESCE(EXCLUDED.project_id, sessions.project_id)`,
    id, projectId
  );
}

/** Reactivate a session that was auto-ended (sequential workflow pattern).
 *  Only updates status/ended_at — does NOT reset started_at. */
export async function reactivateSession(id: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE sessions SET status = 'active', ended_at = NULL WHERE id = ? AND status = 'ended'`,
    id
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

export interface SessionRow {
  id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
}

export async function getActiveSessions(): Promise<SessionRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC`) as Promise<SessionRow[]>;
}

export async function getAllSessions(): Promise<SessionRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions ORDER BY started_at DESC`) as Promise<SessionRow[]>;
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM sessions WHERE id = ?`, id) as SessionRow[];
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

export async function getSessionsByProject(projectId: string): Promise<SessionRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC`, projectId) as Promise<SessionRow[]>;
}

export async function getActiveSessionsByProject(projectId: string): Promise<SessionRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM sessions WHERE project_id = ? AND status = 'active' ORDER BY started_at DESC`, projectId) as Promise<SessionRow[]>;
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

export async function getProjectIdForSession(sessionId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT project_id FROM sessions WHERE id = ?`, sessionId) as Array<{ project_id: string | null }>;
    return rows[0]?.project_id ?? null;
  } catch {
    return null;
  }
}
