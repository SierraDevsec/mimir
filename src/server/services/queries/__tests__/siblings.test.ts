import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getSiblingAgents } from "../siblings.js";
import { getTestDb, clearTestData, closeTestDb } from "./setup.js";

// Mock getDb to return test database
vi.mock("../../../db.js", async () => {
  const setup = await import("./setup.js");
  return {
    getDb: () => setup.getTestDb(),
  };
});

describe("getSiblingAgents", () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("should return empty array when no siblings exist", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id)
                  VALUES ('agent1', 'sess1', 'agent-one', 'parent1')`);

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toEqual([]);
  });

  it("should return completed siblings with context_summary", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    // Add completed sibling
    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, parent_agent_id, status, context_summary, completed_at)
                  VALUES ('agent1', 'sess1', 'sibling-1', 'backend', 'parent1', 'completed', 'Fixed DB queries', '2026-02-05 10:00:00')`);

    // Add another completed sibling
    await db.run(`INSERT INTO agents (id, session_id, agent_name, agent_type, parent_agent_id, status, context_summary, completed_at)
                  VALUES ('agent2', 'sess1', 'sibling-2', 'frontend', 'parent1', 'completed', 'Updated UI', '2026-02-05 10:05:00')`);

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toHaveLength(2);
    expect(result[0].agent_name).toBe("sibling-2"); // Most recent first
    expect(result[0].context_summary).toBe("Updated UI");
    expect(result[1].agent_name).toBe("sibling-1");
  });

  it("should exclude active siblings", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status)
                  VALUES ('agent1', 'sess1', 'active-sibling', 'parent1', 'active')`);

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toEqual([]);
  });

  it("should exclude siblings without context_summary", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status, completed_at)
                  VALUES ('agent1', 'sess1', 'no-summary', 'parent1', 'completed', '2026-02-05 10:00:00')`);

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toEqual([]);
  });

  it("should limit to 5 most recent siblings", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);

    // Add 7 siblings
    for (let i = 1; i <= 7; i++) {
      await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status, context_summary, completed_at)
                    VALUES ('agent${i}', 'sess1', 'sibling-${i}', 'parent1', 'completed', 'Summary ${i}', '2026-02-05 10:0${i}:00')`);
    }

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toHaveLength(5);
    expect(result[0].agent_name).toBe("sibling-7"); // Most recent
  });

  it("should filter by session_id", async () => {
    const db = await getTestDb();
    await db.run(`INSERT INTO projects (id, name, path) VALUES ('proj1', 'Test', '/test')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess1', 'proj1')`);
    await db.run(`INSERT INTO sessions (id, project_id) VALUES ('sess2', 'proj1')`);

    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status, context_summary, completed_at)
                  VALUES ('agent1', 'sess1', 'sess1-sibling', 'parent1', 'completed', 'In sess1', '2026-02-05 10:00:00')`);
    await db.run(`INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status, context_summary, completed_at)
                  VALUES ('agent2', 'sess2', 'sess2-sibling', 'parent1', 'completed', 'In sess2', '2026-02-05 10:00:00')`);

    const result = await getSiblingAgents("sess1", "parent1");

    expect(result).toHaveLength(1);
    expect(result[0].agent_name).toBe("sess1-sibling");
  });
});
