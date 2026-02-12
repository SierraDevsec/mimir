import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getPromotionCandidates } from "../promotionCandidates.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

vi.mock("../../../db.js", async () => {
  const setup = await import("./setup.js");
  return { getDb: () => setup.getTestDb() };
});

describe("getPromotionCandidates", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty when no observations exist", async () => {
    const result = await getPromotionCandidates("p1");
    expect(result).toEqual([]);
  });

  it("should return empty when concepts do not meet thresholds", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);

    // Only 1 mark with 'duckdb' — below default minCount=3
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'BigInt gotcha', ['duckdb', 'bigint'])`);

    const result = await getPromotionCandidates("p1");
    expect(result).toEqual([]);
  });

  it("should aggregate concepts across marks and sessions", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);

    // 3 marks with 'duckdb' across 2 sessions
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'BigInt gotcha', ['duckdb', 'bigint'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'Array literal', ['duckdb', 'array'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s2', 'p1', 'discovery', 'now() vs current_timestamp', ['duckdb', 'timestamp'])`);

    const result = await getPromotionCandidates("p1", 3, 2);

    expect(result).toHaveLength(1);
    expect(result[0].concept).toBe("duckdb");
    expect(result[0].count).toBe(3);
    expect(result[0].session_count).toBe(2);
    expect(result[0].mark_ids).toHaveLength(3);
    expect(result[0].sample_titles).toContain("BigInt gotcha");
    expect(typeof result[0].count).toBe("number"); // BigInt→Number
  });

  it("should exclude promoted marks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);

    // 3 'duckdb' marks but 1 is promoted
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'Mark 1', ['duckdb'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts, promoted_to)
                  VALUES ('s1', 'p1', 'warning', 'Mark 2', ['duckdb'], 'rules/duckdb.md')`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s2', 'p1', 'warning', 'Mark 3', ['duckdb'])`);

    // Only 2 non-promoted marks — below threshold of 3
    const result = await getPromotionCandidates("p1", 3, 2);
    expect(result).toEqual([]);
  });

  it("should respect custom minCount and minSessions", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);

    // 2 marks in 1 session
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'Mark A', ['hooks'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'warning', 'Mark B', ['hooks'])`);

    // With relaxed thresholds: minCount=2, minSessions=1
    const result = await getPromotionCandidates("p1", 2, 1);
    expect(result).toHaveLength(1);
    expect(result[0].concept).toBe("hooks");
    expect(result[0].count).toBe(2);
  });

  it("should filter by project_id", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Proj1', '/p1')`);
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p2', 'Proj2', '/p2')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p2')`);

    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'note', 'P1 mark', ['react'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s1', 'p1', 'note', 'P1 mark 2', ['react'])`);
    await db.run(`INSERT INTO observations (session_id, project_id, type, title, concepts)
                  VALUES ('s2', 'p2', 'note', 'P2 mark', ['react'])`);

    // p1 only has 2 'react' marks in 1 session
    const result = await getPromotionCandidates("p1", 2, 1);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });
});
