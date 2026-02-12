import { useState, useCallback } from "react";
import { api, type Agent, type AgentDefinition, type RegisteredAgent, type Session, formatDateTime, formatTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Card } from "../components/Card";
import { Badge, statusVariant } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { AgentDetail } from "../components/AgentDetail";
import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiEditLine, RiRobot2Line } from "react-icons/ri";

const AVAILABLE_TOOLS = ["Read", "Write", "Edit", "Grep", "Glob", "Bash"];
const AVAILABLE_SKILLS = ["compress-output", "compress-review"];
const PERMISSION_MODES = ["default", "plan", "bypassPermissions"];
const MODELS = [
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

const MODEL_COLORS: Record<string, string> = {
  opus: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  sonnet: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  haiku: "bg-teal-900/40 text-teal-300 border-teal-700/50",
};

const MEMORY_OPTIONS = ["none", "project"];

interface ModalState {
  mode: "create" | "edit";
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  memory: string;
  permissionMode: string;
  body: string;
}

const emptyModal: ModalState = {
  mode: "create",
  name: "",
  description: "",
  model: "sonnet",
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
  skills: ["compress-output"],
  memory: "project",
  permissionMode: "default",
  body: "",
};

// --- Running Agents section (collapsed by default) ---

type AgentsData = { sessions: Session[]; agentsBySession: Record<string, Agent[]> };

export default function Agents() {
  const { selected: projectId } = useProject();

  // Agent definitions
  const defFetcher = useCallback(async () => {
    if (!projectId) return [];
    return api.agentDefs(projectId);
  }, [projectId]);
  const { data: definitions, reload: reloadDefs } = useQuery<AgentDefinition[]>({ fetcher: defFetcher, deps: [projectId] });

  // Modal
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);

  // Running agents
  const [showRunning, setShowRunning] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());

  const runningFetcher = useCallback(async (): Promise<AgentsData> => {
    const sessions = await api.sessions(true, projectId ?? undefined);
    const map: Record<string, Agent[]> = {};
    await Promise.all(
      sessions.map(async (s) => {
        map[s.id] = await api.sessionAgents(s.id);
      })
    );
    return { sessions, agentsBySession: map };
  }, [projectId]);

  // Swarm agents from registry (tmux-based)
  const registryFetcher = useCallback(async (): Promise<RegisteredAgent[]> => {
    if (!projectId) return [];
    try { return await api.registry(projectId); } catch { return []; }
  }, [projectId]);

  const { data: runningData, reload: reloadRunning } = useQuery<AgentsData>({ fetcher: runningFetcher, deps: [projectId] });
  const { data: registryAgents = [] } = useQuery<RegisteredAgent[]>({ fetcher: registryFetcher, deps: [projectId] });
  const { sessions = [], agentsBySession = {} } = runningData ?? {};
  const allAgents = Object.values(agentsBySession).flat();
  const totalRunning = allAgents.length + registryAgents.length;
  const activeSessions = sessions.filter((s) => (agentsBySession[s.id] ?? []).length > 0);

  function openCreateModal() {
    setModal({ ...emptyModal });
  }

  function openEditModal(def: AgentDefinition) {
    setModal({
      mode: "edit",
      name: def.name,
      description: def.description,
      model: def.model,
      tools: [...def.tools],
      skills: [...def.skills],
      memory: def.memory ?? "project",
      permissionMode: def.permissionMode,
      body: def.body,
    });
  }

  async function handleSave() {
    if (!projectId || !modal) return;
    if (!modal.name.trim()) {
      alert("Name is required");
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === "create") {
        await api.createAgentDef({
          project_id: projectId,
          name: modal.name.trim(),
          description: modal.description,
          model: modal.model,
          tools: modal.tools,
          skills: modal.skills,
          memory: modal.memory,
          permissionMode: modal.permissionMode,
          body: modal.body,
        });
      } else {
        await api.updateAgentDef(modal.name, {
          project_id: projectId,
          description: modal.description,
          model: modal.model,
          tools: modal.tools,
          skills: modal.skills,
          memory: modal.memory,
          permissionMode: modal.permissionMode,
          body: modal.body,
        });
      }
      setModal(null);
      reloadDefs();
    } catch (error) {
      alert(`Failed to save: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (!projectId) return;
    if (!confirm(`Delete agent "${name}"? The agent-memory directory will be preserved.`)) return;
    try {
      await api.deleteAgentDef(projectId, name);
      reloadDefs();
    } catch (error) {
      alert(`Failed to delete: ${(error as Error).message}`);
    }
  }

  function toggleTool(tool: string) {
    if (!modal) return;
    setModal({
      ...modal,
      tools: modal.tools.includes(tool)
        ? modal.tools.filter((t) => t !== tool)
        : [...modal.tools, tool],
    });
  }

  function toggleSkill(skill: string) {
    if (!modal) return;
    setModal({
      ...modal,
      skills: modal.skills.includes(skill)
        ? modal.skills.filter((s) => s !== skill)
        : [...modal.skills, skill],
    });
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState title="Select a project" description="Choose a project to manage agent definitions" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Definitions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Agent Definitions</h2>
          <button
            onClick={openCreateModal}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RiAddLine className="w-4 h-4" />
            New Agent
          </button>
        </div>

        {!definitions || definitions.length === 0 ? (
          <EmptyState
            title="No agent definitions"
            description="Create an agent to get started. Agent definitions are stored as .claude/agents/*.md files."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {definitions.map((def) => (
              <Card key={def.name} className="relative group" hover>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <RiRobot2Line className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-semibold text-white">{def.name}</h3>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${MODEL_COLORS[def.model] ?? MODEL_COLORS.sonnet}`}>
                    {def.model}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                  {def.description || "No description"}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {def.tools.map((tool) => (
                    <span key={tool} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                      {tool}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(def)}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    <RiEditLine className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(def.name)}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                  >
                    <RiDeleteBinLine className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {modal.mode === "create" ? "New Agent" : `Edit: ${modal.name}`}
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <RiCloseLine className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  disabled={modal.mode === "edit"}
                  placeholder="e.g. my-agent"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 disabled:opacity-50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  placeholder="Short description of this agent's role"
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 resize-none"
                />
              </div>

              {/* Model + Memory + Permission Mode (inline) */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Model</label>
                  <div className="relative">
                    <select
                      value={modal.model}
                      onChange={(e) => setModal({ ...modal, model: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-zinc-300 appearance-none cursor-pointer"
                    >
                      {MODELS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">&#9662;</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Memory</label>
                  <div className="relative">
                    <select
                      value={modal.memory}
                      onChange={(e) => setModal({ ...modal, memory: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-zinc-300 appearance-none cursor-pointer"
                    >
                      {MEMORY_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">&#9662;</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Permission</label>
                  <div className="relative">
                    <select
                      value={modal.permissionMode}
                      onChange={(e) => setModal({ ...modal, permissionMode: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-zinc-300 appearance-none cursor-pointer"
                    >
                      {PERMISSION_MODES.map((mode) => (
                        <option key={mode} value={mode}>{mode}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">&#9662;</span>
                  </div>
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Tools</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TOOLS.map((tool) => (
                    <label key={tool} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modal.tools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                        className="rounded border-zinc-600 bg-zinc-800 text-emerald-500"
                      />
                      {tool}
                    </label>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Skills</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SKILLS.map((skill) => (
                    <label key={skill} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modal.skills.includes(skill)}
                        onChange={() => toggleSkill(skill)}
                        className="rounded border-zinc-600 bg-zinc-800 text-emerald-500"
                      />
                      {skill}
                    </label>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Body (Agent Prompt)</label>
                <textarea
                  value={modal.body}
                  onChange={(e) => setModal({ ...modal, body: e.target.value })}
                  placeholder="Agent instructions and role description..."
                  rows={8}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 resize-none font-mono"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? "Saving..." : modal.mode === "create" ? "Create Agent" : "Save Changes"}
                </button>
                <button
                  onClick={() => setModal(null)}
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Running Agents (collapsible) */}
      <div>
        <button
          onClick={() => setShowRunning(!showRunning)}
          className="flex items-center gap-2 text-lg font-semibold text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <span className={`text-xs transition-transform ${showRunning ? "rotate-90" : ""}`}>&#9654;</span>
          Running Agents
          <span className="text-xs text-zinc-500">({totalRunning})</span>
        </button>

        {showRunning && (
          <div className="space-y-4">
            {/* Swarm Agents (from registry) */}
            {registryAgents.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-1 py-1">
                  <Badge variant="success" dot>swarm</Badge>
                  <span className="text-xs text-zinc-400">{registryAgents.length} agents (tmux)</span>
                </div>
                {registryAgents.map((ra) => (
                  <div key={ra.agent_name} className="flex items-start gap-2 ml-5">
                    <span className="text-zinc-600 text-sm mt-3 shrink-0">{"\u251c\u2500"}</span>
                    <Card className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-zinc-200">{ra.agent_name}</span>
                        <Badge variant="success" dot>active</Badge>
                        {ra.tmux_pane && <span className="text-xs text-zinc-500">pane: {ra.tmux_pane}</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        last seen: {formatDateTime(ra.last_seen_at)}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {activeSessions.length === 0 && registryAgents.length === 0 && <EmptyState title="No agents found" />}
              {activeSessions.map((session) => {
                const agents = agentsBySession[session.id] ?? [];
                const isCollapsed = collapsedSessions.has(session.id);
                const toggleSession = () => {
                  setCollapsedSessions((prev) => {
                    const next = new Set(prev);
                    if (next.has(session.id)) next.delete(session.id);
                    else next.add(session.id);
                    return next;
                  });
                };
                return (
                  <div key={session.id} className="space-y-1">
                    <div
                      className="flex items-center gap-2 px-1 cursor-pointer hover:bg-zinc-800/30 rounded-lg py-1 -my-1 transition-colors"
                      onClick={toggleSession}
                    >
                      <span className={`text-zinc-500 text-xs transition-transform ${isCollapsed ? "" : "rotate-90"}`}>&#9654;</span>
                      <Badge variant={statusVariant(session.status)} dot>{session.status}</Badge>
                      <span className="text-xs font-mono text-zinc-400">{session.id.slice(0, 12)}</span>
                      {session.project_id && <span className="text-xs text-zinc-500">{session.project_id}</span>}
                      <span className="text-xs text-zinc-600">{formatDateTime(session.started_at)}</span>
                      <span className="text-xs text-zinc-600 ml-auto">{agents.length} agents</span>
                    </div>
                    {!isCollapsed && agents.map((agent, i) => {
                      const isExpanded = expandedAgent === agent.id;
                      return (
                        <div key={agent.id} className="flex items-start gap-2 ml-5">
                          <span className="text-zinc-600 text-sm mt-3 shrink-0">{i === agents.length - 1 ? "\u2514\u2500" : "\u251c\u2500"}</span>
                          <Card className="flex-1 cursor-pointer" hover>
                            <div onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-zinc-200">{agent.agent_name}</span>
                                <Badge variant={statusVariant(agent.status)} dot>{agent.status}</Badge>
                                {agent.agent_type && agent.agent_type !== agent.agent_name && (
                                  <span className="text-xs text-zinc-500">[{agent.agent_type}]</span>
                                )}
                                {agent.status === "active" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      api.killAgent(agent.id).then(reloadRunning).catch(() => {});
                                    }}
                                    className="ml-auto px-2 py-0.5 text-[10px] rounded-lg bg-red-900/40 text-red-400 hover:bg-red-900/70 transition-colors"
                                    title="Kill agent"
                                  >
                                    Kill
                                  </button>
                                )}
                              </div>
                              <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                                <span>id: {agent.id.slice(0, 12)}</span>
                                {agent.completed_at && <span>completed: {formatTime(agent.completed_at)}</span>}
                                {(agent.input_tokens > 0 || agent.output_tokens > 0) && (
                                  <span className="text-amber-500">
                                    {((agent.input_tokens + agent.output_tokens) / 1000).toFixed(1)}K tokens
                                    <span className="text-zinc-600 ml-1">(in: {(agent.input_tokens / 1000).toFixed(1)}K / out: {(agent.output_tokens / 1000).toFixed(1)}K)</span>
                                  </span>
                                )}
                              </div>
                              {!isExpanded && agent.context_summary && (
                                <div className="mt-2 text-xs text-zinc-400 bg-zinc-800/50 rounded-lg p-2 line-clamp-2">
                                  {agent.context_summary}
                                </div>
                              )}
                            </div>
                            {isExpanded && <AgentDetail agent={agent} />}
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
