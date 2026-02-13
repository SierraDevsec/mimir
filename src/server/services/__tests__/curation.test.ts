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

import { getCurationStats } from "../curation.js";
import { logActivity } from "../activity.js";

describe("curation service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
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

  describe("getCurationStats", () => {
    it("should return default stats when no data exists", async () => {
      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.last_curated).toBeNull();
      expect(stats.sessions_since).toBe(1); // the session we inserted
      expect(stats.marks_since).toBe(0);
      expect(stats.promotion_candidates).toBe(0);
      expect(stats.agent_memories).toBeInstanceOf(Array);
    });

    it("should count sessions since last curation", async () => {
      // Record a curation event with explicit past timestamp
      await db.run(
        `INSERT INTO activity_log (session_id, event_type, details, created_at)
         VALUES ('curation', 'curation_completed', '{}', '2025-01-01 00:00:00')`,
      );

      // Add sessions after curation timestamp
      await db.run(
        `INSERT INTO sessions (id, project_id, status, started_at) VALUES (?, ?, 'active', '2025-01-02 00:00:00')`,
        "sess-after-1", fixtures.projectId
      );
      await db.run(
        `INSERT INTO sessions (id, project_id, status, started_at) VALUES (?, ?, 'active', '2025-01-03 00:00:00')`,
        "sess-after-2", fixtures.projectId
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.last_curated).not.toBeNull();
      // Original session from beforeEach has now() timestamp (2026), so it's after curation too
      expect(stats.sessions_since).toBe(3);
    });

    it("should count marks since last curation", async () => {
      // Record curation with past timestamp
      await db.run(
        `INSERT INTO activity_log (session_id, event_type, details, created_at)
         VALUES ('curation', 'curation_completed', '{}', '2025-01-01 00:00:00')`,
      );

      // Add marks after curation timestamp
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts, created_at)
         VALUES (?, ?, 'warning', 'New gotcha', ['duckdb'], '2025-01-02 00:00:00')`,
        fixtures.sessionId, fixtures.projectId
      );
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts, created_at)
         VALUES (?, ?, 'discovery', 'Found something', ['hooks'], '2025-01-03 00:00:00')`,
        fixtures.sessionId, fixtures.projectId
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.marks_since).toBe(2);
    });

    it("should return 0 marks/sessions when curation just happened", async () => {
      // Curation with future timestamp — everything before it
      await db.run(
        `INSERT INTO activity_log (session_id, event_type, details, created_at)
         VALUES ('curation', 'curation_completed', '{}', '2099-01-01 00:00:00')`,
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.marks_since).toBe(0);
      expect(stats.sessions_since).toBe(0);
    });

    it("should count all sessions when never curated", async () => {
      await db.run(
        `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
        "sess-2", fixtures.projectId
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.last_curated).toBeNull();
      expect(stats.sessions_since).toBe(2);
    });

    it("should count all marks when never curated", async () => {
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'note', 'Mark 1', ['test'])`,
        fixtures.sessionId, fixtures.projectId
      );
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'note', 'Mark 2', ['test'])`,
        fixtures.sessionId, fixtures.projectId
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.last_curated).toBeNull();
      expect(stats.marks_since).toBe(2);
    });

    it("should count promotion candidates", async () => {
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "sess-2", fixtures.projectId
      );

      // 3 marks with 'duckdb' across 2 sessions → meets default threshold (3, 2)
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'warning', 'BigInt', ['duckdb'])`,
        fixtures.sessionId, fixtures.projectId
      );
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'warning', 'Array literal', ['duckdb'])`,
        fixtures.sessionId, fixtures.projectId
      );
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'discovery', 'now()', ['duckdb'])`,
        "sess-2", fixtures.projectId
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.promotion_candidates).toBe(1);
    });

    it("should filter by project_id", async () => {
      // Different project
      await db.run(
        `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
        "other-proj", "Other", "/other"
      );
      await db.run(
        `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
        "other-sess", "other-proj"
      );
      await db.run(
        `INSERT INTO observations (session_id, project_id, type, title, concepts)
         VALUES (?, ?, 'note', 'Other mark', ['test'])`,
        "other-sess", "other-proj"
      );

      const stats = await getCurationStats(fixtures.projectId);

      expect(stats.marks_since).toBe(0);
      expect(stats.sessions_since).toBe(1); // only our session
    });
  });
});
