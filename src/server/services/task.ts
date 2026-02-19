import { getDb, toVarcharArraySql } from "../db.js";
import { deleteCommentsByTask } from "./comment.js";

export interface TaskRow {
  id: number;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  tags: string[] | null;
  flow_id: number | null;
  flow_node_id: string | null;
  depends_on: number[] | null;
  created_at: string;
  updated_at: string;
}

export async function createTask(
  projectId: string | null,
  title: string,
  description: string | null,
  assignedTo: string | null,
  status: string = "pending",
  tags: string[] | null = null
): Promise<number> {
  const db = await getDb();
  const tagsSql = toVarcharArraySql(tags ?? []);
  const rows = await db.all(
    `INSERT INTO tasks (project_id, title, description, assigned_to, status, tags)
     VALUES (?, ?, ?, ?, ?, ${tagsSql}) RETURNING id`,
    projectId, title, description, assignedTo, status
  );
  return Number((rows[0] as { id: number }).id);
}

export async function getTask(id: number): Promise<TaskRow | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM tasks WHERE id = ?`, id) as TaskRow[];
  return rows.length > 0 ? rows[0] : null;
}

export async function updateTaskStatus(id: number, status: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE tasks SET status = ?, updated_at = now() WHERE id = ?`, status, id
  );
}

export async function getTasksByProject(projectId: string): Promise<TaskRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC`, projectId
  ) as Promise<TaskRow[]>;
}

export async function getAllTasks(): Promise<TaskRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM tasks ORDER BY created_at DESC`) as Promise<TaskRow[]>;
}

export async function updateTask(
  id: number,
  fields: {
    status?: string;
    title?: string;
    description?: string | null;
    assigned_to?: string | null;
    tags?: string[] | null;
  }
): Promise<boolean> {
  const db = await getDb();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.status !== undefined) {
    updates.push("status = ?");
    values.push(fields.status);
  }
  if (fields.title !== undefined) {
    updates.push("title = ?");
    values.push(fields.title);
  }
  if (fields.description !== undefined) {
    updates.push("description = ?");
    values.push(fields.description);
  }
  if (fields.assigned_to !== undefined) {
    updates.push("assigned_to = ?");
    values.push(fields.assigned_to);
  }
  if (fields.tags !== undefined) {
    updates.push(`tags = ${toVarcharArraySql(fields.tags ?? [])}`);
  }

  if (updates.length === 0) return false;

  updates.push("updated_at = now()");
  values.push(id);

  const result = await db.all(
    `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? RETURNING id`,
    ...values
  );

  return result.length > 0;
}

export async function deleteTask(id: number): Promise<boolean> {
  const db = await getDb();
  await db.exec("BEGIN TRANSACTION");
  try {
    await deleteCommentsByTask(id);
    const rows = await db.all(`DELETE FROM tasks WHERE id = ? RETURNING id`, id);
    await db.exec("COMMIT");
    return rows.length > 0;
  } catch (err) {
    try { await db.exec("ROLLBACK"); } catch (rollbackErr) { console.error("[mimir] ROLLBACK failed (task):", rollbackErr); }
    throw err;
  }
}

export async function findPendingTaskForAgent(
  sessionId: string,
  agentName: string,
  agentType: string | null
): Promise<{ id: number; title: string } | null> {
  const db = await getDb();
  // Match by assigned_to = agentName or agentType, status = pending
  const rows = agentType
    ? await db.all(
        `SELECT t.id, t.title
         FROM tasks t
         JOIN sessions s ON t.project_id = s.project_id
         WHERE s.id = ?
           AND t.status = 'pending'
           AND (t.assigned_to = ? OR t.assigned_to = ?)
         ORDER BY t.created_at ASC
         LIMIT 1`,
        sessionId, agentName, agentType
      )
    : await db.all(
        `SELECT t.id, t.title
         FROM tasks t
         JOIN sessions s ON t.project_id = s.project_id
         WHERE s.id = ?
           AND t.status = 'pending'
           AND t.assigned_to = ?
         ORDER BY t.created_at ASC
         LIMIT 1`,
        sessionId, agentName
      );
  return rows.length > 0 ? rows[0] as { id: number; title: string } : null;
}

export async function getInProgressTasksForAgent(
  sessionId: string,
  agentName: string
): Promise<{ id: number; title: string }[]> {
  const db = await getDb();
  return db.all(
    `SELECT t.id, t.title
     FROM tasks t
     JOIN sessions s ON t.project_id = s.project_id
     WHERE s.id = ? AND t.assigned_to = ? AND t.status = 'in_progress'
     ORDER BY t.created_at ASC`,
    sessionId, agentName
  ) as Promise<{ id: number; title: string }[]>;
}
