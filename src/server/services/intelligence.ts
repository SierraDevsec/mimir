import { getDb } from "../db.js";
import {
  getSiblingAgents,
  getSameTypeAgents,
  getCrossSessionContext,
  getTaggedContext,
  getRecentContext,
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
} from "./queries/index.js";

const MAX_CONTEXT_CHARS = 6000;

/**
 * Smart context injection for SubagentStart.
 * Instead of blindly returning recent 10 entries, selects context
 * based on agent role relevance, sibling agents, and cross-session history.
 * Each query is independently protected — partial results are returned on failure.
 *
 * Sections are added in priority order (highest first).
 * A 6000-char budget prevents context bloat.
 */
export async function buildSmartContext(
  sessionId: string,
  agentName: string,
  agentType: string | null,
  parentAgentId: string | null
): Promise<string> {
  // Collect sections in priority order (highest first)
  const prioritySections: string[] = [];

  // 6. Active tasks assigned to this agent (HIGHEST PRIORITY)
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
    prioritySections.push(`## Your Assigned Tasks\n${taskLines.join("\n")}`);
  }

  // 7. Pending messages for this agent
  const pendingMsgs = await getPendingMessages(sessionId, agentName, 5);

  if (pendingMsgs.length > 0) {
    const lines = pendingMsgs.map(
      (m) => `- [${m.priority}] From ${m.from_name} (${m.created_at}): ${m.content}`
    );
    prioritySections.push(`## Pending Messages\n${lines.join("\n")}`);
  }

  // 1. Sibling agent summaries (same parent, same session — most relevant)
  if (parentAgentId) {
    const siblings = await getSiblingAgents(sessionId, parentAgentId);

    if (siblings.length > 0) {
      const lines = siblings.map(
        (s) => `- [${s.agent_name}] ${s.context_summary}`
      );
      prioritySections.push(`## Sibling Agent Results\n${lines.join("\n")}`);
    }
  }

  // 2. Same-type agent history (agents with same name/type — learn from predecessors)
  if (agentType) {
    const sameType = await getSameTypeAgents(agentType, sessionId, parentAgentId);

    if (sameType.length > 0) {
      const lines = sameType.map(
        (s) => `- [${s.agent_name}] ${s.context_summary}`
      );
      prioritySections.push(`## Previous ${agentType} Agent Results\n${lines.join("\n")}`);
    }
  }

  // 4. Current session context (tagged entries relevant to this agent)
  const taggedContext = await getTaggedContext(sessionId, agentName, agentType);

  if (taggedContext.length > 0) {
    const lines = taggedContext.map(
      (e) => `- [${e.entry_type}] ${e.content}`
    );
    prioritySections.push(`## Relevant Context\n${lines.join("\n")}`);
  }

  // 3. Cross-session context (same project, previous sessions)
  const crossSession = await getCrossSessionContext(sessionId);

  if (crossSession.length > 0) {
    const lines = crossSession.map(
      (e) => `- [${e.entry_type}${e.agent_name ? ` by ${e.agent_name}` : ""}] ${e.content}`
    );
    prioritySections.push(`## Cross-Session Context\n${lines.join("\n")}`);
  }

  // 8. Sibling Marks — direct injection (marks from sibling agents in same session)
  try {
    const siblingMarkRows = await getSiblingMarks(sessionId, agentName, parentAgentId, 5);
    if (siblingMarkRows.length > 0) {
      const lines = siblingMarkRows.map(
        (m) => `- [${m.type}] ${m.title}${m.agent_name ? ` (by ${m.agent_name})` : ""}`
      );
      prioritySections.push(`## Team Marks\n${lines.join("\n")}`);
    }
  } catch (err) {
    console.error("[intelligence/stage-8] sibling marks failed:", err);
  }

  // 9. Cross-Session Marks + File-Based Marks — direct injection
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT project_id FROM sessions WHERE id = ?`, sessionId) as Array<{ project_id: string | null }>;
    const projectId = rows[0]?.project_id;
    if (projectId) {
      // Collect file paths from assigned tasks (description + title may mention files)
      const taskFiles = await getAgentFileChanges(sessionId, agentName);

      // File-based marks (highest relevance for cross-session)
      const fileMarkRows = taskFiles.length > 0
        ? await getFileBasedMarks(projectId, taskFiles, sessionId, 5)
        : [];

      // General project marks (fallback)
      const projectMarkRows = await getProjectMarks(projectId, sessionId, 5);

      // Merge and deduplicate (file-based marks first, then project marks)
      const seenIds = new Set<number>();
      const allMarks = [...fileMarkRows, ...projectMarkRows].filter(m => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      }).slice(0, 5);

      if (allMarks.length > 0) {
        const lines = allMarks.map(
          (m) => `- [${m.type}] ${m.title}${m.agent_name ? ` (by ${m.agent_name})` : ""}`
        );
        prioritySections.push(`## Past Marks\n${lines.join("\n")}`);
      }
    }
  } catch (err) {
    console.error("[intelligence/stage-9] project marks failed:", err);
  }

  // 5. Fallback: if nothing found, use recent session context
  if (prioritySections.length === 0) {
    const recent = await getRecentContext(sessionId);

    if (recent.length > 0) {
      const lines = recent.map(
        (e) => `- [${e.entry_type}] ${e.content}`
      );
      prioritySections.push(`## Recent Context\n${lines.join("\n")}`);
    }
  }

  if (prioritySections.length === 0) return "";

  // Apply token budget: include sections in priority order until budget exhausted
  const header = `[clnode smart context for ${agentName}]\n\n`;
  let totalChars = header.length;
  const includedSections: string[] = [];

  for (const section of prioritySections) {
    const sectionCost = section.length + 2; // +2 for "\n\n" separator
    if (totalChars + sectionCost > MAX_CONTEXT_CHARS && includedSections.length > 0) {
      break; // Budget exceeded — stop adding sections
    }
    includedSections.push(section);
    totalChars += sectionCost;
  }

  return `${header}${includedSections.join("\n\n")}`;
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
  agentId: string,
  agentName: string
): Promise<string | null> {
  const incomplete = await getIncompleteTasks(sessionId, agentName);

  if (incomplete.length === 0) return null;

  const lines = incomplete.map((t) => `- [${t.status}] ${t.title}`);
  return `[clnode warning] Agent ${agentName} stopping with ${incomplete.length} incomplete task(s):\n${lines.join("\n")}`;
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
    const db = await getDb();
    const rows = await db.all(`SELECT project_id FROM sessions WHERE id = ?`, sessionId) as Array<{ project_id: string | null }>;
    const projectId = rows[0]?.project_id;
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
    return "[clnode project context]\n\n(No active tasks or agents)";
  }

  return `[clnode project context]\n\n${sections.join("\n\n")}`;
}
