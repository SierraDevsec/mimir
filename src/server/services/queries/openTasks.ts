import { getDb, extractCount } from "../../db.js";
import { safeQuery, type TaskRow } from "./types.js";

export interface OpenTasksResult {
  tasks: TaskRow[];
  backlogCount: number;
}

/**
 * Get open tasks (pending, in_progress, needs_review) for project context.
 * Also counts backlog (idea + planned) tasks.
 * Ordered by priority (in_progress > needs_review > pending).
 */
export async function getOpenTasks(
  sessionId: string,
  limit: number = 10
): Promise<OpenTasksResult> {
  const db = await getDb();

  const tasks = await safeQuery<TaskRow>("prompt-tasks", () => db.all(
    `SELECT t.title, t.status, t.assigned_to, t.tags
     FROM tasks t
     JOIN sessions s ON t.project_id = s.project_id
     WHERE s.id = ? AND t.status IN ('pending', 'in_progress', 'needs_review')
     ORDER BY
       CASE t.status
         WHEN 'in_progress' THEN 1
         WHEN 'needs_review' THEN 2
         WHEN 'pending' THEN 3
         ELSE 4
       END,
       t.created_at ASC
     LIMIT ?`,
    sessionId, limit
  ));

  const backlogCountRows = await safeQuery<{ count: number | bigint }>("prompt-backlog", () => db.all(
    `SELECT COUNT(*) as count
     FROM tasks t
     JOIN sessions s ON t.project_id = s.project_id
     WHERE s.id = ? AND t.status IN ('idea', 'planned')`,
    sessionId
  ));

  const backlogCount = extractCount(backlogCountRows);

  return { tasks, backlogCount };
}
