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
  logActivity,
  getActivitiesBySession,
  getRecentActivities,
  getActivitiesByProject,
} from "../activity.js";

describe("activity service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Setup test project, session, agent
    await db.run(
      `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
      fixtures.projectId, fixtures.projectName, fixtures.projectPath
    );
    await db.run(
      `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
      fixtures.sessionId, fixtures.projectId
    );
    await db.run(
      `INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, 'test-agent', 'active')`,
      fixtures.agentId, fixtures.sessionId
    );
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("logActivity", () => {
    it("should insert activity with JSON details (object)", async () => {
      await logActivity(
        fixtures.sessionId,
        fixtures.agentId,
        "PostToolUse",
        { tool_name: "Read", file_path: "/src/index.ts" }
      );

      const rows = await db.all("SELECT * FROM activity_log WHERE session_id = ?", fixtures.sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        session_id: fixtures.sessionId,
        agent_id: fixtures.agentId,
        event_type: "PostToolUse",
      });
      // DuckDB returns JSON as string, parse to verify
      const details = typeof rows[0].details === "string"
        ? JSON.parse(rows[0].details)
        : rows[0].details;
      expect(details).toMatchObject({
        tool_name: "Read",
        file_path: "/src/index.ts",
      });
    });

    it("should handle object details stringified", async () => {
      // logActivity stringifies non-string details, so pass an object
      await logActivity(fixtures.sessionId, null, "SessionStart", { message: "started" });

      const activities = await getActivitiesBySession(fixtures.sessionId);
      const details = typeof activities[0].details === "string"
        ? JSON.parse(activities[0].details)
        : activities[0].details;
      expect(details.message).toBe("started");
    });

    it("should handle null agent_id", async () => {
      await logActivity(fixtures.sessionId, null, "SessionStart", {});

      const activities = await getActivitiesBySession(fixtures.sessionId);
      expect(activities[0].agent_id).toBeNull();
    });
  });

  describe("getActivitiesBySession", () => {
    it("should return activities ordered by created_at DESC", async () => {
      await logActivity(fixtures.sessionId, null, "First", {});
      await logActivity(fixtures.sessionId, null, "Second", {});

      const activities = await getActivitiesBySession(fixtures.sessionId);
      expect(activities).toHaveLength(2);
      expect(activities[0].event_type).toBe("Second"); // Most recent
    });

    it("should return only activities for the session", async () => {
      await logActivity(fixtures.sessionId, null, "Session1", {});

      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-session", fixtures.projectId
      );
      await logActivity("other-session", null, "Session2", {});

      const activities = await getActivitiesBySession(fixtures.sessionId);
      expect(activities).toHaveLength(1);
      expect(activities[0].event_type).toBe("Session1");
    });
  });

  describe("getRecentActivities", () => {
    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await logActivity(fixtures.sessionId, null, `Event${i}`, {});
      }

      const recent = await getRecentActivities(5);
      expect(recent).toHaveLength(5);
    });

    it("should default to 50 limit", async () => {
      for (let i = 0; i < 60; i++) {
        await logActivity(fixtures.sessionId, null, `Event${i}`, {});
      }

      const recent = await getRecentActivities();
      expect(recent).toHaveLength(50);
    });

    it("should return activities from all sessions", async () => {
      await logActivity(fixtures.sessionId, null, "Session1", {});

      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-session", fixtures.projectId
      );
      await logActivity("other-session", null, "Session2", {});

      const recent = await getRecentActivities();
      expect(recent).toHaveLength(2);
    });
  });

  describe("getActivitiesByProject", () => {
    it("should return activities for project (JOIN sessions)", async () => {
      await logActivity(fixtures.sessionId, null, "Project1", {});

      // Different project
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "sess-2", "proj-2"
      );
      await logActivity("sess-2", null, "Project2", {});

      const activities = await getActivitiesByProject(fixtures.projectId);
      expect(activities).toHaveLength(1);
      expect(activities[0].event_type).toBe("Project1");
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await logActivity(fixtures.sessionId, null, `Event${i}`, {});
      }

      const activities = await getActivitiesByProject(fixtures.projectId, 3);
      expect(activities).toHaveLength(3);
    });
  });
});
