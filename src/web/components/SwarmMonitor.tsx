import { useEffect, useState, useCallback } from "react";
import { Card } from "./Card";
import { RiTerminalLine, RiRobot2Line } from "react-icons/ri";

interface SwarmSession {
  sessionName: string;
  projectId: string;
  agents: Array<{ name: string; model: string; paneId?: string }>;
  status: string;
  createdAt: string;
}

interface SwarmMonitorProps {
  projectId: string | null;
}

export default function SwarmMonitor({ projectId }: SwarmMonitorProps) {
  const [sessions, setSessions] = useState<SwarmSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/swarm/sessions?project_id=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      setSessions(data);
      if (data.length > 0 && !selectedSession) {
        setSelectedSession(data[0].sessionName);
      }
    } catch (error) {
      console.error("Failed to load swarm sessions:", error);
    }
  }, [projectId, selectedSession]);

  useEffect(() => {
    if (!projectId) return;
    loadSessions();
    const interval = setInterval(loadSessions, 2000);
    return () => clearInterval(interval);
  }, [projectId, loadSessions]);

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950 border-t border-zinc-800">
        <p className="text-sm text-zinc-600">Select a project to view swarm sessions</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950 border-t border-zinc-800">
        <div className="text-center">
          <RiTerminalLine className="w-12 h-12 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No active swarm sessions</p>
          <p className="text-xs text-zinc-600 mt-1">Start a swarm to see session details</p>
        </div>
      </div>
    );
  }

  const currentSession = sessions.find((s) => s.sessionName === selectedSession);

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-t border-zinc-800">
      {/* Session Tabs */}
      <div className="flex gap-2 p-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mr-4">
          <RiTerminalLine className="w-4 h-4" />
          <span>Active Sessions:</span>
        </div>
        {sessions.map((session) => (
          <button
            key={session.sessionName}
            onClick={() => setSelectedSession(session.sessionName)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedSession === session.sessionName
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {session.sessionName}
          </button>
        ))}
      </div>

      {/* Session Details */}
      {currentSession && (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Session Info */}
            <Card>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Session Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Name:</span>
                  <span className="text-zinc-300 font-mono text-xs">{currentSession.sessionName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    currentSession.status === "active"
                      ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700/50"
                      : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {currentSession.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Agents:</span>
                  <span className="text-zinc-300">{currentSession.agents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Created:</span>
                  <span className="text-zinc-300 text-xs">
                    {new Date(currentSession.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            {/* Agent List */}
            <Card>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Agents</h3>
              <div className="space-y-2">
                {currentSession.agents.map((agent, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-zinc-800/40 rounded-lg border border-zinc-700/50"
                  >
                    <div className="flex items-center gap-2">
                      <RiRobot2Line className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-zinc-300">{agent.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{agent.model}</span>
                      {agent.paneId && (
                        <span className="text-xs font-mono text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">
                          {agent.paneId}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
