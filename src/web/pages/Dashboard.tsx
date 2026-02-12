import { useCallback } from "react";
import { api, type Session, type Agent, type Activity, type Task, type Stats, type DailyActivity, type AgentContextSize, type AgentTokenUsage, type TotalTokenUsage, formatTime } from "../lib/api";
import { useWebSocket } from "../lib/useWebSocket";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { EventBadge, EVENT_VARIANTS } from "../components/EventBadge";
import { BarChart } from "../components/Chart";
import { RiTerminalBoxLine, RiRobot2Line, RiDatabase2Line, RiFileEditLine, RiPulseLine, RiTaskLine, RiTimeLine, RiCoinLine } from "react-icons/ri";

type DashboardData = [Session[], Agent[], Agent[], Activity[], Stats, Task[], DailyActivity[], AgentContextSize[], AgentTokenUsage[], TotalTokenUsage];

export default function Dashboard() {
  const { connected, events } = useWebSocket();
  const { selected: projectId } = useProject();

  const fetcher = useCallback(async () => {
    const pid = projectId ?? undefined;
    return Promise.all([
      api.sessions(true, pid),
      api.agents(true, pid),
      api.agents(false, pid),
      api.activities(50, pid),
      api.stats(pid),
      api.tasks(pid),
      api.usageDaily(7),
      api.usageContextSizes(pid),
      api.usageTokens(pid),
      api.usageTotalTokens(pid),
    ]) as Promise<DashboardData>;
  }, [projectId]);

  const { data } = useQuery<DashboardData>({ fetcher, deps: [projectId] });

  const [sessions = [], agents = [], allAgents = [], activities = [], stats, tasks = [], dailyActivity = [], contextSizes = [], tokenUsage = [], totalTokens] = data ?? [];

  const agentTypeCounts = allAgents.reduce<Record<string, number>>((acc, a) => {
    const type = a.agent_type || a.agent_name || "unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const agentTypeData = Object.entries(agentTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, color: "bg-emerald-500" }));

  const activityTypeCounts = activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.event_type] = (acc[a.event_type] || 0) + 1;
    return acc;
  }, {});

  const EVENT_CHART_COLORS: Record<string, string> = {
    SessionStart: "bg-green-500",
    SessionEnd: "bg-red-500",
    SubagentStart: "bg-blue-500",
    SubagentStop: "bg-purple-500",
    PostToolUse: "bg-amber-500",
    UserPromptSubmit: "bg-cyan-500",
    Stop: "bg-orange-500",
  };

  const activityTypeData = Object.entries(activityTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: EVENT_CHART_COLORS[label] || "bg-zinc-500" }));

  // Daily activity chart (messages per day)
  const dailyActivityData = [...dailyActivity]
    .reverse()
    .map((d) => ({
      label: d.date.slice(5), // MM-DD
      value: d.messageCount,
      color: "bg-cyan-500",
    }));

  // Context sizes chart (top agents by context length)
  const contextSizeData = contextSizes
    .filter((c) => c.context_length > 0)
    .slice(0, 8)
    .map((c) => ({
      label: c.agent_type || c.agent_name || c.id.slice(0, 8),
      value: Math.round(c.context_length / 100) * 100, // Round to nearest 100
      color: "bg-purple-500",
    }));

  // Token usage chart (top agents by total tokens)
  const tokenUsageData = tokenUsage
    .filter((t) => t.total_tokens > 0)
    .slice(0, 8)
    .map((t) => ({
      label: t.agent_type || t.agent_name || t.id.slice(0, 8),
      value: t.total_tokens,
      color: "bg-amber-500",
    }));

  // Calculate totals for stats
  const weeklyMessages = dailyActivity.reduce((sum, d) => sum + d.messageCount, 0);
  const totalContextChars = contextSizes.reduce((sum, c) => sum + c.context_length, 0);
  const totalTokenCount = totalTokens?.total ?? 0;

  // Format token count with K/M suffix
  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const statCards = [
    { label: "Active Sessions", value: sessions.length, sub: stats ? `/ ${stats.total_sessions} total` : undefined, icon: RiTerminalBoxLine },
    { label: "Active Agents", value: agents.length, sub: stats ? `/ ${stats.total_agents} total` : undefined, icon: RiRobot2Line },
    { label: "Context Entries", value: stats?.total_context_entries ?? 0, icon: RiDatabase2Line },
    { label: "File Changes", value: stats?.total_file_changes ?? 0, icon: RiFileEditLine },
    { label: "Live Events", value: events.length, icon: RiPulseLine },
    { label: "Tasks", value: tasks.length, icon: RiTaskLine, sub: projectId ? "this project" : "all projects" },
    { label: "Weekly Messages", value: weeklyMessages, icon: RiTimeLine, sub: "last 7 days" },
    { label: "Total Tokens", value: formatTokens(totalTokenCount), icon: RiCoinLine, sub: totalTokens ? `in: ${formatTokens(totalTokens.input)} / out: ${formatTokens(totalTokens.output)}` : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-zinc-50">Dashboard</h2>
        <Badge variant={connected ? "success" : "danger"} dot>{connected ? "LIVE" : "DISCONNECTED"}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-zinc-50">{s.value}</span>
                  {s.sub && <span className="text-xs text-zinc-600">{s.sub}</span>}
                </div>
                <div className="text-sm text-zinc-400 mt-1">{s.label}</div>
              </div>
              <s.icon className="w-5 h-5 text-zinc-600" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <BarChart data={dailyActivityData} title="Daily Messages (Last 7 Days)" />
        </Card>
        <Card>
          <BarChart data={tokenUsageData} title="Agent Token Usage" />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <BarChart data={agentTypeData} title="Agent Types" />
        </Card>
        <Card>
          <BarChart data={activityTypeData} title="Recent Activity Breakdown" />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <BarChart data={contextSizeData} title="Agent Context Sizes (chars)" />
        </Card>
        <div />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Active Sessions</h3>
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-zinc-600 text-sm">No active sessions</p>}
            {sessions.map((s) => (
              <Card key={s.id} hover>
                <div className="text-sm font-mono text-zinc-200">{s.id}</div>
                <div className="text-xs text-zinc-500 mt-1">project: {s.project_id ?? "—"}</div>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Recent Activity</h3>
          <div className="space-y-1">
            {activities.length === 0 && <p className="text-zinc-600 text-sm">No activity yet</p>}
            {activities.slice(0, 15).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                <EventBadge type={a.event_type} />
                <span className="text-zinc-400 font-mono">{a.agent_id?.slice(0, 8) ?? "system"}</span>
                <span className="text-zinc-600">{formatTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

