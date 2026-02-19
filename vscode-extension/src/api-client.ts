import type { Activity, Agent, ContextEntry, FileChange, Session, Stats, Task, TaskComment } from "./types";

export class ApiClient {
  private token: string;

  constructor(private baseUrl: string) {
    this.token = process.env.MIMIR_API_TOKEN ?? "";
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const merged: RequestInit = {
      ...init,
      headers: this.authHeaders(init?.headers as Record<string, string> | undefined),
    };
    const res = await fetch(`${this.baseUrl}${path}`, merged);
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  health() {
    return this.get<{ status: string; uptime: number }>("/api/health");
  }

  stats(projectId: string) {
    return this.get<Stats>(`/api/stats?project_id=${projectId}`);
  }

  sessions(projectId: string, active?: boolean) {
    const params = new URLSearchParams({ project_id: projectId });
    if (active) params.set("active", "true");
    return this.get<Session[]>(`/api/sessions?${params.toString()}`);
  }

  agents(projectId: string, active?: boolean) {
    const params = new URLSearchParams({ project_id: projectId });
    if (active) params.set("active", "true");
    return this.get<Agent[]>(`/api/agents?${params.toString()}`);
  }

  sessionAgents(sessionId: string) {
    return this.get<Agent[]>(`/api/sessions/${sessionId}/agents`);
  }

  sessionActivities(sessionId: string) {
    return this.get<Activity[]>(`/api/sessions/${sessionId}/activities`);
  }

  sessionContext(sessionId: string) {
    return this.get<ContextEntry[]>(`/api/sessions/${sessionId}/context`);
  }

  sessionFiles(sessionId: string) {
    return this.get<FileChange[]>(`/api/sessions/${sessionId}/files`);
  }

  killAgent(id: string) {
    return this.patch<{ ok: boolean }>(`/api/agents/${id}`, {
      status: "completed",
      context_summary: "Manually killed via VSCode",
    });
  }

  tasks(projectId: string) {
    return this.get<Task[]>(`/api/tasks?project_id=${projectId}`);
  }

  createTask(data: { title: string; description?: string; status?: string }) {
    return this.post<{ ok: boolean; id: number }>("/api/tasks", data);
  }

  updateTask(id: number, data: Partial<Pick<Task, "title" | "description" | "status" | "assigned_to" | "tags">>) {
    return this.patch<{ ok: boolean }>(`/api/tasks/${id}`, data);
  }

  deleteTask(id: number) {
    return this.del<{ ok: boolean }>(`/api/tasks/${id}`);
  }

  taskComments(taskId: number) {
    return this.get<TaskComment[]>(`/api/tasks/${taskId}/comments`);
  }

  addTaskComment(taskId: number, data: { content: string; author?: string; comment_type?: string }) {
    return this.post<{ ok: boolean; id: number }>(`/api/tasks/${taskId}/comments`, data);
  }

  activities(projectId: string, limit = 50) {
    return this.get<Activity[]>(`/api/activities?project_id=${projectId}&limit=${limit}`);
  }
}
