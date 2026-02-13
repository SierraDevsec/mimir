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
import { addClient, removeClient } from "./routes/ws.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket 엔드포인트
app.get(
  "/ws",
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

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[mimir] server running on http://localhost:${info.port}`);
  });

  injectWebSocket(server);

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
