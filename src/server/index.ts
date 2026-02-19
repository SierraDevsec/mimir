import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env if present (Node 22 built-in)
const __dirname_env = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname_env, "../../.env");
if (existsSync(envPath)) {
  try { process.loadEnvFile(envPath); } catch { /* ignore */ }
}

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { getDb } from "./db.js";
import hooks from "./routes/hooks.js";
import api from "./routes/api.js";
import { addClient, removeClient, broadcast } from "./routes/ws.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Optional Bearer token auth — enable by setting MIMIR_API_TOKEN env var
// Protects against accidental port exposure (SSH tunnels, container port mapping, etc.)
const API_TOKEN = process.env.MIMIR_API_TOKEN;
if (API_TOKEN) {
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") return next(); // health check always allowed
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${API_TOKEN}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });
  app.use("/hooks/*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!auth || auth !== `Bearer ${API_TOKEN}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });
  console.log(`[mimir] API token auth enabled`);
}

// WebSocket 엔드포인트
app.get(
  "/ws",
  async (c, next) => {
    if (API_TOKEN) {
      const auth = c.req.header("Authorization");
      // WebSocket clients cannot set custom headers during the HTTP upgrade handshake,
      // so the token is accepted via query parameter as a well-established fallback.
      // Risk is low: this daemon is local-only; query params appear in server logs but
      // not in third-party logs or browser history for programmatic clients.
      const queryToken = c.req.query("token");
      if ((!auth || auth !== `Bearer ${API_TOKEN}`) && queryToken !== API_TOKEN) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    return next();
  },
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      console.log("[ws] client connected");
      addClient(ws);
    },
    onClose(_event, ws) {
      console.log("[ws] client disconnected");
      removeClient(ws);
    },
    onError(error) {
      console.error("[ws] error:", error);
    },
  }))
);

// 라우트 마운트
app.route("/hooks", hooks);
app.route("/api", api);

// 프로덕션: 빌드된 Web UI 서빙
const __dirname = dirname(fileURLToPath(import.meta.url));
// dev mode (tsx): __dirname = src/server → ../web = src/web (no built assets)
// prod mode (node): __dirname = dist/server → ../web = dist/web (has assets/)
const candidate = resolve(__dirname, "../web");
const webDistPath = existsSync(resolve(candidate, "assets"))
  ? candidate
  : resolve(__dirname, "../../dist/web");

if (existsSync(webDistPath)) {
  // Static assets (skip /api and /hooks paths)
  app.get("/*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/hooks/") || path === "/ws") {
      return next();
    }
    return serveStatic({ root: webDistPath })(c, next);
  });
  // SPA fallback (skip /api and /hooks paths)
  app.get("/*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/hooks/") || path === "/ws") {
      return next();
    }
    return serveStatic({ root: webDistPath, path: "index.html" })(c, next);
  });
} else {
  app.get("/", (c) => {
    return c.json({
      name: "mimir",
      version: "0.1.0",
      endpoints: {
        hooks: "POST /hooks/:event",
        api: "GET /api/*",
        ws: "GET /ws",
        ui: "Run 'pnpm build:web' first, then restart",
      },
    });
  });
}

const PORT = parseInt(process.env.MIMIR_PORT ?? "3100", 10);

async function main() {
  // DB 초기화
  await getDb();
  console.log(`[mimir] database initialized`);

  // End zombie sessions/agents from previous daemon run
  const db = await getDb();
  const zombieSessions = await db.all(`UPDATE sessions SET status = 'ended', ended_at = now() WHERE status = 'active' RETURNING id`);
  const zombieAgents = await db.all(`UPDATE agents SET status = 'completed', completed_at = now() WHERE status = 'active' RETURNING id`);
  if (zombieSessions.length > 0 || zombieAgents.length > 0) {
    console.log(`[mimir] Cleaned up ${zombieSessions.length} zombie sessions, ${zombieAgents.length} zombie agents`);
  }

  // Backfill embeddings for observations missing them (async, non-blocking)
  const { isEmbeddingEnabled, backfillEmbeddings, ensureHnswIndex } = await import("./services/embedding.js");
  if (isEmbeddingEnabled()) {
    backfillEmbeddings().then(count => {
      if (count > 0) console.log(`[mimir] Backfilled ${count} observation embeddings`);
      return ensureHnswIndex();
    }).catch(err => console.error("[mimir] Embedding backfill failed:", err));
  }

  // Start periodic embedding backfill timer (only when embedding is enabled)
  if (isEmbeddingEnabled()) {
    const { startBackfill } = await import("./services/observation-store.js");
    startBackfill();
  }

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[mimir] server running on http://localhost:${info.port}`);
  });

  injectWebSocket(server);

  // Periodic stale agent cleanup every 10 minutes
  // Agents killed via ESC or context limit don't fire SubagentStop — catch them here
  const staleCleanupTimer = setInterval(async () => {
    try {
      const db = await getDb();
      const stale = await db.all(
        `UPDATE agents SET status = 'completed', completed_at = now()
         WHERE status = 'active'
           AND started_at < now() - INTERVAL 2 HOUR
         RETURNING id, agent_name`
      ) as Array<{ id: string; agent_name: string }>;
      if (stale.length > 0) {
        console.log(`[mimir] Cleaned up ${stale.length} stale agent(s): ${stale.map(a => a.agent_name).join(", ")}`);
        for (const a of stale) {
          broadcast("SubagentStop", { agent_id: a.id, agent_name: a.agent_name, stale: true });
        }
      }
    } catch (err) {
      console.error("[mimir] stale agent cleanup failed:", err);
    }
  }, 10 * 60 * 1000);

  // Slack bridge (opt-in via env vars)
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    let slackProjectId = process.env.SLACK_PROJECT_ID;
    if (!slackProjectId) {
      // Auto-detect: pick the first (most recent) project from DB
      const { getAllProjects } = await import("./services/project.js");
      const projects = await getAllProjects() as Array<{ id: string }>;
      if (projects.length > 0) {
        slackProjectId = projects[0].id;
        console.log(`[slack] auto-detected project: ${slackProjectId}`);
      } else {
        console.warn("[slack] no projects found in DB, using 'default'");
        slackProjectId = "default";
      }
    }
    const { startSlackBridge } = await import("./services/slack.js");
    startSlackBridge(slackProjectId);
  }

  // graceful shutdown
  const shutdown = async () => {
    console.log("\n[mimir] shutting down...");
    clearInterval(staleCleanupTimer);
    const { pingInterval } = await import("./routes/ws.js");
    clearInterval(pingInterval);
    const { stopBackfill } = await import("./services/observation-store.js");
    stopBackfill();
    if (process.env.SLACK_BOT_TOKEN) {
      const { stopSlackBridge } = await import("./services/slack.js");
      stopSlackBridge();
    }
    const { closeDb } = await import("./db.js");
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Best-effort checkpoint on crash — reduces WAL corruption risk
  process.on("uncaughtException", async (err) => {
    console.error("[mimir] uncaughtException:", err);
    const { checkpoint } = await import("./db.js");
    await checkpoint().catch(() => {});
    process.exit(1);
  });
  // unhandledRejection: log + checkpoint but let Node.js v22 handle process exit
  // (Node.js v22 terminates on unhandled rejections by default — no explicit exit needed)
  process.on("unhandledRejection", async (reason) => {
    console.error("[mimir] unhandledRejection:", reason);
    const { checkpoint } = await import("./db.js");
    await checkpoint().catch(() => {});
  });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("EADDRINUSE")) {
    console.error(`[mimir] Port ${PORT} is already in use. Is another mimir instance running?`);
    console.error(`[mimir] Try: mimir stop, or use MIMIR_PORT=<port> mimir start`);
  } else if (msg.includes("duckdb") || msg.includes("DuckDB")) {
    console.error(`[mimir] Database error: ${msg}`);
    console.error(`[mimir] Try deleting data/mimir.duckdb and restarting`);
  } else {
    console.error("[mimir] Fatal error:", msg);
  }
  process.exit(1);
});
