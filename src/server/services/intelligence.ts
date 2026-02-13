import { getDb } from "../db.js";
import {
  getAssignedTasks,
  getActiveAgents,
  getOpenTasks,
  getDecisions,
  getCompletedAgents,
  getIncompleteTasks,
  getPendingMessages,
  getAllPendingMessageCount,
  getSiblingMarks,
  getProjectMarks,
  getFileBasedMarks,
  getRelevantMarksRAG,
} from "./queries/index.js";
import { isEmbeddingEnabled } from "./embedding.js";
import { getProjectIdForSession } from "./session.js";

/**
 * Smart context injection for SubagentStart.
 *
 * Push = only what agents can't discover on their own.
 * Pull = agents search via self-search skill + RAG when needed.
 *
 * Stages:
 *  1. Assigned Tasks — agent needs to know what to do
 *  2. Pending Messages — agent needs to know about communications
 *  3. Team Marks — sibling agent warnings/discoveries (current session)
 *  4. Past Marks — cross-session marks via RAG (or file-based fallback)
 */
export async function buildSmartContext(
  sessionId: string,
  agentName: string,
  agentType: string | null,
  parentAgentId: string | null
): Promise<string> {
  const sections: string[] = [];

  // 1. Assigned tasks (HIGHEST PRIORITY — agent needs to know what to do)
  const tasks = await getAssignedTasks(sessionId, agentName);

  if (tasks.length > 0) {
    const taskLines: string[] = [];
    for (const t of tasks) {
      const tagsStr = t.tags && t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : "";
      let line = `- [${t.status}] ${t.title}${tagsStr}${t.description ? ": " + t.description.slice(0, 100) : ""}`;
      if (t.planComment) {
        line += `\n  Plan: ${t.planComment.slice(0, 200)}`;
      }
      taskLines.push(line);
    }
    sections.push(`## Your Assigned Tasks\n${taskLines.join("\n")}`);
  }

  // 2. Pending messages
  const pendingMsgs = await getPendingMessages(sessionId, agentName, 5);

  if (pendingMsgs.length > 0) {
    const lines = pendingMsgs.map(
      (m) => `- [${m.priority}] From ${m.from_name} (${m.created_at}): ${m.content}`
    );
    sections.push(`## Pending Messages\n${lines.join("\n")}`);
  }

  // 3. Team Marks — sibling agent marks in current session
  try {
    const siblingMarkRows = await getSiblingMarks(sessionId, agentName, parentAgentId, 5);
    if (siblingMarkRows.length > 0) {
      const lines = siblingMarkRows.map(
        (m) => `- [${m.type}] ${m.title}${m.agent_name ? ` (by ${m.agent_name})` : ""}`
      );
      sections.push(`## Team Marks\n${lines.join("\n")}`);
    }
  } catch (err) {
    console.error("[intelligence/stage-3] team marks failed:", err);
  }

  // 4. Past Marks — cross-session marks via RAG or file-based fallback
  try {
    const projectId = await getProjectIdForSession(sessionId);
    if (projectId) {
      let allMarks;

      if (isEmbeddingEnabled()) {
        const taskDescs = tasks.map(t =>
          t.description ? `${t.title}: ${t.description}` : t.title
        ).join(" | ");
        const contextText = `${agentName} ${agentType ?? ""} ${taskDescs}`.trim();
        allMarks = await getRelevantMarksRAG(projectId, contextText, sessionId, 5);
      } else {
        const taskFiles = await getAgentFileChanges(sessionId, agentName);
        const fileMarkRows = taskFiles.length > 0
          ? await getFileBasedMarks(projectId, taskFiles, sessionId, 5)
          : [];
        const projectMarkRows = await getProjectMarks(projectId, sessionId, 5);

        const seenIds = new Set<number>();
        allMarks = [...fileMarkRows, ...projectMarkRows].filter(m => {
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          return true;
        }).slice(0, 5);
      }

      if (allMarks.length > 0) {
        const lines = allMarks.map(
          (m) => `- [${m.type}] ${m.title}${m.agent_name ? ` (by ${m.agent_name})` : ""}`
        );
        sections.push(`## Past Marks\n${lines.join("\n")}`);
      }
    }
  } catch (err) {
    console.error("[intelligence/stage-4] past marks failed:", err);
  }

  if (sections.length === 0) return "";

  return `[mimir smart context for ${agentName}]\n\n${sections.join("\n\n")}`;
}

/**
 * Get file paths associated with an agent's same-type predecessors in this session.
 * Used to find file-based marks relevant to the agent's work area.
 */
async function getAgentFileChanges(
  sessionId: string, agentName: string
): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.all(
      `SELECT DISTINCT fc.file_path
       FROM file_changes fc
       JOIN agents a ON fc.agent_id = a.id
       WHERE fc.session_id = ?
         AND (a.agent_name = ? OR a.agent_type = ?)
       LIMIT 20`,
      sessionId, agentName, agentName
    ) as Array<{ file_path: string }>;
    return rows.map(r => r.file_path);
  } catch {
    return [];
  }
}

/**
 * Todo Enforcer: check incomplete tasks on SubagentStop.
 * Returns a warning string if agent has unfinished tasks.
 */
export async function checkIncompleteTasks(
  sessionId: string,
  _agentId: string,
  agentName: string
): Promise<string | null> {
  const incomplete = await getIncompleteTasks(sessionId, agentName);

  if (incomplete.length === 0) return null;

  const lines = incomplete.map((t) => `- [${t.status}] ${t.title}`);
  return `[mimir warning] Agent ${agentName} stopping with ${incomplete.length} incomplete task(s):\n${lines.join("\n")}`;
}

/**
 * Build project context for UserPromptSubmit.
 * Attaches active tasks, recent decisions, and active agents summary.
 * Each query is independently protected for partial success.
 */
export async function buildPromptContext(
  sessionId: string
): Promise<string> {
  const sections: string[] = [];

  // Active agents
  const activeAgents = await getActiveAgents(sessionId);

  if (activeAgents.length > 0) {
    const lines = activeAgents.map(
      (a) => `- ${a.agent_name}${a.agent_type ? ` (${a.agent_type})` : ""}`
    );
    sections.push(`## Active Agents\n${lines.join("\n")}`);
  }

  // Open tasks for this project (5-stage priority order, excluding completed)
  const { tasks, backlogCount } = await getOpenTasks(sessionId);

  if (tasks.length > 0 || backlogCount > 0) {
    const lines = tasks.map(
      (t) => {
        const tagsStr = t.tags && t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : "";
        return `- [${t.status}] ${t.title}${tagsStr}${t.assigned_to ? ` → ${t.assigned_to}` : ""}`;
      }
    );
    if (backlogCount > 0) {
      lines.push(`\n(+${backlogCount} in backlog)`);
    }
    sections.push(`## Open Tasks\n${lines.join("\n")}`);
  }

  // Recent decisions/blockers
  const decisions = await getDecisions(sessionId);

  if (decisions.length > 0) {
    const lines = decisions.map(
      (d) => `- [${d.entry_type}] ${d.content}`
    );
    sections.push(`## Recent Decisions & Blockers\n${lines.join("\n")}`);
  }

  // Completed agent summaries (this session)
  const completedAgents = await getCompletedAgents(sessionId);

  if (completedAgents.length > 0) {
    const lines = completedAgents.map(
      (a) => `- [${a.agent_name}] ${a.context_summary}`
    );
    sections.push(`## Completed Agent Summaries\n${lines.join("\n")}`);
  }

  // Pending messages count
  const pendingMsgCount = await getAllPendingMessageCount(sessionId);

  if (pendingMsgCount > 0) {
    sections.push(`## Pending Messages\n${pendingMsgCount} unread message(s) in project. Use read_messages MCP tool to check.`);
  }

  // Past marks (cross-session knowledge)
  try {
    const projectId = await getProjectIdForSession(sessionId);
    if (projectId) {
      const markRows = await getProjectMarks(projectId, sessionId, 5);
      if (markRows.length > 0) {
        const lines = markRows.map(
          (m) => `- [${m.type}] ${m.title}`
        );
        sections.push(`## Past Marks\n${lines.join("\n")}`);
      }
    }
  } catch (err) {
    console.error("[intelligence/prompt-marks] failed:", err);
  }

  if (sections.length === 0) {
    return "[mimir project context]\n\n(No active tasks or agents)";
  }

  return `[mimir project context]\n\n${sections.join("\n\n")}`;
}
