import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { projectCacheManager } from "../project-cache-manager";
import type { ProjectWithPermissions } from "@studio/core";

const createProject = (
  overrides: Partial<ProjectWithPermissions> = {}
): ProjectWithPermissions => ({
  id: overrides.id || `project-${Math.random().toString(36).slice(2)}`,
  name: overrides.name || "Project",
  owner_id: overrides.owner_id || "owner-1",
  created_at: overrides.created_at || new Date().toISOString(),
  metadata: overrides.metadata || {},
  user_role: overrides.user_role || "owner",
  shared_with_count: overrides.shared_with_count ?? 0,
  is_shared: overrides.is_shared ?? false,
});

describe("projectCacheManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getProjects and setProjects", () => {
    it("should set and retrieve projects", () => {
      const project = createProject({ id: "p-1" });
      projectCacheManager.setProjects("user-1", [project]);

      const cached = projectCacheManager.getProjects("user-1");
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe("p-1");
    });

    it("should return null for uncached user", () => {
      expect(projectCacheManager.getProjects("unknown")).toBeNull();
    });
  });

  describe("shouldRefresh", () => {
    it("should return true when no cache exists", () => {
      expect(projectCacheManager.shouldRefresh("unknown")).toBe(true);
    });

    it("should return false when cache is fresh", () => {
      projectCacheManager.setProjects("user-1", [createProject()]);
      expect(projectCacheManager.shouldRefresh("user-1")).toBe(false);
    });

    it("should return true when cache TTL exceeded", () => {
      projectCacheManager.setProjects("user-1", [createProject()]);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(projectCacheManager.shouldRefresh("user-1")).toBe(true);
    });
  });

  describe("addProject", () => {
    it("should add project to cache", () => {
      const project = createProject({ id: "p-1" });
      projectCacheManager.addProject("user-1", project);

      const cached = projectCacheManager.getProjects("user-1");
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe("p-1");
    });
  });

  describe("updateProject", () => {
    it("should update project in cache", () => {
      const project = createProject({ id: "p-1", name: "Original" });
      projectCacheManager.setProjects("user-1", [project]);

      projectCacheManager.updateProject("user-1", "p-1", {
        name: "Updated",
        shared_with_count: 2,
      });

      const cached = projectCacheManager.getProjects("user-1");
      expect(cached?.[0].name).toBe("Updated");
      expect(cached?.[0].shared_with_count).toBe(2);
    });

    it("should handle updating non-existent cache gracefully", () => {
      projectCacheManager.updateProject("unknown", "p-1", { name: "Test" });
      expect(projectCacheManager.getProjects("unknown")).toBeNull();
    });
  });

  describe("removeProject", () => {
    it("should remove project from cache", () => {
      const project1 = createProject({ id: "p-1" });
      const project2 = createProject({ id: "p-2" });
      projectCacheManager.setProjects("user-1", [project1, project2]);

      projectCacheManager.removeProject("user-1", "p-1");

      const cached = projectCacheManager.getProjects("user-1");
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe("p-2");
    });

    it("should handle removing from empty cache gracefully", () => {
      projectCacheManager.removeProject("unknown", "p-1");
      expect(projectCacheManager.getProjects("unknown")).toBeNull();
    });
  });
});
