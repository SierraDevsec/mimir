import { useState, useCallback, useRef, useEffect } from "react";
import { api, type Observation, type PromotionCandidate, formatDateTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";

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

const PAGE_SIZE = 20;

function MarksList({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    try {
      const data = await api.observations(
        projectId, search || undefined, typeFilter || undefined, undefined, PAGE_SIZE, offset
      );
      if (append) {
        setObservations(prev => [...prev, ...data]);
      } else {
        setObservations(data);
      }
      setHasMore(data.length >= PAGE_SIZE);
    } catch (error) {
      console.error("Failed to load observations:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, search, typeFilter]);

  // Reset on filter change
  useEffect(() => {
    setObservations([]);
    setHasMore(true);
    loadPage(0, false);
  }, [loadPage]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadPage(observations.length, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, observations.length, loadPage]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search marks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-600"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="cl-select bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All Types</option>
          {Object.keys(TYPE_COLORS).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading && observations.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
      ) : observations.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center">
          No marks yet. Marks are created by agents during work via self-marking.
        </div>
      ) : (
        <div className="space-y-2">
          {observations.map((obs) => (
            <div key={obs.id} className="bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <button
                onClick={() => setExpandedId(expandedId === obs.id ? null : obs.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
              >
                <TypeBadge type={obs.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{obs.title}</div>
                  {obs.subtitle && (
                    <div className="text-xs text-zinc-500 truncate">{obs.subtitle}</div>
                  )}
                </div>
                {obs.promoted_to && (
                  <span className="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 shrink-0">
                    {obs.promoted_to}
                  </span>
                )}
                <div className="text-xs text-zinc-500 shrink-0">
                  {formatDateTime(obs.created_at)}
                </div>
                <span className="text-zinc-600 text-xs">
                  {expandedId === obs.id ? "\u25B2" : "\u25BC"}
                </span>
              </button>

              {expandedId === obs.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-zinc-700/50 pt-3">
                  {obs.narrative && (
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Narrative</div>
                      <div className="text-sm text-zinc-300 whitespace-pre-wrap">{obs.narrative}</div>
                    </div>
                  )}

                  {obs.concepts && obs.concepts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {obs.concepts.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-700 rounded text-xs text-zinc-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {((obs.files_read && obs.files_read.length > 0) || (obs.files_modified && obs.files_modified.length > 0)) && (
                    <div className="text-xs text-zinc-500 space-y-1">
                      {obs.files_read && obs.files_read.length > 0 && (
                        <div>Files read: {obs.files_read.join(", ")}</div>
                      )}
                      {obs.files_modified && obs.files_modified.length > 0 && (
                        <div>Files modified: {obs.files_modified.join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-4 text-center">
            {loading && <span className="text-zinc-500 text-sm">Loading more...</span>}
            {!hasMore && observations.length > 0 && (
              <span className="text-zinc-600 text-xs">{observations.length} marks total</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PromotionPanel({ projectId }: { projectId: string }) {
  const [promoteTarget, setPromoteTarget] = useState<PromotionCandidate | null>(null);
  const [rulesFile, setRulesFile] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetcher = useCallback(async () => {
    return api.promotionCandidates(projectId);
  }, [projectId, refreshKey]);

  const { data: candidates, loading } = useQuery<PromotionCandidate[]>({ fetcher, deps: [projectId, refreshKey] });

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

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Concepts that appear 3+ times across 2+ sessions are promotion candidates.
        Promote them to <code className="text-zinc-400">.claude/rules/</code> for permanent team knowledge.
      </p>

      {loading && !candidates ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
      ) : !candidates?.length ? (
        <div className="text-zinc-500 text-sm py-8 text-center">
          No promotion candidates yet. Marks need to appear across multiple sessions.
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.concept} className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 p-4">
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
            </div>
          ))}
        </div>
      )}

      {/* Promote Modal */}
      {promoteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-600 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100">
              Promote "{promoteTarget.concept}"
            </h3>
            <p className="text-xs text-zinc-400">
              {promoteTarget.count} marks will be promoted.
              They will no longer appear in future agent injections.
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

export default function Observations() {
  const { selected: projectId } = useProject();
  const [tab, setTab] = useState<"marks" | "promotion">("marks");

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        Select a project to view marks
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Marks</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700">
        <button
          onClick={() => setTab("marks")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "marks"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Marks
        </button>
        <button
          onClick={() => setTab("promotion")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "promotion"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Promotion
        </button>
      </div>

      {tab === "marks" ? (
        <MarksList projectId={projectId} />
      ) : (
        <PromotionPanel projectId={projectId} />
      )}
    </div>
  );
}
