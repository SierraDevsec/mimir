import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { Database } from "duckdb-async";
import {
  getTestDb,
  closeTestDb,
  truncateAllTables,
  setupTestData,
  fixtures,
} from "../../../__tests__/setup.js";

// Mock db.js first
vi.mock("../../db.js", async (importOriginal) => {
  const actual = await importOriginal();
  const setup = await import("../../../__tests__/setup.js");
  return {
    ...(actual as object),
    getDb: () => setup.getTestDb(),
    checkpoint: vi.fn(),
    getDataDir: () => "/tmp/mimir-test",
  };
});

// Mock embedding service
vi.mock("../../services/embedding.js", () => ({
  isEmbeddingEnabled: () => false,
  generateEmbedding: vi.fn().mockResolvedValue(null),
  updateObservationEmbedding: vi.fn(),
  buildEmbeddingText: (title: string) => title,
  backfillEmbeddings: vi.fn().mockResolvedValue(0),
  ensureHnswIndex: vi.fn().mockResolvedValue(undefined),
  toEmbeddingLiteral: vi.fn().mockReturnValue("NULL"),
}));

// Mock observation-store to prevent backfill timers
vi.mock("../../services/observation-store.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    startBackfill: vi.fn(),
    stopBackfill: vi.fn(),
  };
});

// Mock WebSocket broadcast — no WS server in tests
vi.mock("../ws.js", () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  removeClient: vi.fn(),
  pingInterval: null,
}));

// Mock buildSmartContext to avoid heavy intelligence queries and RAG calls
vi.mock("../../services/intelligence.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    buildSmartContext: vi.fn().mockResolvedValue("## Test Context\nNo marks found."),
    buildPromptContext: vi.fn().mockResolvedValue("[mimir project context]\n\n(No active tasks or agents)"),
    checkIncompleteTasks: vi.fn().mockResolvedValue(null),
  };
});

// Mock statusline (in-memory)
vi.mock("../../services/statusline.js", () => ({
  getStatusline: vi.fn().mockReturnValue(null),
  getStatuslineByPath: vi.fn().mockReturnValue(null),
  updateStatusline: vi.fn(),
}));

// Mock promotionCandidates (read-only query)
vi.mock("../../services/queries/promotionCandidates.js", () => ({
  getPromotionCandidates: vi.fn().mockResolvedValue([]),
}));

// Import hooks AFTER mocks are set up
import hooks from "../hooks.js";

function buildApp(): Hono {
  const app = new Hono();
  app.route("/hooks", hooks);
  return app;
}

function makeHookRequest(app: Hono, event: string, body: object) {
  return app.request(`/hooks/${event}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Hook handler", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    await setupTestData(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ---------------------------------------------------------------------------
  // SessionStart
  // ---------------------------------------------------------------------------
  describe("SessionStart", () => {
    it("creates session record and returns empty JSON", async () => {
      const app = buildApp();
      const sessionId = "hook-test-session-001";
      const res = await makeHookRequest(app, "SessionStart", {
        session_id: sessionId,
        cwd: fixtures.projectPath,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});

      // Verify session was created in DB
      const rows = await db.all("SELECT * FROM sessions WHERE id = ?", sessionId);
      expect(rows).toHaveLength(1);
    });

    it("associates session with existing project by path", async () => {
      const app = buildApp();
      const sessionId = "hook-test-session-002";
      await makeHookRequest(app, "SessionStart", {
        session_id: sessionId,
        cwd: fixtures.projectPath, // matches test project path
      });

      const rows = await db.all(
        "SELECT project_id FROM sessions WHERE id = ?",
        sessionId
      ) as Array<{ project_id: string | null }>;
      expect(rows[0]?.project_id).toBe(fixtures.projectId);
    });

    it("creates session even without cwd", async () => {
      const app = buildApp();
      const sessionId = "hook-test-session-003";
      const res = await makeHookRequest(app, "SessionStart", {
        session_id: sessionId,
      });
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // SubagentStart
  // ---------------------------------------------------------------------------
  describe("SubagentStart", () => {
    it("registers agent and returns hookSpecificOutput with hookEventName", async () => {
      const app = buildApp();
      const agentId = "hook-agent-001";
      const res = await makeHookRequest(app, "SubagentStart", {
        session_id: fixtures.sessionId,
        agent_id: agentId,
        agent_type: "backend-dev",
      });

      expect(res.status).toBe(200);
      const body = await res.json() as {
        hookSpecificOutput: { hookEventName: string; additionalContext?: string };
      };
      expect(body.hookSpecificOutput).toBeDefined();
      expect(body.hookSpecificOutput.hookEventName).toBe("SubagentStart");
    });

    it("returns additionalContext string when context is available", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "SubagentStart", {
        session_id: fixtures.sessionId,
        agent_id: "hook-agent-002",
        agent_type: "backend-dev",
      });

      const body = await res.json() as {
        hookSpecificOutput: { hookEventName: string; additionalContext?: string };
      };
      // buildSmartContext is mocked to return a non-empty string, so additionalContext should be set
      expect(body.hookSpecificOutput.additionalContext).toBeDefined();
      expect(typeof body.hookSpecificOutput.additionalContext).toBe("string");
    });

    it("creates agent record in DB", async () => {
      const app = buildApp();
      const agentId = "hook-agent-003";
      await makeHookRequest(app, "SubagentStart", {
        session_id: fixtures.sessionId,
        agent_id: agentId,
        agent_type: "frontend-dev",
      });

      const rows = await db.all("SELECT * FROM agents WHERE id = ?", agentId);
      expect(rows).toHaveLength(1);
    });

    it("still returns hookSpecificOutput on service failure (error recovery)", async () => {
      // Override buildSmartContext to throw for this test
      const { buildSmartContext } = await import("../../services/intelligence.js");
      vi.mocked(buildSmartContext).mockRejectedValueOnce(new Error("simulated failure"));

      const app = buildApp();
      const res = await makeHookRequest(app, "SubagentStart", {
        session_id: fixtures.sessionId,
        agent_id: "hook-agent-err",
        agent_type: "backend-dev",
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { hookSpecificOutput: { hookEventName: string } };
      expect(body.hookSpecificOutput).toBeDefined();
      expect(body.hookSpecificOutput.hookEventName).toBe("SubagentStart");
    });
  });

  // ---------------------------------------------------------------------------
  // SubagentStop
  // ---------------------------------------------------------------------------
  describe("SubagentStop", () => {
    it("marks agent as completed and returns empty JSON", async () => {
      const app = buildApp();
      // First start the agent
      const agentId = "hook-stop-agent-001";
      await db.run(
        "INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, ?, 'active')",
        agentId, fixtures.sessionId, "backend-dev"
      );

      const res = await makeHookRequest(app, "SubagentStop", {
        session_id: fixtures.sessionId,
        agent_id: agentId,
        context_summary: "Completed all API endpoints",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});

      // Verify agent status updated
      const rows = await db.all(
        "SELECT status FROM agents WHERE id = ?",
        agentId
      ) as Array<{ status: string }>;
      expect(rows[0]?.status).toBe("completed");
    });

    it("handles missing agent_id gracefully", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "SubagentStop", {
        session_id: fixtures.sessionId,
        // agent_id omitted
      });
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // PostToolUse
  // ---------------------------------------------------------------------------
  describe("PostToolUse", () => {
    it("records file change for Edit tool", async () => {
      const app = buildApp();
      const agentId = "hook-tool-agent-001";
      await db.run(
        "INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, ?, 'active')",
        agentId, fixtures.sessionId, "backend-dev"
      );

      const res = await makeHookRequest(app, "PostToolUse", {
        session_id: fixtures.sessionId,
        agent_id: agentId,
        tool_name: "Edit",
        tool_input: { file_path: "src/server/db.ts" },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});

      const rows = await db.all(
        "SELECT file_path, change_type FROM file_changes WHERE session_id = ?",
        fixtures.sessionId
      ) as Array<{ file_path: string; change_type: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].file_path).toBe("src/server/db.ts");
      expect(rows[0].change_type).toBe("edit");
    });

    it("records file change for Write tool with change_type=create", async () => {
      const app = buildApp();
      await makeHookRequest(app, "PostToolUse", {
        session_id: fixtures.sessionId,
        agent_id: null,
        tool_name: "Write",
        tool_input: { file_path: "src/new-file.ts" },
      });

      const rows = await db.all(
        "SELECT change_type FROM file_changes WHERE session_id = ?",
        fixtures.sessionId
      ) as Array<{ change_type: string }>;
      expect(rows.some(r => r.change_type === "create")).toBe(true);
    });

    it("does not record file change for non-Edit/Write tools", async () => {
      const app = buildApp();
      await makeHookRequest(app, "PostToolUse", {
        session_id: fixtures.sessionId,
        tool_name: "Bash",
        tool_input: { command: "ls" },
      });

      const rows = await db.all(
        "SELECT * FROM file_changes WHERE session_id = ?",
        fixtures.sessionId
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // UserPromptSubmit
  // ---------------------------------------------------------------------------
  describe("UserPromptSubmit", () => {
    it("returns hookSpecificOutput with hookEventName", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "UserPromptSubmit", {
        session_id: fixtures.sessionId,
        prompt: "What is the status of the project?",
      });

      expect(res.status).toBe(200);
      const body = await res.json() as {
        hookSpecificOutput: { hookEventName: string; additionalContext?: string };
      };
      expect(body.hookSpecificOutput).toBeDefined();
      expect(body.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    });

    it("includes additionalContext when project context is available", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "UserPromptSubmit", {
        session_id: fixtures.sessionId,
        prompt: "Help me build an API",
      });

      const body = await res.json() as {
        hookSpecificOutput: { additionalContext?: string };
      };
      // buildPromptContext is mocked to return non-empty string
      expect(body.hookSpecificOutput.additionalContext).toBeDefined();
    });

    it("still returns hookSpecificOutput on service failure", async () => {
      const { buildPromptContext } = await import("../../services/intelligence.js");
      vi.mocked(buildPromptContext).mockRejectedValueOnce(new Error("prompt context failed"));

      const app = buildApp();
      const res = await makeHookRequest(app, "UserPromptSubmit", {
        session_id: fixtures.sessionId,
        prompt: "Test",
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { hookSpecificOutput: { hookEventName: string } };
      expect(body.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown event
  // ---------------------------------------------------------------------------
  describe("Unknown / custom event", () => {
    it("returns empty JSON for unknown event type", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "SomeCustomEvent", {
        session_id: fixtures.sessionId,
        some_field: "value",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});
    });

    it("logs activity for unknown events", async () => {
      const app = buildApp();
      await makeHookRequest(app, "UnknownEvent", {
        session_id: fixtures.sessionId,
      });

      const rows = await db.all(
        "SELECT event_type FROM activity_log WHERE session_id = ? AND event_type = 'UnknownEvent'",
        fixtures.sessionId
      ) as Array<{ event_type: string }>;
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid body
  // ---------------------------------------------------------------------------
  describe("Invalid / malformed body", () => {
    it("returns valid JSON even with completely invalid body (never breaks Claude Code)", async () => {
      const app = buildApp();
      const res = await app.request("/hooks/SessionStart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json-at-all!!!",
      });

      // Hook must always respond with valid JSON — never an error
      expect(res.status).toBe(200);
      expect(async () => await res.json()).not.toThrow();
    });

    it("returns valid JSON with empty body", async () => {
      const app = buildApp();
      const res = await app.request("/hooks/PostToolUse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // PostContext
  // ---------------------------------------------------------------------------
  describe("PostContext", () => {
    it("stores context entry when content is provided", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "PostContext", {
        session_id: fixtures.sessionId,
        entry_type: "decision",
        content: "Chose Hono over Express",
        tags: ["hono", "express"],
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);

      const rows = await db.all(
        "SELECT content FROM context_entries WHERE session_id = ? AND entry_type = 'decision'",
        fixtures.sessionId
      ) as Array<{ content: string }>;
      expect(rows.some(r => r.content === "Chose Hono over Express")).toBe(true);
    });

    it("ignores empty content", async () => {
      const app = buildApp();
      await makeHookRequest(app, "PostContext", {
        session_id: fixtures.sessionId,
        entry_type: "note",
        content: "",
      });

      const rows = await db.all(
        "SELECT * FROM context_entries WHERE session_id = ?",
        fixtures.sessionId
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // RegisterProject
  // ---------------------------------------------------------------------------
  describe("RegisterProject", () => {
    it("registers a new project and returns project_id", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "RegisterProject", {
        project_id: "new-hook-project",
        project_name: "Hook Test Project",
        project_path: "/tmp/hook-test",
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean; project_id: string };
      expect(body.ok).toBe(true);
      expect(body.project_id).toBe("new-hook-project");

      const rows = await db.all(
        "SELECT * FROM projects WHERE id = ?",
        "new-hook-project"
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Stop event
  // ---------------------------------------------------------------------------
  describe("Stop", () => {
    it("logs activity and returns empty JSON", async () => {
      const app = buildApp();
      const res = await makeHookRequest(app, "Stop", {
        session_id: fixtures.sessionId,
        reason: "session ended by user",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    });
  });
});
