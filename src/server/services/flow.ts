import { getDb, checkpoint } from "../db.js";

export interface FlowRow {
  id: number;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  mermaid_code: string;
  metadata: string; // JSON string from DuckDB
  created_at: string;
  updated_at: string;
}

export async function createFlow(
  projectId: string,
  name: string,
  mermaidCode: string,
  description: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const db = await getDb();
  const rows = await db.all(
    `INSERT INTO flows (project_id, name, description, mermaid_code, metadata)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    projectId, name, description, mermaidCode, JSON.stringify(metadata)
  );
  const id = Number((rows[0] as { id: number }).id);
  await checkpoint();
  return id;
}

export async function getFlow(id: number): Promise<FlowRow | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM flows WHERE id = ?`, id);
  return rows.length > 0 ? rows[0] as FlowRow : null;
}

export async function getFlowsByProject(projectId: string): Promise<FlowRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT * FROM flows WHERE project_id = ? ORDER BY updated_at DESC`,
    projectId
  ) as Promise<FlowRow[]>;
}

export async function getAllFlows(): Promise<FlowRow[]> {
  const db = await getDb();
  return db.all(`SELECT * FROM flows ORDER BY updated_at DESC`) as Promise<FlowRow[]>;
}

export async function updateFlow(
  id: number,
  fields: {
    name?: string;
    description?: string | null;
    status?: string;
    mermaid_code?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    updates.push("name = ?");
    values.push(fields.name);
  }
  if (fields.description !== undefined) {
    updates.push("description = ?");
    values.push(fields.description);
  }
  if (fields.status !== undefined) {
    updates.push("status = ?");
    values.push(fields.status);
  }
  if (fields.mermaid_code !== undefined) {
    updates.push("mermaid_code = ?");
    values.push(fields.mermaid_code);
  }
  if (fields.metadata !== undefined) {
    updates.push("metadata = ?");
    values.push(JSON.stringify(fields.metadata));
  }

  if (updates.length === 0) return false;

  updates.push("updated_at = now()");
  values.push(id);

  await db.run(
    `UPDATE flows SET ${updates.join(", ")} WHERE id = ?`,
    ...values
  );
  await checkpoint();
  return true;
}

export async function deleteFlow(id: number): Promise<boolean> {
  const db = await getDb();
  // Clear flow_id from any linked tasks
  await db.run(`UPDATE tasks SET flow_id = NULL, flow_node_id = NULL WHERE flow_id = ?`, id);
  const result = await db.all(`DELETE FROM flows WHERE id = ? RETURNING id`, id);
  if (result.length > 0) await checkpoint();
  return result.length > 0;
}
