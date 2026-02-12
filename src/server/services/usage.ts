import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db.js";

interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: DailyActivity[];
}

interface AgentContextSize {
  id: string;
  agent_name: string;
  agent_type: string | null;
  context_length: number;
  session_id: string;
}

interface AgentTokenUsage {
  id: string;
  agent_name: string;
  agent_type: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_id: string;
}

/**
 * Read daily activity from Claude Code's stats-cache.json
 * Returns last N days of activity
 */
export async function getDailyActivity(days: number = 7): Promise<DailyActivity[]> {
  const statsPath = path.join(os.homedir(), ".claude", "stats-cache.json");

  if (!fs.existsSync(statsPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(statsPath, "utf-8");
    const stats: StatsCache = JSON.parse(raw);

    // Sort by date descending and take last N days
    const sorted = [...stats.dailyActivity]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);

    return sorted;
  } catch {
    return [];
  }
}

/**
 * Get weekly totals from stats-cache.json
 */
export async function getWeeklyTotals(): Promise<{ messages: number; sessions: number; toolCalls: number }> {
  const daily = await getDailyActivity(7);

  return {
    messages: daily.reduce((sum, d) => sum + d.messageCount, 0),
    sessions: daily.reduce((sum, d) => sum + d.sessionCount, 0),
    toolCalls: daily.reduce((sum, d) => sum + d.toolCallCount, 0),
  };
}

/**
 * Get context summary sizes for all agents
 * Returns agents with their context_summary length
 */
export async function getAgentContextSizes(projectId?: string): Promise<AgentContextSize[]> {
  const db = await getDb();

  let query = `
    SELECT
      agents.id,
      agents.agent_name,
      agents.agent_type,
      agents.session_id,
      COALESCE(LENGTH(agents.context_summary), 0) as context_length
    FROM agents
  `;

  const params: string[] = [];

  if (projectId) {
    query += `
      JOIN sessions ON agents.session_id = sessions.id
      WHERE sessions.project_id = ?
    `;
    params.push(projectId);
  }

  query += ` ORDER BY context_length DESC LIMIT 50`;

  const rows = await db.all(query, ...params);
  // Convert BigInt context_length to Number
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    agent_name: row.agent_name as string,
    agent_type: row.agent_type as string | null,
    session_id: row.session_id as string,
    context_length: Number(row.context_length ?? 0),
  }));
}

/**
 * Get token usage for all agents
 * Returns agents with their input/output token counts
 */
export async function getAgentTokenUsage(projectId?: string): Promise<AgentTokenUsage[]> {
  const db = await getDb();

  let query = `
    SELECT
      agents.id,
      agents.agent_name,
      agents.agent_type,
      agents.session_id,
      COALESCE(agents.input_tokens, 0) as input_tokens,
      COALESCE(agents.output_tokens, 0) as output_tokens
    FROM agents
    WHERE agents.input_tokens > 0 OR agents.output_tokens > 0
  `;

  const params: string[] = [];

  if (projectId) {
    query = `
      SELECT
        agents.id,
        agents.agent_name,
        agents.agent_type,
        agents.session_id,
        COALESCE(agents.input_tokens, 0) as input_tokens,
        COALESCE(agents.output_tokens, 0) as output_tokens
      FROM agents
      JOIN sessions ON agents.session_id = sessions.id
      WHERE sessions.project_id = ?
        AND (agents.input_tokens > 0 OR agents.output_tokens > 0)
    `;
    params.push(projectId);
  }

  query += ` ORDER BY (COALESCE(agents.input_tokens, 0) + COALESCE(agents.output_tokens, 0)) DESC LIMIT 50`;

  const rows = await db.all(query, ...params);
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    agent_name: row.agent_name as string,
    agent_type: row.agent_type as string | null,
    session_id: row.session_id as string,
    input_tokens: Number(row.input_tokens ?? 0),
    output_tokens: Number(row.output_tokens ?? 0),
    total_tokens: Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0),
  }));
}

/**
 * Get total token usage across all agents
 */
export async function getTotalTokenUsage(projectId?: string): Promise<{ input: number; output: number; total: number }> {
  const db = await getDb();

  let query = `
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output
    FROM agents
  `;

  const params: string[] = [];

  if (projectId) {
    query = `
      SELECT
        COALESCE(SUM(agents.input_tokens), 0) as total_input,
        COALESCE(SUM(agents.output_tokens), 0) as total_output
      FROM agents
      JOIN sessions ON agents.session_id = sessions.id
      WHERE sessions.project_id = ?
    `;
    params.push(projectId);
  }

  const result = await db.all(query, ...params);
  const totalInput = Number(result[0]?.total_input ?? 0);
  const totalOutput = Number(result[0]?.total_output ?? 0);
  return { input: totalInput, output: totalOutput, total: totalInput + totalOutput };
}

/**
 * Get total context size across all agents
 */
export async function getTotalContextSize(projectId?: string): Promise<number> {
  const db = await getDb();

  let query = `
    SELECT COALESCE(SUM(LENGTH(context_summary)), 0) as total
    FROM agents
  `;

  const params: string[] = [];

  if (projectId) {
    query = `
      SELECT COALESCE(SUM(LENGTH(agents.context_summary)), 0) as total
      FROM agents
      JOIN sessions ON agents.session_id = sessions.id
      WHERE sessions.project_id = ?
    `;
    params.push(projectId);
  }

  const result = await db.all(query, ...params);
  const total = result[0]?.total;
  return typeof total === "bigint" ? Number(total) : (total ?? 0);
}
