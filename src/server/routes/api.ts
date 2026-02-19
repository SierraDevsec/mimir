import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.js";
import { getSession, endSession, getSessionsByProject, getActiveSessionsByProject, getSessionsCountByProject, getActiveSessionsCountByProject } from "../services/session.js";
import { getAgentsBySession, getAgent, stopAgent, updateAgentSummary, deleteAgent, getAgentsByProject, getActiveAgentsByProject, getAgentsCountByProject, getActiveAgentsCountByProject } from "../services/agent.js";
import { getContextBySession, getContextByAgent, deleteContextByType, getContextEntriesCountByProject } from "../services/context.js";
import { getFileChangesBySession, getFileChangesByAgent, getFileChangesCountByProject } from "../services/filechange.js";
import { getTasksByProject, getTask, createTask, updateTask, deleteTask } from "../services/task.js";
import { addComment, getCommentsByTask } from "../services/comment.js";
import { logActivity, getActivitiesBySession, getActivitiesByProject } from "../services/activity.js";
import { getAllProjects, deleteProject } from "../services/project.js";
import { getDailyActivity, getWeeklyTotals, getAgentContextSizes, getTotalContextSize, getAgentTokenUsage, getTotalTokenUsage } from "../services/usage.js";
import { sendMessage, getMessagesByProject, getMessage, markAsRead, deleteMessage } from "../services/message.js";
import { registerAgent, unregisterAgent, getRegisteredAgents, deleteRegistration } from "../services/registry.js";
import { notifyAgent } from "../services/notify.js";
import { broadcast } from "./ws.js";
import { createTmuxSession, createPane, killPane, killSession, listPanes, listSessions, getTmuxPane, getTmuxSession } from "../services/tmux.js";
import { startSwarm, listSwarmSessions } from "../services/swarm.js";
import { getStatusline, getStatuslineByPath } from "../services/statusline.js";
import { listAgentDefinitions, getAgentDefinition, createAgentDefinition, updateAgentDefinition, deleteAgentDefinition } from "../services/agent-definition.js";
import { searchObservations, getObservationDetails, getObservationTimeline, getObservationsByProject, saveObservation, markAsPromoted, deleteObservation, updateObservation, resolveObservation } from "../services/observation-store.js";
import { getPromotionCandidates } from "../services/queries/promotionCandidates.js";
import { getCurationStats } from "../services/curation.js";
import { listSkills } from "../services/skill.js";
import { createFlow, getFlow, getFlowsByProject, updateFlow, deleteFlow } from "../services/flow.js";

const api = new Hono();

/** Parse integer URL param; returns null if NaN or non-positive (triggers 400) */
function parseId(param: string): number | null {
  const n = parseInt(param, 10);
  return isNaN(n) || n < 1 ? null : n;
}

/** Clamp an integer query param to [min, max]; returns fallback if NaN or non-finite */
function clampInt(val: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(val ?? String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// --- Input validation schemas ---
const TaskCreateSchema = z.object({
  project_id: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  assigned_to: z.string().max(100).nullable().optional(),
  status: z.enum(["idea", "pending", "in_progress", "completed", "cancelled"]).optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
});

const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(["idea", "pending", "in_progress", "completed", "cancelled"]).optional(),
  assigned_to: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
  changed_by: z.string().max(100).optional(),
});

const ObservationUpdateSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  type: z.enum(["warning", "decision", "discovery", "note"]).optional(),
  concepts: z.array(z.string().max(100)).max(50).optional(),
});

const ObservationCreateSchema = z.object({
  project_id: z.string().min(1),
  text: z.string().min(1).max(10000),
  type: z.enum(["warning", "decision", "discovery", "note"]).optional(),
  concepts: z.array(z.string().max(100)).max(50).optional(),
  files: z.array(z.string().max(500)).max(100).optional(),
  session_id: z.string().optional(),
  agent_id: z.string().optional(),
});

const ObservationPromoteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  promoted_to: z.string().min(1).max(500),
});

const MessageCreateSchema = z.object({
  project_id: z.string().min(1),
  from_name: z.string().min(1).max(100),
  to_name: z.string().min(1).max(100),
  content: z.string().min(1).max(50000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  session_id: z.string().optional(),
});

const CommentCreateSchema = z.object({
  content: z.string().min(1).max(10000),
  author: z.string().max(100).nullable().optional(),
  comment_type: z.enum(["note", "status_change", "review", "blocker"]).optional(),
});

const FlowCreateSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  mermaid_code: z.string().min(1).max(100000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const FlowUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  mermaid_code: z.string().min(1).max(100000).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const SessionPatchSchema = z.object({
  status: z.literal("ended"),
});

const MessagePatchSchema = z.object({
  status: z.literal("read"),
});

const RegistryCreateSchema = z.object({
  agent_name: z.string().min(1).max(100),
  project_id: z.string().min(1),
  tmux_pane: z.string().max(100).nullable().optional(),
  session_id: z.string().nullable().optional(),
});

const PatchAgentSchema = z.object({
  status: z.enum(["completed"]).optional(),
  context_summary: z.string().max(10000).optional(),
});

const TmuxSessionSchema = z.object({
  project_id: z.string().min(1),
});

const TmuxPaneSchema = z.object({
  session_name: z.string().min(1),
  agent_name: z.string().optional(),
  start_claude: z.boolean().optional(),
});

const SwarmStartSchema = z.object({
  project_id: z.string().min(1),
  agents: z.array(z.object({
    name: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
  })).min(1).max(20),
  leader_model: z.string().max(100).optional(),
  initial_task: z.string().max(10000).optional(),
  skip_permissions: z.boolean().optional(),
});

const AgentDefCreateSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Agent name must contain only letters, numbers, dashes, or underscores"),
  description: z.string().max(2000).optional(),
  model: z.string().max(100).optional(),
  tools: z.array(z.string().max(100).regex(/^[\w:.-]+$/, "Tool name must contain only word chars, colons, dots, or dashes")).max(50).optional(),
  skills: z.array(z.string().max(100).regex(/^[\w:.-]+$/, "Skill name must contain only word chars, colons, dots, or dashes")).max(50).optional(),
  memory: z.string().max(100).optional(),
  permissionMode: z.string().max(50).optional(),
  body: z.string().max(50000).optional(),
});

// Note: `name` intentionally excluded — name is immutable, taken from URL param
const AgentDefUpdateSchema = z.object({
  project_id: z.string().min(1),
  description: z.string().max(2000).optional(),
  model: z.string().max(100).optional(),
  tools: z.array(z.string().max(100).regex(/^[\w:.-]+$/, "Tool name must contain only word chars, colons, dots, or dashes")).max(50).optional(),
  skills: z.array(z.string().max(100).regex(/^[\w:.-]+$/, "Skill name must contain only word chars, colons, dots, or dashes")).max(50).optional(),
  memory: z.string().max(100).optional(),
  permissionMode: z.string().max(50).optional(),
  body: z.string().max(50000).optional(),
});

const CurationCompleteSchema = z.object({
  project_id: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

api.get("/health", async (c) => {
  try {
    const db = await getDb();
    await db.all("SELECT 1");
    return c.json({ status: "ok", uptime: process.uptime(), db: "ok" });
  } catch {
    return c.json({ status: "degraded", uptime: process.uptime(), db: "error" }, 503);
  }
});

api.get("/projects", async (c) => c.json(await getAllProjects()));

api.delete("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteProject(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

api.get("/sessions", async (c) => {
  const active = c.req.query("active");
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(active === "true" ? await getActiveSessionsByProject(projectId) : await getSessionsByProject(projectId));
});

api.get("/sessions/:id", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json(session);
});

api.get("/sessions/:id/agents", async (c) => c.json(await getAgentsBySession(c.req.param("id"))));
api.get("/sessions/:id/context", async (c) => c.json(await getContextBySession(c.req.param("id"))));
api.delete("/sessions/:id/context", async (c) => {
  const entryType = c.req.query("entry_type");
  if (!entryType) return c.json({ error: "entry_type query param required" }, 400);
  const deleted = await deleteContextByType(c.req.param("id"), entryType);
  return c.json({ ok: true, deleted });
});
api.get("/sessions/:id/files", async (c) => c.json(await getFileChangesBySession(c.req.param("id"))));
api.get("/sessions/:id/activities", async (c) => c.json(await getActivitiesBySession(c.req.param("id"))));

api.patch("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const session = await getSession(id);
  if (!session) return c.json({ error: "not found" }, 404);
  const parsed = SessionPatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  if (parsed.data.status === "ended") {
    await endSession(id);
    broadcast("SessionEnd", { session_id: id });
  }
  return c.json({ ok: true });
});

api.get("/agents", async (c) => {
  const active = c.req.query("active");
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(active === "true" ? await getActiveAgentsByProject(projectId) : await getAgentsByProject(projectId));
});

api.get("/agents/:id", async (c) => {
  const agent = await getAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "not found" }, 404);
  return c.json(agent);
});

api.get("/agents/:id/context", async (c) => {
  return c.json(await getContextByAgent(c.req.param("id")));
});

api.get("/agents/:id/files", async (c) => {
  return c.json(await getFileChangesByAgent(c.req.param("id")));
});

api.patch("/agents/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await getAgent(id);
  if (!agent) return c.json({ error: "not found" }, 404);
  const parsed = PatchAgentSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }
  const { status, context_summary } = parsed.data;
  if (status === "completed") {
    await stopAgent(id, context_summary ?? "Manually stopped via UI");
  } else if (context_summary !== undefined) {
    await updateAgentSummary(id, context_summary);
  }
  return c.json({ ok: true });
});

api.delete("/agents/:id", async (c) => {
  await deleteAgent(c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/tasks", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await getTasksByProject(projectId));
});

api.get("/tasks/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const task = await getTask(id);
  if (!task) return c.json({ error: "not found" }, 404);
  return c.json(task);
});

api.post("/tasks", async (c) => {
  const parsed = TaskCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { project_id, title, description, assigned_to, status, tags } = parsed.data;
  const id = await createTask(
    project_id ?? null,
    title,
    description ?? null,
    assigned_to ?? null,
    status ?? "idea",
    tags ?? null
  );
  broadcast("task_created", { id, title, status: status ?? "idea", project_id });
  return c.json({ ok: true, id }, 201);
});

api.patch("/tasks/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const parsed = TaskUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const body = parsed.data;
  const oldTask = await getTask(id);
  if (!oldTask) return c.json({ error: "not found" }, 404);

  const updated = await updateTask(id, body);
  if (!updated) return c.json({ error: "no changes" }, 400);

  // Auto-add status_change comment
  const oldStatus = (oldTask as { status?: string }).status;
  if (body.status && oldStatus && body.status !== oldStatus) {
    await addComment(id, body.changed_by ?? null, "status_change",
      `Status changed: ${oldStatus} → ${body.status}`);
  }

  broadcast("task_updated", { id, ...body });
  return c.json({ ok: true });
});

api.delete("/tasks/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const deleted = await deleteTask(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("task_deleted", { id });
  return c.json({ ok: true });
});

api.get("/tasks/:id/comments", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  return c.json(await getCommentsByTask(id));
});

api.post("/tasks/:id/comments", async (c) => {
  const taskId = parseId(c.req.param("id"));
  if (taskId === null) return c.json({ error: "invalid id" }, 400);
  const parsed = CommentCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { content, author, comment_type } = parsed.data;
  const id = await addComment(taskId, author ?? null, comment_type ?? "note", content);
  return c.json({ ok: true, id }, 201);
});

api.get("/activities", async (c) => {
  const limit = clampInt(c.req.query("limit"), 50, 1, 500);
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await getActivitiesByProject(projectId, limit));
});

api.get("/stats", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);

  const [
    total_sessions,
    active_sessions,
    total_agents,
    active_agents,
    total_context_entries,
    total_file_changes
  ] = await Promise.all([
    getSessionsCountByProject(projectId),
    getActiveSessionsCountByProject(projectId),
    getAgentsCountByProject(projectId),
    getActiveAgentsCountByProject(projectId),
    getContextEntriesCountByProject(projectId),
    getFileChangesCountByProject(projectId)
  ]);

  return c.json({
    total_sessions,
    active_sessions,
    total_agents,
    active_agents,
    total_context_entries,
    total_file_changes
  });
});

// Usage analytics endpoints
api.get("/usage/daily", async (c) => {
  const days = clampInt(c.req.query("days"), 7, 1, 365);
  return c.json(await getDailyActivity(days));
});

api.get("/usage/weekly", async (c) => {
  return c.json(await getWeeklyTotals());
});

api.get("/usage/context-sizes", async (c) => {
  const projectId = c.req.query("project_id");
  return c.json(await getAgentContextSizes(projectId ?? undefined));
});

api.get("/usage/total-context", async (c) => {
  const projectId = c.req.query("project_id");
  return c.json({ total: await getTotalContextSize(projectId ?? undefined) });
});

api.get("/usage/tokens", async (c) => {
  const projectId = c.req.query("project_id");
  return c.json(await getAgentTokenUsage(projectId ?? undefined));
});

api.get("/usage/total-tokens", async (c) => {
  const projectId = c.req.query("project_id");
  return c.json(await getTotalTokenUsage(projectId ?? undefined));
});

// Messages
api.post("/messages", async (c) => {
  const parsed = MessageCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { project_id, from_name, to_name, content, priority, session_id } = parsed.data;
  const id = await sendMessage(project_id, from_name, to_name, content, priority ?? "normal", session_id ?? null);
  broadcast("message_sent", { id, project_id, from_name, to_name, priority: priority ?? "normal" });
  // Async tmux notification — fire and forget
  notifyAgent(to_name, project_id, from_name).catch(() => {});
  return c.json({ ok: true, id }, 201);
});

api.get("/messages", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  const status = c.req.query("status");
  const limit = clampInt(c.req.query("limit"), 50, 1, 500);
  const since = c.req.query("since");
  return c.json(await getMessagesByProject(projectId, status ?? undefined, limit, since ?? undefined));
});

api.patch("/messages/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const msg = await getMessage(id);
  if (!msg) return c.json({ error: "not found" }, 404);
  const parsed = MessagePatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  if (parsed.data.status === "read") {
    await markAsRead(id);
    broadcast("message_read", { id });
  }
  return c.json({ ok: true });
});

api.delete("/messages/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const deleted = await deleteMessage(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("message_deleted", { id });
  return c.json({ ok: true });
});

// Agent Registry (tmux pane mapping)
api.post("/registry", async (c) => {
  const parsed = RegistryCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  const { agent_name, project_id, tmux_pane, session_id } = parsed.data;
  await registerAgent(agent_name, project_id, tmux_pane ?? null, session_id ?? null);
  broadcast("agent_registered", { agent_name, project_id, tmux_pane });
  return c.json({ ok: true }, 201);
});

api.get("/registry", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await getRegisteredAgents(projectId));
});

api.delete("/registry/:agent_name", async (c) => {
  const agentName = c.req.param("agent_name");
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  const deleted = await deleteRegistration(agentName, projectId);
  if (!deleted) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// Tmux Session Management
api.post("/tmux/sessions", async (c) => {
  const parsed = TmuxSessionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }
  const { project_id } = parsed.data;
  try {
    const sessionName = await createTmuxSession(project_id);
    broadcast("tmux_session_created", { session_name: sessionName, project_id });
    return c.json({ ok: true, session_name: sessionName }, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

api.get("/tmux/sessions", async (c) => {
  const projectId = c.req.query("project_id");
  const sessions = await listSessions(projectId ?? undefined);
  return c.json(sessions);
});

api.get("/tmux/sessions/:name", async (c) => {
  const sessionName = c.req.param("name");
  const session = await getTmuxSession(sessionName);
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json(session);
});

api.delete("/tmux/sessions/:name", async (c) => {
  const sessionName = c.req.param("name");
  try {
    await killSession(sessionName);
    broadcast("tmux_session_killed", { session_name: sessionName });
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Tmux Pane Management
api.post("/tmux/panes", async (c) => {
  const parsed = TmuxPaneSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }
  const { session_name, agent_name, start_claude } = parsed.data;
  try {
    const paneId = await createPane(
      session_name,
      agent_name ?? undefined,
      start_claude ?? false
    );
    broadcast("tmux_pane_created", { pane_id: paneId, session_name, agent_name });
    return c.json({ ok: true, pane_id: paneId }, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

api.get("/tmux/panes", async (c) => {
  const sessionName = c.req.query("session_name");
  const panes = await listPanes(sessionName ?? undefined);
  return c.json(panes);
});

api.get("/tmux/panes/:id", async (c) => {
  const paneId = c.req.param("id");
  const pane = await getTmuxPane(paneId);
  if (!pane) return c.json({ error: "not found" }, 404);
  return c.json(pane);
});

api.delete("/tmux/panes/:id", async (c) => {
  const paneId = c.req.param("id");
  try {
    await killPane(paneId);
    broadcast("tmux_pane_killed", { pane_id: paneId });
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Swarm Management
api.post("/swarm/start", async (c) => {
  const parsed = SwarmStartSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  const { project_id, agents, leader_model, initial_task, skip_permissions } = parsed.data;

  try {
    const swarmSession = await startSwarm({
      projectId: project_id,
      agents,
      leaderModel: leader_model,
      initialTask: initial_task,
      skipPermissions: !!skip_permissions,
    });
    broadcast("swarm_started", { session_name: swarmSession.sessionName, project_id });
    return c.json({ ok: true, session: swarmSession }, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

api.get("/swarm/sessions", async (c) => {
  const projectId = c.req.query("project_id");
  const sessions = await listSwarmSessions(projectId ?? undefined);
  return c.json(sessions);
});

// Statusline (real-time, in-memory)
api.get("/statusline/:projectId", (c) => {
  const data = getStatusline(c.req.param("projectId"));
  return c.json(data);
});

api.get("/statusline", (c) => {
  const path = c.req.query("path");
  if (!path) return c.json(null);
  const data = getStatuslineByPath(path);
  return c.json(data);
});

// Agent Definitions (file-based CRUD)
api.get("/agent-defs", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await listAgentDefinitions(projectId));
});

api.get("/agent-defs/:name", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  const def = await getAgentDefinition(projectId, c.req.param("name"));
  if (!def) return c.json({ error: "not found" }, 404);
  return c.json(def);
});

api.post("/agent-defs", async (c) => {
  const parsed = AgentDefCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  const { project_id, name, description, model, tools, skills, memory, permissionMode, body: agentBody } = parsed.data;
  try {
    await createAgentDefinition(project_id, {
      name,
      description: description ?? "",
      model: model ?? "sonnet",
      tools: tools ?? ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: skills ?? ["self-mark", "self-search", "self-memory"],
      memory: memory ?? "project",
      permissionMode: permissionMode ?? "default",
      body: agentBody ?? "",
    });
    return c.json({ ok: true }, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

api.put("/agent-defs/:name", async (c) => {
  const parsed = AgentDefUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  const { project_id, ...updates } = parsed.data;
  try {
    await updateAgentDefinition(project_id, c.req.param("name"), updates);
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

api.delete("/agent-defs/:name", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  try {
    await deleteAgentDefinition(projectId, c.req.param("name"));
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Observations
api.get("/observations", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);

  const query = c.req.query("query");
  const type = c.req.query("type");
  const agent = c.req.query("agent");
  const limit = clampInt(c.req.query("limit"), 20, 1, 500);
  const offset = clampInt(c.req.query("offset"), 0, 0, 100000);
  const days = clampInt(c.req.query("days"), 90, 1, 365);

  if (query || type || agent) {
    return c.json(await searchObservations(projectId, query ?? "", type ?? undefined, agent ?? undefined, limit, days));
  }
  return c.json(await getObservationsByProject(projectId, limit, offset));
});

api.get("/observations/promotion-candidates", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);

  const minCount = clampInt(c.req.query("min_count"), 3, 1, 100);
  const minSessions = clampInt(c.req.query("min_sessions"), 2, 1, 100);

  return c.json(await getPromotionCandidates(projectId, minCount, minSessions));
});

api.post("/observations/promote", async (c) => {
  const parsed = ObservationPromoteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { ids, promoted_to } = parsed.data;
  await markAsPromoted(ids, promoted_to);
  broadcast("marks_promoted", { ids, promoted_to });
  return c.json({ ok: true, count: ids.length });
});

api.get("/observations/details", async (c) => {
  const idsParam = c.req.query("ids");
  if (!idsParam) return c.json({ error: "ids required (comma-separated)" }, 400);
  const ids = idsParam.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0).slice(0, 500);
  return c.json(await getObservationDetails(ids));
});

api.get("/observations/:id/timeline", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const before = clampInt(c.req.query("before"), 3, 1, 20);
  const after = clampInt(c.req.query("after"), 3, 1, 20);
  return c.json(await getObservationTimeline(id, before, after));
});

api.patch("/observations/:id/resolve", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const resolved = await resolveObservation(id);
  if (!resolved) return c.json({ error: "not found or already resolved" }, 404);
  broadcast("observation_resolved", { id });
  return c.json({ ok: true });
});

api.delete("/observations/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const deleted = await deleteObservation(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("observation_deleted", { id });
  return c.json({ ok: true });
});

api.patch("/observations/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const parsed = ObservationUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const body = parsed.data;
  const updated = await updateObservation(id, body);
  if (!updated) return c.json({ error: "not found or no changes" }, 404);
  broadcast("observation_updated", { id, ...body });
  return c.json({ ok: true });
});

api.post("/observations", async (c) => {
  const parsed = ObservationCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { project_id, text, type, concepts, files, session_id, agent_id } = parsed.data;

  const fileList: string[] = files ?? [];
  const obs = {
    type: type ?? "note",
    title: text.slice(0, 100),
    subtitle: undefined,
    narrative: text,
    facts: [],
    concepts: concepts ?? [],
    files_read: fileList,
    files_modified: fileList,
  };

  const id = await saveObservation(obs, session_id ?? "manual", agent_id ?? null, project_id);
  broadcast("observation_created", { id, project_id, type: obs.type, title: obs.title });
  return c.json({ ok: true, id }, 201);
});

// Skills
api.get("/skills", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await listSkills(projectId));
});

// Curation stats
api.get("/curation/stats", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await getCurationStats(projectId));
});

api.post("/curation/complete", async (c) => {
  const parsed = CurationCompleteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  const { project_id, details } = parsed.data;
  await logActivity("curation", null, "curation_completed", details ?? {});
  broadcast("curation_completed", { project_id });
  return c.json({ ok: true });
});

// Flows
api.get("/flows", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  return c.json(await getFlowsByProject(projectId));
});

api.get("/flows/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const flow = await getFlow(id);
  if (!flow) return c.json({ error: "not found" }, 404);
  return c.json(flow);
});

api.post("/flows", async (c) => {
  const parsed = FlowCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { project_id, name, description, mermaid_code, metadata } = parsed.data;
  const id = await createFlow(project_id, name, mermaid_code, description ?? null, metadata ?? {});
  broadcast("flow_created", { id, name, project_id });
  return c.json({ ok: true, id }, 201);
});

api.patch("/flows/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const flow = await getFlow(id);
  if (!flow) return c.json({ error: "not found" }, 404);
  const parsed = FlowUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const body = parsed.data;
  const updated = await updateFlow(id, body);
  if (!updated) return c.json({ error: "no changes" }, 400);
  broadcast("flow_updated", { id, ...body });
  return c.json({ ok: true });
});

api.delete("/flows/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const deleted = await deleteFlow(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("flow_deleted", { id });
  return c.json({ ok: true });
});

api.onError((err, c) => {
  if (err instanceof SyntaxError) {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }
  console.error("[api] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default api;
