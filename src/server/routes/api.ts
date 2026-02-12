import { Hono } from "hono";
import { getAllSessions, getActiveSessions, getSession, getTotalSessionsCount, getActiveSessionsCount, getSessionsByProject, getActiveSessionsByProject, getSessionsCountByProject, getActiveSessionsCountByProject } from "../services/session.js";
import { getAllAgents, getActiveAgents, getAgentsBySession, getAgent, stopAgent, updateAgentSummary, getTotalAgentsCount, getActiveAgentsCount, deleteAgent, getAgentsByProject, getActiveAgentsByProject, getAgentsCountByProject, getActiveAgentsCountByProject } from "../services/agent.js";
import { getContextBySession, getContextByAgent, getTotalContextEntriesCount, deleteContextByType, getContextEntriesCountByProject } from "../services/context.js";
import { getFileChangesBySession, getFileChangesByAgent, getTotalFileChangesCount, getFileChangesCountByProject } from "../services/filechange.js";
import { getAllTasks, getTasksByProject, getTask, createTask, updateTask, deleteTask } from "../services/task.js";
import { addComment, getCommentsByTask } from "../services/comment.js";
import { getRecentActivities, getActivitiesBySession, getActivitiesByProject } from "../services/activity.js";
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
import { searchObservations, getObservationDetails, getObservationTimeline, getObservationsByProject, saveObservation, markAsPromoted, deleteObservation, updateObservation } from "../services/observation-store.js";
import { getPromotionCandidates } from "../services/queries/promotionCandidates.js";

const api = new Hono();

api.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

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
  if (projectId) {
    return c.json(active === "true" ? await getActiveSessionsByProject(projectId) : await getSessionsByProject(projectId));
  }
  return c.json(active === "true" ? await getActiveSessions() : await getAllSessions());
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

api.get("/agents", async (c) => {
  const active = c.req.query("active");
  const projectId = c.req.query("project_id");
  if (projectId) {
    return c.json(active === "true" ? await getActiveAgentsByProject(projectId) : await getAgentsByProject(projectId));
  }
  return c.json(active === "true" ? await getActiveAgents() : await getAllAgents());
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
  const body = await c.req.json();
  if (body.status === "completed") {
    await stopAgent(id, body.context_summary ?? "Manually stopped via UI");
  } else if (body.context_summary !== undefined) {
    await updateAgentSummary(id, body.context_summary);
  }
  return c.json({ ok: true });
});

api.delete("/agents/:id", async (c) => {
  await deleteAgent(c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/tasks", async (c) => {
  const projectId = c.req.query("project_id");
  return c.json(projectId ? await getTasksByProject(projectId) : await getAllTasks());
});

api.get("/tasks/:id", async (c) => {
  const task = await getTask(parseInt(c.req.param("id"), 10));
  if (!task) return c.json({ error: "not found" }, 404);
  return c.json(task);
});

api.post("/tasks", async (c) => {
  const body = await c.req.json();
  const { project_id, title, description, assigned_to, status, tags } = body;
  if (!title) return c.json({ error: "title required" }, 400);
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
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json();
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
  const id = parseInt(c.req.param("id"), 10);
  const deleted = await deleteTask(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("task_deleted", { id });
  return c.json({ ok: true });
});

api.get("/tasks/:id/comments", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  return c.json(await getCommentsByTask(id));
});

api.post("/tasks/:id/comments", async (c) => {
  const taskId = parseInt(c.req.param("id"), 10);
  const body = await c.req.json();
  if (!body.content) return c.json({ error: "content required" }, 400);
  const id = await addComment(
    taskId,
    body.author ?? null,
    body.comment_type ?? "note",
    body.content
  );
  return c.json({ ok: true, id }, 201);
});

api.get("/activities", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const projectId = c.req.query("project_id");
  return c.json(projectId ? await getActivitiesByProject(projectId, limit) : await getRecentActivities(limit));
});

api.get("/stats", async (c) => {
  const projectId = c.req.query("project_id");

  if (projectId) {
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
  }

  const [
    total_sessions,
    active_sessions,
    total_agents,
    active_agents,
    total_context_entries,
    total_file_changes
  ] = await Promise.all([
    getTotalSessionsCount(),
    getActiveSessionsCount(),
    getTotalAgentsCount(),
    getActiveAgentsCount(),
    getTotalContextEntriesCount(),
    getTotalFileChangesCount()
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
  const days = parseInt(c.req.query("days") ?? "7", 10);
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
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }
  const { project_id, from_name, to_name, content, priority, session_id } = body;
  if (!project_id || !from_name || !to_name || !content) {
    return c.json({ error: "project_id, from_name, to_name, content required" }, 400);
  }
  const id = await sendMessage(project_id as string, from_name as string, to_name as string, content as string, (priority ?? "normal") as string, (session_id ?? null) as string | null);
  broadcast("message_sent", { id, project_id, from_name, to_name, priority: priority ?? "normal" });
  // Async tmux notification — fire and forget
  notifyAgent(to_name as string, project_id as string, from_name as string).catch(() => {});
  return c.json({ ok: true, id }, 201);
});

api.get("/messages", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const since = c.req.query("since");
  return c.json(await getMessagesByProject(projectId, status ?? undefined, limit, since ?? undefined));
});

api.patch("/messages/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const msg = await getMessage(id);
  if (!msg) return c.json({ error: "not found" }, 404);
  const body = await c.req.json();
  if (body.status === "read") {
    await markAsRead(id);
    broadcast("message_read", { id });
  }
  return c.json({ ok: true });
});

api.delete("/messages/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const deleted = await deleteMessage(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("message_deleted", { id });
  return c.json({ ok: true });
});

// Agent Registry (tmux pane mapping)
api.post("/registry", async (c) => {
  const body = await c.req.json();
  const { agent_name, project_id, tmux_pane, session_id } = body;
  if (!agent_name || !project_id) {
    return c.json({ error: "agent_name, project_id required" }, 400);
  }
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
  const body = await c.req.json();
  const { project_id } = body;
  if (!project_id) {
    return c.json({ error: "project_id required" }, 400);
  }
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
  const body = await c.req.json();
  const { session_name, agent_name, start_claude } = body;
  if (!session_name) {
    return c.json({ error: "session_name required" }, 400);
  }
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
  const body = await c.req.json();
  const { project_id, agents, leader_model, initial_task, skip_permissions } = body;

  if (!project_id) {
    return c.json({ error: "project_id required" }, 400);
  }
  if (!agents || !Array.isArray(agents) || agents.length === 0) {
    return c.json({ error: "agents array required (at least one agent)" }, 400);
  }

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
  const body = await c.req.json();
  const { project_id, name, description, model, tools, skills, memory, permissionMode, body: agentBody } = body;
  if (!project_id || !name) return c.json({ error: "project_id and name required" }, 400);
  try {
    await createAgentDefinition(project_id, {
      name,
      description: description ?? "",
      model: model ?? "sonnet",
      tools: tools ?? ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: skills ?? ["compress-output"],
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
  const body = await c.req.json();
  const { project_id, ...updates } = body;
  if (!project_id) return c.json({ error: "project_id required" }, 400);
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
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const days = parseInt(c.req.query("days") ?? "90", 10);

  if (query || type || agent) {
    return c.json(await searchObservations(projectId, query ?? "", type ?? undefined, agent ?? undefined, limit, days));
  }
  return c.json(await getObservationsByProject(projectId, limit));
});

api.get("/observations/promotion-candidates", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) return c.json({ error: "project_id required" }, 400);

  const minCount = parseInt(c.req.query("min_count") ?? "3", 10);
  const minSessions = parseInt(c.req.query("min_sessions") ?? "2", 10);

  return c.json(await getPromotionCandidates(projectId, minCount, minSessions));
});

api.post("/observations/promote", async (c) => {
  const body = await c.req.json();
  const { ids, promoted_to } = body;
  if (!ids || !Array.isArray(ids) || !promoted_to) {
    return c.json({ error: "ids (array) and promoted_to (string) required" }, 400);
  }
  await markAsPromoted(ids, promoted_to);
  broadcast("marks_promoted", { ids, promoted_to });
  return c.json({ ok: true, count: ids.length });
});

api.get("/observations/details", async (c) => {
  const idsParam = c.req.query("ids");
  if (!idsParam) return c.json({ error: "ids required (comma-separated)" }, 400);
  const ids = idsParam.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
  return c.json(await getObservationDetails(ids));
});

api.get("/observations/:id/timeline", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const before = parseInt(c.req.query("before") ?? "3", 10);
  const after = parseInt(c.req.query("after") ?? "3", 10);
  return c.json(await getObservationTimeline(id, before, after));
});

api.delete("/observations/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const deleted = await deleteObservation(id);
  if (!deleted) return c.json({ error: "not found" }, 404);
  broadcast("observation_deleted", { id });
  return c.json({ ok: true });
});

api.patch("/observations/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json();
  const updated = await updateObservation(id, body);
  if (!updated) return c.json({ error: "not found or no changes" }, 404);
  broadcast("observation_updated", { id, ...body });
  return c.json({ ok: true });
});

api.post("/observations", async (c) => {
  const body = await c.req.json();
  const { project_id, text, type, concepts, files, session_id, agent_id } = body;
  if (!project_id || !text) return c.json({ error: "project_id and text required" }, 400);

  const fileList: string[] = Array.isArray(files) ? files : [];
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

export default api;
