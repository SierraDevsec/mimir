import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getAssignedTasks } from "../assignedTasks.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

vi.mock("../../../db.js", async () => {
  const setup = await import("./setup.js");
  return {
    getDb: () => setup.getTestDb(),
  };
});

describe("getAssignedTasks", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no tasks assigned", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toEqual([]);
  });

  it("should return tasks assigned to agent", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'Task 1', 'agent-1', 'pending')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (2, 'proj1', 'Task 2', 'agent-2', 'pending')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Task 1");
  });

  it("should exclude completed and idea tasks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'Pending', 'agent-1', 'pending')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (2, 'proj1', 'Completed', 'agent-1', 'completed')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (3, 'proj1', 'Idea', 'agent-1', 'idea')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Pending");
  });

  it("should order by priority (in_progress > pending > planned)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status, created_at)
                  VALUES (1, 'proj1', 'Planned', 'agent-1', 'planned', '2026-02-05 10:00:00')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status, created_at)
                  VALUES (2, 'proj1', 'Pending', 'agent-1', 'pending', '2026-02-05 10:01:00')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status, created_at)
                  VALUES (3, 'proj1', 'In Progress', 'agent-1', 'in_progress', '2026-02-05 10:02:00')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("In Progress");
    expect(result[1].title).toBe("Pending");
    expect(result[2].title).toBe("Planned");
  });

  it("should include plan comments for planned tasks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'Planned Task', 'agent-1', 'planned')`);
    await db.run(`INSERT INTO task_comments (id, task_id, author, comment_type, content)
                  VALUES (1, 1, 'Leader', 'plan', 'Please refactor the database module')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].planComment).toBe("Please refactor the database module");
  });

  it("should include plan comments for pending tasks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'Pending Task', 'agent-1', 'pending')`);
    await db.run(`INSERT INTO task_comments (id, task_id, author, comment_type, content)
                  VALUES (1, 1, 'Leader', 'plan', 'Add unit tests')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].planComment).toBe("Add unit tests");
  });

  it("should not include plan comments for in_progress tasks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'In Progress Task', 'agent-1', 'in_progress')`);
    await db.run(`INSERT INTO task_comments (id, task_id, author, comment_type, content)
                  VALUES (1, 1, 'Leader', 'plan', 'This should not be fetched')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].planComment).toBeUndefined();
  });

  it("should use most recent plan comment when multiple exist", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status)
                  VALUES (1, 'proj1', 'Task', 'agent-1', 'planned')`);
    await db.run(`INSERT INTO task_comments (id, task_id, author, comment_type, content, created_at)
                  VALUES (1, 1, 'Leader', 'plan', 'Old plan', '2026-02-05 10:00:00')`);
    await db.run(`INSERT INTO task_comments (id, task_id, author, comment_type, content, created_at)
                  VALUES (2, 1, 'Leader', 'plan', 'New plan', '2026-02-05 10:05:00')`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].planComment).toBe("New plan");
  });

  it("should include tags", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, assigned_to, status, tags)
                  VALUES (1, 'proj1', 'Tagged Task', 'agent-1', 'pending', ['backend', 'urgent'])`);

    const result = await getAssignedTasks("sess1", "agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].tags).toEqual(["backend", "urgent"]);
  });
});
