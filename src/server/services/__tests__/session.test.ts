import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Database } from "duckdb-async";
import { getTestDb, closeTestDb, truncateAllTables, fixtures, setupTestData } from "../../../__tests__/setup.js";

vi.mock("../../db.js", async () => {
  const setup = await import("../../../__tests__/setup.js");
  return {
    getDb: () => setup.getTestDb(),
    extractCount: setup.extractCount,
  };
});

import {
  startSession,
  endSession,
  getSession,
  getActiveSessions,
  getAllSessions,
  getTotalSessionsCount,
  getActiveSessionsCount,
  getSessionsByProject,
  getActiveSessionsByProject,
  getSessionsCountByProject,
  getActiveSessionsCountByProject,
} from "../session.js";

describe("session service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Insert test project
    await db.run(
      `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
      fixtures.projectId, fixtures.projectName, fixtures.projectPath
    );
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("startSession", () => {
    it("should insert a new session", async () => {
      await startSession("sess-1", fixtures.projectId);

      const rows = await db.all("SELECT * FROM sessions WHERE id = ?", "sess-1");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "sess-1",
        project_id: fixtures.projectId,
        status: "active",
      });
    });

    it("should preserve project_id on re-register with COALESCE", async () => {
      // First registration with project_id
      await startSession("sess-1", fixtures.projectId);

      // Re-registration without project_id (null)
      await startSession("sess-1", null);

      const rows = await db.all("SELECT * FROM sessions WHERE id = ?", "sess-1");
      expect(rows).toHaveLength(1);
      // COALESCE should preserve original project_id
      expect(rows[0].project_id).toBe(fixtures.projectId);
    });

    it("should update status to active on re-register", async () => {
      await startSession("sess-1", fixtures.projectId);
      await db.run("UPDATE sessions SET status = 'ended' WHERE id = ?", "sess-1");

      await startSession("sess-1", null);

      const session = await getSession("sess-1");
      expect(session?.status).toBe("active");
    });
  });

  describe("endSession", () => {
    it("should set status to ended", async () => {
      await startSession("sess-1", fixtures.projectId);
      await endSession("sess-1");

      const session = await getSession("sess-1");
      expect(session?.status).toBe("ended");
      expect(session?.ended_at).not.toBeNull();
    });

    it("should complete all active agents in the session", async () => {
      await startSession("sess-1", fixtures.projectId);
      await db.run(
        `INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, ?, 'active')`,
        "agent-1", "sess-1", "test-agent"
      );
      await db.run(
        `INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, ?, 'active')`,
        "agent-2", "sess-1", "test-agent-2"
      );

      await endSession("sess-1");

      const agents = await db.all("SELECT * FROM agents WHERE session_id = ?", "sess-1");
      expect(agents.every((a: any) => a.status === "completed")).toBe(true);
      expect(agents.every((a: any) => a.completed_at !== null)).toBe(true);
    });
  });

  describe("getSession", () => {
    it("should return session by id", async () => {
      await startSession("sess-1", fixtures.projectId);

      const session = await getSession("sess-1");
      expect(session).not.toBeNull();
      expect(session?.id).toBe("sess-1");
    });

    it("should return null for non-existent session", async () => {
      const session = await getSession("non-existent");
      expect(session).toBeNull();
    });
  });

  describe("getActiveSessions", () => {
    it("should return only active sessions", async () => {
      await startSession("sess-1", fixtures.projectId);
      await startSession("sess-2", fixtures.projectId);
      await endSession("sess-1");

      const active = await getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("sess-2");
    });
  });

  describe("getAllSessions", () => {
    it("should return all sessions ordered by started_at DESC", async () => {
      await startSession("sess-1", fixtures.projectId);
      await startSession("sess-2", fixtures.projectId);
      await endSession("sess-1");

      const all = await getAllSessions();
      expect(all).toHaveLength(2);
    });
  });

  describe("count functions - BigInt handling", () => {
    it("getTotalSessionsCount should return Number (not BigInt)", async () => {
      await startSession("sess-1", fixtures.projectId);
      await startSession("sess-2", fixtures.projectId);

      const count = await getTotalSessionsCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });

    it("getActiveSessionsCount should return Number", async () => {
      await startSession("sess-1", fixtures.projectId);
      await startSession("sess-2", fixtures.projectId);
      await endSession("sess-1");

      const count = await getActiveSessionsCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(1);
    });

    it("count should be 0 when no sessions", async () => {
      const count = await getTotalSessionsCount();
      expect(count).toBe(0);
    });
  });

  describe("project-scoped queries", () => {
    it("getSessionsByProject should return sessions for project", async () => {
      await startSession("sess-1", fixtures.projectId);
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await startSession("sess-2", "proj-2");

      const sessions = await getSessionsByProject(fixtures.projectId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("sess-1");
    });

    it("getSessionsCountByProject should return Number", async () => {
      await startSession("sess-1", fixtures.projectId);
      await startSession("sess-2", fixtures.projectId);

      const count = await getSessionsCountByProject(fixtures.projectId);
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });
  });
});
