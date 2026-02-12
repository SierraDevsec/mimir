import { getDb } from "../db.js";

export interface TaskComment {
  id: number;
  task_id: number;
  author: string | null;
  comment_type: string;
  content: string;
  created_at: string;
}

export async function addComment(
  taskId: number,
  author: string | null,
  commentType: string,
  content: string
): Promise<number> {
  const db = await getDb();
  const rows = await db.all(
    `INSERT INTO task_comments (task_id, author, comment_type, content) VALUES (?, ?, ?, ?) RETURNING id`,
    taskId, author, commentType, content
  );
  return Number((rows[0] as { id: number }).id);
}

export async function getCommentsByTask(taskId: number): Promise<TaskComment[]> {
  const db = await getDb();
  return db.all(
    `SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC`,
    taskId
  ) as Promise<TaskComment[]>;
}

export async function deleteCommentsByTask(taskId: number): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM task_comments WHERE task_id = ?`, taskId);
}
