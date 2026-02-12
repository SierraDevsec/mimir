import { getDb } from "../db.js";

export async function registerProject(id: string, name: string, projectPath: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, path = excluded.path`,
    id, name, projectPath
  );
}

export async function findProjectByPath(projectPath: string) {
  const db = await getDb();
  const rows = await db.all(`SELECT * FROM projects WHERE path = ?`, projectPath);
  return rows[0] ?? null;
}

export async function getAllProjects() {
  const db = await getDb();
  return db.all(`SELECT * FROM projects ORDER BY created_at DESC`);
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = await getDb();
  const before = await db.all(`SELECT id FROM projects WHERE id = ?`, id);
  if (before.length === 0) return false;
  await db.run(`DELETE FROM projects WHERE id = ?`, id);
  return true;
}
