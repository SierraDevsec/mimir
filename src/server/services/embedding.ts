/**
 * Cloudflare Workers AI bge-m3 embedding service.
 * Generates 1024-dim embeddings for observation RAG search.
 * Graceful degradation: returns null if CF credentials missing or API fails.
 */
import { getDb, checkpoint } from "../db.js";

const CF_ACCOUNT_ID = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = () => process.env.CLOUDFLARE_API_TOKEN;
const CF_MODEL = "@cf/baai/bge-m3";
const EMBEDDING_DIM = 1024;
const BATCH_SIZE = 50;

export function isEmbeddingEnabled(): boolean {
  return !!(CF_ACCOUNT_ID() && CF_API_TOKEN());
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const results = await generateEmbeddings([text]);
  return results[0];
}

export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (!isEmbeddingEnabled() || texts.length === 0) return texts.map(() => null);

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID()}/ai/run/${CF_MODEL}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[embedding] CF API error: ${res.status} ${res.statusText}`);
      return texts.map(() => null);
    }

    const json = (await res.json()) as {
      success: boolean;
      result?: { data: number[][] };
    };

    if (!json.success || !json.result?.data) {
      console.error("[embedding] CF API returned no data:", JSON.stringify(json).slice(0, 200));
      return texts.map(() => null);
    }

    return json.result.data.map((emb) => {
      if (!Array.isArray(emb)) return null;
      if (emb.length !== EMBEDDING_DIM) return null;
      if (!emb.every(v => Number.isFinite(v))) return null;
      return emb;
    });
  } catch (err) {
    console.error("[embedding] CF API request failed:", err);
    return texts.map(() => null);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Build embeddable text from observation fields */
export function buildEmbeddingText(title: string, narrative?: string | null, concepts?: string[] | null): string {
  const parts = [title];
  if (narrative) parts.push(narrative);
  if (concepts && concepts.length > 0) parts.push(concepts.join(" "));
  return parts.join(" ").slice(0, 2000); // bge-m3 handles up to 8192 tokens, but keep it reasonable
}

/**
 * Convert a number[] embedding to a DuckDB FLOAT array literal.
 * Returns null if any value is non-finite (invalid embedding).
 * Centralizes the validation + literal generation used in multiple places.
 */
export function toEmbeddingLiteral(embedding: number[]): string | null {
  if (!embedding.every(v => typeof v === "number" && Number.isFinite(v))) return null;
  return `[${embedding.join(",")}]::FLOAT[${EMBEDDING_DIM}]`;
}

export async function updateObservationEmbedding(id: number, embedding: number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIM || !embedding.every(v => Number.isFinite(v))) {
    throw new Error(`Invalid embedding: expected ${EMBEDDING_DIM} finite numbers, got ${embedding.length}`);
  }
  const db = await getDb();
  // Safe: already validated above
  const arrLiteral = toEmbeddingLiteral(embedding)!;
  await db.run(
    `UPDATE observations SET embedding = ${arrLiteral} WHERE id = ?`,
    id
  );
}

/**
 * Backfill embeddings for observations missing them.
 * Called on daemon startup. Processes in batches.
 */
export async function backfillEmbeddings(): Promise<number> {
  if (!isEmbeddingEnabled()) return 0;

  const db = await getDb();

  // Check if embedding column exists
  try {
    await db.all(`SELECT embedding FROM observations LIMIT 0`);
  } catch {
    return 0; // Column doesn't exist yet
  }

  const rows = await db.all(
    `SELECT id, title, narrative, concepts FROM observations WHERE embedding IS NULL ORDER BY id`
  ) as Array<{ id: number; title: string; narrative: string | null; concepts: string[] | null }>;

  if (rows.length === 0) return 0;

  console.log(`[embedding] Backfilling ${rows.length} observations...`);
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => buildEmbeddingText(r.title, r.narrative, r.concepts));
    const embeddings = await generateEmbeddings(texts);

    const updated = await Promise.all(
      batch.map(async (row, j) => {
        const emb = embeddings[j];
        if (!emb) return 0;
        await updateObservationEmbedding(row.id, emb);
        return 1;
      })
    );
    count += updated.reduce<number>((a, b) => a + b, 0);
  }

  if (count > 0) await checkpoint();
  return count;
}

/**
 * Create HNSW index on observations.embedding if enough embeddings exist.
 * Safe to call multiple times — checks for minimum row count.
 */
export async function ensureHnswIndex(): Promise<void> {
  const db = await getDb();

  try {
    const result = await db.all(
      `SELECT COUNT(*) as cnt FROM observations WHERE embedding IS NOT NULL`
    ) as Array<{ cnt: number | bigint }>;
    const embCount = Number(result[0]?.cnt ?? 0);

    if (embCount < 10) return; // Not enough data for useful index

    // Check if index already exists
    const indexes = await db.all(
      `SELECT index_name FROM duckdb_indexes() WHERE table_name = 'observations' AND index_name = 'obs_embedding_idx'`
    ) as Array<{ index_name: string }>;

    if (indexes.length > 0) return; // Already exists

    await db.exec(
      `CREATE INDEX obs_embedding_idx ON observations USING HNSW (embedding) WITH (metric = 'cosine')`
    );
    console.log(`[embedding] HNSW index created (${embCount} embeddings)`);
  } catch (err) {
    console.error("[embedding] HNSW index creation failed:", err);
  }
}
