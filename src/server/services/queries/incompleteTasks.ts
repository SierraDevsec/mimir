import { getDb } from "../../db.js";
import { safeQuery, type TaskRow } from "./types.js";

/**
 * Get incomplete tasks (pending, in_progress) assigned to an agent.
 * Used by todo enforcer to warn when agent stops with unfinished work.
 */
export async function getIncompleteTasks(
  sessionId: string,
  agentName: string
): Promise<TaskRow[]> {
  const db = await getDb();
  return safeQuery<TaskRow>("todo-enforcer", () => db.all(
    `SELECT t.title, t.status
     FROM tasks t
     JOIN sessions s ON t.project_id = s.project_id
     WHERE s.id = ? AND t.assigned_to = ? AND t.status IN ('pending', 'in_progress')
     ORDER BY t.created_at ASC`,
    sessionId, agentName
  ));
}
