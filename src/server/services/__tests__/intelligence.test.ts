import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Database } from "duckdb-async";
import { getTestDb, closeTestDb, truncateAllTables, fixtures } from "../../../__tests__/setup.js";

vi.mock("../../db.js", async () => {
  const setup = await import("../../../__tests__/setup.js");
  return {
    getDb: () => setup.getTestDb(),
    extractCount: setup.extractCount,
  };
});

import {
  buildSmartContext,
  checkIncompleteTasks,
  buildPromptContext,
} from "../intelligence.js";

describe("intelligence service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);

    // Setup test project and session
    await db.run(
      `INSERT INTO projects (id, name, path) VALUES (?, ?, ?)`,
      fixtures.projectId, fixtures.projectName, fixtures.projectPath
    );
    await db.run(
      `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')`,
      fixtures.sessionId, fixtures.projectId
    );
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("buildSmartContext", () => {
    describe("sibling agent summaries", () => {
      it("should include sibling agent summaries (same parent, same session)", async () => {
        // Create parent agent
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, agent_type, status) VALUES (?, ?, ?, ?, 'active')`,
          "parent", fixtures.sessionId, "leader", "leader"
        );

        // Create completed sibling
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, agent_type, parent_agent_id, status, completed_at, context_summary)
           VALUES (?, ?, ?, ?, ?, 'completed', now(), ?)`,
          "sibling1", fixtures.sessionId, "backend-dev", "node-backend", "parent",
          "Completed API endpoints"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "frontend-dev",
          "react-frontend",
          "parent" // same parent
        );

        expect(context).toContain("## Sibling Agent Results");
        expect(context).toContain("[backend-dev]");
        expect(context).toContain("Completed API endpoints");
      });

      it("should not include siblings with null context_summary", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, parent_agent_id, status, completed_at)
           VALUES (?, ?, ?, ?, 'completed', now())`,
          "sibling-no-summary", fixtures.sessionId, "no-summary-agent", "parent"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "test-agent",
          "test",
          "parent"
        );

        expect(context).not.toContain("no-summary-agent");
      });
    });

    describe("same-type agent history", () => {
      it("should include previous agents with same type", async () => {
        // Create completed agent of same type in previous session
        await db.run(
          `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'ended')`,
          "prev-session", fixtures.projectId
        );
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, agent_type, status, completed_at, context_summary)
           VALUES (?, ?, ?, ?, 'completed', now(), ?)`,
          "prev-backend", "prev-session", "backend-dev", "node-backend",
          "Previous backend work completed"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev-2",
          "node-backend", // same type
          null
        );

        expect(context).toContain("## Previous node-backend Agent Results");
        expect(context).toContain("Previous backend work completed");
      });

      it("should skip same-type when agentType is null", async () => {
        const context = await buildSmartContext(
          fixtures.sessionId,
          "generic-agent",
          null, // no type
          null
        );

        expect(context).not.toContain("Previous");
      });
    });

    describe("cross-session context", () => {
      it("should include context from other sessions in same project", async () => {
        // Create another session in same project
        await db.run(
          `INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'ended')`,
          "prev-session", fixtures.projectId
        );

        // Add context entries to previous session
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content) VALUES (?, ?, ?)`,
          "prev-session", "decision", "Use REST API"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "test-agent",
          "test",
          null
        );

        expect(context).toContain("## Cross-Session Context");
        expect(context).toContain("[decision]");
        expect(context).toContain("Use REST API");
      });

      it("should filter by specific entry_types (agent_summary, decision, blocker, handoff)", async () => {
        await db.run(
          `INSERT INTO sessions (id, project_id) VALUES (?, ?)`,
          "prev", fixtures.projectId
        );

        // Should include
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content) VALUES (?, ?, ?)`,
          "prev", "decision", "Important decision"
        );
        // Should not include
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content) VALUES (?, ?, ?)`,
          "prev", "note", "Random note"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "test",
          "test",
          null
        );

        expect(context).toContain("Important decision");
        expect(context).not.toContain("Random note");
      });
    });

    describe("tagged context (list_contains)", () => {
      it("should include context tagged with agent name", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content, tags)
           VALUES (?, ?, ?, ['backend-dev', 'urgent']::VARCHAR[])`,
          fixtures.sessionId, "handoff", "Task for backend"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev", // matches tag
          "node-backend",
          null
        );

        expect(context).toContain("## Relevant Context");
        expect(context).toContain("Task for backend");
      });

      it("should include context tagged with agent type", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content, tags)
           VALUES (?, ?, ?, ['node-backend']::VARCHAR[])`,
          fixtures.sessionId, "note", "Backend specific note"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev",
          "node-backend", // matches tag
          null
        );

        expect(context).toContain("Backend specific note");
      });

      it("should include context tagged with 'all'", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content, tags)
           VALUES (?, ?, ?, ['all']::VARCHAR[])`,
          fixtures.sessionId, "blocker", "Important for everyone"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "any-agent",
          "any-type",
          null
        );

        expect(context).toContain("Important for everyone");
      });

      it("should include decision/blocker/handoff regardless of tags", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content, tags)
           VALUES (?, ?, ?, NULL)`,
          fixtures.sessionId, "blocker", "Untagged blocker"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "test",
          "test",
          null
        );

        expect(context).toContain("Untagged blocker");
      });
    });

    describe("fallback: recent context", () => {
      it("should use recent context when no other sections found", async () => {
        // Add generic note (not tagged, not special type)
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content, tags)
           VALUES (?, ?, ?, NULL)`,
          fixtures.sessionId, "note", "Just a note"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "new-agent",
          null, // no type matching
          null  // no parent
        );

        expect(context).toContain("## Recent Context");
        expect(context).toContain("Just a note");
      });
    });

    describe("assigned tasks", () => {
      it("should include tasks assigned to agent", async () => {
        await db.run(
          `INSERT INTO tasks (project_id, title, description, status, assigned_to)
           VALUES (?, ?, ?, 'pending', ?)`,
          fixtures.projectId, "Implement API", "Create REST endpoints", "backend-dev"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev", // matches assigned_to
          "node-backend",
          null
        );

        expect(context).toContain("## Your Assigned Tasks");
        expect(context).toContain("[pending] Implement API");
        expect(context).toContain("Create REST endpoints");
      });

      it("should include plan comments for planned/pending tasks", async () => {
        const rows = await db.all(
          `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'planned', ?) RETURNING id`,
          fixtures.projectId, "Planned Task", "backend-dev"
        );
        const taskId = Number((rows[0] as { id: number }).id);

        await db.run(
          `INSERT INTO task_comments (task_id, comment_type, content) VALUES (?, 'plan', ?)`,
          taskId, "Step 1: Create schema. Step 2: Implement handlers."
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev",
          "node-backend",
          null
        );

        expect(context).toContain("Plan:");
        expect(context).toContain("Step 1: Create schema");
      });

      it("should include task tags", async () => {
        await db.run(
          `INSERT INTO tasks (project_id, title, status, assigned_to, tags)
           VALUES (?, ?, 'in_progress', ?, ['urgent', 'backend']::VARCHAR[])`,
          fixtures.projectId, "Tagged Task", "backend-dev"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev",
          null,
          null
        );

        expect(context).toContain("[urgent, backend]");
      });

      it("should exclude completed and idea tasks", async () => {
        await db.run(
          `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'completed', ?)`,
          fixtures.projectId, "Completed Task", "backend-dev"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'idea', ?)`,
          fixtures.projectId, "Idea Task", "backend-dev"
        );

        const context = await buildSmartContext(
          fixtures.sessionId,
          "backend-dev",
          null,
          null
        );

        expect(context).not.toContain("Completed Task");
        expect(context).not.toContain("Idea Task");
      });
    });

    describe("edge cases", () => {
      it("should handle parentAgentId null (root agent)", async () => {
        const context = await buildSmartContext(
          fixtures.sessionId,
          "leader",
          "leader",
          null // root agent, no parent
        );

        // Should not crash, should return something or empty string
        expect(typeof context).toBe("string");
      });

      it("should handle agentType null", async () => {
        const context = await buildSmartContext(
          fixtures.sessionId,
          "generic",
          null, // no type
          "some-parent"
        );

        expect(typeof context).toBe("string");
      });

      it("should return empty string when all queries return empty", async () => {
        const context = await buildSmartContext(
          fixtures.sessionId,
          "new-agent",
          "new-type",
          "nonexistent-parent"
        );

        expect(context).toBe("");
      });
    });
  });

  describe("checkIncompleteTasks", () => {
    it("should return null when no incomplete tasks", async () => {
      await db.run(
        `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'completed', ?)`,
        fixtures.projectId, "Done Task", "backend-dev"
      );

      const warning = await checkIncompleteTasks(
        fixtures.sessionId,
        "agent-1",
        "backend-dev"
      );

      expect(warning).toBeNull();
    });

    it("should return warning for pending tasks", async () => {
      await db.run(
        `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'pending', ?)`,
        fixtures.projectId, "Pending Task", "backend-dev"
      );

      const warning = await checkIncompleteTasks(
        fixtures.sessionId,
        "agent-1",
        "backend-dev"
      );

      expect(warning).not.toBeNull();
      expect(warning).toContain("[clnode warning]");
      expect(warning).toContain("backend-dev");
      expect(warning).toContain("1 incomplete task");
      expect(warning).toContain("[pending] Pending Task");
    });

    it("should return warning for in_progress tasks", async () => {
      await db.run(
        `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'in_progress', ?)`,
        fixtures.projectId, "In Progress Task", "backend-dev"
      );

      const warning = await checkIncompleteTasks(
        fixtures.sessionId,
        "agent-1",
        "backend-dev"
      );

      expect(warning).toContain("[in_progress]");
    });

    it("should include all incomplete tasks in warning", async () => {
      await db.run(
        `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'pending', ?)`,
        fixtures.projectId, "Task 1", "backend-dev"
      );
      await db.run(
        `INSERT INTO tasks (project_id, title, status, assigned_to) VALUES (?, ?, 'in_progress', ?)`,
        fixtures.projectId, "Task 2", "backend-dev"
      );

      const warning = await checkIncompleteTasks(
        fixtures.sessionId,
        "agent-1",
        "backend-dev"
      );

      expect(warning).toContain("2 incomplete task(s)");
      expect(warning).toContain("Task 1");
      expect(warning).toContain("Task 2");
    });
  });

  describe("buildPromptContext", () => {
    describe("active agents section", () => {
      it("should include active agents", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, agent_type, status)
           VALUES (?, ?, ?, ?, 'active')`,
          "agent-1", fixtures.sessionId, "backend-dev", "node-backend"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("## Active Agents");
        expect(context).toContain("backend-dev (node-backend)");
      });

      it("should not include completed agents in active section", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, status, completed_at)
           VALUES (?, ?, ?, 'completed', now())`,
          "agent-1", fixtures.sessionId, "done-agent"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).not.toContain("## Active Agents");
      });
    });

    describe("open tasks section", () => {
      it("should include open tasks (excluding completed)", async () => {
        await db.run(
          `INSERT INTO tasks (project_id, title, status, assigned_to)
           VALUES (?, ?, 'in_progress', ?)`,
          fixtures.projectId, "Working Task", "agent-1"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status)
           VALUES (?, ?, 'completed')`,
          fixtures.projectId, "Done Task"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("## Open Tasks");
        expect(context).toContain("[in_progress] Working Task");
        expect(context).not.toContain("Done Task");
      });

      it("should show actionable tasks only (pending/in_progress/needs_review) and backlog count", async () => {
        // Insert tasks of different statuses
        await db.run(
          `INSERT INTO tasks (project_id, title, status) VALUES (?, ?, 'idea')`,
          fixtures.projectId, "Idea"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status) VALUES (?, ?, 'planned')`,
          fixtures.projectId, "Planned"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status) VALUES (?, ?, 'pending')`,
          fixtures.projectId, "Pending"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status) VALUES (?, ?, 'in_progress')`,
          fixtures.projectId, "InProgress"
        );
        await db.run(
          `INSERT INTO tasks (project_id, title, status) VALUES (?, ?, 'needs_review')`,
          fixtures.projectId, "NeedsReview"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        // in_progress > needs_review > pending
        const inProgressIdx = context.indexOf("[in_progress]");
        const needsReviewIdx = context.indexOf("[needs_review]");
        const pendingIdx = context.indexOf("[pending]");

        expect(inProgressIdx).toBeGreaterThan(-1);
        expect(needsReviewIdx).toBeGreaterThan(-1);
        expect(pendingIdx).toBeGreaterThan(-1);
        expect(inProgressIdx).toBeLessThan(needsReviewIdx);
        expect(needsReviewIdx).toBeLessThan(pendingIdx);

        // idea/planned should NOT be shown, but backlog count should
        expect(context).not.toContain("[idea]");
        expect(context).not.toContain("[planned]");
        expect(context).toContain("(+2 in backlog)");
      });

      it("should show assignment and tags", async () => {
        await db.run(
          `INSERT INTO tasks (project_id, title, status, assigned_to, tags)
           VALUES (?, ?, 'pending', ?, ['urgent']::VARCHAR[])`,
          fixtures.projectId, "Urgent Task", "backend-dev"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("[urgent]");
        expect(context).toContain("→ backend-dev");
      });
    });

    describe("decisions/blockers section", () => {
      it("should include recent decisions and blockers", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content)
           VALUES (?, ?, ?)`,
          fixtures.sessionId, "decision", "Use TypeScript"
        );
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content)
           VALUES (?, ?, ?)`,
          fixtures.sessionId, "blocker", "Waiting for API spec"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("## Recent Decisions & Blockers");
        expect(context).toContain("[decision] Use TypeScript");
        expect(context).toContain("[blocker] Waiting for API spec");
      });

      it("should include handoff entries", async () => {
        await db.run(
          `INSERT INTO context_entries (session_id, entry_type, content)
           VALUES (?, ?, ?)`,
          fixtures.sessionId, "handoff", "Pass to frontend"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("[handoff] Pass to frontend");
      });
    });

    describe("completed agent summaries", () => {
      it("should include completed agent summaries", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, status, completed_at, context_summary)
           VALUES (?, ?, ?, 'completed', now(), ?)`,
          "agent-1", fixtures.sessionId, "backend-dev", "API completed with 5 endpoints"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).toContain("## Completed Agent Summaries");
        expect(context).toContain("[backend-dev]");
        expect(context).toContain("API completed with 5 endpoints");
      });

      it("should not include agents with null context_summary", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, status, completed_at, context_summary)
           VALUES (?, ?, ?, 'completed', now(), NULL)`,
          "agent-1", fixtures.sessionId, "no-summary"
        );

        const context = await buildPromptContext(fixtures.sessionId);

        expect(context).not.toContain("no-summary");
      });
    });

    describe("edge cases", () => {
      it("should return fallback message when nothing to report", async () => {
        const context = await buildPromptContext(fixtures.sessionId);
        expect(context).toBe("[clnode project context]\n\n(No active tasks or agents)");
      });

      it("should include header when there is content", async () => {
        await db.run(
          `INSERT INTO agents (id, session_id, agent_name, status) VALUES (?, ?, ?, 'active')`,
          "agent-1", fixtures.sessionId, "active-agent"
        );

        const context = await buildPromptContext(fixtures.sessionId);
        expect(context).toContain("[clnode project context]");
      });
    });
  });
});
