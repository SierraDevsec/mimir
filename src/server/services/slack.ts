import { App } from "@slack/bolt";
import WebSocket from "ws";
import { sendMessage, getMessage, markAsRead, getMessagesByProject } from "./message.js";
import { notifyAgent } from "./notify.js";
import { broadcast } from "../routes/ws.js";
import { getRegisteredAgents } from "./registry.js";
import { getActiveSessionsByProject } from "./session.js";
import { getTasksByProject } from "./task.js";

const CLNODE_PORT = parseInt(process.env.CLNODE_PORT ?? "3100", 10);

let slackApp: App | null = null;

// --- Command handler ---

interface SlackCommandContext {
  projectId: string;
  app: App;
  channelId: string;
}

async function handleCommand(text: string, ctx: SlackCommandContext): Promise<string | null> {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "!help") {
    return [
      "*clnode Slack Commands*",
      "`!help` — Show this help",
      "`!status` — Active sessions & agents summary",
      "`!agents` — List registered agents",
      "`!tasks` — List open tasks",
      "`!msg <agent> <text>` — Send a message to an agent",
      "`!messages [agent]` — Show recent messages (optionally filtered by agent)",
    ].join("\n");
  }

  if (cmd === "!status") {
    const [agents, sessions] = await Promise.all([
      getRegisteredAgents(ctx.projectId),
      getActiveSessionsByProject(ctx.projectId),
    ]);
    const agentCount = (agents as unknown[]).length;
    const sessionCount = (sessions as unknown[]).length;
    return `*Status* (project: \`${ctx.projectId}\`)\nActive sessions: ${sessionCount}\nRegistered agents: ${agentCount}`;
  }

  if (cmd === "!agents") {
    const agents = await getRegisteredAgents(ctx.projectId) as Array<{ agent_name: string; status: string }>;
    if (agents.length === 0) return "No agents registered.";
    const lines = agents.map((a) => `• \`${a.agent_name}\` — ${a.status}`);
    return `*Agents* (${agents.length})\n${lines.join("\n")}`;
  }

  if (cmd === "!tasks") {
    const tasks = await getTasksByProject(ctx.projectId) as Array<{ id: number; title: string; status: string; assigned_to: string | null }>;
    const open = tasks.filter((t) => t.status !== "completed");
    if (open.length === 0) return "No open tasks.";
    const lines = open.slice(0, 15).map((t) => `• #${t.id} [${t.status}] ${t.title}${t.assigned_to ? ` → ${t.assigned_to}` : ""}`);
    return `*Tasks* (${open.length} open)\n${lines.join("\n")}`;
  }

  if (cmd === "!msg") {
    const toAgent = parts[1];
    const msgContent = parts.slice(2).join(" ");
    if (!toAgent || !msgContent) return "Usage: `!msg <agent> <text>`";

    const id = await sendMessage(ctx.projectId, "slack:user", toAgent, msgContent, "normal");
    broadcast("message_sent", { id, project_id: ctx.projectId, from_name: "slack:user", to_name: toAgent, priority: "normal" });
    notifyAgent(toAgent, ctx.projectId, "slack:user").catch(() => {});
    return `Message #${id} sent to \`${toAgent}\`.`;
  }

  if (cmd === "!messages") {
    const filterAgent = parts[1];
    const msgs = await getMessagesByProject(ctx.projectId, undefined, 10) as Array<{ from_name: string; to_name: string; content: string; created_at: string }>;
    let filtered = msgs;
    if (filterAgent) {
      filtered = msgs.filter((m) => m.from_name === filterAgent || m.to_name === filterAgent);
    }
    if (filtered.length === 0) return filterAgent ? `No recent messages for \`${filterAgent}\`.` : "No recent messages.";
    const lines = [...filtered].reverse().map((m) => {
      const ts = new Date(m.created_at).toLocaleTimeString();
      const snippet = m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content;
      return `[${ts}] \`${m.from_name}\` → \`${m.to_name}\`: ${snippet}`;
    });
    return lines.join("\n");
  }

  // Not a command
  return null;
}

// --- Bridge ---

export function startSlackBridge(projectId: string): void {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!botToken || !appToken || !channelId) {
    console.error("[slack] Missing SLACK_BOT_TOKEN, SLACK_APP_TOKEN, or SLACK_CHANNEL_ID");
    return;
  }

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  const cmdCtx: SlackCommandContext = { projectId, app, channelId };

  // Inbound: Slack → clnode
  app.message(async ({ message }) => {
    // Only handle regular user messages (not bot messages, not edits)
    if (message.subtype || !("text" in message) || !message.text) return;
    if (message.channel !== channelId) return;

    const username = ("user" in message && message.user) ? message.user : "unknown";
    const fromName = `slack:${username}`;
    const content = message.text;

    // Check for commands first
    if (content.startsWith("!")) {
      try {
        const reply = await handleCommand(content, cmdCtx);
        if (reply) {
          await app.client.chat.postMessage({ channel: channelId, text: reply });
          return;
        }
      } catch (err) {
        console.error("[slack] command error:", err);
      }
    }

    try {
      const id = await sendMessage(projectId, fromName, "orchestrator", content, "normal");
      broadcast("message_sent", { id, project_id: projectId, from_name: fromName, to_name: "orchestrator", priority: "normal" });
      notifyAgent("orchestrator", projectId, fromName).catch(() => {});
      console.log(`[slack] inbound message #${id} from ${fromName}`);
    } catch (err) {
      console.error("[slack] failed to store inbound message:", err);
    }
  });

  // Outbound: clnode → Slack (via WebSocket)
  connectWsForOutbound(app, channelId);

  app.start().then(() => {
    slackApp = app;
    console.log(`[slack] bridge started (channel: ${channelId}, project: ${projectId})`);
  }).catch((err) => {
    console.error("[slack] failed to start:", err);
  });
}

function connectWsForOutbound(app: App, channelId: string): void {
  const wsUrl = `ws://localhost:${CLNODE_PORT}/ws`;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("[slack] WebSocket connected for outbound relay");
    });

    ws.on("message", async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload.event !== "message_sent") return;

        const { id, to_name, from_name } = payload.data;
        if (to_name !== "slack" && !to_name.startsWith("slack:")) return;

        // Get full message content from DB
        const msg = await getMessage(Number(id));
        if (!msg) return;

        const text = `*${from_name}*: ${(msg as { content: string }).content}`;
        await app.client.chat.postMessage({
          channel: channelId,
          text,
        });

        // Mark as read after delivery
        await markAsRead(Number(id));
        console.log(`[slack] outbound message #${id} from ${from_name} → Slack`);
      } catch (err) {
        console.error("[slack] outbound relay error:", err);
      }
    });

    ws.on("close", () => {
      console.log("[slack] WebSocket disconnected, reconnecting in 3s...");
      reconnectTimer = setTimeout(connect, 3000);
    });

    ws.on("error", (err) => {
      console.error("[slack] WebSocket error:", err.message);
      ws.close();
    });
  }

  connect();

  // Cleanup on process exit
  process.on("SIGINT", () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
  process.on("SIGTERM", () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
}

export function stopSlackBridge(): void {
  if (slackApp) {
    slackApp.stop().catch(() => {});
    slackApp = null;
    console.log("[slack] bridge stopped");
  }
}
