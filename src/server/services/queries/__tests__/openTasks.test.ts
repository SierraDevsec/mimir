import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getOpenTasks } from "../openTasks.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

vi.mock("../../../db.js", async () => {
  const setup = await import("./setup.js");
  return {
    getDb: () => setup.getTestDb(),
    extractCount: (result: { count?: number | bigint }[]) => {
      return Number(result[0]?.count ?? 0);
    },
  };
});

describe("getOpenTasks", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty result when no tasks exist", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    const result = await getOpenTasks("sess1");

    expect(result.tasks).toEqual([]);
    expect(result.backlogCount).toBe(0);
  });

  it("should return open tasks (pending, in_progress, needs_review)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (1, 'proj1', 'Pending', 'pending')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (2, 'proj1', 'In Progress', 'in_progress')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (3, 'proj1', 'Needs Review', 'needs_review')`);

    const result = await getOpenTasks("sess1");

    expect(result.tasks).toHaveLength(3);
  });

  it("should exclude completed tasks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (1, 'proj1', 'Open', 'pending')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (2, 'proj1', 'Completed', 'completed')`);

    const result = await getOpenTasks("sess1");

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Open");
  });

  it("should order by priority (in_progress > needs_review > pending)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status, created_at)
                  VALUES (1, 'proj1', 'Pending', 'pending', '2026-02-05 10:00:00')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status, created_at)
                  VALUES (2, 'proj1', 'Needs Review', 'needs_review', '2026-02-05 10:01:00')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status, created_at)
                  VALUES (3, 'proj1', 'In Progress', 'in_progress', '2026-02-05 10:02:00')`);

    const result = await getOpenTasks("sess1");

    expect(result.tasks[0].title).toBe("In Progress");
    expect(result.tasks[1].title).toBe("Needs Review");
    expect(result.tasks[2].title).toBe("Pending");
  });

  it("should respect limit parameter", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    for (let i = 1; i <= 15; i++) {
      await db.run(`INSERT INTO tasks (id, project_id, title, status)
                    VALUES (${i}, 'proj1', 'Task ${i}', 'pending')`);
    }

    const result = await getOpenTasks("sess1", 5);

    expect(result.tasks).toHaveLength(5);
  });

  it("should count backlog tasks (idea + planned)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (1, 'proj1', 'Idea 1', 'idea')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (2, 'proj1', 'Idea 2', 'idea')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (3, 'proj1', 'Planned', 'planned')`);
    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (4, 'proj1', 'Pending', 'pending')`);

    const result = await getOpenTasks("sess1");

    expect(result.backlogCount).toBe(3);
  });

  it("should include task details (assigned_to, tags)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status, assigned_to, tags)
                  VALUES (1, 'proj1', 'Task', 'pending', 'agent-1', ['backend', 'urgent'])`);

    const result = await getOpenTasks("sess1");

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].assigned_to).toBe("agent-1");
    expect(result.tasks[0].tags).toEqual(["backend", "urgent"]);
  });

  it("should handle BigInt count conversion", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO tasks (id, project_id, title, status)
                  VALUES (1, 'proj1', 'Idea', 'idea')`);

    const result = await getOpenTasks("sess1");

    expect(typeof result.backlogCount).toBe("number");
    expect(result.backlogCount).toBe(1);
  });
});
