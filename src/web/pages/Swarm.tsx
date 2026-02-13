import { useEffect, useState, useRef, useCallback } from "react";
import { useProject } from "../lib/ProjectContext";
import { api, type AgentDefinition } from "../lib/api";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import SwarmMonitor from "../components/SwarmMonitor";
import { useQuery } from "../lib/useQuery";
import { RiSendPlane2Line, RiRobot2Line, RiAddLine, RiCloseLine } from "react-icons/ri";

interface Message {
  id: number;
  from_name: string;
  to_name: string;
  content: string;
  priority: string;
  status: string;
  created_at: string;
}

interface Agent {
  agent_name: string;
  tmux_pane: string | null;
  status: string;
  last_seen_at: string;
}

interface SwarmSession {
  sessionName: string;
  projectId: string;
  agents: Array<{ name: string; model: string; paneId?: string }>;
  status: string;
  createdAt: string;
}

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5",
  haiku: "claude-haiku-4-5-20251001",
};

export default function Swarm() {
  const { selected } = useProject();
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const senderName = "user";
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedAgentDefs, setSelectedAgentDefs] = useState<Set<string>>(new Set());
  const [initialTask, setInitialTask] = useState("");
  const [swarmSessions, setSwarmSessions] = useState<SwarmSession[]>([]);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const activeSessionSince = useRef<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!selected) return;
    if (!activeSessionSince.current) {
      setMessages([]);
      return;
    }
    try {
      const url = `/api/messages?project_id=${encodeURIComponent(selected)}&limit=100&since=${encodeURIComponent(activeSessionSince.current)}`;
      const res = await fetch(url);
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }, [selected]);

  const loadAgents = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/registry?project_id=${encodeURIComponent(selected)}`);
      const data = await res.json();
      setAgents(data);
      if (data.length > 0 && !selectedAgent) {
        setSelectedAgent(data[0].agent_name);
      }
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  }, [selected, selectedAgent]);

  const loadSwarmSessions = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/swarm/sessions?project_id=${encodeURIComponent(selected)}`);
      const data = await res.json();
      setSwarmSessions(data);
      const active = data.find((s: SwarmSession) => s.status === "active");
      activeSessionSince.current = active?.createdAt ?? null;
    } catch (error) {
      console.error("Failed to load swarm sessions:", error);
    }
  }, [selected]);

  const defFetcher = useCallback(async () => {
    if (!selected) return [];
    return api.agentDefs(selected);
  }, [selected]);
  const { data: agentDefs } = useQuery<AgentDefinition[]>({ fetcher: defFetcher, deps: [selected] });

  useEffect(() => {
    if (!selected) return;
    loadSwarmSessions().then(() => loadMessages());
    loadAgents();
    const interval = setInterval(() => {
      loadSwarmSessions().then(() => loadMessages());
      loadAgents();
    }, 2000);
    return () => clearInterval(interval);
  }, [selected, loadSwarmSessions, loadMessages, loadAgents]);

  const isSending = useRef(false);

  async function sendMessage() {
    if (!selected || !selectedAgent || !newMessage.trim()) return;
    if (isSending.current) return;
    isSending.current = true;

    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selected,
          from_name: senderName,
          to_name: selectedAgent,
          content: newMessage,
          priority: "normal",
        }),
      });
      setNewMessage("");
      loadMessages();
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      isSending.current = false;
    }
  }

  const [confirmingKill, setConfirmingKill] = useState<string | null>(null);

  async function killSwarmSession(sessionName: string) {
    if (!selected) return;

    try {
      await fetch(`/api/tmux/sessions/${encodeURIComponent(sessionName)}`, {
        method: "DELETE",
      });
      setConfirmingKill(null);
      loadSwarmSessions();
      loadAgents();
    } catch (error) {
      console.error("Failed to kill session:", error);
    }
  }

  function toggleAgentDef(name: string) {
    setSelectedAgentDefs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleStartSwarm() {
    if (!selected || !agentDefs) return;

    const chosen = agentDefs.filter((d) => selectedAgentDefs.has(d.name));
    if (chosen.length === 0) {
      alert("Select at least one agent.");
      return;
    }

    setIsStarting(true);

    const agentList = chosen.map((d) => ({
      name: d.name,
      model: MODEL_MAP[d.model] ?? "claude-sonnet-4-5",
      persona: d.description || undefined,
    }));

    try {
      const res = await fetch("/api/swarm/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selected,
          agents: agentList,
          leader_model: "claude-opus-4-6",
          initial_task: initialTask || undefined,
          skip_permissions: skipPermissions,
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setShowStartModal(false);
        setSelectedAgentDefs(new Set());
        setInitialTask("");
        setSkipPermissions(false);
        loadAgents();
        loadSwarmSessions();
      } else {
        alert(`Failed to start swarm: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to start swarm:", error);
      alert("Failed to start swarm. Check console for details.");
    } finally {
      setIsStarting(false);
    }
  }

  const filteredMessages = selectedAgent
    ? messages.filter(
        (m) => m.from_name === selectedAgent || m.to_name === selectedAgent
      )
    : messages;

  // Detect if user is at bottom of scroll container
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
    setShouldAutoScroll(isAtBottom);
  };

  // Auto-scroll to bottom when new messages arrive (only if user is at bottom)
  useEffect(() => {
    if (shouldAutoScroll && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredMessages, shouldAutoScroll]);

  if (!selected) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          title="Select a project"
          description="Choose a project to view swarm messages"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-2xl font-bold text-white">Claude Orchestration</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStartModal(true)}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RiAddLine className="w-4 h-4" />
            Start Orchestration
          </button>
        </div>
      </div>

      {/* Start Orchestration Modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Start Orchestration</h3>
              <button
                onClick={() => setShowStartModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <RiCloseLine className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Select Agents */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Select Agents
                </label>
                {!agentDefs || agentDefs.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-4 text-center">
                    No agents defined.{" "}
                    <a href="/agents" className="text-emerald-400 hover:text-emerald-300 underline">
                      Go to Agents page
                    </a>{" "}
                    to create.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {agentDefs.map((def) => (
                      <label
                        key={def.name}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          selectedAgentDefs.has(def.name)
                            ? "bg-emerald-900/20 border border-emerald-700/50"
                            : "bg-zinc-800/40 border border-zinc-700/30 hover:bg-zinc-800/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgentDefs.has(def.name)}
                          onChange={() => toggleAgentDef(def.name)}
                          className="rounded border-zinc-600 bg-zinc-800 text-emerald-500"
                        />
                        <span className="text-sm text-zinc-200 font-medium">{def.name}</span>
                        <span className="text-xs text-zinc-500">({def.model})</span>
                        {def.description && (
                          <span className="text-xs text-zinc-500 truncate ml-auto max-w-[200px]">
                            {def.description}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Initial Task */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Initial Task (optional)
                </label>
                <textarea
                  value={initialTask}
                  onChange={(e) => setInitialTask(e.target.value)}
                  placeholder="Enter the initial task for all agents..."
                  rows={6}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 resize-none overflow-y-auto"
                />
              </div>

              {/* Skip Permissions */}
              <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer bg-zinc-800/40 border border-zinc-700/30 hover:bg-zinc-800/60 transition-colors">
                <input
                  type="checkbox"
                  checked={skipPermissions}
                  onChange={(e) => setSkipPermissions(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-emerald-500"
                />
                <div>
                  <span className="text-sm text-zinc-200 font-medium">Skip Permissions</span>
                  <p className="text-xs text-zinc-500">
                    --dangerously-skip-permissions: Agents run without tool approval prompts
                  </p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleStartSwarm}
                  disabled={isStarting || selectedAgentDefs.size === 0}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isStarting ? "Starting..." : `Start (${selectedAgentDefs.size})`}
                </button>
                <button
                  onClick={() => setShowStartModal(false)}
                  disabled={isStarting}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Message Area - Top */}
      <div className="flex-1 min-h-0 px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
        {/* Agent List & Swarm Sessions */}
        <Card className="lg:col-span-1 space-y-4 overflow-y-auto">
          {/* Active Swarm Sessions */}
          {swarmSessions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Active Sessions</h3>
              <div className="space-y-2">
                {swarmSessions.map((session) => (
                  <div
                    key={session.sessionName}
                    className="px-3 py-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-300 font-medium truncate">
                          {session.sessionName}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {session.agents.length} agents
                        </div>
                      </div>
                      {confirmingKill === session.sessionName ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => killSwarmSession(session.sessionName)}
                            className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingKill(null)}
                            className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingKill(session.sessionName)}
                          className="px-2 py-1 bg-red-900/30 hover:bg-red-800/50 text-red-400 text-xs rounded border border-red-700/50 transition-colors"
                          title="Kill session"
                        >
                          Kill
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Agents */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Active Agents</h3>
            {agents.length === 0 ? (
              <p className="text-xs text-zinc-500">No agents registered</p>
            ) : (
              <div className="space-y-1">
                {agents.map((agent) => (
                  <button
                    key={agent.agent_name}
                    onClick={() => setSelectedAgent(agent.agent_name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedAgent === agent.agent_name
                        ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700/50"
                        : "text-zinc-400 hover:bg-zinc-800/60 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RiRobot2Line className="w-4 h-4" />
                      <span className="truncate">{agent.agent_name}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {agent.status === "active" ? "🟢 Online" : "⚪ Offline"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Chat Area */}
        <Card className="lg:col-span-3 flex flex-col overflow-hidden">
          {selectedAgent ? (
            <>
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <RiRobot2Line className="w-4 h-4 text-emerald-400" />
                  {selectedAgent}
                </h3>
                <span className="text-xs text-zinc-500">
                  {filteredMessages.length} messages
                </span>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto space-y-3 mb-4 flex flex-col"
              >
                {filteredMessages.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-8">
                    No messages yet
                  </p>
                ) : (
                  <>
                    {[...filteredMessages].reverse().map((msg) => {
                      const isSentBySelectedAgent = msg.from_name === selectedAgent;

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isSentBySelectedAgent ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-4 py-2 ${
                              isSentBySelectedAgent
                                ? "bg-emerald-900/30 border border-emerald-700/50"
                                : "bg-zinc-800/60 border border-zinc-700/50"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-xs font-medium ${
                                  msg.from_name === "user"
                                    ? "text-blue-400"
                                    : isSentBySelectedAgent ? "text-emerald-400" : "text-zinc-400"
                                }`}
                              >
                                {msg.from_name === "user" ? "[USER]" : msg.from_name}
                              </span>
                              <span className="text-xs text-zinc-500">→</span>
                              <span className="text-xs text-zinc-500">{msg.to_name}</span>
                              <span className="text-xs text-zinc-600">
                                {new Date(msg.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                              {msg.content}
                            </p>
                            {msg.priority !== "normal" && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded bg-orange-900/30 text-orange-400 border border-orange-700/50">
                                {msg.priority}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-2 border-t border-zinc-800 pt-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={`Message to ${selectedAgent}...`}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-300 placeholder-zinc-600"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <RiSendPlane2Line className="w-4 h-4" />
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-zinc-500">Select an agent to start chatting</p>
            </div>
          )}
        </Card>
        </div>
      </div>

      {/* Swarm Monitor - Bottom */}
      <div className="shrink-0 h-[280px]">
        <SwarmMonitor projectId={selected} />
      </div>
    </div>
  );
}
