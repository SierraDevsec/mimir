export interface ContextRow {
  id: number;
  session_id: string;
  agent_id: string | null;
  entry_type: string;
  content: string;
  tags: string[] | null;
  created_at: string;
}

export interface AgentRow {
  id: string;
  session_id: string;
  agent_name: string;
  agent_type: string | null;
  parent_agent_id: string | null;
  status: string;
  context_summary: string | null;
}

export interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  tags: string[] | null;
}

export interface TaskCommentRow {
  content: string;
  comment_type: string;
}

export async function safeQuery<T>(label: string, fn: () => Promise<unknown[]>): Promise<T[]> {
  try {
    return await fn() as T[];
  } catch (err) {
    console.error(`[intelligence/${label}] query failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}
