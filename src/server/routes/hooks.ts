import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { startSession, endSession, reactivateSession } from "../services/session.js";
import { startAgent, stopAgent, getAgent } from "../services/agent.js";
import { addContextEntry } from "../services/context.js";
import { recordFileChange } from "../services/filechange.js";
import { logActivity } from "../services/activity.js";
import { findProjectByPath, registerProject } from "../services/project.js";
import { buildSmartContext, checkIncompleteTasks, buildPromptContext } from "../services/intelligence.js";
import { updateStatusline } from "../services/statusline.js";
import { findPendingTaskForAgent, getInProgressTasksForAgent, updateTask } from "../services/task.js";
import { addComment } from "../services/comment.js";
import { broadcast } from "./ws.js";
import { getPromotionCandidates } from "../services/queries/promotionCandidates.js";
import { getSession } from "../services/session.js";

interface HookBody {
  session_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_type?: string;
  parent_agent_id?: string;
  cwd?: string;
  project_path?: string;
  transcript_path?: string;
  agent_transcript_path?: string;
  context_summary?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  result?: unknown;
  prompt?: string;
  message?: string;
  reason?: string;
  entry_type?: string;
  content?: string;
  tags?: string[] | null;
  task_title?: string;
  title?: string;
  project_id?: string;
  project_name?: string;
  directory?: string;
  git_branch?: string;
  model?: string;
  cli_version?: string;
  context_pct?: number;
  session_pct?: number;
  session_reset?: string;
  rolling_5h_pct?: number;
  rolling_5h_cost?: string;
  weekly_pct?: number;
  weekly_cost?: string;
}

interface TranscriptUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

interface TranscriptExtraction {
  summary: string | null;
  usage: TranscriptUsage;
}

/** Extract summary and token usage from a Claude Code agent transcript JSONL */
async function extractFromTranscript(transcriptPath: string): Promise<TranscriptExtraction> {
  const result: TranscriptExtraction = {
    summary: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };

  // Brief delay to let Claude Code finish writing the transcript
  await new Promise(r => setTimeout(r, 500));

  try {
    const content = await readFile(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i]);

      // Extract summary from last assistant text
      if (!result.summary && entry.type === "assistant" && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { text: string }) => c.text);
        if (textParts.length > 0) {
          result.summary = textParts.join("\n");
        }
      }

      // Sum up token usage from all assistant messages
      if (entry.type === "assistant" && entry.message?.usage) {
        const usage = entry.message.usage;
        result.usage.input_tokens += Number(usage.input_tokens ?? 0);
        result.usage.output_tokens += Number(usage.output_tokens ?? 0);
        result.usage.cache_read_input_tokens += Number(usage.cache_read_input_tokens ?? 0);
        result.usage.cache_creation_input_tokens += Number(usage.cache_creation_input_tokens ?? 0);
      }
    }
  } catch {
    // Ignore errors
  }

  return result;
}


const hooks = new Hono();

hooks.post("/:event", async (c) => {
  const event = c.req.param("event");
  const body: HookBody = await c.req.json().catch(() => ({}));
  const sessionId = body.session_id ?? "unknown";

  try {
    switch (event) {
      case "SessionStart": {
        const cwd = body.cwd ?? body.project_path ?? null;
        let projectId: string | null = null;
        if (cwd) {
          const project = await findProjectByPath(cwd);
          if (project) projectId = (project as { id: string }).id;
        }
        await startSession(sessionId, projectId);
        await logActivity(sessionId, null, "SessionStart", { cwd, project_id: projectId });
        broadcast("SessionStart", { session_id: sessionId, project_id: projectId });
        return c.json({});
      }

      case "SessionEnd": {
        await endSession(sessionId);
        await logActivity(sessionId, null, "SessionEnd", {});
        broadcast("SessionEnd", { session_id: sessionId });

        // Auto-check promotion candidates after session ends
        try {
          const session = await getSession(sessionId);
          const projectId = (session as { project_id?: string } | null)?.project_id;
          if (projectId) {
            const candidates = await getPromotionCandidates(projectId, 3, 2);
            if (candidates.length > 0) {
              broadcast("promotion_candidates_available", {
                project_id: projectId,
                count: candidates.length,
                top: candidates.slice(0, 3).map((c: { concept: string }) => c.concept),
              });
            }
          }
        } catch { /* non-blocking */ }

        return c.json({});
      }

      case "SubagentStart": {
        const agentId = body.agent_id ?? crypto.randomUUID();
        const agentType = body.agent_type ?? null;
        const agentName = agentType ?? "unknown";
        const parentAgentId = body.parent_agent_id ?? null;

        // Reactivate session if auto-ended between sequential agents
        await reactivateSession(sessionId);
        await startAgent(agentId, sessionId, agentName, agentType, parentAgentId);
        await logActivity(sessionId, agentId, "SubagentStart", { agent_name: agentName, agent_type: agentType });
        broadcast("SubagentStart", { session_id: sessionId, agent_id: agentId, agent_name: agentName });

        // Auto-assign pending task to starting agent
        try {
          const pendingTask = await findPendingTaskForAgent(sessionId, agentName, agentType);
          if (pendingTask) {
            await updateTask(pendingTask.id, { status: "in_progress", assigned_to: agentName });
            await addComment(pendingTask.id, "system", "status_change",
              `Auto-assigned to agent ${agentName} and moved to in_progress`);
          }
        } catch (err) {
          console.error("[hooks/SubagentStart] task auto-assign failed:", err);
        }

        // Phase 3: Smart context injection (4.5s timeout — hook has 5s budget)
        let additionalContext = "";
        try {
          let timeoutId: ReturnType<typeof setTimeout>;
          const timeout = new Promise<string>(resolve => {
            timeoutId = setTimeout(() => resolve(""), 4500);
          });
          additionalContext = await Promise.race([
            buildSmartContext(sessionId, agentName, agentType, parentAgentId).then(result => {
              clearTimeout(timeoutId);
              return result;
            }),
            timeout,
          ]);
        } catch (err) {
          console.error("[hooks/SubagentStart] buildSmartContext failed:", err);
        }

        return c.json({
          hookSpecificOutput: {
            hookEventName: "SubagentStart",
            ...(additionalContext ? { additionalContext } : {}),
          },
        });
      }

      case "SubagentStop": {
        const agentId = body.agent_id ?? null;
        const agentTranscriptPath = body.agent_transcript_path ?? null;
        // Claude Code doesn't send context_summary — extract from transcript
        let contextSummary: string | null = body.context_summary ?? (typeof body.result === "string" ? body.result : null);
        let inputTokens = 0;
        let outputTokens = 0;

        if (agentTranscriptPath) {
          const extraction = await extractFromTranscript(agentTranscriptPath);
          if (!contextSummary && extraction.summary) {
            contextSummary = extraction.summary;
          }
          inputTokens = extraction.usage.input_tokens + extraction.usage.cache_read_input_tokens;
          outputTokens = extraction.usage.output_tokens;
        }


        if (agentId) {
          const agent = await getAgent(agentId);
          const agentName = agent?.agent_name ?? body.agent_type ?? "unknown";

          await stopAgent(agentId, contextSummary, inputTokens, outputTokens);
          if (contextSummary) {
            const entryType = agent?.agent_type === "Plan" ? "plan" : "agent_summary";
            await addContextEntry(sessionId, agentId, entryType, contextSummary, ["auto", agentName]);
          }
          // transcript_path is no longer stored as context — summary is extracted directly

          // Auto-complete in_progress tasks for stopping agent
          try {
            const inProgressTasks = await getInProgressTasksForAgent(sessionId, agentName);
            if (contextSummary && inProgressTasks.length > 0) {
              for (const task of inProgressTasks) {
                await updateTask(task.id, { status: "completed" });
                await addComment(task.id, agentName, "result", contextSummary.slice(0, 500));
                await addComment(task.id, "system", "status_change",
                  `Auto-completed by agent ${agentName} on stop`);
              }
            }
          } catch (err) {
            console.error("[hooks/SubagentStop] task auto-complete failed:", err);
          }

          // Phase 3: Todo Enforcer — check incomplete tasks
          const warning = await checkIncompleteTasks(sessionId, agentId, agentName);
          if (warning) {
            await addContextEntry(sessionId, agentId, "todo_warning", warning, ["enforcer", agentName]);
          }

          await logActivity(sessionId, agentId, "SubagentStop", {
            context_summary: contextSummary,
            incomplete_tasks: warning ? true : false,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          });
          broadcast("SubagentStop", {
            session_id: sessionId,
            agent_id: agentId,
            incomplete_tasks: !!warning,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          });

          // Auto-end session if no active agents remain
          try {
            const { getDb } = await import("../db.js");
            const db = await getDb();
            const remaining = await db.all(
              `SELECT COUNT(*) as count FROM agents WHERE session_id = ? AND status = 'active'`,
              sessionId
            );
            if (Number(remaining[0]?.count ?? 0) === 0) {
              await endSession(sessionId);
              broadcast("SessionEnd", { session_id: sessionId });
              console.log(`[hooks/SubagentStop] Auto-ended session ${sessionId} (no active agents)`);
            }
          } catch (err) {
            console.error("[hooks/SubagentStop] session auto-end check failed:", err);
          }
        }
        return c.json({});
      }

      case "PostToolUse": {
        const agentId = body.agent_id ?? null;
        const toolName = body.tool_name ?? body.tool ?? "";
        const toolInput = body.tool_input ?? {};

        if (toolName === "Edit" || toolName === "Write") {
          const filePath = String(toolInput.file_path ?? toolInput.path ?? "unknown");
          const changeType = toolName === "Write" ? "create" : "edit";
          await recordFileChange(sessionId, agentId, filePath, changeType);
        }

        await logActivity(sessionId, agentId, "PostToolUse", { tool_name: toolName });
        broadcast("PostToolUse", { session_id: sessionId, tool_name: toolName });
        return c.json({});
      }

      case "Stop": {
        await logActivity(sessionId, null, "Stop", { reason: body.reason });
        broadcast("Stop", { session_id: sessionId });
        return c.json({});
      }

      case "UserPromptSubmit": {
        const prompt = body.prompt ?? body.message ?? "";
        await logActivity(sessionId, null, "UserPromptSubmit", { prompt: prompt.slice(0, 500) });
        broadcast("UserPromptSubmit", { session_id: sessionId });

        // Phase 3: Auto-attach project context to user prompts
        const promptContext = await buildPromptContext(sessionId);

        return c.json({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            ...(promptContext ? { additionalContext: promptContext } : {}),
          },
        });
      }

      case "PostContext": {
        const agentId = body.agent_id ?? null;
        const entryType = body.entry_type ?? "note";
        const content = body.content ?? "";
        const tags = body.tags ?? null;
        if (content) {
          await addContextEntry(sessionId, agentId, entryType, content, tags);
          await logActivity(sessionId, agentId, "PostContext", { entry_type: entryType });
          broadcast("PostContext", { session_id: sessionId, entry_type: entryType });
        }
        return c.json({ ok: true });
      }

      case "TeammateIdle": {
        const agentId = body.agent_id ?? null;
        const agentName = body.agent_name ?? body.agent_type ?? "unknown";
        const agentType = body.agent_type ?? null;

        if (agentId) {
          // Update agent status to active (re-activate on idle) using single UPDATE
          try {
            const { getDb } = await import("../db.js");
            const db = await getDb();
            // Check if agent exists first, then UPDATE or INSERT
            const existing = await db.all(
              `SELECT id FROM agents WHERE id=? AND session_id=?`,
              agentId, sessionId
            );
            if (existing.length > 0) {
              await db.run(
                `UPDATE agents SET status='active' WHERE id=? AND session_id=?`,
                agentId, sessionId
              );
            } else {
              // Agent not yet in DB (teams mode — SubagentStart was skipped).
              // Insert as 'active'; agents table has no 'idle' status, and
              // TeammateIdle means the agent is alive and waiting for input.
              await startAgent(agentId, sessionId, agentName, agentType, null);
            }
          } catch (e) {
            console.debug('[hooks] TeammateIdle error:', e);
          }
        }

        await logActivity(sessionId, agentId, "TeammateIdle", { agent_name: agentName });
        broadcast("TeammateIdle", { session_id: sessionId, agent_id: agentId, agent_name: agentName });
        return c.json({});
      }

      case "TaskCompleted": {
        const taskTitle = body.task_title ?? body.title ?? null;
        const taskResult = body.result ?? null;
        const agentId = body.agent_id ?? null;
        const agentName = body.agent_name ?? body.agent_type ?? "unknown";

        // Sync with mimir tasks table if task title matches
        if (taskTitle) {
          try {
            // Find matching in-progress task by title/assigned agent
            const inProgressTasks = await getInProgressTasksForAgent(sessionId, agentName);
            for (const task of inProgressTasks) {
              if (task.title?.toLowerCase().includes(taskTitle.toLowerCase()) ||
                  taskTitle.toLowerCase().includes(task.title?.toLowerCase() ?? "")) {
                await updateTask(task.id, { status: "completed" });
                if (taskResult) {
                  await addComment(task.id, agentName, "result", String(taskResult).slice(0, 500));
                }
                await addComment(task.id, "system", "status_change",
                  `Completed via TaskCompleted event from ${agentName}`);
                break;
              }
            }
          } catch (err) {
            console.error("[hooks/TaskCompleted] task sync failed:", err);
          }
        }

        await logActivity(sessionId, agentId, "TaskCompleted", {
          agent_name: agentName,
          task_title: taskTitle,
          result: taskResult ? String(taskResult).slice(0, 500) : null,
        });
        broadcast("TaskCompleted", { session_id: sessionId, agent_id: agentId, task_title: taskTitle });
        return c.json({});
      }

      case "StatuslineUpdate": {
        const projectId = body.project_id ?? "unknown";
        updateStatusline(projectId, {
          directory: body.directory ?? "",
          git_branch: body.git_branch ?? "",
          model: body.model ?? "",
          cli_version: body.cli_version ?? "",
          agent_name: body.agent_name ?? "",
          context_pct: Number(body.context_pct ?? 0),
          session_pct: Number(body.session_pct ?? 0),
          session_reset: body.session_reset ?? "",
          rolling_5h_pct: Number(body.rolling_5h_pct ?? 0),
          rolling_5h_cost: body.rolling_5h_cost ?? "",
          weekly_pct: Number(body.weekly_pct ?? 0),
          weekly_cost: body.weekly_cost ?? "",
        });
        broadcast("StatuslineUpdate", { project_id: projectId });
        return c.json({});
      }

      case "RegisterProject": {
        const pid = body.project_id ?? crypto.randomUUID();
        const pname = body.project_name ?? "unknown";
        const ppath = body.project_path ?? "";
        await registerProject(pid, pname, ppath);
        return c.json({ ok: true, project_id: pid });
      }

      default: {
        // Strip sensitive local file paths before broadcasting to WS clients
        const { transcript_path: _tp, tool_input: _ti, tool_response: _tr, result: _r, ...safeBody } = body;
        await logActivity(sessionId, null, event, safeBody);
        broadcast(event, safeBody);
        return c.json({});
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[hooks/${event}] Error:`, msg);
    // SubagentStart must always return hookSpecificOutput structure
    if (event === "SubagentStart") {
      return c.json({ hookSpecificOutput: { hookEventName: "SubagentStart" } });
    }
    if (event === "UserPromptSubmit") {
      return c.json({ hookSpecificOutput: { hookEventName: "UserPromptSubmit" } });
    }
    return c.json({});
  }
});

export default hooks;
