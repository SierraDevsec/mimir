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
  addContextEntry,
  getContextBySession,
  getContextByAgent,
  getContextByType,
  getRecentContext,
  getCrossSessionContext,
  deleteContextByType,
  getTotalContextEntriesCount,
  getContextEntriesCountByProject,
} from "../context.js";

describe("context service", () => {
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
    await db.run(
      `INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, 'test-agent', 'active')`,
      fixtures.agentId, fixtures.sessionId
    );
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("addContextEntry", () => {
    it("should insert context entry", async () => {
      await addContextEntry(fixtures.sessionId, fixtures.agentId, "note", "Test content", null);

      const rows = await db.all("SELECT * FROM context_entries WHERE session_id = ?", fixtures.sessionId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        session_id: fixtures.sessionId,
        agent_id: fixtures.agentId,
        entry_type: "note",
        content: "Test content",
      });
    });

    it("should handle null tags", async () => {
      await addContextEntry(fixtures.sessionId, null, "note", "Content", null);

      const contexts = await getContextBySession(fixtures.sessionId);
      expect(contexts[0].tags).toBeNull();
    });

    it("should handle tags array with literal construction", async () => {
      await addContextEntry(
        fixtures.sessionId,
        fixtures.agentId,
        "decision",
        "Important decision",
        ["backend-dev", "all"]
      );

      const contexts = await getContextBySession(fixtures.sessionId);
      expect(contexts[0].tags).toEqual(["backend-dev", "all"]);
    });

    it("should escape single quotes in tags", async () => {
      await addContextEntry(
        fixtures.sessionId,
        null,
        "note",
        "Test",
        ["it's", "foo's bar"]
      );

      const contexts = await getContextBySession(fixtures.sessionId);
      expect(contexts[0].tags).toEqual(["it's", "foo's bar"]);
    });
  });

  describe("getContextBySession", () => {
    it("should return entries ordered by created_at DESC", async () => {
      await addContextEntry(fixtures.sessionId, null, "first", "First", null);
      await addContextEntry(fixtures.sessionId, null, "second", "Second", null);

      const contexts = await getContextBySession(fixtures.sessionId);
      expect(contexts).toHaveLength(2);
      expect(contexts[0].entry_type).toBe("second"); // Most recent
    });
  });

  describe("getContextByAgent", () => {
    it("should return entries for specific agent", async () => {
      await addContextEntry(fixtures.sessionId, fixtures.agentId, "note", "Agent 1", null);
      await addContextEntry(fixtures.sessionId, "other-agent", "note", "Agent 2", null);

      const contexts = await getContextByAgent(fixtures.agentId);
      expect(contexts).toHaveLength(1);
      expect(contexts[0].content).toBe("Agent 1");
    });
  });

  describe("getContextByType", () => {
    it("should filter by entry_type", async () => {
      await addContextEntry(fixtures.sessionId, null, "decision", "Decision 1", null);
      await addContextEntry(fixtures.sessionId, null, "note", "Note 1", null);
      await addContextEntry(fixtures.sessionId, null, "decision", "Decision 2", null);

      const decisions = await getContextByType(fixtures.sessionId, "decision");
      expect(decisions).toHaveLength(2);
      expect(decisions.every((c: any) => c.entry_type === "decision")).toBe(true);
    });
  });

  describe("getRecentContext", () => {
    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await addContextEntry(fixtures.sessionId, null, "note", `Note ${i}`, null);
      }

      const recent = await getRecentContext(fixtures.sessionId, 3);
      expect(recent).toHaveLength(3);
    });

    it("should default to 20 limit", async () => {
      for (let i = 0; i < 25; i++) {
        await addContextEntry(fixtures.sessionId, null, "note", `Note ${i}`, null);
      }

      const recent = await getRecentContext(fixtures.sessionId);
      expect(recent).toHaveLength(20);
    });
  });

  describe("getCrossSessionContext", () => {
    it("should return entries from other sessions in same project (JOIN sessions)", async () => {
      // Add entry to current session
      await addContextEntry(fixtures.sessionId, null, "note", "Current session", null);

      // Create another session in same project
      await db.run(
        `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
        fixtures.sessionId2, fixtures.projectId
      );
      await addContextEntry(fixtures.sessionId2, null, "decision", "Other session", null);

      const cross = await getCrossSessionContext(fixtures.sessionId);
      expect(cross).toHaveLength(1);
      expect(cross[0].content).toBe("Other session");
      expect(cross[0].source_session_id).toBe(fixtures.sessionId2);
    });

    it("should not include entries from different project", async () => {
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other Project", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-proj-session", "proj-2"
      );
      await addContextEntry("other-proj-session", null, "note", "Different project", null);

      const cross = await getCrossSessionContext(fixtures.sessionId);
      expect(cross).toHaveLength(0);
    });
  });

  describe("deleteContextByType", () => {
    it("should delete and return count", async () => {
      await addContextEntry(fixtures.sessionId, null, "temp", "Temp 1", null);
      await addContextEntry(fixtures.sessionId, null, "temp", "Temp 2", null);
      await addContextEntry(fixtures.sessionId, null, "note", "Note", null);

      const deleted = await deleteContextByType(fixtures.sessionId, "temp");
      expect(deleted).toBe(2);

      const remaining = await getContextBySession(fixtures.sessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].entry_type).toBe("note");
    });

    it("should return 0 when nothing to delete", async () => {
      const deleted = await deleteContextByType(fixtures.sessionId, "nonexistent");
      expect(deleted).toBe(0);
    });
  });

  describe("count functions - BigInt handling", () => {
    it("getTotalContextEntriesCount should return Number", async () => {
      await addContextEntry(fixtures.sessionId, null, "note", "1", null);
      await addContextEntry(fixtures.sessionId, null, "note", "2", null);

      const count = await getTotalContextEntriesCount();
      expect(typeof count).toBe("number");
      expect(count).toBe(2);
    });

    it("getContextEntriesCountByProject should JOIN sessions", async () => {
      await addContextEntry(fixtures.sessionId, null, "note", "1", null);

      // Different project
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "proj-2", "Other", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "sess-2", "proj-2"
      );
      await addContextEntry("sess-2", null, "note", "2", null);

      const count = await getContextEntriesCountByProject(fixtures.projectId);
      expect(typeof count).toBe("number");
      expect(count).toBe(1);
    });
  });
});
