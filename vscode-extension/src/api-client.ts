import type { Activity, Agent, ContextEntry, FileChange, Session, Stats, Task, TaskComment } from "./types";

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
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

  stats(projectId?: string) {
    return this.get<Stats>(`/api/stats${projectId ? `?project_id=${projectId}` : ""}`);
  }

  sessions(active?: boolean) {
    const params = new URLSearchParams();
    if (active) params.set("active", "true");
    const qs = params.toString();
    return this.get<Session[]>(`/api/sessions${qs ? `?${qs}` : ""}`);
  }

  agents(active?: boolean) {
    const params = new URLSearchParams();
    if (active) params.set("active", "true");
    const qs = params.toString();
    return this.get<Agent[]>(`/api/agents${qs ? `?${qs}` : ""}`);
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

  tasks(projectId?: string) {
    return this.get<Task[]>(`/api/tasks${projectId ? `?project_id=${projectId}` : ""}`);
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

  activities(limit = 50) {
    return this.get<Activity[]>(`/api/activities?limit=${limit}`);
  }
}
