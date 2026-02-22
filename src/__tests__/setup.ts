import { Database } from "duckdb-async";
import { beforeEach, afterAll } from "vitest";

/**
 * Re-export extractCount from db.ts for test mocks.
 * This ensures test mocks use the same implementation as production.
 */
export { extractCount } from "../server/db.js";

let testDb: Database | null = null;

export async function getTestDb(): Promise<Database> {
  if (!testDb) {
    testDb = await Database.create(":memory:");
    await initTestSchema(testDb);
  }
  return testDb;
}

export async function closeTestDb(): Promise<void> {
  if (testDb) {
    await testDb.close();
    testDb = null;
  }
}

export async function truncateAllTables(db: Database): Promise<void> {
  // 의존성 역순 삭제
  await db.run("DELETE FROM session_summaries");
  await db.run("DELETE FROM observations");
  await db.run("DELETE FROM messages");
  await db.run("DELETE FROM activity_log");
  await db.run("DELETE FROM file_changes");
  await db.run("DELETE FROM context_entries");
  await db.run("DELETE FROM task_comments");
  await db.run("DELETE FROM tasks");
  await db.run("DELETE FROM flows");
  await db.run("DELETE FROM tmux_panes");
  await db.run("DELETE FROM tmux_sessions");
  await db.run("DELETE FROM agent_registry");
  await db.run("DELETE FROM agents");
  await db.run("DELETE FROM sessions");
  await db.run("DELETE FROM projects");
}

async function initTestSchema(db: Database): Promise<void> {
  // db.ts의 스키마 복사
  await db.exec(`
    CREATE SEQUENCE IF NOT EXISTS context_entries_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS file_changes_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS tasks_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS activity_log_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS task_comments_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS observations_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS session_summaries_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS messages_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS tmux_panes_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS flows_seq START 1;
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
      id           INTEGER PRIMARY KEY DEFAULT nextval('tasks_seq'),
      project_id   VARCHAR,
      title        VARCHAR NOT NULL,
      description  TEXT,
      status       VARCHAR DEFAULT 'pending',
      assigned_to  VARCHAR,
      tags         VARCHAR[],
      flow_id      INTEGER,
      flow_node_id VARCHAR,
      depends_on   INTEGER[],
      created_at   TIMESTAMP DEFAULT now(),
      updated_at   TIMESTAMP DEFAULT now()
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
      status          VARCHAR DEFAULT 'active',
      promoted_to     VARCHAR,
      embedding       FLOAT[1024],
      created_at      TIMESTAMP DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS flows (
      id           INTEGER PRIMARY KEY DEFAULT nextval('flows_seq'),
      project_id   VARCHAR NOT NULL,
      name         VARCHAR NOT NULL,
      description  TEXT,
      status       VARCHAR DEFAULT 'draft',
      mermaid_code TEXT NOT NULL,
      metadata     JSON DEFAULT '{}',
      created_at   TIMESTAMP DEFAULT now(),
      updated_at   TIMESTAMP DEFAULT now()
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
}

// Test fixtures
export const fixtures = {
  projectId: "proj-test-001",
  projectName: "Test Project",
  projectPath: "/test/path",
  sessionId: "sess-test-001",
  sessionId2: "sess-test-002",
  agentId: "agent-test-001",
  agentId2: "agent-test-002",
  parentAgentId: "parent-agent-001",
};

// Insert test project and session
export async function setupTestData(db: Database): Promise<void> {
  await db.run(
    `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
    fixtures.projectId, fixtures.projectName, fixtures.projectPath
  );
  await db.run(
    `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
    fixtures.sessionId, fixtures.projectId
  );
}
