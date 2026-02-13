import { useState, useCallback } from "react";
import { api, type CurationStats, type PromotionCandidate, formatDateTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { RiTimeLine, RiTerminalBoxLine, RiEyeLine, RiArrowUpLine, RiDatabase2Line } from "react-icons/ri";

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  warning:   { bg: "bg-red-900/60", text: "text-red-300" },
  decision:  { bg: "bg-blue-900/60", text: "text-blue-300" },
  discovery: { bg: "bg-amber-900/60", text: "text-amber-300" },
  note:      { bg: "bg-purple-900/60", text: "text-purple-300" },
};

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_COLORS[type] ?? TYPE_COLORS.note;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      {type}
    </span>
  );
}

export default function Curation() {
  const { selected: projectId } = useProject();
  const [promoteTarget, setPromoteTarget] = useState<PromotionCandidate | null>(null);
  const [rulesFile, setRulesFile] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const statsFetcher = useCallback(async () => {
    if (!projectId) return null;
    return api.curationStats(projectId);
  }, [projectId, refreshKey]);

  const candidatesFetcher = useCallback(async () => {
    if (!projectId) return [];
    return api.promotionCandidates(projectId);
  }, [projectId, refreshKey]);

  const { data: stats, loading: statsLoading } = useQuery<CurationStats | null>({ fetcher: statsFetcher, deps: [projectId, refreshKey] });
  const { data: candidates } = useQuery<PromotionCandidate[]>({ fetcher: candidatesFetcher, deps: [projectId, refreshKey] });

  async function handlePromote() {
    if (!promoteTarget || !rulesFile.trim()) return;
    setPromoting(true);
    try {
      await api.promote(promoteTarget.mark_ids, rulesFile.trim());
      setPromoteTarget(null);
      setRulesFile("");
      setRefreshKey((k) => k + 1);
    } finally {
      setPromoting(false);
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        Select a project to view curation stats
      </div>
    );
  }

  if (statsLoading && !stats) {
    return <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>;
  }

  const statCards = [
    {
      label: "Last Curated",
      value: stats?.last_curated ? formatDateTime(stats.last_curated) : "Never",
      icon: RiTimeLine,
    },
    {
      label: "Sessions Since",
      value: stats?.sessions_since ?? 0,
      icon: RiTerminalBoxLine,
    },
    {
      label: "New Marks",
      value: stats?.marks_since ?? 0,
      icon: RiEyeLine,
    },
    {
      label: "Promotion Candidates",
      value: stats?.promotion_candidates ?? 0,
      icon: RiArrowUpLine,
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Curation</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold text-zinc-50">{s.value}</div>
                <div className="text-sm text-zinc-400 mt-1">{s.label}</div>
              </div>
              <s.icon className="w-5 h-5 text-zinc-600" />
            </div>
          </Card>
        ))}
      </div>

      {/* Agent Memories */}
      {stats?.agent_memories && stats.agent_memories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <RiDatabase2Line className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-zinc-100">Agent Memories</h3>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-700/50">
                    <th className="pb-2 font-medium">Agent</th>
                    <th className="pb-2 font-medium">Size</th>
                    <th className="pb-2 font-medium">Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.agent_memories.map((m) => (
                    <tr key={m.name} className="border-b border-zinc-800/50 last:border-0">
                      <td className="py-2 text-zinc-200 font-mono">{m.name}</td>
                      <td className="py-2 text-zinc-400">{(m.size_bytes / 1024).toFixed(1)} KB</td>
                      <td className="py-2 text-zinc-500">{m.last_modified.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Promotion Candidates */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-100 mb-3">Promotion Candidates</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Concepts that appear 3+ times across 2+ sessions. Promote to <code className="text-zinc-400">.claude/rules/</code> for permanent team knowledge.
        </p>

        {!candidates?.length ? (
          <EmptyState title="No promotion candidates" description="Marks need to appear across multiple sessions to become candidates." />
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <Card key={c.concept}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">{c.concept}</span>
                    <span className="text-xs text-zinc-500">
                      {c.count} marks / {c.session_count} sessions
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setPromoteTarget(c);
                      setRulesFile(`rules/${c.concept}.md`);
                    }}
                    className="px-3 py-1 rounded text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                  >
                    Promote
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {c.types.map((t, i) => <TypeBadge key={i} type={t} />)}
                </div>
                <div className="text-xs text-zinc-400 space-y-0.5">
                  {c.sample_titles.slice(0, 3).map((title, i) => (
                    <div key={i} className="truncate">{title}</div>
                  ))}
                  {c.sample_titles.length > 3 && (
                    <div className="text-zinc-500">+{c.sample_titles.length - 3} more</div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Promote Modal */}
      {promoteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-600 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Promote "{promoteTarget.concept}"
            </h3>
            <p className="text-xs text-zinc-400">
              {promoteTarget.count} marks will be promoted. They will no longer appear in future agent injections.
            </p>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Rules file path</label>
              <input
                type="text"
                value={rulesFile}
                onChange={(e) => setRulesFile(e.target.value)}
                placeholder="rules/example.md"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setPromoteTarget(null); setRulesFile(""); }}
                className="px-4 py-2 rounded text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={promoting || !rulesFile.trim()}
                className="px-4 py-2 rounded text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
              >
                {promoting ? "Promoting..." : "Confirm Promote"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
