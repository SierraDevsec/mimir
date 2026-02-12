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
  recordFileChange,
  getFileChangesBySession,
  getFileChangesByAgent,
  getTotalFileChangesCount,
  getFileChangesCountByProject,
} from "../filechange.js";

describe("filechange service", () => {
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

  describe("recordFileChange", () => {
    it("should insert file change record", async () => {
      await recordFileChange(fixtures.sessionId, fixtures.agentId, "/src/index.ts", "Edit");

      const rows = await db.all("SELECT * FROM file_changes WHERE session_id = ?", fixtures.sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        session_id: fixtures.sessionId,
        agent_id: fixtures.agentId,
        file_path: "/src/index.ts",
        change_type: "Edit",
      });
    });

    it("should handle null agent_id", async () => {
      await recordFileChange(fixtures.sessionId, null, "/readme.md", "Write");

      const files = await getFileChangesBySession(fixtures.sessionId);
      expect(files[0].agent_id).toBeNull();
    });

    it("should support different change types", async () => {
      await recordFileChange(fixtures.sessionId, fixtures.agentId, "/a.ts", "Edit");
      await recordFileChange(fixtures.sessionId, fixtures.agentId, "/b.ts", "Write");

      const files = await getFileChangesBySession(fixtures.sessionId);
      expect(files).toHaveLength(2);
    });
  });

  describe("getFileChangesBySession", () => {
    it("should return files ordered by created_at DESC", async () => {
      await recordFileChange(fixtures.sessionId, null, "/first.ts", "Edit");
      await recordFileChange(fixtures.sessionId, null, "/second.ts", "Edit");

      const files = await getFileChangesBySession(fixtures.sessionId);
      expect(files).toHaveLength(2);
      expect(files[0].file_path).toBe("/second.ts"); // Most recent
    });

    it("should return only files for the session", async () => {
      await recordFileChange(fixtures.sessionId, null, "/a.ts", "Edit");

      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-session", fixtures.projectId
      );
      await recordFileChange("other-session", null, "/b.ts", "Edit");

      const files = await getFileChangesBySession(fixtures.sessionId);
      expect(files).toHaveLength(1);
      expect(files[0].file_path).toBe("/a.ts");
    });
  });

  describe("getFileChangesByAgent", () => {
    it("should return files for specific agent", async () => {
      await recordFileChange(fixtures.sessionId, fixtures.agentId, "/agent1.ts", "Edit");
      await recordFileChange(fixtures.sessionId, "other-agent", "/agent2.ts", "Edit");

      const files = await getFileChangesByAgent(fixtures.agentId);
      expect(files).toHaveLength(1);
      expect(files[0].file_path).toBe("/agent1.ts");
    });
  });

  describe("count functions - BigInt handling", () => {
    it("getTotalFileChangesCount should return Number", async () => {
      await recordFileChange(fixtures.sessionId, null, "/a.ts", "Edit");
      await recordFileChange(fixtures.sessionId, null, "/b.ts", "Write");

      const count = await getTotalFileChangesCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });

    it("should return 0 when no file changes", async () => {
      const count = await getTotalFileChangesCount();
      expect(count).toBe(0);
    });

    it("getFileChangesCountByProject should JOIN sessions", async () => {
      await recordFileChange(fixtures.sessionId, null, "/a.ts", "Edit");

      // Different project
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "sess-2", "proj-2"
      );
      await recordFileChange("sess-2", null, "/b.ts", "Edit");

      const count = await getFileChangesCountByProject(fixtures.projectId);
      expect(typeof count).toBe("number");
      expect(count).toBe(1);
    });
  });
});
