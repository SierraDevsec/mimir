import { Database } from "duckdb-async";

let testDb: Database | null = null;

export async function getTestDb(): Promise<Database> {
  if (!testDb) {
    testDb = await Database.create(":memory:");
    await initTestSchema();
  }
  return testDb;
}

export async function closeTestDb() {
  if (testDb) {
    await testDb.close();
    testDb = null;
  }
}

async function initTestSchema() {
  if (!testDb) throw new Error("Test DB not initialized");

  await testDb.exec(`
    CREATE TABLE projects (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      path VARCHAR UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE TABLE sessions (
      id VARCHAR PRIMARY KEY,
      project_id VARCHAR,
      started_at TIMESTAMP DEFAULT now(),
      ended_at TIMESTAMP,
      status VARCHAR DEFAULT 'active'
    );

    CREATE TABLE agents (
      id VARCHAR PRIMARY KEY,
      session_id VARCHAR NOT NULL,
      agent_name VARCHAR NOT NULL,
      agent_type VARCHAR,
      parent_agent_id VARCHAR,
      status VARCHAR DEFAULT 'active',
      started_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP,
      context_summary VARCHAR
    );

    CREATE TABLE context_entries (
      id INTEGER PRIMARY KEY,
      session_id VARCHAR NOT NULL,
      agent_id VARCHAR,
      entry_type VARCHAR NOT NULL,
      content VARCHAR NOT NULL,
      tags VARCHAR[],
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE SEQUENCE context_entries_seq START 1;

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      project_id VARCHAR NOT NULL,
      title VARCHAR NOT NULL,
      description VARCHAR,
      status VARCHAR DEFAULT 'pending',
      assigned_to VARCHAR,
      tags VARCHAR[],
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );

    CREATE SEQUENCE tasks_seq START 1;

    CREATE TABLE task_comments (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      author VARCHAR,
      comment_type VARCHAR NOT NULL,
      content VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );

    CREATE SEQUENCE task_comments_seq START 1;

    CREATE SEQUENCE observations_seq START 1;

    CREATE TABLE observations (
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
      promoted_to     VARCHAR DEFAULT NULL,
      created_at      TIMESTAMP DEFAULT now()
    );
  `);
}

export async function clearTestData() {
  if (!testDb) throw new Error("Test DB not initialized");

  await testDb.exec(`
    DELETE FROM observations;
    DELETE FROM task_comments;
    DELETE FROM tasks;
    DELETE FROM context_entries;
    DELETE FROM agents;
    DELETE FROM sessions;
    DELETE FROM projects;
  `);
}
