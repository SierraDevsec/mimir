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

  await db.exec("BEGIN TRANSACTION");
  try {
    // CASCADE delete in dependency order (transaction ensures atomicity)
    await db.run(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM tasks WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM context_entries WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM file_changes WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM activity_log WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM messages WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM agent_registry WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM observations WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM session_summaries WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM agents WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM sessions WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM flows WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM tmux_panes WHERE session_name IN (SELECT session_name FROM tmux_sessions WHERE project_id = ?)`, [id]);
    await db.run(`DELETE FROM tmux_sessions WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM projects WHERE id = ?`, [id]);
    await db.exec("COMMIT");
  } catch (err) {
    try { await db.exec("ROLLBACK"); } catch (rollbackErr) { console.error("[mimir] ROLLBACK failed (project):", rollbackErr); }
    throw err;
  }

  return true;
}
