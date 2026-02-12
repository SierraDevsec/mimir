import { useState, useCallback } from "react";
import { api, type Activity as ActivityType, type FileChange, formatTime } from "../lib/api";
import { useWebSocket } from "../lib/useWebSocket";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Badge } from "../components/Badge";
import { EventBadge } from "../components/EventBadge";
import { FilterButton } from "../components/FilterButton";
import { EmptyState } from "../components/EmptyState";

const EVENT_TYPES = [
  "SessionStart", "SessionEnd", "SubagentStart", "SubagentStop",
  "PostToolUse", "Stop", "UserPromptSubmit",
];

export default function Activity() {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [subagentOnly, setSubagentOnly] = useState(false);
  const [tab, setTab] = useState<"log" | "files">("log");
  const { connected } = useWebSocket();
  const { selected: projectId } = useProject();

  const fetcher = useCallback(() => {
    return api.activities(100, projectId ?? undefined);
  }, [projectId]);

  const { data: activities = [] } = useQuery<ActivityType[]>({ fetcher, deps: [projectId] });

  const loadFiles = (sessionId: string) => {
    api.sessionFiles(sessionId).then(setFiles).catch(() => {});
  };

  const filtered = activities
    .filter((a) => !typeFilter || a.event_type === typeFilter)
    .filter((a) => !subagentOnly || a.agent_id != null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-zinc-50">Activity</h2>
        <Badge variant={connected ? "success" : "danger"} dot>{connected ? "LIVE" : "OFFLINE"}</Badge>
      </div>

      <div className="flex gap-2">
        <FilterButton active={tab === "log"} onClick={() => setTab("log")}>
          Event Log
        </FilterButton>
        <FilterButton active={tab === "files"} onClick={() => setTab("files")}>
          File Changes
        </FilterButton>
        {tab === "log" && (
          <>
            <button
              onClick={() => setSubagentOnly(!subagentOnly)}
              className={`px-3 py-1 rounded-lg text-xs ml-auto transition-colors ${subagentOnly ? "bg-purple-900/60 text-purple-300" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              Subagent Only
            </button>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="cl-select bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300"
            >
              <option value="">All events</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {tab === "log" && (
        <div className="space-y-1">
          {filtered.length === 0 && <EmptyState title="No activity" />}
          {filtered.map((a) => {
            let details: Record<string, unknown> = {};
            try { details = JSON.parse(a.details); } catch (_) {}
            return (
              <div key={a.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-zinc-800/50">
                <span className="text-zinc-600 w-20 shrink-0">{formatTime(a.created_at)}</span>
                <EventBadgeWrapper type={a.event_type} />
                <span className="text-zinc-400 font-mono w-20 shrink-0">{a.agent_id?.slice(0, 10) ?? "—"}</span>
                <span className="text-zinc-500 truncate">
                  {Object.entries(details).map(([k, v]) => `${k}=${String(v)}`).join(" ")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "files" && (
        <div>
          <div className="mb-3">
            <button
              onClick={() => {
                if (activities.length > 0) loadFiles(activities[0].session_id);
              }}
              className="px-3 py-1 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
            >
              Load latest session files
            </button>
          </div>
          <div className="space-y-1">
            {files.length === 0 && <EmptyState title="No file changes loaded" />}
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800/50">
                <span className="text-zinc-600 w-20 shrink-0">{formatTime(f.created_at)}</span>
                <Badge variant={f.change_type === "create" ? "success" : "warning"}>{f.change_type}</Badge>
                <span className="text-zinc-300 font-mono">{f.file_path}</span>
                <span className="text-zinc-500 font-mono">{f.agent_id?.slice(0, 10) ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventBadgeWrapper({ type }: { type: string }) {
  return (
    <span className="w-28 shrink-0 text-center">
      <EventBadge type={type} />
    </span>
  );
}
