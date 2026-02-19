import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getSiblingMarks, getProjectMarks, getFileBasedMarks } from "../relevantMarks.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

vi.mock("../../../db.js", async (importOriginal) => {
  const actual = await importOriginal();
  const setup = await import("./setup.js");
  return {
    ...actual as object,
    getDb: () => setup.getTestDb(),
  };
});

describe("getSiblingMarks", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no marks exist", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);

    const result = await getSiblingMarks("s1", "agent-a", "parent1");
    expect(result).toEqual([]);
  });

  it("should return sibling marks with parent_agent_id", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('a1', 's1', 'backend', 'parent1', 'completed')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('a2', 's1', 'frontend', 'parent1', 'active')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', 'a1', 'p1', 'warning', 'BigInt needs Number() wrap')`);

    const result = await getSiblingMarks("s1", "frontend", "parent1");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("BigInt needs Number() wrap");
    expect(result[0].type).toBe("warning");
    expect(result[0].agent_name).toBe("backend");
  });

  it("should exclude own agent marks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('a1', 's1', 'backend', 'parent1', 'active')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', 'a1', 'p1', 'note', 'My own mark')`);

    const result = await getSiblingMarks("s1", "backend", "parent1");
    expect(result).toEqual([]);
  });

  it("should exclude promoted marks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('a1', 's1', 'backend', 'parent1', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title, promoted_to)
                  VALUES ('s1', 'a1', 'p1', 'warning', 'Promoted mark', 'rules/duckdb.md')`);

    const result = await getSiblingMarks("s1", "frontend", "parent1");
    expect(result).toEqual([]);
  });

  it("should respect limit", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('a1', 's1', 'backend', 'parent1', 'completed')`);

    for (let i = 1; i <= 10; i++) {
      await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                    VALUES ('s1', 'a1', 'p1', 'note', 'Mark ${i}')`);
    }

    const result = await getSiblingMarks("s1", "frontend", "parent1", 3);
    expect(result).toHaveLength(3);
  });

  it("should fallback to session-wide marks when parentAgentId is null", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'backend', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', 'a1', 'p1', 'discovery', 'Session-wide mark')`);

    const result = await getSiblingMarks("s1", "frontend", null);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Session-wide mark");
  });
});

describe("getProjectMarks", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no marks exist", async () => {
    const result = await getProjectMarks("p1", "s1");
    expect(result).toEqual([]);
  });

  it("should return marks from other sessions", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'old-agent', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', 'a1', 'p1', 'decision', 'Chose DuckDB over SQLite')`);

    const result = await getProjectMarks("p1", "s2");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Chose DuckDB over SQLite");
    expect(result[0].agent_name).toBe("old-agent");
  });

  it("should exclude marks from current session", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'agent', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', 'a1', 'p1', 'note', 'Same session mark')`);

    const result = await getProjectMarks("p1", "s1");
    expect(result).toEqual([]);
  });

  it("should exclude promoted marks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'agent', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title, promoted_to)
                  VALUES ('s1', 'a1', 'p1', 'warning', 'Already promoted', 'rules/test.md')`);

    const result = await getProjectMarks("p1", "s2");
    expect(result).toEqual([]);
  });

  it("should handle marks without agent (LEFT JOIN)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);

    // Mark without agent_id (manual mark via API)
    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title)
                  VALUES ('s1', NULL, 'p1', 'note', 'Manual mark')`);

    const result = await getProjectMarks("p1", "s2");
    expect(result).toHaveLength(1);
    expect(result[0].agent_name).toBeNull();
  });
});

describe("getFileBasedMarks", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no files provided", async () => {
    const result = await getFileBasedMarks("p1", [], "s2");
    expect(result).toEqual([]);
  });

  it("should return marks matching files_read", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'backend', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title, files_read)
                  VALUES ('s1', 'a1', 'p1', 'warning', 'DB gotcha', ['src/server/db.ts'])`);

    const result = await getFileBasedMarks("p1", ["src/server/db.ts"], "s2");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("DB gotcha");
  });

  it("should return marks matching files_modified", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'backend', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title, files_modified)
                  VALUES ('s1', 'a1', 'p1', 'decision', 'API choice', ['src/server/routes/api.ts'])`);

    const result = await getFileBasedMarks("p1", ["src/server/routes/api.ts"], "s2");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("API choice");
  });

  it("should not return marks from current session", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, status)
                  VALUES ('a1', 's1', 'backend', 'completed')`);

    await db.run(`INSERT INTO observations (session_id, agent_id, project_id, type, title, files_read)
                  VALUES ('s1', 'a1', 'p1', 'warning', 'Same session', ['src/db.ts'])`);

    const result = await getFileBasedMarks("p1", ["src/db.ts"], "s1");
    expect(result).toEqual([]);
  });

  it("should exclude promoted marks", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);

    await db.run(`INSERT INTO observations (session_id, project_id, type, title, files_read, promoted_to)
                  VALUES ('s1', 'p1', 'warning', 'Promoted', ['src/db.ts'], 'rules/db.md')`);

    const result = await getFileBasedMarks("p1", ["src/db.ts"], "s2");
    expect(result).toEqual([]);
  });

  it("should not match when files do not overlap", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s1', 'p1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('s2', 'p1')`);

    await db.run(`INSERT INTO observations (session_id, project_id, type, title, files_read)
                  VALUES ('s1', 'p1', 'note', 'Unrelated', ['src/cli/index.ts'])`);

    const result = await getFileBasedMarks("p1", ["src/server/db.ts"], "s2");
    expect(result).toEqual([]);
  });
});
