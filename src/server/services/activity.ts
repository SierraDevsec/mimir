import { getDb } from "../db.js";

export async function logActivity(
  sessionId: string,
  agentId: string | null,
  eventType: string,
  details: unknown
): Promise<void> {
  const db = await getDb();
  const detailsJson = typeof details === "string" ? details : JSON.stringify(details);
  await db.run(
    `INSERT INTO activity_log (session_id, agent_id, event_type, details) VALUES (?, ?, ?, ?::JSON)`,
    sessionId, agentId, eventType, detailsJson
  );
}

export async function getActivitiesBySession(sessionId: string) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM activity_log WHERE session_id = ? ORDER BY created_at DESC`,
    sessionId
  );
}

export async function getRecentActivities(limit: number = 50) {
  const db = await getDb();
  return db.all(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`, limit);
}

export async function getActivitiesByProject(projectId: string, limit: number = 50) {
  const db = await getDb();
  return db.all(
    `SELECT activity_log.* FROM activity_log
     JOIN sessions ON activity_log.session_id = sessions.id
     WHERE sessions.project_id = ?
     ORDER BY activity_log.created_at DESC
     LIMIT ?`,
    projectId, limit
  );
}
