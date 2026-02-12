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
  startAgent,
  stopAgent,
  getAgent,
  getAgentsBySession,
  getActiveAgents,
  getAllAgents,
  getTotalAgentsCount,
  getActiveAgentsCount,
  deleteAgent,
  getAgentsByProject,
  getActiveAgentsByProject,
  getAgentsCountByProject,
  getActiveAgentsCountByProject,
} from "../agent.js";

describe("agent service", () => {
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

  describe("startAgent", () => {
    it("should insert a new agent", async () => {
      await startAgent("agent-1", fixtures.sessionId, "backend-dev", "node-backend", null);

      const agent = await getAgent("agent-1");
      expect(agent).not.toBeNull();
      expect(agent).toMatchObject({
        id: "agent-1",
        session_id: fixtures.sessionId,
        agent_name: "backend-dev",
        agent_type: "node-backend",
        parent_agent_id: null,
        status: "active",
      });
    });

    it("should handle null parent_agent_id", async () => {
      await startAgent("agent-1", fixtures.sessionId, "leader", null, null);

      const agent = await getAgent("agent-1");
      expect(agent?.parent_agent_id).toBeNull();
      expect(agent?.agent_type).toBeNull();
    });

    it("should set parent_agent_id when provided", async () => {
      await startAgent("parent", fixtures.sessionId, "leader", "leader", null);
      await startAgent("child", fixtures.sessionId, "worker", "worker", "parent");

      const child = await getAgent("child");
      expect(child?.parent_agent_id).toBe("parent");
    });

    it("should update status to active on re-register", async () => {
      await startAgent("agent-1", fixtures.sessionId, "test", "test", null);
      await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", "agent-1");

      await startAgent("agent-1", fixtures.sessionId, "test", "test", null);

      const agent = await getAgent("agent-1");
      expect(agent?.status).toBe("active");
    });
  });

  describe("stopAgent", () => {
    it("should set status to completed and save context_summary", async () => {
      await startAgent("agent-1", fixtures.sessionId, "test", "test", null);

      await stopAgent("agent-1", "Task completed successfully. Created 5 files.");

      const agent = await getAgent("agent-1");
      expect(agent?.status).toBe("completed");
      expect(agent?.context_summary).toBe("Task completed successfully. Created 5 files.");
      expect(agent?.completed_at).not.toBeNull();
    });

    it("should handle null context_summary", async () => {
      await startAgent("agent-1", fixtures.sessionId, "test", "test", null);

      await stopAgent("agent-1", null);

      const agent = await getAgent("agent-1");
      expect(agent?.status).toBe("completed");
      expect(agent?.context_summary).toBeNull();
    });
  });

  describe("getAgent", () => {
    it("should return null for non-existent agent", async () => {
      const agent = await getAgent("non-existent");
      expect(agent).toBeNull();
    });
  });

  describe("getAgentsBySession", () => {
    it("should return agents for session", async () => {
      await startAgent("agent-1", fixtures.sessionId, "agent1", "type1", null);
      await startAgent("agent-2", fixtures.sessionId, "agent2", "type2", null);

      // Different session
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-session", fixtures.projectId
      );
      await startAgent("agent-3", "other-session", "agent3", "type3", null);

      const agents = await getAgentsBySession(fixtures.sessionId);
      expect(agents).toHaveLength(2);
    });
  });

  describe("deleteAgent", () => {
    it("should delete agent and related data from 4 tables", async () => {
      await startAgent("agent-1", fixtures.sessionId, "test", "test", null);

      // Add related data
      await db.run(
        `INSERT INTO activity_log (session_id, agent_id, event_type, details)
         VALUES (?, ?, 'test', '{}')`,
        fixtures.sessionId, "agent-1"
      );
      await db.run(
        `INSERT INTO context_entries (session_id, agent_id, entry_type, content)
         VALUES (?, ?, 'note', 'test content')`,
        fixtures.sessionId, "agent-1"
      );
      await db.run(
        `INSERT INTO file_changes (session_id, agent_id, file_path, change_type)
         VALUES (?, ?, '/path/file.ts', 'Edit')`,
        fixtures.sessionId, "agent-1"
      );

      await deleteAgent("agent-1");

      // Verify all deleted
      const agent = await getAgent("agent-1");
      expect(agent).toBeNull();

      const activities = await db.all("SELECT * FROM activity_log WHERE agent_id = ?", "agent-1");
      expect(activities).toHaveLength(0);

      const contexts = await db.all("SELECT * FROM context_entries WHERE agent_id = ?", "agent-1");
      expect(contexts).toHaveLength(0);

      const files = await db.all("SELECT * FROM file_changes WHERE agent_id = ?", "agent-1");
      expect(files).toHaveLength(0);
    });
  });

  describe("count functions - BigInt handling", () => {
    it("getTotalAgentsCount should return Number", async () => {
      await startAgent("agent-1", fixtures.sessionId, "a1", "t1", null);
      await startAgent("agent-2", fixtures.sessionId, "a2", "t2", null);

      const count = await getTotalAgentsCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });

    it("getActiveAgentsCount should return Number", async () => {
      await startAgent("agent-1", fixtures.sessionId, "a1", "t1", null);
      await startAgent("agent-2", fixtures.sessionId, "a2", "t2", null);
      await stopAgent("agent-1", null);

      const count = await getActiveAgentsCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(1);
    });

    it("should return 0 when no agents", async () => {
      const count = await getTotalAgentsCount();
      expect(count).toBe(0);
    });
  });

  describe("project-scoped queries", () => {
    it("getAgentsByProject should JOIN sessions", async () => {
      await startAgent("agent-1", fixtures.sessionId, "a1", "t1", null);

      // Different project
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "sess-2", "proj-2"
      );
      await startAgent("agent-2", "sess-2", "a2", "t2", null);

      const agents = await getAgentsByProject(fixtures.projectId);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe("agent-1");
    });

    it("getAgentsCountByProject should return Number", async () => {
      await startAgent("agent-1", fixtures.sessionId, "a1", "t1", null);
      await startAgent("agent-2", fixtures.sessionId, "a2", "t2", null);

      const count = await getAgentsCountByProject(fixtures.projectId);
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });
  });
});
