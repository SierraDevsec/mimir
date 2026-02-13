import { Database } from "duckdb-async";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../../data"
);

let db: Database | null = null;
let checkpointTimer: ReturnType<typeof setInterval> | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, "mimir.duckdb");
  db = await Database.create(dbPath);
  await initSchema(db);

  // Checkpoint after schema init to flush migrations from WAL
  await db.exec("CHECKPOINT");

  // Periodic checkpoint every 5 minutes
  checkpointTimer = setInterval(async () => {
    try {
      if (db) await db.exec("CHECKPOINT");
    } catch { /* DB may be closing */ }
  }, 5 * 60 * 1000);

  return db;
}

async function initSchema(db: Database): Promise<void> {
  await db.exec(`
    CREATE SEQUENCE IF NOT EXISTS context_entries_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS file_changes_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS tasks_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS activity_log_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS task_comments_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS messages_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS tmux_panes_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS observations_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS session_summaries_seq START 1;
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         VARCHAR PRIMARY KEY,
      name       VARCHAR NOT NULL,
      path       VARCHAR NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         VARCHAR PRIMARY KEY,
      project_id VARCHAR,
      started_at TIMESTAMP DEFAULT now(),
      ended_at   TIMESTAMP,
      status     VARCHAR DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS agents (
      id              VARCHAR PRIMARY KEY,
      session_id      VARCHAR,
      agent_name      VARCHAR NOT NULL,
      agent_type      VARCHAR,
      parent_agent_id VARCHAR,
      status          VARCHAR DEFAULT 'active',
      started_at      TIMESTAMP DEFAULT now(),
      completed_at    TIMESTAMP,
      context_summary TEXT,
      input_tokens    INTEGER DEFAULT 0,
      output_tokens   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS context_entries (
      id         INTEGER PRIMARY KEY DEFAULT nextval('context_entries_seq'),
      session_id VARCHAR,
      agent_id   VARCHAR,
      entry_type VARCHAR NOT NULL,
      content    TEXT NOT NULL,
      tags       VARCHAR[],
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS file_changes (
      id          INTEGER PRIMARY KEY DEFAULT nextval('file_changes_seq'),
      session_id  VARCHAR,
      agent_id    VARCHAR,
      file_path   VARCHAR NOT NULL,
      change_type VARCHAR NOT NULL,
      created_at  TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY DEFAULT nextval('tasks_seq'),
      project_id  VARCHAR,
      title       VARCHAR NOT NULL,
      description TEXT,
      status      VARCHAR DEFAULT 'pending',
      assigned_to VARCHAR,
      tags        VARCHAR[],
      created_at  TIMESTAMP DEFAULT now(),
      updated_at  TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id           INTEGER PRIMARY KEY DEFAULT nextval('task_comments_seq'),
      task_id      INTEGER NOT NULL,
      author       VARCHAR,
      comment_type VARCHAR NOT NULL,
      content      TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY DEFAULT nextval('activity_log_seq'),
      session_id VARCHAR,
      agent_id   VARCHAR,
      event_type VARCHAR NOT NULL,
      details    JSON,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY DEFAULT nextval('messages_seq'),
      project_id VARCHAR NOT NULL,
      from_name  VARCHAR NOT NULL,
      to_name    VARCHAR NOT NULL,
      content    TEXT NOT NULL,
      priority   VARCHAR DEFAULT 'normal',
      status     VARCHAR DEFAULT 'pending',
      session_id VARCHAR,
      read_at    TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agent_registry (
      agent_name    VARCHAR NOT NULL,
      project_id    VARCHAR NOT NULL,
      tmux_pane     VARCHAR,
      session_id    VARCHAR,
      status        VARCHAR DEFAULT 'active',
      registered_at TIMESTAMP DEFAULT now(),
      last_seen_at  TIMESTAMP DEFAULT now(),
      PRIMARY KEY (agent_name, project_id)
    );

    CREATE TABLE IF NOT EXISTS tmux_sessions (
      session_name VARCHAR PRIMARY KEY,
      project_id   VARCHAR NOT NULL,
      status       VARCHAR DEFAULT 'active',
      agents_json  VARCHAR,
      created_at   TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tmux_panes (
      id           INTEGER PRIMARY KEY DEFAULT nextval('tmux_panes_seq'),
      pane_id      VARCHAR NOT NULL UNIQUE,
      session_name VARCHAR NOT NULL,
      window_id    VARCHAR,
      agent_name   VARCHAR,
      status       VARCHAR DEFAULT 'active',
      created_at   TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS observations (
      id              INTEGER PRIMARY KEY DEFAULT nextval('observations_seq'),
      session_id      VARCHAR NOT NULL,
      agent_id        VARCHAR,
      project_id      VARCHAR NOT NULL,
      type            VARCHAR NOT NULL,
      title           VARCHAR NOT NULL,
      subtitle        VARCHAR,
      narrative       TEXT,
      facts           VARCHAR[],
      concepts        VARCHAR[],
      files_read      VARCHAR[],
      files_modified  VARCHAR[],
      discovery_tokens INTEGER DEFAULT 0,
      source          VARCHAR DEFAULT 'self-mark',
      created_at      TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS session_summaries (
      id              INTEGER PRIMARY KEY DEFAULT nextval('session_summaries_seq'),
      session_id      VARCHAR NOT NULL,
      agent_id        VARCHAR,
      project_id      VARCHAR NOT NULL,
      request         TEXT,
      investigated    TEXT,
      learned         TEXT,
      completed       TEXT,
      next_steps      TEXT,
      files_read      VARCHAR[],
      files_modified  VARCHAR[],
      notes           TEXT,
      discovery_tokens INTEGER DEFAULT 0,
      created_at      TIMESTAMP DEFAULT now()
    );
  `);

  // Migration: add tags column to existing tasks tables (idempotent)
  try {
    await db.exec(`ALTER TABLE tasks ADD COLUMN tags VARCHAR[]`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add token columns to agents table
  try {
    await db.exec(`ALTER TABLE agents ADD COLUMN input_tokens INTEGER DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }
  try {
    await db.exec(`ALTER TABLE agents ADD COLUMN output_tokens INTEGER DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add agents_json column to tmux_sessions table
  try {
    await db.exec(`ALTER TABLE tmux_sessions ADD COLUMN agents_json VARCHAR`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add source column to observations table
  try {
    await db.exec(`ALTER TABLE observations ADD COLUMN source VARCHAR DEFAULT 'self-mark'`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add promoted_to column to observations table (warm→cold promotion tracking)
  try {
    await db.exec(`ALTER TABLE observations ADD COLUMN promoted_to VARCHAR DEFAULT NULL`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add status column to observations (active/resolved lifecycle)
  try {
    await db.exec(`ALTER TABLE observations ADD COLUMN status VARCHAR DEFAULT 'active'`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: vss extension + embedding column for RAG
  try {
    await db.exec(`INSTALL vss; LOAD vss;`);
    await db.exec(`SET hnsw_enable_experimental_persistence = true`);
  } catch {
    // vss already loaded or unavailable — RAG will use sequential scan
  }

  try {
    await db.exec(`ALTER TABLE observations ADD COLUMN embedding FLOAT[1024]`);
  } catch {
    // Column already exists — ignore
  }

}

/** Force CHECKPOINT — call after critical writes (observations, projects) */
export async function checkpoint(): Promise<void> {
  if (db) {
    try { await db.exec("CHECKPOINT"); } catch { /* best effort */ }
  }
}

export function getDataDir(): string {
  return DATA_DIR;
}

export async function closeDb(): Promise<void> {
  if (checkpointTimer) {
    clearInterval(checkpointTimer);
    checkpointTimer = null;
  }
  if (db) {
    try { await db.exec("CHECKPOINT"); } catch { /* best effort */ }
    await db.close();
    db = null;
  }
}

/**
 * Extract count from DuckDB query result.
 * DuckDB COUNT(*) returns BigInt, which cannot be JSON serialized.
 */
export function extractCount(result: { count?: number | bigint }[]): number {
  return Number(result[0]?.count ?? 0);
}
