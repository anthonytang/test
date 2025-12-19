import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@studio/auth";
import { useNotifications } from "@studio/notifications";
import { azureApiClient } from "@studio/api";
import { ProjectWithPermissions, ProjectMetadata } from "@studio/core";
import { projectCacheManager } from "../lib/project-cache-manager";

export function useProjects() {
  const { user, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useNotifications();

  const [projects, setProjects] = useState<ProjectWithPermissions[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.localAccountId || user?.homeAccountId || "";

  /**
   * Load projects with caching
   */
  const loadProjects = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;

      try {
        // Load from cache immediately (SWR pattern)
        if (!forceRefresh) {
          const cachedProjects = projectCacheManager.getProjects(userId);
          if (cachedProjects) {
            setProjects(cachedProjects);
          }
        }

        // Fetch fresh data
        const shouldRefresh =
          forceRefresh || projectCacheManager.shouldRefresh(userId);
        if (!shouldRefresh && !forceRefresh) return;

        setLoading(true);

        // Single API call
        const response = await fetch(
          `/api/projects?userId=${encodeURIComponent(
            userId
          )}&includeShared=true`
        );

        if (!response.ok) {
          throw new Error("Failed to load projects");
        }

        const projectsData = await response.json();

        // Update cache and state
        projectCacheManager.setProjects(userId, projectsData);
        setProjects(projectsData);
        setError(null);
      } catch (err) {
        console.error("Error loading projects:", err);

        // Only show error if we don't have cached data
        const hasCachedData = projectCacheManager.getProjects(userId) !== null;
        if (!hasCachedData) {
          setError("Failed to load projects");
        }
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    },
    [userId]
  );

  /**
   * Create new project with optimistic update
   */
  const createProject = useCallback(
    async (name: string, metadata: ProjectMetadata) => {
      if (!userId) throw new Error("User ID not available");

      try {
        const project = await azureApiClient.createProject(
          name,
          metadata,
          userId
        );
        const projectWithPermissions: ProjectWithPermissions = {
          ...project,
          user_role: "owner",
          shared_with_count: 0,
          is_shared: false,
        };

        // Optimistic update
        projectCacheManager.addProject(userId, projectWithPermissions);
        setProjects((prev) => [projectWithPermissions, ...prev]);

        showSuccess(
          "Project Created",
          "Your new project has been created successfully"
        );
        return projectWithPermissions;
      } catch (err) {
        console.error("Error creating project:", err);
        showError(
          "Failed to create project",
          "An error occurred while creating the project"
        );
        throw err;
      }
    },
    [userId, showSuccess, showError]
  );

  /**
   * Update project with optimistic update
   */
  const updateProject = useCallback(
    async (projectId: string, updates: { name?: string; metadata?: any }) => {
      if (!userId) throw new Error("User ID not available");

      // Store original for rollback
      const originalProjects = projects;

      try {
        // Optimistic update
        const optimisticUpdates: Partial<ProjectWithPermissions> = {
          ...updates,
          updated_at: new Date().toISOString(),
        };

        projectCacheManager.updateProject(userId, projectId, optimisticUpdates);
        setProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? { ...project, ...optimisticUpdates }
              : project
          )
        );

        // Background sync
        await azureApiClient.updateProject(projectId, updates, userId);
      } catch (err) {
        console.error("Error updating project:", err);

        // Rollback on error
        projectCacheManager.setProjects(userId, originalProjects);
        setProjects(originalProjects);

        showError(
          "Failed to update project",
          "An error occurred while updating the project"
        );
        throw err;
      }
    },
    [userId, projects, showError]
  );

  /**
   * Update project metadata (for archive/status changes)
   */
  const updateMetadata = useCallback(
    async (projectId: string, metadata: any) => {
      return updateProject(projectId, { metadata });
    },
    [updateProject]
  );

  /**
   * Delete project with optimistic update
   */
  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!userId) throw new Error("User ID not available");

      // Store original for rollback
      const originalProjects = projects;

      try {
        // Optimistic update
        projectCacheManager.removeProject(userId, projectId);
        setProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Background sync
        await azureApiClient.deleteProject(projectId, userId);

        showSuccess(
          "Project Deleted",
          "Project has been successfully deleted"
        );
      } catch (err) {
        console.error("Error deleting project:", err);

        // Rollback on error
        projectCacheManager.setProjects(userId, originalProjects);
        setProjects(originalProjects);

        showError(
          "Failed to delete project",
          "An error occurred while deleting the project"
        );
        throw err;
      }
    },
    [userId, projects, showSuccess, showError]
  );

  /**
   * Update share count (after sharing operations)
   */
  const updateShareCount = useCallback(
    (projectId: string, delta: number) => {
      if (!userId) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;

          const currentCount = Number(p.shared_with_count || 0);
          const newCount = Math.max(0, currentCount + delta);

          const updated = { ...p, shared_with_count: newCount };
          projectCacheManager.updateProject(userId, projectId, {
            shared_with_count: newCount,
          });

          return updated;
        })
      );
    },
    [userId]
  );

  /**
   * Refresh projects (force reload)
   */
  const refresh = useCallback(() => {
    return loadProjects(true);
  }, [loadProjects]);

  /**
   * Initial load
   */
  useEffect(() => {
    if (isAuthenticated && userId) {
      loadProjects();
    }
  }, [isAuthenticated, userId, loadProjects]);

  return {
    projects,
    loading,
    initialLoadComplete,
    error,
    createProject,
    updateProject,
    updateMetadata,
    deleteProject,
    updateShareCount,
    refresh,
  };
}
