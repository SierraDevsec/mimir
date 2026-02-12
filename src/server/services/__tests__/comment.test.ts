import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Database } from "duckdb-async";
import { getTestDb, closeTestDb, truncateAllTables, fixtures } from "../../../__tests__/setup.js";

vi.mock("../../db.js", async () => {
  const setup = await import("../../../__tests__/setup.js");
  return {
    getDb: () => setup.getTestDb(),
    extractCount: setup.extractCount,
  };
});

import {
  addComment,
  getCommentsByTask,
  deleteCommentsByTask,
} from "../comment.js";

describe("comment service", () => {
  let db: Database;
  let taskId: number;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);

    // Create a test task
    const rows = await db.all(
      `INSERT INTO tasks (project_id, title, description) VALUES (?, ?, ?) RETURNING id`,
      fixtures.projectId, "Test Task", "Description"
    );
    taskId = Number((rows[0] as { id: number }).id);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("addComment", () => {
    it("should insert comment and return id (RETURNING)", async () => {
      const id = await addComment(taskId, "claude", "plan", "Implementation plan here");

      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);

      const comments = await getCommentsByTask(taskId);
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({
        task_id: taskId,
        author: "claude",
        comment_type: "plan",
        content: "Implementation plan here",
      });
    });

    it("should handle null author", async () => {
      const id = await addComment(taskId, null, "note", "Anonymous note");

      const comments = await getCommentsByTask(taskId);
      expect(comments[0].author).toBeNull();
    });

    it("should support different comment types", async () => {
      await addComment(taskId, "agent", "plan", "Plan");
      await addComment(taskId, "agent", "review", "Review");
      await addComment(taskId, "agent", "status_change", "Status changed");
      await addComment(taskId, "agent", "result", "Result");
      await addComment(taskId, "agent", "note", "Note");

      const comments = await getCommentsByTask(taskId);
      expect(comments).toHaveLength(5);
    });
  });

  describe("getCommentsByTask", () => {
    it("should return comments ordered by created_at ASC", async () => {
      await addComment(taskId, "a", "note", "First");
      await addComment(taskId, "b", "note", "Second");
      await addComment(taskId, "c", "note", "Third");

      const comments = await getCommentsByTask(taskId);
      expect(comments).toHaveLength(3);
      expect(comments[0].content).toBe("First"); // Oldest first
      expect(comments[2].content).toBe("Third"); // Newest last
    });

    it("should return empty array for task with no comments", async () => {
      const comments = await getCommentsByTask(taskId);
      expect(comments).toEqual([]);
    });
  });

  describe("deleteCommentsByTask", () => {
    it("should delete all comments for task", async () => {
      await addComment(taskId, "a", "note", "1");
      await addComment(taskId, "b", "note", "2");
      await addComment(taskId, "c", "note", "3");

      await deleteCommentsByTask(taskId);

      const comments = await getCommentsByTask(taskId);
      expect(comments).toHaveLength(0);
    });

    it("should not affect comments of other tasks", async () => {
      // Create another task
      const rows = await db.all(
        `INSERT INTO tasks (project_id, title) VALUES (?, ?) RETURNING id`,
        fixtures.projectId, "Other Task"
      );
      const otherTaskId = Number((rows[0] as { id: number }).id);

      await addComment(taskId, "a", "note", "Task 1 comment");
      await addComment(otherTaskId, "b", "note", "Task 2 comment");

      await deleteCommentsByTask(taskId);

      const task1Comments = await getCommentsByTask(taskId);
      expect(task1Comments).toHaveLength(0);

      const task2Comments = await getCommentsByTask(otherTaskId);
      expect(task2Comments).toHaveLength(1);
    });
  });
});
