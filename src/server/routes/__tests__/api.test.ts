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

// Mock db.js before importing route handlers
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

// Mock embedding to avoid external calls
vi.mock("../../services/embedding.js", () => ({
  isEmbeddingEnabled: () => false,
  generateEmbedding: vi.fn().mockResolvedValue(null),
  updateObservationEmbedding: vi.fn(),
  buildEmbeddingText: (title: string) => title,
  backfillEmbeddings: vi.fn().mockResolvedValue(0),
  ensureHnswIndex: vi.fn().mockResolvedValue(undefined),
  toEmbeddingLiteral: vi.fn().mockReturnValue("NULL"),
  startBackfill: vi.fn(),
  stopBackfill: vi.fn(),
}));

// Mock ws broadcast — no WebSocket server in tests
vi.mock("../ws.js", () => ({
  broadcast: vi.fn(),
  addClient: vi.fn(),
  removeClient: vi.fn(),
  pingInterval: null,
}));

// Mock agent-definition file-based service (reads disk)
vi.mock("../../services/agent-definition.js", () => ({
  listAgentDefinitions: vi.fn().mockResolvedValue([]),
  getAgentDefinition: vi.fn().mockResolvedValue(null),
  createAgentDefinition: vi.fn().mockResolvedValue(undefined),
  updateAgentDefinition: vi.fn().mockResolvedValue(undefined),
  deleteAgentDefinition: vi.fn().mockResolvedValue(undefined),
}));

// Mock skill service (file-based)
vi.mock("../../services/skill.js", () => ({
  listSkills: vi.fn().mockResolvedValue([]),
}));

// Mock notify (sends tmux notifications - side effect)
vi.mock("../../services/notify.js", () => ({
  notifyAgent: vi.fn().mockResolvedValue(undefined),
}));

// Mock swarm (spawns processes)
vi.mock("../../services/swarm.js", () => ({
  startSwarm: vi.fn().mockResolvedValue({ sessionName: "test-session" }),
  listSwarmSessions: vi.fn().mockResolvedValue([]),
}));

// Mock tmux (spawns processes)
vi.mock("../../services/tmux.js", () => ({
  createTmuxSession: vi.fn().mockResolvedValue("test-tmux-session"),
  createPane: vi.fn().mockResolvedValue("test-pane-id"),
  killPane: vi.fn().mockResolvedValue(undefined),
  killSession: vi.fn().mockResolvedValue(undefined),
  listPanes: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn().mockResolvedValue([]),
  getTmuxPane: vi.fn().mockResolvedValue(null),
  getTmuxSession: vi.fn().mockResolvedValue(null),
}));

// Mock statusline (in-memory only)
vi.mock("../../services/statusline.js", () => ({
  getStatusline: vi.fn().mockReturnValue(null),
  getStatuslineByPath: vi.fn().mockReturnValue(null),
  updateStatusline: vi.fn(),
}));

// Mock curation (external)
vi.mock("../../services/curation.js", () => ({
  getCurationStats: vi.fn().mockResolvedValue({ total: 0 }),
}));

// Import api router AFTER mocks are set up
import api from "../api.js";

/**
 * Build a minimal Hono app with only the /api mount — mirrors index.ts structure.
 * Auth middleware is added selectively in auth-specific tests.
 */
function buildApp(): Hono {
  const app = new Hono();
  app.route("/api", api);
  return app;
}

describe("API routes", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    await setupTestData(db);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  describe("GET /api/health", () => {
    it("returns 200 with status ok", async () => {
      const app = buildApp();
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string };
      expect(body.status).toBe("ok");
    });
  });

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------
  describe("GET /api/sessions", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe("project_id required");
    });

    it("returns 200 with empty array for valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/sessions?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("returns 200 with active sessions when active=true", async () => {
      const app = buildApp();
      const res = await app.request(`/api/sessions?project_id=${fixtures.projectId}&active=true`);
      expect(res.status).toBe(200);
      const body = await res.json() as Array<{ id: string; status: string }>;
      expect(Array.isArray(body)).toBe(true);
      // The test session inserted via setupTestData should appear
      const found = body.find(s => s.id === fixtures.sessionId);
      expect(found).toBeDefined();
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns 404 for non-existent session", async () => {
      const app = buildApp();
      const res = await app.request("/api/sessions/nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns 200 for existing session", async () => {
      const app = buildApp();
      const res = await app.request(`/api/sessions/${fixtures.sessionId}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { id: string };
      expect(body.id).toBe(fixtures.sessionId);
    });
  });

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------
  describe("GET /api/agents", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/agents");
      expect(res.status).toBe(400);
    });

    it("returns 200 with valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/agents?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Tasks — CRUD
  // ---------------------------------------------------------------------------
  describe("GET /api/tasks", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks");
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe("project_id required");
    });

    it("returns 200 with valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/tasks?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });
  });

  describe("POST /api/tasks", () => {
    it("returns 400 when body is invalid (missing title)", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when title is empty string", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId, title: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 with valid body", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          title: "Test Task",
          description: "A test task",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(typeof body.id).toBe("number");
    });

    it("returns 201 with tags array", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          title: "Tagged Task",
          tags: ["bug", "urgent"],
        }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("returns 404 for non-existent task id", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks/99999");
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid (non-numeric) id", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks/nonexistent");
      expect(res.status).toBe(400);
    });

    it("returns 200 for existing task", async () => {
      // Create a task first
      const app = buildApp();
      const createRes = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId, title: "Fetch Me" }),
      });
      const { id } = await createRes.json() as { id: number };

      const res = await app.request(`/api/tasks/${id}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { title: string };
      expect(body.title).toBe("Fetch Me");
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("returns 404 when task does not exist", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks/99999", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("returns 200 when task is deleted", async () => {
      const app = buildApp();
      const createRes = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId, title: "Delete Me" }),
      });
      const { id } = await createRes.json() as { id: number };

      const deleteRes = await app.request(`/api/tasks/${id}`, { method: "DELETE" });
      expect(deleteRes.status).toBe(200);
      const body = await deleteRes.json() as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/api/tasks/${id}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Observations
  // ---------------------------------------------------------------------------
  describe("POST /api/observations", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "test" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when text is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 with valid body", async () => {
      const app = buildApp();
      const res = await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          text: "DuckDB COUNT returns BigInt",
          type: "warning",
          concepts: ["duckdb", "bigint"],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(typeof body.id).toBe("number");
    });
  });

  describe("GET /api/observations", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/observations");
      expect(res.status).toBe(400);
    });

    it("returns 200 with valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/observations?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });

    it("returns created observation in list", async () => {
      const app = buildApp();
      await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          text: "Unique observation xyz987",
          type: "note",
        }),
      });

      const res = await app.request(`/api/observations?project_id=${fixtures.projectId}`);
      const body = await res.json() as Array<{ title: string }>;
      expect(body.some(o => o.title.includes("Unique observation xyz987"))).toBe(true);
    });

    it("returns search results for matching query", async () => {
      const app = buildApp();
      await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          text: "Hono routing pattern abc123",
          type: "discovery",
          concepts: ["hono", "routing"],
        }),
      });

      const res = await app.request(
        `/api/observations?project_id=${fixtures.projectId}&query=Hono`
      );
      const body = await res.json() as Array<{ title: string }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/observations/promote", () => {
    it("returns 400 with invalid body", async () => {
      const app = buildApp();
      const res = await app.request("/api/observations/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }), // empty ids not allowed
      });
      expect(res.status).toBe(400);
    });

    it("returns 200 when promotion succeeds", async () => {
      const app = buildApp();
      // Create an observation first
      const createRes = await app.request("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          text: "To be promoted",
          type: "decision",
        }),
      });
      const { id } = await createRes.json() as { id: number };

      const promoteRes = await app.request("/api/observations/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], promoted_to: "rules/test.md" }),
      });
      expect(promoteRes.status).toBe(200);
      const body = await promoteRes.json() as { ok: boolean; count: number };
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  describe("GET /api/messages", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/messages");
      expect(res.status).toBe(400);
    });

    it("returns 200 with valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/messages?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });
  });

  describe("POST /api/messages", () => {
    it("returns 400 when required fields are missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 with valid message body", async () => {
      const app = buildApp();
      const res = await app.request("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          from_name: "agent-a",
          to_name: "agent-b",
          content: "Hello from A",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  describe("GET /api/stats", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/stats");
      expect(res.status).toBe(400);
    });

    it("returns 200 with count fields", async () => {
      const app = buildApp();
      const res = await app.request(`/api/stats?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        total_sessions: number;
        active_sessions: number;
        total_agents: number;
      };
      expect(typeof body.total_sessions).toBe("number");
      expect(typeof body.active_sessions).toBe("number");
      expect(typeof body.total_agents).toBe("number");
    });
  });

  // ---------------------------------------------------------------------------
  // Flows
  // ---------------------------------------------------------------------------
  describe("GET /api/flows", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/flows");
      expect(res.status).toBe(400);
    });

    it("returns 200 with empty array for new project", async () => {
      const app = buildApp();
      const res = await app.request(`/api/flows?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe("POST /api/flows", () => {
    it("returns 400 when required fields are missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: fixtures.projectId, name: "My Flow" }),
        // mermaid_code missing
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 when flow is created", async () => {
      const app = buildApp();
      const res = await app.request("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          name: "Test Flow",
          mermaid_code: "graph TD\nA --> B",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { ok: boolean; id: number };
      expect(body.ok).toBe(true);
      expect(typeof body.id).toBe("number");
    });

    it("returns created flow via GET", async () => {
      const app = buildApp();
      const createRes = await app.request("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          name: "Fetch Flow",
          mermaid_code: "graph LR\nX --> Y",
        }),
      });
      const { id } = await createRes.json() as { id: number };

      const getRes = await app.request(`/api/flows/${id}`);
      expect(getRes.status).toBe(200);
      const body = await getRes.json() as { name: string };
      expect(body.name).toBe("Fetch Flow");
    });
  });

  describe("DELETE /api/flows/:id", () => {
    it("returns 404 for non-existent flow", async () => {
      const app = buildApp();
      const res = await app.request("/api/flows/99999", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("returns 200 when flow is deleted", async () => {
      const app = buildApp();
      const createRes = await app.request("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: fixtures.projectId,
          name: "To Delete",
          mermaid_code: "graph TD\nA --> B",
        }),
      });
      const { id } = await createRes.json() as { id: number };

      const deleteRes = await app.request(`/api/flows/${id}`, { method: "DELETE" });
      expect(deleteRes.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------
  describe("GET /api/registry", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/registry");
      expect(res.status).toBe(400);
    });

    it("returns 200 with empty array", async () => {
      const app = buildApp();
      const res = await app.request(`/api/registry?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe("POST /api/registry", () => {
    it("returns 400 when required fields missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: "test-agent" }), // project_id missing
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 when registration succeeds", async () => {
      const app = buildApp();
      const res = await app.request("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: "backend-dev",
          project_id: fixtures.projectId,
          tmux_pane: "%5",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth middleware
  // ---------------------------------------------------------------------------
  describe("Auth middleware (MIMIR_API_TOKEN)", () => {
    it("returns 401 on protected routes when token is missing", async () => {
      const originalToken = process.env.MIMIR_API_TOKEN;
      process.env.MIMIR_API_TOKEN = "secret-test-token-xyz";

      try {
        // Rebuild the app with auth enabled — replicate index.ts auth logic
        const { timingSafeEqual } = await import("node:crypto");
        const authApp = new Hono();
        const TOKEN = process.env.MIMIR_API_TOKEN;

        function isValidToken(auth: string | undefined): boolean {
          if (!TOKEN) return true;
          const expected = `Bearer ${TOKEN}`;
          const actual = auth ?? "";
          const maxLen = Math.max(actual.length, expected.length);
          const bufA = Buffer.alloc(maxLen);
          const bufB = Buffer.alloc(maxLen);
          bufA.write(actual);
          bufB.write(expected);
          return timingSafeEqual(bufA, bufB);
        }

        authApp.use("/api/*", async (c, next) => {
          if (c.req.path === "/api/health") return next();
          if (!isValidToken(c.req.header("Authorization"))) {
            return c.json({ error: "Unauthorized" }, 401);
          }
          return next();
        });
        authApp.route("/api", api);

        const res = await authApp.request(`/api/sessions?project_id=${fixtures.projectId}`);
        expect(res.status).toBe(401);
        const body = await res.json() as { error: string };
        expect(body.error).toBe("Unauthorized");
      } finally {
        if (originalToken === undefined) {
          delete process.env.MIMIR_API_TOKEN;
        } else {
          process.env.MIMIR_API_TOKEN = originalToken;
        }
      }
    });

    it("health check bypasses auth even when token is required", async () => {
      const originalToken = process.env.MIMIR_API_TOKEN;
      process.env.MIMIR_API_TOKEN = "secret-test-token-xyz";

      try {
        const { timingSafeEqual } = await import("node:crypto");
        const authApp = new Hono();
        const TOKEN = process.env.MIMIR_API_TOKEN;

        function isValidToken(auth: string | undefined): boolean {
          if (!TOKEN) return true;
          const expected = `Bearer ${TOKEN}`;
          const actual = auth ?? "";
          const maxLen = Math.max(actual.length, expected.length);
          const bufA = Buffer.alloc(maxLen);
          const bufB = Buffer.alloc(maxLen);
          bufA.write(actual);
          bufB.write(expected);
          return timingSafeEqual(bufA, bufB);
        }

        authApp.use("/api/*", async (c, next) => {
          if (c.req.path === "/api/health") return next();
          if (!isValidToken(c.req.header("Authorization"))) {
            return c.json({ error: "Unauthorized" }, 401);
          }
          return next();
        });
        authApp.route("/api", api);

        const res = await authApp.request("/api/health");
        expect(res.status).toBe(200);
      } finally {
        if (originalToken === undefined) {
          delete process.env.MIMIR_API_TOKEN;
        } else {
          process.env.MIMIR_API_TOKEN = originalToken;
        }
      }
    });

    it("allows request with correct Bearer token", async () => {
      const originalToken = process.env.MIMIR_API_TOKEN;
      process.env.MIMIR_API_TOKEN = "secret-test-token-xyz";

      try {
        const { timingSafeEqual } = await import("node:crypto");
        const authApp = new Hono();
        const TOKEN = process.env.MIMIR_API_TOKEN;

        function isValidToken(auth: string | undefined): boolean {
          if (!TOKEN) return true;
          const expected = `Bearer ${TOKEN}`;
          const actual = auth ?? "";
          const maxLen = Math.max(actual.length, expected.length);
          const bufA = Buffer.alloc(maxLen);
          const bufB = Buffer.alloc(maxLen);
          bufA.write(actual);
          bufB.write(expected);
          return timingSafeEqual(bufA, bufB);
        }

        authApp.use("/api/*", async (c, next) => {
          if (c.req.path === "/api/health") return next();
          if (!isValidToken(c.req.header("Authorization"))) {
            return c.json({ error: "Unauthorized" }, 401);
          }
          return next();
        });
        authApp.route("/api", api);

        const res = await authApp.request(
          `/api/sessions?project_id=${fixtures.projectId}`,
          { headers: { Authorization: "Bearer secret-test-token-xyz" } }
        );
        expect(res.status).toBe(200);
      } finally {
        if (originalToken === undefined) {
          delete process.env.MIMIR_API_TOKEN;
        } else {
          process.env.MIMIR_API_TOKEN = originalToken;
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------------
  describe("GET /api/activities", () => {
    it("returns 400 when project_id is missing", async () => {
      const app = buildApp();
      const res = await app.request("/api/activities");
      expect(res.status).toBe(400);
    });

    it("returns 200 with valid project_id", async () => {
      const app = buildApp();
      const res = await app.request(`/api/activities?project_id=${fixtures.projectId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------
  describe("GET /api/projects", () => {
    it("returns 200 with list including test project", async () => {
      const app = buildApp();
      const res = await app.request("/api/projects");
      expect(res.status).toBe(200);
      const body = await res.json() as Array<{ id: string }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.some(p => p.id === fixtures.projectId)).toBe(true);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("returns 404 for non-existent project", async () => {
      const app = buildApp();
      const res = await app.request("/api/projects/nonexistent", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe("error handler", () => {
    it("returns 400 on invalid JSON body", async () => {
      const app = buildApp();
      const res = await app.request("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-valid-json",
      });
      // Either 400 (SyntaxError caught by onError) or 400 (validation failure)
      expect(res.status).toBe(400);
    });
  });
});
