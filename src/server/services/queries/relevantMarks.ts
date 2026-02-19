/**
 * Mark injection queries for buildSmartContext().
 * Returns actual mark content (not just counts) for direct injection.
 */
import { getDb, toVarcharArrayLiteral } from "../../db.js";
import { isEmbeddingEnabled, generateEmbedding, toEmbeddingLiteral } from "../embedding.js";

export interface MarkSummary {
  id: number;
  type: string;
  title: string;
  agent_name: string | null;
}

/**
 * Sibling marks: same session, same parent, different agent.
 * Highest relevance — marks from agents working on the same task batch.
 */
export async function getSiblingMarks(
  sessionId: string, agentName: string, parentAgentId: string | null, limit: number = 5
): Promise<MarkSummary[]> {
  const db = await getDb();

  if (parentAgentId) {
    return db.all(
      `SELECT o.id, o.type, o.title, a.agent_name
       FROM observations o
       JOIN agents a ON o.agent_id = a.id
       WHERE o.session_id = ?
         AND a.parent_agent_id = ?
         AND a.agent_name != ?
         AND o.promoted_to IS NULL
         AND (o.status IS NULL OR o.status = 'active')
       ORDER BY o.created_at DESC
       LIMIT ?`,
      sessionId, parentAgentId, agentName, limit
    ) as Promise<MarkSummary[]>;
  }

  // Fallback: any marks from other agents in same session
  return db.all(
    `SELECT o.id, o.type, o.title, a.agent_name
     FROM observations o
     JOIN agents a ON o.agent_id = a.id
     WHERE o.session_id = ?
       AND a.agent_name != ?
       AND o.promoted_to IS NULL
       AND (o.status IS NULL OR o.status = 'active')
     ORDER BY o.created_at DESC
     LIMIT ?`,
    sessionId, agentName, limit
  ) as Promise<MarkSummary[]>;
}

/**
 * Project marks: same project, different sessions.
 * Cross-session knowledge — marks from past work on the same project.
 */
export async function getProjectMarks(
  projectId: string, sessionId: string, limit: number = 5
): Promise<MarkSummary[]> {
  const db = await getDb();

  return db.all(
    `SELECT o.id, o.type, o.title, a.agent_name
     FROM observations o
     LEFT JOIN agents a ON o.agent_id = a.id
     WHERE o.project_id = ?
       AND o.session_id != ?
       AND o.promoted_to IS NULL
       AND (o.status IS NULL OR o.status = 'active')
     ORDER BY o.created_at DESC
     LIMIT ?`,
    projectId, sessionId, limit
  ) as Promise<MarkSummary[]>;
}

/**
 * File-based marks: marks whose files_read or files_modified overlap
 * with the given file list. Cross-session, not promoted.
 * Most precise matching — surfaces marks relevant to the specific files an agent will touch.
 */
export async function getFileBasedMarks(
  projectId: string, files: string[], sessionId: string, limit: number = 5
): Promise<MarkSummary[]> {
  if (files.length === 0) return [];
  const db = await getDb();

  // DuckDB does not support bind parameters for VARCHAR[] literals used with list_has_any().
  // toVarcharArrayLiteral() builds a safe literal via escapeForVarcharArray() which
  // strips NUL/control chars and escapes backslashes and single-quotes.
  // File paths are system-generated (PostToolUse hook), not raw user input.
  const fileListLiteral = toVarcharArrayLiteral(files);

  return db.all(
    `SELECT o.id, o.type, o.title, a.agent_name
     FROM observations o
     LEFT JOIN agents a ON o.agent_id = a.id
     WHERE o.project_id = ?
       AND o.session_id != ?
       AND o.promoted_to IS NULL
       AND (o.status IS NULL OR o.status = 'active')
       AND (
         list_has_any(o.files_read, ${fileListLiteral}::VARCHAR[])
         OR list_has_any(o.files_modified, ${fileListLiteral}::VARCHAR[])
       )
     ORDER BY o.created_at DESC
     LIMIT ?`,
    projectId, sessionId, limit
  ) as Promise<MarkSummary[]>;
}

/**
 * RAG-based mark retrieval: embed context text → cosine similarity search.
 * Falls back to getProjectMarks() if embedding fails.
 */
export async function getRelevantMarksRAG(
  projectId: string, contextText: string, sessionId: string, limit: number = 5
): Promise<MarkSummary[]> {
  if (!isEmbeddingEnabled()) {
    return getProjectMarks(projectId, sessionId, limit);
  }

  try {
    const embedding = await generateEmbedding(contextText);
    if (!embedding) {
      return getProjectMarks(projectId, sessionId, limit);
    }

    const db = await getDb();
    const arrLiteral = toEmbeddingLiteral(embedding);
    if (!arrLiteral) {
      return getProjectMarks(projectId, sessionId, limit);
    }

    const results = await db.all(
      `SELECT o.id, o.type, o.title, a.agent_name
       FROM observations o
       LEFT JOIN agents a ON o.agent_id = a.id
       WHERE o.project_id = ?
         AND o.session_id != ?
         AND o.promoted_to IS NULL
         AND (o.status IS NULL OR o.status = 'active')
         AND o.embedding IS NOT NULL
       ORDER BY array_cosine_distance(o.embedding, ${arrLiteral}) ASC
       LIMIT ?`,
      projectId, sessionId, limit
    ) as MarkSummary[];

    if (results.length === 0) {
      return getProjectMarks(projectId, sessionId, limit);
    }

    return results;
  } catch (err) {
    console.error("[relevantMarks] RAG search failed, falling back:", err);
    return getProjectMarks(projectId, sessionId, limit);
  }
}
