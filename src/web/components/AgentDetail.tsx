import { useState, useEffect } from "react";
import { api, type Agent, type ContextEntry, type FileChange, formatDateTime } from "../lib/api";
import { Badge } from "./Badge";

type Tab = "summary" | "context" | "files";

export function AgentDetail({ agent }: { agent: Agent }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [context, setContext] = useState<ContextEntry[]>([]);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [loadedContext, setLoadedContext] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setContext([]);
    setFiles([]);
    setLoadedContext(false);
    setLoadedFiles(false);
    setTab("summary");
  }, [agent.id]);

  useEffect(() => {
    if (tab === "context" && !loadedContext) {
      setLoading(true);
      api.agentContext(agent.id).then(c => { setContext(c); setLoadedContext(true); setLoading(false); }).catch(() => setLoading(false));
    }
    if (tab === "files" && !loadedFiles) {
      setLoading(true);
      api.agentFiles(agent.id).then(f => { setFiles(f); setLoadedFiles(true); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [tab, agent.id, loadedContext, loadedFiles]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "context", label: "Context" },
    { key: "files", label: "Files" },
  ];

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3 space-y-3">
      <div className="flex gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={(e) => { e.stopPropagation(); setTab(t.key); }}
            className={`px-3 py-1 rounded-lg text-xs transition-colors ${tab === t.key ? "bg-emerald-900/60 text-emerald-300" : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="text-sm text-zinc-300 whitespace-pre-wrap">
          {agent.context_summary || <span className="text-zinc-600 italic">No summary available</span>}
        </div>
      )}

      {tab === "context" && (
        <div className="space-y-2">
          {loading && <p className="text-xs text-zinc-500">Loading...</p>}
          {!loading && context.length === 0 && <p className="text-xs text-zinc-600">No context entries</p>}
          {context.map(e => (
            <div key={e.id} className="bg-zinc-800/50 rounded-lg p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="purple">{e.entry_type}</Badge>
                {(e.tags ?? []).map(t => <Badge key={t} variant="neutral">{t}</Badge>)}
                <span className="text-[10px] text-zinc-600 ml-auto">{formatDateTime(e.created_at)}</span>
              </div>
              <div className="text-xs text-zinc-300 whitespace-pre-wrap">{e.content}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "files" && (
        <div className="space-y-1">
          {loading && <p className="text-xs text-zinc-500">Loading...</p>}
          {!loading && files.length === 0 && <p className="text-xs text-zinc-600">No file changes</p>}
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs py-1">
              <Badge variant={f.change_type === "create" ? "success" : "warning"}>{f.change_type}</Badge>
              <span className="text-zinc-300 font-mono">{f.file_path}</span>
              <span className="text-zinc-600 text-[10px] ml-auto">{formatDateTime(f.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
