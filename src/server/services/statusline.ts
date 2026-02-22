// In-memory cache for statusline data (volatile, real-time)

export interface StatuslineData {
  project_id: string;
  directory: string;
  git_branch: string;
  model: string;
  cli_version: string;
  agent_name: string;
  context_pct: number;
  session_pct: number;
  session_reset: string;
  rolling_5h_pct: number;
  rolling_5h_cost: string;
  weekly_pct: number;
  weekly_cost: string;
  updated_at: string;
}

// Keyed by project_id
const cache = new Map<string, StatuslineData>();
// Secondary index: expanded directory path → project_id
const pathIndex = new Map<string, string>();

const STATUSLINE_MAP_MAX = 10_000;

export function updateStatusline(projectId: string, data: Omit<StatuslineData, "project_id" | "updated_at">): void {
  // Guard against unbounded map growth — clear both maps together so they stay in sync.
  // Statusline data is purely real-time / in-memory; clearing has no durability impact.
  if (cache.size >= STATUSLINE_MAP_MAX) {
    cache.clear();
    pathIndex.clear();
  }

  const entry: StatuslineData = {
    ...data,
    project_id: projectId,
    updated_at: new Date().toISOString(),
  };
  cache.set(projectId, entry);

  // Index by expanded directory path (resolve ~ to HOME)
  if (data.directory) {
    const expanded = data.directory.replace(/^~/, process.env.HOME ?? "");
    pathIndex.set(expanded, projectId);
  }
}

export function getStatusline(projectId: string): StatuslineData | null {
  return cache.get(projectId) ?? null;
}

export function getStatuslineByPath(dirPath: string): StatuslineData | null {
  const projectId = pathIndex.get(dirPath);
  if (!projectId) return null;
  return cache.get(projectId) ?? null;
}
