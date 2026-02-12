import { getDb, extractCount } from "../../db.js";
import { safeQuery } from "./types.js";

export interface PendingMessage {
  id: number;
  from_name: string;
  content: string;
  priority: string;
  created_at: string;
}

export async function getPendingMessages(
  sessionId: string,
  agentName: string,
  limit: number = 5
): Promise<PendingMessage[]> {
  const db = await getDb();
  return safeQuery<PendingMessage>("pending-messages", () => db.all(
    `SELECT m.id, m.from_name, m.content, m.priority, m.created_at
     FROM messages m
     JOIN sessions s ON m.project_id = s.project_id
     WHERE s.id = ? AND m.to_name = ? AND m.status = 'pending'
     ORDER BY m.created_at ASC
     LIMIT ?`,
    sessionId, agentName, limit
  ));
}

export async function getPendingMessageCount(
  sessionId: string,
  agentName: string
): Promise<number> {
  const db = await getDb();
  const result = await safeQuery<{ count: number | bigint }>("pending-msg-count", () => db.all(
    `SELECT COUNT(*) as count
     FROM messages m
     JOIN sessions s ON m.project_id = s.project_id
     WHERE s.id = ? AND m.to_name = ? AND m.status = 'pending'`,
    sessionId, agentName
  ));
  return extractCount(result);
}

export async function getAllPendingMessageCount(
  sessionId: string
): Promise<number> {
  const db = await getDb();
  const result = await safeQuery<{ count: number | bigint }>("all-pending-msg-count", () => db.all(
    `SELECT COUNT(*) as count
     FROM messages m
     JOIN sessions s ON m.project_id = s.project_id
     WHERE s.id = ? AND m.status = 'pending'`,
    sessionId
  ));
  return extractCount(result);
}
