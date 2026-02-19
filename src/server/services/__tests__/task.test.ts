import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Database } from "duckdb-async";
import { getTestDb, closeTestDb, truncateAllTables, fixtures } from "../../../__tests__/setup.js";

vi.mock("../../db.js", async (importOriginal) => {
  const actual = await importOriginal();
  const setup = await import("../../../__tests__/setup.js");
  return {
    ...actual as object,
    getDb: () => setup.getTestDb(),
    extractCount: setup.extractCount,
  };
});

import {
  createTask,
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getAllTasks,
  getTasksByProject,
  findPendingTaskForAgent,
  getInProgressTasksForAgent,
} from "../task.js";

describe("task service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Setup test project and session
    await db.run(
      `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
      fixtures.projectId, fixtures.projectName, fixtures.projectPath
    );
    await db.run(
      `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
      fixtures.sessionId, fixtures.projectId
    );
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("createTask", () => {
    it("should insert and return id (RETURNING)", async () => {
      const id = await createTask(fixtures.projectId, "Test Task", "Description", "agent-1");

      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);

      const task = await getTask(id);
      expect(task).toMatchObject({
        project_id: fixtures.projectId,
        title: "Test Task",
        description: "Description",
        assigned_to: "agent-1",
        status: "pending", // default
      });
    });

    it("should handle null tags", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null, "pending", null);

      const task = await getTask(id);
      expect(task?.tags).toBeNull();
    });

    it("should handle empty tags array", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null, "pending", []);

      const task = await getTask(id);
      expect(task?.tags).toBeNull(); // Empty array treated as NULL
    });

    it("should handle tags array", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null, "pending", ["bug", "urgent"]);

      const task = await getTask(id);
      expect(task?.tags).toEqual(["bug", "urgent"]);
    });

    it("should escape single quotes in tags (SQL injection prevention)", async () => {
      const id = await createTask(
        fixtures.projectId,
        "Task",
        null,
        null,
        "pending",
        ["foo's bar", "test'tag"]
      );

      const task = await getTask(id);
      expect(task?.tags).toEqual(["foo's bar", "test'tag"]);
    });

    it("should use custom status", async () => {
      const id = await createTask(fixtures.projectId, "Idea", null, null, "idea");

      const task = await getTask(id);
      expect(task?.status).toBe("idea");
    });
  });

  describe("getTask", () => {
    it("should return null for non-existent task", async () => {
      const task = await getTask(99999);
      expect(task).toBeNull();
    });
  });

  describe("updateTask", () => {
    it("should update partial fields", async () => {
      const id = await createTask(fixtures.projectId, "Original", "Desc", null);

      const updated = await updateTask(id, { title: "Updated Title" });
      expect(updated).toBe(true);

      const task = await getTask(id);
      expect(task?.title).toBe("Updated Title");
      expect(task?.description).toBe("Desc"); // Unchanged
    });

    it("should update status", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null);

      await updateTask(id, { status: "in_progress" });

      const task = await getTask(id);
      expect(task?.status).toBe("in_progress");
    });

    it("should update tags to new array", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null, "pending", ["old"]);

      await updateTask(id, { tags: ["new1", "new2"] });

      const task = await getTask(id);
      expect(task?.tags).toEqual(["new1", "new2"]);
    });

    it("should update tags to NULL when empty array", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null, "pending", ["old"]);

      await updateTask(id, { tags: [] });

      const task = await getTask(id);
      expect(task?.tags).toBeNull();
    });

    it("should return false when no fields provided", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null);

      const updated = await updateTask(id, {});
      expect(updated).toBe(false);
    });
  });

  describe("updateTaskStatus", () => {
    it("should update only status", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null);

      await updateTaskStatus(id, "completed");

      const task = await getTask(id);
      expect(task?.status).toBe("completed");
    });
  });

  describe("deleteTask", () => {
    it("should delete task and cascade to comments", async () => {
      const id = await createTask(fixtures.projectId, "Task", null, null);

      // Add comments
      await db.run(
        `INSERT INTO task_comments (task_id, comment_type, content) VALUES (?, 'note', 'comment')`,
        id
      );

      await deleteTask(id);

      const task = await getTask(id);
      expect(task).toBeNull();

      const comments = await db.all("SELECT * FROM task_comments WHERE task_id = ?", id);
      expect(comments).toHaveLength(0);
    });
  });

  describe("getAllTasks", () => {
    it("should return all tasks ordered by created_at DESC", async () => {
      await createTask(fixtures.projectId, "Task 1", null, null);
      await createTask(fixtures.projectId, "Task 2", null, null);

      const tasks = await getAllTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe("Task 2"); // Most recent first
    });
  });

  describe("getTasksByProject", () => {
    it("should return only tasks for project", async () => {
      await createTask(fixtures.projectId, "Task 1", null, null);

      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await createTask("proj-2", "Task 2", null, null);

      const tasks = await getTasksByProject(fixtures.projectId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Task 1");
    });
  });

  describe("findPendingTaskForAgent", () => {
    it("should find task by assigned_to = agentName", async () => {
      await createTask(fixtures.projectId, "Task 1", null, "backend-dev", "pending");

      const task = await findPendingTaskForAgent(fixtures.sessionId, "backend-dev", null);
      expect(task).not.toBeNull();
      expect(task?.title).toBe("Task 1");
    });

    it("should find task by assigned_to = agentType", async () => {
      await createTask(fixtures.projectId, "Task 1", null, "node-backend", "pending");

      const task = await findPendingTaskForAgent(fixtures.sessionId, "backend-dev", "node-backend");
      expect(task).not.toBeNull();
      expect(task?.title).toBe("Task 1");
    });

    it("should return null when no pending task", async () => {
      await createTask(fixtures.projectId, "Task 1", null, "backend-dev", "completed");

      const task = await findPendingTaskForAgent(fixtures.sessionId, "backend-dev", null);
      expect(task).toBeNull();
    });

    it("should return oldest pending task (FIFO)", async () => {
      await createTask(fixtures.projectId, "First Task", null, "backend-dev", "pending");
      await createTask(fixtures.projectId, "Second Task", null, "backend-dev", "pending");

      const task = await findPendingTaskForAgent(fixtures.sessionId, "backend-dev", null);
      expect(task?.title).toBe("First Task");
    });
  });

  describe("getInProgressTasksForAgent", () => {
    it("should return in_progress tasks for agent", async () => {
      await createTask(fixtures.projectId, "Task 1", null, "backend-dev", "in_progress");
      await createTask(fixtures.projectId, "Task 2", null, "backend-dev", "pending");
      await createTask(fixtures.projectId, "Task 3", null, "other-agent", "in_progress");

      const tasks = await getInProgressTasksForAgent(fixtures.sessionId, "backend-dev");
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Task 1");
    });

    it("should return empty array when none", async () => {
      const tasks = await getInProgressTasksForAgent(fixtures.sessionId, "backend-dev");
      expect(tasks).toEqual([]);
    });
  });
});
