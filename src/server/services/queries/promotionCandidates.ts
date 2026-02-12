/**
 * Promotion candidate detection for warm→cold mark promotion.
 * Finds concepts that appear repeatedly across sessions — candidates for rules/ promotion.
 */
import { getDb } from "../../db.js";

export interface PromotionCandidate {
  concept: string;
  count: number;
  session_count: number;
  mark_ids: number[];
  sample_titles: string[];
  types: string[];
}

/**
 * Find concepts that appear in multiple marks across multiple sessions.
 * These are candidates for promotion to .claude/rules/ files.
 */
export async function getPromotionCandidates(
  projectId: string, minCount: number = 3, minSessions: number = 2
): Promise<PromotionCandidate[]> {
  const db = await getDb();

  const rows = await db.all(
    `WITH exploded AS (
       SELECT id, session_id, title, type, created_at,
              UNNEST(concepts) as concept
       FROM observations
       WHERE project_id = ?
         AND promoted_to IS NULL
         AND concepts IS NOT NULL
         AND len(concepts) > 0
     )
     SELECT concept,
            COUNT(*) as count,
            COUNT(DISTINCT session_id) as session_count,
            LIST(id ORDER BY created_at DESC) as mark_ids,
            LIST(DISTINCT title) as sample_titles,
            LIST(DISTINCT type) as types
     FROM exploded
     GROUP BY concept
     HAVING COUNT(*) >= ?
       AND COUNT(DISTINCT session_id) >= ?
     ORDER BY count DESC`,
    projectId, minCount, minSessions
  ) as Array<{
    concept: string;
    count: number | bigint;
    session_count: number | bigint;
    mark_ids: number[];
    sample_titles: string[];
    types: string[];
  }>;

  return rows.map(r => ({
    concept: r.concept,
    count: Number(r.count),
    session_count: Number(r.session_count),
    mark_ids: r.mark_ids,
    sample_titles: r.sample_titles,
    types: r.types,
  }));
}
