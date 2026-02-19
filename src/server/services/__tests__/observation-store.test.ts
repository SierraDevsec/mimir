import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { saveObservation, markAsPromoted, getObservationsByProject, searchObservations } from "../observation-store.js";
import { getTestDb, truncateAllTables, closeTestDb, fixtures, setupTestData } from "../../../__tests__/setup.js";

vi.mock("../../db.js", async (importOriginal) => {
  const actual = await importOriginal();
  const setup = await import("../../../__tests__/setup.js");
  return {
    ...actual as object,
    getDb: () => setup.getTestDb(),
    checkpoint: vi.fn(),
    getDataDir: () => "/tmp/mimir-test",
  };
});

vi.mock("../embedding.js", () => ({
  isEmbeddingEnabled: () => false,
  generateEmbedding: vi.fn().mockResolvedValue(null),
  updateObservationEmbedding: vi.fn(),
  buildEmbeddingText: (title: string) => title,
}));

describe("observation-store", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  beforeEach(async () => {
    const db = await getTestDb();
    await truncateAllTables(db);
    await setupTestData(db);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("saveObservation", () => {
    it("should insert an observation and return its id", async () => {
      const id = await saveObservation(
        {
          type: "warning",
          title: "BigInt needs Number() wrap",
          facts: [],
          concepts: ["duckdb", "bigint"],
          files_read: [],
          files_modified: [],
        },
        fixtures.sessionId,
        fixtures.agentId,
        fixtures.projectId
      );

      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);
    });

    it("should store files_read and files_modified", async () => {
      const id = await saveObservation(
        {
          type: "discovery",
          title: "Hook timeout is 3s",
          facts: [],
          concepts: ["hooks"],
          files_read: ["src/hooks/hook.sh"],
          files_modified: ["src/hooks/hook.sh"],
        },
        fixtures.sessionId,
        fixtures.agentId,
        fixtures.projectId
      );

      const db = await getTestDb();
      const rows = await db.all(`SELECT files_read, files_modified FROM observations WHERE id = ?`, id);
      expect(rows).toHaveLength(1);
      const row = rows[0] as { files_read: string[] | null; files_modified: string[] | null };
      expect(row.files_read).toContain("src/hooks/hook.sh");
      expect(row.files_modified).toContain("src/hooks/hook.sh");
    });

    it("should store concepts as array", async () => {
      const id = await saveObservation(
        {
          type: "decision",
          title: "Chose Hono over Express",
          facts: [],
          concepts: ["hono", "express", "server"],
          files_read: [],
          files_modified: [],
        },
        fixtures.sessionId,
        null,
        fixtures.projectId
      );

      const db = await getTestDb();
      const rows = await db.all(`SELECT concepts FROM observations WHERE id = ?`, id);
      const row = rows[0] as { concepts: string[] | null };
      expect(row.concepts).toContain("hono");
      expect(row.concepts).toContain("express");
      expect(row.concepts).toHaveLength(3);
    });

    it("should store null for empty arrays", async () => {
      const id = await saveObservation(
        {
          type: "note",
          title: "Simple note",
          facts: [],
          concepts: [],
          files_read: [],
          files_modified: [],
        },
        fixtures.sessionId,
        null,
        fixtures.projectId
      );

      const db = await getTestDb();
      const rows = await db.all(`SELECT concepts, files_read, files_modified FROM observations WHERE id = ?`, id);
      const row = rows[0] as { concepts: string[] | null; files_read: string[] | null; files_modified: string[] | null };
      expect(row.concepts).toBeNull();
      expect(row.files_read).toBeNull();
      expect(row.files_modified).toBeNull();
    });
  });

  describe("markAsPromoted", () => {
    it("should set promoted_to on specified observations", async () => {
      const id1 = await saveObservation(
        { type: "warning", title: "Mark 1", facts: [], concepts: ["duckdb"], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const id2 = await saveObservation(
        { type: "warning", title: "Mark 2", facts: [], concepts: ["duckdb"], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );

      await markAsPromoted([id1, id2], "rules/duckdb.md");

      const db = await getTestDb();
      const rows = await db.all(`SELECT promoted_to FROM observations WHERE id IN (?, ?)`, id1, id2) as Array<{ promoted_to: string | null }>;
      expect(rows).toHaveLength(2);
      expect(rows[0].promoted_to).toBe("rules/duckdb.md");
      expect(rows[1].promoted_to).toBe("rules/duckdb.md");
    });

    it("should do nothing with empty ids array", async () => {
      await markAsPromoted([], "rules/test.md");
      // No error thrown — this is a no-op
    });

    it("should not affect other observations", async () => {
      const id1 = await saveObservation(
        { type: "warning", title: "To promote", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const id2 = await saveObservation(
        { type: "note", title: "Keep as is", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );

      await markAsPromoted([id1], "rules/test.md");

      const db = await getTestDb();
      const row = await db.all(`SELECT promoted_to FROM observations WHERE id = ?`, id2) as Array<{ promoted_to: string | null }>;
      expect(row[0].promoted_to).toBeNull();
    });
  });

  describe("searchObservations (ILIKE path — embedding disabled)", () => {
    it("should find by title keyword", async () => {
      await saveObservation(
        { type: "warning", title: "DuckDB BigInt overflow", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const results = await searchObservations(fixtures.projectId, "BigInt");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("DuckDB BigInt overflow");
    });

    it("should find by concept keyword", async () => {
      await saveObservation(
        { type: "note", title: "Framework decision", facts: [], concepts: ["hono", "typescript"], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const results = await searchObservations(fixtures.projectId, "hono");
      expect(results.some(r => r.title === "Framework decision")).toBe(true);
    });

    it("should filter by type", async () => {
      await saveObservation(
        { type: "warning", title: "A warning mark", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      await saveObservation(
        { type: "note", title: "A note mark", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const results = await searchObservations(fixtures.projectId, "", "warning");
      expect(results.every(r => r.type === "warning")).toBe(true);
      expect(results.some(r => r.title === "A warning mark")).toBe(true);
    });

    it("should exclude promoted observations", async () => {
      const id = await saveObservation(
        { type: "note", title: "promoted-unique-abc123", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      await markAsPromoted([id], "rules/test.md");
      const results = await searchObservations(fixtures.projectId, "promoted-unique-abc123");
      expect(results.find(r => r.id === id)).toBeUndefined();
    });

    it("should treat _ as literal (not SQL wildcard)", async () => {
      await saveObservation(
        { type: "note", title: "callback_fn hook", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      await saveObservation(
        { type: "note", title: "callbackXfn hook", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      // If _ is NOT escaped, "callback_fn" would match both titles (any char wildcard).
      // With proper escaping, it should only match the literal "callback_fn" title.
      const results = await searchObservations(fixtures.projectId, "callback_fn");
      expect(results.some(r => r.title === "callback_fn hook")).toBe(true);
      expect(results.some(r => r.title === "callbackXfn hook")).toBe(false);
    });

    it("should treat % as literal (not SQL wildcard)", async () => {
      await saveObservation(
        { type: "note", title: "100% complete", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );
      const results = await searchObservations(fixtures.projectId, "100%");
      expect(results.some(r => r.title === "100% complete")).toBe(true);
    });

    it("should return empty for no matches", async () => {
      const results = await searchObservations(fixtures.projectId, "xyzNonExistentTermXyz");
      expect(results).toHaveLength(0);
    });
  });

  describe("getObservationsByProject", () => {
    it("should return observations filtered by project_id", async () => {
      await saveObservation(
        { type: "note", title: "Project mark", facts: [], concepts: [], files_read: [], files_modified: [] },
        fixtures.sessionId, null, fixtures.projectId
      );

      const result = await getObservationsByProject(fixtures.projectId);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Project mark");
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 5; i++) {
        await saveObservation(
          { type: "note", title: `Mark ${i}`, facts: [], concepts: [], files_read: [], files_modified: [] },
          fixtures.sessionId, null, fixtures.projectId
        );
      }

      const result = await getObservationsByProject(fixtures.projectId, 3);
      expect(result).toHaveLength(3);
    });

    it("should return empty for non-existent project", async () => {
      const result = await getObservationsByProject("non-existent");
      expect(result).toEqual([]);
    });
  });
});
