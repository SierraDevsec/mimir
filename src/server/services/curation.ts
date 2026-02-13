import { getDb } from "../db.js";
import { getPromotionCandidates } from "./queries/promotionCandidates.js";
import fs from "node:fs";
import path from "node:path";

interface CurationStats {
  last_curated: string | null;
  sessions_since: number;
  marks_since: number;
  promotion_candidates: number;
  agent_memories: Array<{ name: string; size_bytes: number; last_modified: string }>;
}

export async function getCurationStats(projectId: string): Promise<CurationStats> {
  const db = await getDb();

  // Last curation timestamp from activity_log
  const lastCuration = await db.all(
    `SELECT created_at FROM activity_log WHERE event_type = 'curation_completed' ORDER BY created_at DESC LIMIT 1`
  );
  const lastCurated = lastCuration.length > 0 ? String(lastCuration[0].created_at) : null;

  // Sessions since last curation
  let sessionsSince = 0;
  if (lastCurated) {
    const rows = await db.all(
      `SELECT COUNT(*) as count FROM sessions WHERE project_id = ? AND started_at > ?::TIMESTAMP`,
      projectId, lastCurated
    );
    sessionsSince = Number(rows[0]?.count ?? 0);
  } else {
    const rows = await db.all(
      `SELECT COUNT(*) as count FROM sessions WHERE project_id = ?`,
      projectId
    );
    sessionsSince = Number(rows[0]?.count ?? 0);
  }

  // Marks since last curation
  let marksSince = 0;
  if (lastCurated) {
    const rows = await db.all(
      `SELECT COUNT(*) as count FROM observations WHERE project_id = ? AND created_at > ?::TIMESTAMP`,
      projectId, lastCurated
    );
    marksSince = Number(rows[0]?.count ?? 0);
  } else {
    const rows = await db.all(
      `SELECT COUNT(*) as count FROM observations WHERE project_id = ?`,
      projectId
    );
    marksSince = Number(rows[0]?.count ?? 0);
  }

  // Promotion candidates
  const candidates = await getPromotionCandidates(projectId, 3, 2);

  // Agent memories from filesystem
  const memoryDir = path.resolve(process.cwd(), ".claude/agent-memory");
  const agentMemories: CurationStats["agent_memories"] = [];
  if (fs.existsSync(memoryDir)) {
    for (const dir of fs.readdirSync(memoryDir)) {
      const memFile = path.join(memoryDir, dir, "MEMORY.md");
      if (fs.existsSync(memFile)) {
        const stat = fs.statSync(memFile);
        agentMemories.push({
          name: dir,
          size_bytes: stat.size,
          last_modified: stat.mtime.toISOString(),
        });
      }
    }
  }

  return {
    last_curated: lastCurated,
    sessions_since: sessionsSince,
    marks_since: marksSince,
    promotion_candidates: candidates.length,
    agent_memories: agentMemories,
  };
}
