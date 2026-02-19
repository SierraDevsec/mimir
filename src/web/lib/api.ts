const BASE = "/api";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  return request<T>(`${BASE}${path}`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function del<T>(path: string): Promise<T> {
  return request<T>(`${BASE}${path}`, { method: "DELETE" });
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Session {
  id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
}

export interface Agent {
  id: string;
  session_id: string;
  agent_name: string;
  agent_type: string | null;
  parent_agent_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  context_summary: string | null;
  input_tokens: number;
  output_tokens: number;
}

export interface ContextEntry {
  id: number;
  session_id: string;
  agent_id: string | null;
  entry_type: string;
  content: string;
  tags: string[] | null;
  created_at: string;
}

export interface FileChange {
  id: number;
  session_id: string;
  agent_id: string | null;
  file_path: string;
  change_type: string;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  author: string | null;
  comment_type: string;
  content: string;
  created_at: string;
}

export interface RegisteredAgent {
  agent_name: string;
  project_id: string;
  tmux_pane: string | null;
  session_id: string | null;
  status: string;
  last_seen_at: string;
}

export interface Stats {
  total_sessions: number;
  active_sessions: number;
  total_agents: number;
  active_agents: number;
  total_context_entries: number;
  total_file_changes: number;
}

export interface Activity {
  id: number;
  session_id: string;
  agent_id: string | null;
  event_type: string;
  details: string;
  created_at: string;
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface AgentContextSize {
  id: string;
  agent_name: string;
  agent_type: string | null;
  context_length: number;
  session_id: string;
}

export interface AgentTokenUsage {
  id: string;
  agent_name: string;
  agent_type: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_id: string;
}

export interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  memory: string;
  permissionMode: string;
  body: string;
}

export interface TotalTokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface PromotionCandidate {
  concept: string;
  count: number;
  session_count: number;
  mark_ids: number[];
  sample_titles: string[];
  types: string[];
}

export interface Skill {
  name: string;
  description: string;
  hasReferences: boolean;
  preloadedBy: string[];
  body: string;
}

export interface CurationStats {
  last_curated: string | null;
  sessions_since: number;
  marks_since: number;
  promotion_candidates: number;
  agent_memories: Array<{ name: string; size_bytes: number; last_modified: string }>;
}

export interface Observation {
  id: number;
  session_id: string;
  agent_id: string | null;
  project_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  narrative: string | null;
  facts: string[] | null;
  concepts: string[] | null;
  files_read: string[] | null;
  files_modified: string[] | null;
  discovery_tokens: number;
  source: string;
  promoted_to: string | null;
  created_at: string;
}

export interface Flow {
  id: number;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  mermaid_code: string;
  metadata: string; // JSON string — parse on client
  created_at: string;
  updated_at: string;
}

/** DuckDB now() stores local time but JSON serializes with 'Z' suffix.
 *  Strip 'Z' so JS treats it as local time, not UTC. */
export function localDate(ts: string | null): Date | null {
  if (!ts) return null;
  return new Date(ts.replace(/Z$/, ""));
}

export function formatDateTime(ts: string | null): string {
  const d = localDate(ts);
  if (!d) return "—";
  return d.toLocaleString();
}

export function formatTime(ts: string | null): string {
  const d = localDate(ts);
  if (!d) return "—";
  return d.toLocaleTimeString();
}

export const api = {
  health: () => get<{ status: string; uptime: number }>("/health"),
  projects: () => get<Project[]>("/projects"),
  sessions: (active?: boolean, projectId?: string) => {
    const params = new URLSearchParams();
    if (active) params.set("active", "true");
    if (projectId) params.set("project_id", projectId);
    const qs = params.toString();
    return get<Session[]>(`/sessions${qs ? `?${qs}` : ""}`);
  },
  session: (id: string) => get<Session>(`/sessions/${id}`),
  sessionAgents: (id: string) => get<Agent[]>(`/sessions/${id}/agents`),
  sessionContext: (id: string) => get<ContextEntry[]>(`/sessions/${id}/context`),
  sessionFiles: (id: string) => get<FileChange[]>(`/sessions/${id}/files`),
  sessionActivities: (id: string) => get<Activity[]>(`/sessions/${id}/activities`),
  agents: (active?: boolean, projectId?: string) => {
    const params = new URLSearchParams();
    if (active) params.set("active", "true");
    if (projectId) params.set("project_id", projectId);
    const qs = params.toString();
    return get<Agent[]>(`/agents${qs ? `?${qs}` : ""}`);
  },
  agentContext: (id: string) => get<ContextEntry[]>(`/agents/${id}/context`),
  agentFiles: (id: string) => get<FileChange[]>(`/agents/${id}/files`),
  agent: (id: string) => get<Agent>(`/agents/${id}`),
  killAgent: (id: string) => patch<{ ok: boolean }>(`/agents/${id}`, { status: "completed", context_summary: "Manually killed via UI" }),
  tasks: (projectId?: string) => get<Task[]>(`/tasks${projectId ? `?project_id=${projectId}` : ""}`),
  task: (id: number) => get<Task>(`/tasks/${id}`),
  createTask: (data: { project_id?: string; title: string; description?: string; assigned_to?: string; status?: string; tags?: string[] }) =>
    post<{ ok: boolean; id: number }>("/tasks", data),
  updateTask: (id: number, data: Partial<Pick<Task, "title" | "description" | "status" | "assigned_to" | "tags">>) =>
    patch<{ ok: boolean }>(`/tasks/${id}`, data),
  deleteTask: (id: number) => del<{ ok: boolean }>(`/tasks/${id}`),
  taskComments: (taskId: number) => get<TaskComment[]>(`/tasks/${taskId}/comments`),
  addTaskComment: (taskId: number, data: { content: string; author?: string; comment_type?: string }) =>
    post<{ ok: boolean; id: number }>(`/tasks/${taskId}/comments`, data),
  activities: (limit?: number, projectId?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (projectId) params.set("project_id", projectId);
    const qs = params.toString();
    return get<Activity[]>(`/activities${qs ? `?${qs}` : ""}`);
  },
  stats: (projectId?: string) => get<Stats>(`/stats${projectId ? `?project_id=${projectId}` : ""}`),
  // Usage analytics
  usageDaily: (days?: number) => get<DailyActivity[]>(`/usage/daily${days ? `?days=${days}` : ""}`),
  usageWeekly: () => get<{ messages: number; sessions: number; toolCalls: number }>("/usage/weekly"),
  usageContextSizes: (projectId?: string) => get<AgentContextSize[]>(`/usage/context-sizes${projectId ? `?project_id=${projectId}` : ""}`),
  usageTotalContext: (projectId?: string) => get<{ total: number }>(`/usage/total-context${projectId ? `?project_id=${projectId}` : ""}`),
  usageTokens: (projectId?: string) => get<AgentTokenUsage[]>(`/usage/tokens${projectId ? `?project_id=${projectId}` : ""}`),
  usageTotalTokens: (projectId?: string) => get<TotalTokenUsage>(`/usage/total-tokens${projectId ? `?project_id=${projectId}` : ""}`),
  // Agent Definitions (file-based)
  agentDefs: (projectId: string) => get<AgentDefinition[]>(`/agent-defs?project_id=${projectId}`),
  agentDef: (projectId: string, name: string) => get<AgentDefinition>(`/agent-defs/${name}?project_id=${projectId}`),
  createAgentDef: (data: { project_id: string; name: string; description?: string; model?: string; tools?: string[]; skills?: string[]; permissionMode?: string; body?: string }) =>
    post<{ ok: true }>("/agent-defs", data),
  updateAgentDef: (name: string, data: { project_id: string } & Partial<AgentDefinition>) =>
    put<{ ok: true }>(`/agent-defs/${name}`, data),
  deleteAgentDef: (projectId: string, name: string) =>
    del<{ ok: true }>(`/agent-defs/${name}?project_id=${projectId}`),
  // Agent Registry (swarm/tmux agents)
  registry: (projectId: string) => get<RegisteredAgent[]>(`/registry?project_id=${projectId}`),
  // Observations
  observations: (projectId: string, query?: string, type?: string, agent?: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (query) params.set("query", query);
    if (type) params.set("type", type);
    if (agent) params.set("agent", agent);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    return get<Observation[]>(`/observations?${params.toString()}`);
  },
  observationDetails: (ids: number[]) => get<Observation[]>(`/observations/details?ids=${ids.join(",")}`),
  observationTimeline: (id: number, before?: number, after?: number) => {
    const params = new URLSearchParams();
    if (before) params.set("before", String(before));
    if (after) params.set("after", String(after));
    const qs = params.toString();
    return get<Observation[]>(`/observations/${id}/timeline${qs ? `?${qs}` : ""}`);
  },
  deleteObservation: (id: number) => del<{ ok: boolean }>(`/observations/${id}`),
  updateObservation: (id: number, data: { text?: string; type?: string; concepts?: string[] }) =>
    patch<{ ok: boolean }>(`/observations/${id}`, data),
  promotionCandidates: (projectId: string, minCount?: number, minSessions?: number) => {
    const params = new URLSearchParams({ project_id: projectId });
    if (minCount) params.set("min_count", String(minCount));
    if (minSessions) params.set("min_sessions", String(minSessions));
    return get<PromotionCandidate[]>(`/observations/promotion-candidates?${params.toString()}`);
  },
  promote: (ids: number[], promotedTo: string) =>
    post<{ ok: boolean; count: number }>("/observations/promote", { ids, promoted_to: promotedTo }),
  // Skills
  skills: (projectId: string) => get<Skill[]>(`/skills?project_id=${projectId}`),
  // Curation
  curationStats: (projectId: string) => get<CurationStats>(`/curation/stats?project_id=${projectId}`),
  // Flows
  flows: (projectId?: string) => get<Flow[]>(`/flows${projectId ? `?project_id=${projectId}` : ""}`),
  flow: (id: number) => get<Flow>(`/flows/${id}`),
  createFlow: (data: { project_id: string; name: string; mermaid_code: string; description?: string; metadata?: Record<string, unknown> }) =>
    post<{ ok: boolean; id: number }>("/flows", data),
  updateFlow: (id: number, data: Partial<Pick<Flow, "name" | "description" | "status" | "mermaid_code"> & { metadata: Record<string, unknown> }>) =>
    patch<{ ok: boolean }>(`/flows/${id}`, data),
  deleteFlow: (id: number) => del<{ ok: boolean }>(`/flows/${id}`),
};
