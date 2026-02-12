import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getSameTypeAgents } from "../sameType.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

vi.mock("../../../db.js", async () => {
  const setup = await import("./setup.js");
  return {
    getDb: () => setup.getTestDb(),
  };
});

describe("getSameTypeAgents", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no same-type agents exist", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    const result = await getSameTypeAgents("backend", "sess1", null);

    expect(result).toEqual([]);
  });

  it("should return completed agents with same agent_type", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, context_summary, completed_at)
                  VALUES ('agent1', 'sess1', 'backend-1', 'backend', 'completed', 'Implemented API', '2026-02-05 10:00:00')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, context_summary, completed_at)
                  VALUES ('agent2', 'sess1', 'backend-2', 'backend', 'completed', 'Fixed bugs', '2026-02-05 10:05:00')`);

    const result = await getSameTypeAgents("backend", "sess1", null);

    expect(result).toHaveLength(2);
    expect(result[0].agent_name).toBe("backend-2"); // Most recent first
    expect(result[1].agent_name).toBe("backend-1");
  });

  it("should exclude siblings (same session and parent)", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    // Sibling agent (should be excluded)
    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, parent_agent_id, status, context_summary, completed_at)
                  VALUES ('agent1', 'sess1', 'sibling', 'backend', 'parent1', 'completed', 'Sibling work', '2026-02-05 10:00:00')`);

    // Different session agent (should be included)
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess2', 'proj1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, context_summary, completed_at)
                  VALUES ('agent2', 'sess2', 'other-session', 'backend', 'completed', 'Other session work', '2026-02-05 10:05:00')`);

    const result = await getSameTypeAgents("backend", "sess1", "parent1");

    expect(result).toHaveLength(1);
    expect(result[0].agent_name).toBe("other-session");
  });

  it("should limit to 3 most recent agents", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    // Add 5 agents
    for (let i = 1; i <= 5; i++) {
      await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, context_summary, completed_at)
                    VALUES ('agent${i}', 'sess1', 'backend-${i}', 'backend', 'completed', 'Work ${i}', '2026-02-05 10:0${i}:00')`);
    }

    const result = await getSameTypeAgents("backend", "sess1", null);

    expect(result).toHaveLength(3);
    expect(result[0].agent_name).toBe("backend-5"); // Most recent
  });

  it("should exclude agents without context_summary", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, completed_at)
                  VALUES ('agent1', 'sess1', 'no-summary', 'backend', 'completed', '2026-02-05 10:00:00')`);

    const result = await getSameTypeAgents("backend", "sess1", null);

    expect(result).toEqual([]);
  });

  it("should work with null parentAgentId", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, status, context_summary, completed_at)
                  VALUES ('agent1', 'sess1', 'root-agent', 'backend', 'completed', 'Root work', '2026-02-05 10:00:00')`);

    const result = await getSameTypeAgents("backend", "sess1", null);

    expect(result).toHaveLength(1);
    expect(result[0].agent_name).toBe("root-agent");
  });
});
