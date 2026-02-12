import { execFileSync } from "node:child_process";
import { getAgentPane, getRegisteredAgents } from "./registry.js";

// Throttle: max 1 notification per agent per 3 seconds
const lastNotified = new Map<string, number>();
const THROTTLE_MS = 3_000;

/**
 * Send a tmux notification to wake up an idle agent session.
 * Uses tmux send-keys to inject a prompt into the target pane.
 * Throttled to prevent spam when multiple messages arrive quickly.
 */
export async function notifyAgent(
  agentName: string,
  projectId: string,
  fromName: string
): Promise<{ notified: boolean; reason?: string }> {
  // Throttle check
  const key = `${projectId}:${agentName}`;
  const now = Date.now();
  const last = lastNotified.get(key) ?? 0;
  if (now - last < THROTTLE_MS) {
    return { notified: false, reason: "throttled" };
  }

  // Look up tmux pane
  const pane = await getAgentPane(agentName, projectId);
  if (!pane) {
    return { notified: false, reason: "no_tmux_pane" };
  }

  // Send keys to tmux pane
  // Step 1: send text with -l (literal) to avoid special char interpretation
  // Step 2: send Enter separately to submit
  try {
    let prompt = `New message from ${fromName}. Use read_messages tool to check and respond.`;
    if (agentName === "orchestrator") {
      const allAgents = await getRegisteredAgents(projectId) as Array<{ agent_name: string }>;
      const teamNames = allAgents
        .map(a => a.agent_name)
        .filter(n => n !== "orchestrator");
      const teamStr = teamNames.length > 0 ? teamNames.join(", ") : "none";
      prompt += ` Delegate to your team agents (${teamStr}) via send_message. Do NOT do the work yourself.`;
    }
    execFileSync("tmux", ["send-keys", "-t", pane, "-l", prompt], {
      timeout: 3000,
    });
    execFileSync("tmux", ["send-keys", "-t", pane, "Enter"], {
      timeout: 3000,
    });
    lastNotified.set(key, now);
    return { notified: true };
  } catch {
    return { notified: false, reason: "tmux_failed" };
  }
}
