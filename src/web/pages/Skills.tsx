import { useState, useCallback } from "react";
import { api, type Skill } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";

type FilterMode = "all" | "preloaded" | "standalone";

export default function Skills() {
  const { selected: projectId } = useProject();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    if (!projectId) return [];
    return api.skills(projectId);
  }, [projectId]);

  const { data: skills, loading } = useQuery<Skill[]>({ fetcher, deps: [projectId] });

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        Select a project to view skills
      </div>
    );
  }

  const filtered = (skills ?? []).filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "preloaded" && s.preloadedBy.length === 0) return false;
    if (filter === "standalone" && s.preloadedBy.length > 0) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Skills</h2>

      {/* Filters */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-600"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="cl-select bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-300"
        >
          <option value="all">All</option>
          <option value="preloaded">Preloaded</option>
          <option value="standalone">User-invoked</option>
        </select>
      </div>

      {/* Skills Grid */}
      {loading && !skills ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={skills?.length === 0 ? "No skills installed" : "No matching skills"}
          description={skills?.length === 0 ? "Skills are installed via mimir init from .claude/skills/" : "Try a different search or filter"}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((skill) => {
            const isExpanded = expandedSkill === skill.name;
            return (
              <Card
                key={skill.name}
                className={`cursor-pointer ${isExpanded ? "col-span-full" : ""}`}
                hover
              >
                <div onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-zinc-100">{skill.name}</h3>
                    <div className="flex items-center gap-1.5">
                      {skill.hasReferences && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                          refs
                        </span>
                      )}
                      {skill.preloadedBy.length > 0 ? (
                        <Badge variant="info">preloaded</Badge>
                      ) : (
                        <Badge variant="neutral">user-invoked</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 mb-2 line-clamp-2">
                    {skill.description || "No description"}
                  </p>
                  {skill.preloadedBy.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {skill.preloadedBy.map((agent) => (
                        <span key={agent} className="text-[10px] px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded">
                          {agent}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isExpanded && skill.body && (
                  <div className="mt-3 pt-3 border-t border-zinc-700/50">
                    <div className="text-xs text-zinc-500 mb-1">SKILL.md preview</div>
                    <pre className="text-xs text-zinc-400 bg-zinc-800/50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap font-mono">
                      {skill.body.slice(0, 2000)}
                      {skill.body.length > 2000 && "\n\n... (truncated)"}
                    </pre>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
