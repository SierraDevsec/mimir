import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Database } from "duckdb-async";
import { getTestDb, closeTestDb, truncateAllTables } from "../../../__tests__/setup.js";

// Mock getDb to use test database
vi.mock("../../db.js", async () => {
  const setup = await import("../../../__tests__/setup.js");
  return {
    getDb: () => setup.getTestDb(),
    extractCount: setup.extractCount,
  };
});

import {
  registerProject,
  findProjectByPath,
  getAllProjects,
} from "../project.js";

describe("project service", () => {
  let db: Database;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("registerProject", () => {
    it("should insert a new project", async () => {
      await registerProject("proj-1", "My Project", "/path/to/project");

      const rows = await db.all("SELECT * FROM projects WHERE id = ?", "proj-1");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "proj-1",
        name: "My Project",
        path: "/path/to/project",
      });
    });

    it("should update on conflict (same id)", async () => {
      await registerProject("proj-1", "Original", "/original/path");
      await registerProject("proj-1", "Updated", "/updated/path");

      const rows = await db.all("SELECT * FROM projects WHERE id = ?", "proj-1");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "proj-1",
        name: "Updated",
        path: "/updated/path",
      });
    });
  });

  describe("findProjectByPath", () => {
    it("should find project by path", async () => {
      await registerProject("proj-1", "Test", "/test/path");

      const project = await findProjectByPath("/test/path");
      expect(project).not.toBeNull();
      expect(project?.id).toBe("proj-1");
      expect(project?.name).toBe("Test");
    });

    it("should return null for non-existent path", async () => {
      const project = await findProjectByPath("/non/existent");
      expect(project).toBeNull();
    });
  });

  describe("getAllProjects", () => {
    it("should return all projects ordered by created_at DESC", async () => {
      await registerProject("proj-1", "First", "/first");
      await registerProject("proj-2", "Second", "/second");
      await registerProject("proj-3", "Third", "/third");

      const projects = await getAllProjects();
      expect(projects).toHaveLength(3);
      // Most recent first
      expect(projects[0].id).toBe("proj-3");
      expect(projects[2].id).toBe("proj-1");
    });

    it("should return empty array when no projects", async () => {
      const projects = await getAllProjects();
      expect(projects).toEqual([]);
    });
  });
});
