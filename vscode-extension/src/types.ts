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

export interface Activity {
  id: number;
  session_id: string;
  agent_id: string | null;
  event_type: string;
  details: string;
  created_at: string;
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

export interface Stats {
  total_sessions: number;
  active_sessions: number;
  total_agents: number;
  active_agents: number;
  total_context_entries: number;
  total_file_changes: number;
}

export interface WsMessage {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export const COLUMNS = [
  { key: "idea", label: "Idea" },
  { key: "planned", label: "Planned" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "needs_review", label: "Needs Review" },
  { key: "completed", label: "Completed" },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]["key"];
