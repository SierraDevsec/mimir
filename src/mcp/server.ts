#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MIMIR_PORT = parseInt(process.env.MIMIR_PORT ?? "3100", 10);
const MIMIR_URL = `http://localhost:${MIMIR_PORT}`;
const DEFAULT_PROJECT_ID = process.env.MIMIR_PROJECT_ID ?? "";
const DEFAULT_AGENT_NAME = process.env.MIMIR_AGENT_NAME ?? "";
const TMUX_PANE = process.env.TMUX_PANE ?? null;

async function apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${MIMIR_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Auto-register: track which agent names have been registered this session
const registered = new Set<string>();

async function autoRegister(agentName: string, projectId: string): Promise<void> {
  const key = `${projectId}:${agentName}`;
  if (registered.has(key) || !TMUX_PANE) return;
  try {
    await apiCall("POST", "/api/registry", {
      agent_name: agentName,
      project_id: projectId,
      tmux_pane: TMUX_PANE,
    });
    registered.add(key);
  } catch {
    // Silently fail — daemon may not be running yet
  }
}

function resolveAgent(param: string | undefined): string | null {
  return param || DEFAULT_AGENT_NAME || null;
}

function resolveProject(param: string | undefined): string | null {
  return param || DEFAULT_PROJECT_ID || null;
}

const server = new McpServer({
  name: "mimir-messaging",
  version: "0.3.0",
});

// Auto-register on startup if both agent name and project are known
if (DEFAULT_AGENT_NAME && DEFAULT_PROJECT_ID && TMUX_PANE) {
  autoRegister(DEFAULT_AGENT_NAME, DEFAULT_PROJECT_ID).catch(() => {});
}

server.tool(
  "register_agent",
  "Register this agent session for automatic message notifications via tmux. Usually auto-registered, but call this to re-register or verify.",
  {
    agent_name: z.string().optional().describe("Agent name (auto-detected from MIMIR_AGENT_NAME env if omitted)"),
    project_id: z.string().optional().describe("Project ID (auto-detected from MIMIR_PROJECT_ID env if omitted)"),
  },
  async ({ agent_name, project_id }) => {
    const name = resolveAgent(agent_name);
    const pid = resolveProject(project_id);
    if (!name) {
      return {
        content: [{ type: "text" as const, text: "Error: agent_name required. Set MIMIR_AGENT_NAME env or pass agent_name parameter." }],
      };
    }
    if (!pid) {
      return {
        content: [{ type: "text" as const, text: "Error: project_id required. Set MIMIR_PROJECT_ID env or pass project_id parameter." }],
      };
    }
    if (!TMUX_PANE) {
      return {
        content: [{ type: "text" as const, text: "Error: Not running inside tmux. TMUX_PANE environment variable not found." }],
      };
    }
    try {
      await apiCall("POST", "/api/registry", {
        agent_name: name,
        project_id: pid,
        tmux_pane: TMUX_PANE,
      });
      registered.add(`${pid}:${name}`);
      return {
        content: [{ type: "text" as const, text: `Registered "${name}" on tmux pane ${TMUX_PANE}. Automatic notifications enabled.` }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon at ${MIMIR_URL}. Is it running?` }],
      };
    }
  }
);

server.tool(
  "send_message",
  "Send a message to another agent. Your identity (from) is auto-detected from MIMIR_AGENT_NAME env. The target agent will be automatically notified via tmux.",
  {
    to: z.string().describe("Target agent name to send message to"),
    content: z.string().describe("Message content"),
    from: z.string().optional().describe("Your agent name (auto-detected from MIMIR_AGENT_NAME env if omitted)"),
    project_id: z.string().optional().describe("Project ID (auto-detected from MIMIR_PROJECT_ID env if omitted)"),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Message priority (default: normal)"),
  },
  async ({ to, content, from, project_id, priority }) => {
    const sender = resolveAgent(from);
    const pid = resolveProject(project_id);
    if (!sender) {
      return {
        content: [{ type: "text" as const, text: "Error: from required. Set MIMIR_AGENT_NAME env or pass from parameter." }],
      };
    }
    if (!pid) {
      return {
        content: [{ type: "text" as const, text: "Error: project_id required. Set MIMIR_PROJECT_ID env or pass project_id parameter." }],
      };
    }
    await autoRegister(sender, pid);
    try {
      const result = await apiCall("POST", "/api/messages", {
        project_id: pid,
        from_name: sender,
        to_name: to,
        content,
        priority: priority ?? "normal",
      }) as { ok?: boolean; id?: number; error?: string };

      if (result.ok) {
        return {
          content: [{ type: "text" as const, text: `Message sent to ${to} (id: ${result.id})` }],
        };
      }
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error ?? "unknown error"}` }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon at ${MIMIR_URL}. Is it running?` }],
      };
    }
  }
);

server.tool(
  "read_messages",
  "Read pending messages addressed to you. Your identity is auto-detected from MIMIR_AGENT_NAME env. Messages are automatically marked as read.",
  {
    agent_name: z.string().optional().describe("Your agent name (auto-detected from MIMIR_AGENT_NAME env if omitted)"),
    project_id: z.string().optional().describe("Project ID (auto-detected from MIMIR_PROJECT_ID env if omitted)"),
    limit: z.number().optional().describe("Max messages to retrieve (default: 10)"),
  },
  async ({ agent_name, project_id, limit }) => {
    const name = resolveAgent(agent_name);
    const pid = resolveProject(project_id);
    if (!name) {
      return {
        content: [{ type: "text" as const, text: "Error: agent_name required. Set MIMIR_AGENT_NAME env or pass agent_name parameter." }],
      };
    }
    if (!pid) {
      return {
        content: [{ type: "text" as const, text: "Error: project_id required. Set MIMIR_PROJECT_ID env or pass project_id parameter." }],
      };
    }
    await autoRegister(name, pid);
    try {
      const messages = await apiCall("GET",
        `/api/messages?project_id=${encodeURIComponent(pid)}&status=pending&limit=${limit ?? 10}`
      ) as Array<{ id: number; from_name: string; to_name: string; content: string; priority: string; created_at: string }>;

      const myMessages = messages.filter(m => m.to_name === name);

      if (myMessages.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No pending messages." }],
        };
      }

      for (const msg of myMessages) {
        await apiCall("PATCH", `/api/messages/${msg.id}`, { status: "read" });
      }

      const lines = myMessages.map(m =>
        `[${m.priority}] From ${m.from_name} (${m.created_at}):\n${m.content}`
      );

      return {
        content: [{ type: "text" as const, text: `${myMessages.length} message(s):\n\n${lines.join("\n\n---\n\n")}` }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon at ${MIMIR_URL}. Is it running?` }],
      };
    }
  }
);

server.tool(
  "list_agents",
  "List registered agents that you can send messages to.",
  {
    project_id: z.string().optional().describe("Project ID (auto-detected from MIMIR_PROJECT_ID env if omitted)"),
  },
  async ({ project_id }) => {
    const pid = resolveProject(project_id);
    try {
      const agents = await apiCall("GET",
        `/api/registry?project_id=${encodeURIComponent(pid || "")}`
      ) as Array<{ agent_name: string; tmux_pane: string; status: string; last_seen_at: string }>;

      if (agents.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No registered agents." }],
        };
      }

      const lines = agents.map(a =>
        `- ${a.agent_name} (pane: ${a.tmux_pane ?? "none"}) [${a.status}]`
      );

      return {
        content: [{ type: "text" as const, text: `Registered agents:\n${lines.join("\n")}` }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon at ${MIMIR_URL}. Is it running?` }],
      };
    }
  }
);

// ─── Progressive Disclosure: Observation Search Tools ───

server.tool(
  "__IMPORTANT",
  `MANDATORY 3-LAYER SEARCH WORKFLOW for retrieving past marks and knowledge:

1. search_observations(query) → Returns index only (~50-100 tokens/result). Start here.
2. get_timeline(anchor_id) → Returns chronological context around a mark.
3. get_details(ids) → Returns full details (~500-1000 tokens/result). Use sparingly.

ALWAYS start with search_observations. NEVER skip to get_details directly.
This saves ~10x tokens compared to fetching full details for every result.`,
  {},
  async () => ({
    content: [{ type: "text" as const, text: "Use search_observations → get_timeline → get_details workflow." }],
  })
);

server.tool(
  "search_observations",
  "Search past marks (warnings, decisions, discoveries) from this and previous sessions. Returns compact index (id, type, title, agent, time). Use get_details for full content.",
  {
    query: z.string().describe("Search query (matches title, subtitle, narrative)"),
    type: z.enum(["warning", "decision", "discovery", "note"]).optional().describe("Filter by mark type"),
    agent_name: z.string().optional().describe("Filter by agent name"),
    limit: z.number().optional().describe("Max results (default: 20)"),
    days: z.number().optional().describe("Recency window in days (default: 90)"),
    project_id: z.string().optional().describe("Project ID (auto-detected if omitted)"),
  },
  async ({ query, type, agent_name, limit, days, project_id }) => {
    const pid = resolveProject(project_id);
    if (!pid) {
      return { content: [{ type: "text" as const, text: "Error: project_id required." }] };
    }
    try {
      const params = new URLSearchParams({ project_id: pid, query });
      if (type) params.set("type", type);
      if (agent_name) params.set("agent", agent_name);
      if (limit) params.set("limit", String(limit));
      if (days) params.set("days", String(days));

      const results = await apiCall("GET", `/api/observations?${params.toString()}`) as Array<{
        id: number; type: string; title: string; subtitle?: string; agent_id?: string; created_at: string;
      }>;

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No observations found." }] };
      }

      const lines = results.map(r =>
        `[${r.id}] ${r.type} | ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ""} (${r.created_at})`
      );

      return {
        content: [{ type: "text" as const, text: `${results.length} observation(s):\n${lines.join("\n")}\n\nUse get_details([ids]) for full content.` }],
      };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

server.tool(
  "get_timeline",
  "Get chronological context around an observation. Shows what happened before and after.",
  {
    anchor_id: z.number().describe("Observation ID to anchor the timeline"),
    depth_before: z.number().optional().describe("Number of observations before anchor (default: 3)"),
    depth_after: z.number().optional().describe("Number of observations after anchor (default: 3)"),
  },
  async ({ anchor_id, depth_before, depth_after }) => {
    try {
      const params = new URLSearchParams();
      if (depth_before !== undefined) params.set("before", String(depth_before));
      if (depth_after !== undefined) params.set("after", String(depth_after));
      const qs = params.toString();

      const results = await apiCall("GET", `/api/observations/${anchor_id}/timeline${qs ? `?${qs}` : ""}`) as Array<{
        id: number; type: string; title: string; agent_id?: string; created_at: string;
      }>;

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No timeline data found." }] };
      }

      const lines = results.map(r => {
        const marker = r.id === anchor_id ? ">>>" : "   ";
        return `${marker} [${r.id}] ${r.type} | ${r.title} (${r.created_at})`;
      });

      return {
        content: [{ type: "text" as const, text: `Timeline around #${anchor_id}:\n${lines.join("\n")}` }],
      };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

server.tool(
  "get_details",
  "Get full details for specific observations. Use after search_observations to get narratives, facts, and file lists.",
  {
    ids: z.array(z.number()).describe("Observation IDs to fetch full details for"),
  },
  async ({ ids }) => {
    try {
      const results = await apiCall("GET", `/api/observations/details?ids=${ids.join(",")}`) as Array<{
        id: number; type: string; title: string; subtitle?: string; narrative?: string;
        facts?: string[]; concepts?: string[]; files_read?: string[]; files_modified?: string[];
        created_at: string;
      }>;

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No observations found for given IDs." }] };
      }

      const blocks = results.map(r => {
        const parts = [`# [${r.id}] ${r.type}: ${r.title}`];
        if (r.subtitle) parts.push(`*${r.subtitle}*`);
        if (r.narrative) parts.push(`\n${r.narrative}`);
        if (r.facts?.length) parts.push(`\nFacts:\n${r.facts.map(f => `- ${f}`).join("\n")}`);
        if (r.concepts?.length) parts.push(`Concepts: ${r.concepts.join(", ")}`);
        if (r.files_read?.length) parts.push(`Files read: ${r.files_read.join(", ")}`);
        if (r.files_modified?.length) parts.push(`Files modified: ${r.files_modified.join(", ")}`);
        return parts.join("\n");
      });

      return {
        content: [{ type: "text" as const, text: blocks.join("\n\n---\n\n") }],
      };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

server.tool(
  "save_observation",
  "Save a mark (important discovery, warning, or decision) for future agents. Call this immediately when you encounter something worth remembering.",
  {
    text: z.string().describe("One sentence: what + why. Future agents will scan this."),
    type: z.enum(["warning", "decision", "discovery", "note"]).optional().describe("Mark type: warning (gotcha/trap), decision (chose A over B), discovery (learned something undocumented), note (other context). Default: note"),
    concepts: z.array(z.string()).optional().describe("2-4 searchable keywords (e.g. ['duckdb', 'bigint', 'type-safety'])"),
    files: z.array(z.string()).optional().describe("Files related to this mark (e.g. ['src/server/db.ts']). Include files you read or modified that are relevant."),
    project_id: z.string().optional().describe("Project ID (auto-detected if omitted)"),
  },
  async ({ text, type, concepts, files, project_id }) => {
    const pid = resolveProject(project_id);
    if (!pid) {
      return { content: [{ type: "text" as const, text: "Error: project_id required." }] };
    }
    try {
      const result = await apiCall("POST", "/api/observations", {
        project_id: pid,
        text,
        type: type ?? "note",
        concepts: concepts ?? [],
        files: files ?? [],
      }) as { ok?: boolean; id?: number; error?: string };

      if (result.ok) {
        return { content: [{ type: "text" as const, text: `Observation saved (id: ${result.id})` }] };
      }
      return { content: [{ type: "text" as const, text: `Error: ${result.error ?? "unknown"}` }] };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

// ─── Warm→Cold Promotion Tools (for curator agent) ───

server.tool(
  "get_promotion_candidates",
  "Find mark concepts that appear repeatedly across sessions — candidates for promotion to .claude/rules/ files. Use this to identify patterns worth making permanent.",
  {
    project_id: z.string().optional().describe("Project ID (auto-detected if omitted)"),
    min_count: z.number().optional().describe("Minimum mark count for a concept (default: 3)"),
    min_sessions: z.number().optional().describe("Minimum distinct sessions (default: 2)"),
  },
  async ({ project_id, min_count, min_sessions }) => {
    const pid = resolveProject(project_id);
    if (!pid) {
      return { content: [{ type: "text" as const, text: "Error: project_id required." }] };
    }
    try {
      const params = new URLSearchParams({ project_id: pid });
      if (min_count !== undefined) params.set("min_count", String(min_count));
      if (min_sessions !== undefined) params.set("min_sessions", String(min_sessions));

      const candidates = await apiCall("GET", `/api/observations/promotion-candidates?${params.toString()}`) as Array<{
        concept: string; count: number; session_count: number; mark_ids: number[]; sample_titles: string[]; types: string[];
      }>;

      if (candidates.length === 0) {
        return { content: [{ type: "text" as const, text: "No promotion candidates found. Marks need to appear 3+ times across 2+ sessions." }] };
      }

      const blocks = candidates.map(c =>
        `**${c.concept}** (${c.count} marks, ${c.session_count} sessions)\n  Types: ${c.types.join(", ")}\n  IDs: ${c.mark_ids.join(", ")}\n  Samples:\n${c.sample_titles.map(t => `    - ${t}`).join("\n")}`
      );

      return {
        content: [{ type: "text" as const, text: `${candidates.length} promotion candidate(s):\n\n${blocks.join("\n\n")}` }],
      };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

server.tool(
  "promote_marks",
  "Mark observations as promoted to a rules file. Call this after creating/updating a .claude/rules/ file to prevent re-suggesting the same patterns.",
  {
    ids: z.array(z.number()).describe("Observation IDs to mark as promoted"),
    promoted_to: z.string().describe("Rules file path (e.g., 'rules/duckdb.md')"),
  },
  async ({ ids, promoted_to }) => {
    try {
      const result = await apiCall("POST", "/api/observations/promote", {
        ids,
        promoted_to,
      }) as { ok?: boolean; count?: number; error?: string };

      if (result.ok) {
        return { content: [{ type: "text" as const, text: `${result.count} mark(s) promoted to ${promoted_to}` }] };
      }
      return { content: [{ type: "text" as const, text: `Error: ${result.error ?? "unknown"}` }] };
    } catch {
      return { content: [{ type: "text" as const, text: `Error: Could not connect to mimir daemon.` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server error:", e);
  process.exit(1);
});
