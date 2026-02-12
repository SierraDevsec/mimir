import { useEffect, useState, useCallback } from "react";
import { api, type ContextEntry, type Session, formatDateTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";

export default function Context() {
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [search, setSearch] = useState("");
  const { selected: projectId } = useProject();

  const sessionsFetcher = useCallback(() => {
    return api.sessions(false, projectId ?? undefined);
  }, [projectId]);

  const { data: sessions = [] } = useQuery<Session[]>({
    fetcher: sessionsFetcher,
    deps: [projectId],
    reloadOnEvents: false,
  });

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) {
      setSelectedSession(sessions[0].id);
    } else if (sessions.length === 0) {
      setSelectedSession("");
    }
  }, [sessions, selectedSession]);

  const entriesFetcher = useCallback(() => {
    return selectedSession ? api.sessionContext(selectedSession) : Promise.resolve([]);
  }, [selectedSession]);

  const { data: entries = [] } = useQuery<ContextEntry[]>({
    fetcher: entriesFetcher,
    deps: [selectedSession],
    reloadOnEvents: false,
  });

  const filtered = search
    ? entries.filter(
        (e) =>
          e.content.toLowerCase().includes(search.toLowerCase()) ||
          e.entry_type.toLowerCase().includes(search.toLowerCase()) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : entries;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-zinc-50">Context Store</h2>

      <div className="flex gap-3">
        <select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          className="cl-select bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200"
        >
          {sessions.length === 0 && <option value="">No sessions</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.id.slice(0, 8)} ({s.status})</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search content, type, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 flex-1 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <EmptyState
            title={sessions.length === 0 ? "No sessions yet" : "No context entries"}
            description={sessions.length === 0 ? "Start a Claude Code session with hooks enabled." : undefined}
          />
        )}
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="purple">{entry.entry_type}</Badge>
              {entry.agent_id && (
                <span className="text-xs text-zinc-500 font-mono">{entry.agent_id.slice(0, 12)}</span>
              )}
              {(entry.tags ?? []).map((tag) => (
                <Badge key={tag} variant="neutral">{tag}</Badge>
              ))}
              <span className="text-xs text-zinc-600 ml-auto">{formatDateTime(entry.created_at)}</span>
            </div>
            <div className="text-sm text-zinc-200 whitespace-pre-wrap">{entry.content}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
