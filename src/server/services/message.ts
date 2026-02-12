import { getDb, extractCount } from "../db.js";

export async function sendMessage(
  projectId: string,
  fromName: string,
  toName: string,
  content: string,
  priority: string = "normal",
  sessionId: string | null = null
): Promise<number> {
  const db = await getDb();
  const result = await db.all(
    `INSERT INTO messages (project_id, from_name, to_name, content, priority, session_id)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    projectId, fromName, toName, content, priority, sessionId
  );
  return Number((result[0] as { id: number }).id);
}

export async function getUnreadMessages(
  projectId: string,
  agentName: string,
  limit: number = 10
) {
  const db = await getDb();
  return db.all(
    `SELECT * FROM messages
     WHERE project_id = ? AND to_name = ? AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT ?`,
    projectId, agentName, limit
  );
}

export async function markAsRead(messageId: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.all(
    `UPDATE messages SET status = 'read', read_at = now()
     WHERE id = ? AND status = 'pending'
     RETURNING id`,
    messageId
  );
  return result.length > 0;
}

export async function markManyAsRead(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.all(
    `SELECT COUNT(*) as count FROM messages
     WHERE id IN (${placeholders}) AND status = 'pending'`,
    ...ids
  );
  await db.run(
    `UPDATE messages SET status = 'read', read_at = now()
     WHERE id IN (${placeholders}) AND status = 'pending'`,
    ...ids
  );
  return extractCount(result);
}

export async function getMessagesByProject(
  projectId: string,
  status?: string,
  limit: number = 50,
  since?: string
) {
  const db = await getDb();
  const conditions = ["project_id = ?"];
  const params: unknown[] = [projectId];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (since) {
    conditions.push("created_at >= ?");
    params.push(since);
  }

  params.push(limit);
  return db.all(
    `SELECT * FROM messages
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ?`,
    ...params
  );
}

export async function getUnreadCount(
  projectId: string,
  agentName: string
): Promise<number> {
  const db = await getDb();
  const result = await db.all(
    `SELECT COUNT(*) as count FROM messages
     WHERE project_id = ? AND to_name = ? AND status = 'pending'`,
    projectId, agentName
  );
  return extractCount(result);
}

export async function deleteMessage(messageId: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.all(
    `DELETE FROM messages WHERE id = ? RETURNING id`,
    messageId
  );
  return result.length > 0;
}

export async function getMessage(messageId: number) {
  const db = await getDb();
  const result = await db.all(
    `SELECT * FROM messages WHERE id = ?`,
    messageId
  );
  return result[0] ?? null;
}
