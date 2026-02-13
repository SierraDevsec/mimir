/**
 * DuckDB CRUD for observations (agent self-marks).
 * Agents mark via MCP tool → stored here → surfaced to future agents.
 *
 * Persistence: After each write, CHECKPOINT flushes WAL → DB immediately.
 */
import { getDb, checkpoint } from "../db.js";
import { isEmbeddingEnabled, generateEmbedding, updateObservationEmbedding, buildEmbeddingText } from "./embedding.js";

/** Escape a string for DuckDB VARCHAR[] literal: handle both single-quotes and backslashes */
function escapeForVarcharArray(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/** Build a DuckDB VARCHAR[] literal from a string array, or null if empty */
export function toVarcharArrayLiteral(arr: string[]): string | null {
  if (arr.length === 0) return null;
  return `[${arr.map(s => `'${escapeForVarcharArray(s)}'`).join(",")}]`;
}

export interface MarkInput {
  type: string;
  title: string;
  subtitle?: string;
  narrative?: string;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
}

export interface ObservationRow {
  id: number;
  session_id: string;
  agent_id: string | null;
  project_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  narrative: string | null;
  facts: string[] | null;
  concepts: string[] | null;
  files_read: string[] | null;
  files_modified: string[] | null;
  discovery_tokens: number;
  source: string;
  status: string;
  created_at: string;
}

export async function saveObservation(
  obs: MarkInput, sessionId: string, agentId: string | null,
  projectId: string, discoveryTokens: number = 0, source: string = "self-mark"
): Promise<number> {
  const db = await getDb();
  const result = await db.all(
    `INSERT INTO observations (session_id, agent_id, project_id, type, title, subtitle, narrative,
      facts, concepts, files_read, files_modified, discovery_tokens, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    sessionId, agentId, projectId,
    obs.type, obs.title, obs.subtitle ?? null, obs.narrative ?? null,
    toVarcharArrayLiteral(obs.facts),
    toVarcharArrayLiteral(obs.concepts),
    toVarcharArrayLiteral(obs.files_read),
    toVarcharArrayLiteral(obs.files_modified),
    discoveryTokens, source
  );
  const id = Number((result[0] as { id: number }).id);

  // Flush WAL → DB immediately (observations are critical memory)
  await checkpoint();

  // Generate embedding async (don't block save)
  if (isEmbeddingEnabled()) {
    const text = buildEmbeddingText(obs.title, obs.narrative, obs.concepts);
    generateEmbedding(text).then(emb => {
      if (emb) updateObservationEmbedding(id, emb).catch(() => {});
    }).catch(() => {});
  }

  return id;
}

export async function searchObservations(
  projectId: string, query: string, type?: string, agentName?: string,
  limit: number = 20, days: number = 90
): Promise<ObservationRow[]> {
  // Try RAG search first if embedding is enabled and we have a query
  if (query && isEmbeddingEnabled()) {
    try {
      const results = await searchByEmbedding(projectId, query, type, agentName, limit, days);
      if (results.length > 0) return results;
    } catch (err) {
      console.error("[search] RAG search failed, falling back to ILIKE:", err);
    }
  }

  // Fallback: ILIKE keyword search
  return searchByIlike(projectId, query, type, agentName, limit, days);
}

async function searchByEmbedding(
  projectId: string, query: string, type?: string, agentName?: string,
  limit: number = 20, days: number = 90
): Promise<ObservationRow[]> {
  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  const validDays = !isNaN(days) && days > 0 ? days : 90;
  const db = await getDb();

  const conditions: string[] = [
    "o.project_id = ?",
    "o.embedding IS NOT NULL",
    "o.promoted_to IS NULL",
    `o.created_at >= now() - INTERVAL '${validDays} days'`,
  ];
  const params: unknown[] = [projectId];

  if (type) {
    conditions.push("o.type = ?");
    params.push(type);
  }

  if (agentName) {
    conditions.push("o.agent_id IN (SELECT id FROM agents WHERE agent_name = ?)");
    params.push(agentName);
  }

  params.push(limit);

  if (!embedding.every(v => typeof v === "number" && isFinite(v))) return [];
  const arrLiteral = `[${embedding.join(",")}]::FLOAT[1024]`;

  return db.all(
    `SELECT o.id, o.session_id, o.agent_id, o.project_id, o.type, o.title,
            o.subtitle, o.narrative, o.facts, o.concepts, o.files_read,
            o.files_modified, o.discovery_tokens, o.source, o.status, o.created_at,
            array_cosine_distance(o.embedding, ${arrLiteral}) AS distance
     FROM observations o
     WHERE ${conditions.join(" AND ")}
     ORDER BY distance ASC
     LIMIT ?`,
    ...params
  ) as Promise<ObservationRow[]>;
}

async function searchByIlike(
  projectId: string, query: string, type?: string, agentName?: string,
  limit: number = 20, days: number = 90
): Promise<ObservationRow[]> {
  const validDays = !isNaN(days) && days > 0 ? days : 90;

  const db = await getDb();
  const conditions: string[] = ["o.project_id = ?", "o.promoted_to IS NULL"];
  const params: unknown[] = [projectId];

  conditions.push(`o.created_at >= now() - INTERVAL '${validDays} days'`);

  if (type) {
    conditions.push("o.type = ?");
    params.push(type);
  }

  if (agentName) {
    conditions.push("o.agent_id IN (SELECT id FROM agents WHERE agent_name = ?)");
    params.push(agentName);
  }

  if (query) {
    conditions.push("(o.title ILIKE ? OR o.subtitle ILIKE ? OR o.narrative ILIKE ? OR array_to_string(o.concepts, ' ') ILIKE ?)");
    const likeQuery = `%${query}%`;
    params.push(likeQuery, likeQuery, likeQuery, likeQuery);
  }

  params.push(limit);

  return db.all(
    `SELECT o.* FROM observations o WHERE ${conditions.join(" AND ")} ORDER BY o.created_at DESC LIMIT ?`,
    ...params
  ) as Promise<ObservationRow[]>;
}

export async function getObservationDetails(ids: number[]): Promise<ObservationRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.all(
    `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at ASC`,
    ...ids
  ) as Promise<ObservationRow[]>;
}

export async function getObservationTimeline(
  anchorId: number, depthBefore: number = 3, depthAfter: number = 3
): Promise<ObservationRow[]> {
  const db = await getDb();
  // Get the anchor observation's agent and session
  const anchor = await db.all(`SELECT session_id, agent_id, created_at FROM observations WHERE id = ?`, anchorId);
  if (anchor.length === 0) return [];
  const { session_id, created_at } = anchor[0] as { session_id: string; agent_id: string; created_at: string };

  return db.all(
    `(SELECT * FROM observations WHERE session_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT ?)
     UNION ALL
     (SELECT * FROM observations WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?)
     ORDER BY created_at ASC`,
    session_id, created_at, depthBefore + 1,
    session_id, created_at, depthAfter
  ) as Promise<ObservationRow[]>;
}

export async function markAsPromoted(
  ids: number[], promotedTo: string
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  await db.run(
    `UPDATE observations SET promoted_to = ? WHERE id IN (${placeholders})`,
    promotedTo, ...ids
  );
}

export async function resolveObservation(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.all(
    `UPDATE observations SET status = 'resolved' WHERE id = ? AND status = 'active' RETURNING id`,
    id
  );
  if (result.length > 0) {
    await checkpoint();
  }
  return result.length > 0;
}

export async function deleteObservation(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.all(`DELETE FROM observations WHERE id = ? RETURNING id`, id);
  return result.length > 0;
}

export async function updateObservation(
  id: number, updates: { text?: string; type?: string; concepts?: string[] }
): Promise<boolean> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.text !== undefined) {
    sets.push("title = ?", "narrative = ?");
    params.push(updates.text.slice(0, 100), updates.text);
  }
  if (updates.type !== undefined) {
    sets.push("type = ?");
    params.push(updates.type);
  }
  if (updates.concepts !== undefined) {
    sets.push("concepts = ?");
    params.push(toVarcharArrayLiteral(updates.concepts));
  }
  if (sets.length === 0) return false;
  params.push(id);
  const result = await db.all(
    `UPDATE observations SET ${sets.join(", ")} WHERE id = ? RETURNING id`,
    ...params
  );
  return result.length > 0;
}

export async function getObservationsByProject(
  projectId: string, limit: number = 50
): Promise<ObservationRow[]> {
  const db = await getDb();
  return db.all(
    `SELECT * FROM observations WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
    projectId, limit
  ) as Promise<ObservationRow[]>;
}

