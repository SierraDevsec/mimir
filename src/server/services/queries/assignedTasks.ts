import { getDb } from "../../db.js";
import { safeQuery, type TaskRow, type TaskCommentRow } from "./types.js";

export interface TaskWithPlan extends TaskRow {
  planComment?: string;
}

/**
 * Get tasks assigned to the agent (excluding completed/idea).
 * Includes plan comments for planned/pending tasks.
 * Ordered by priority (in_progress > pending > planned).
 */
export async function getAssignedTasks(
  sessionId: string,
  agentName: string
): Promise<TaskWithPlan[]> {
  const db = await getDb();
  const tasks = await safeQuery<TaskRow>("assigned-tasks", () => db.all(
    `SELECT t.id, t.title, t.description, t.status, t.tags
     FROM tasks t
     JOIN sessions s ON t.project_id = s.project_id
     WHERE s.id = ? AND t.assigned_to = ? AND t.status NOT IN ('completed', 'idea')
     ORDER BY
       CASE t.status
         WHEN 'in_progress' THEN 1
         WHEN 'pending' THEN 2
         WHEN 'planned' THEN 3
         ELSE 4
       END,
       t.created_at ASC`,
    sessionId, agentName
  ));

  // Fetch plan comments for planned/pending tasks
  const tasksWithPlans: TaskWithPlan[] = [];
  for (const task of tasks) {
    const taskWithPlan: TaskWithPlan = { ...task };

    if (task.status === "planned" || task.status === "pending") {
      const planComments = await safeQuery<TaskCommentRow>("task-plan-comment", () => db.all(
        `SELECT content FROM task_comments
         WHERE task_id = ? AND comment_type = 'plan'
         ORDER BY created_at DESC LIMIT 1`,
        task.id
      ));

      if (planComments.length > 0) {
        taskWithPlan.planComment = planComments[0].content;
      }
    }

    tasksWithPlans.push(taskWithPlan);
  }

  return tasksWithPlans;
}
