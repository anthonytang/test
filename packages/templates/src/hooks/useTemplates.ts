import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@studio/auth";
import { useNotifications } from "@studio/notifications";
import { azureApiClient } from "@studio/api";
import { Template } from "@studio/core";
import { templateCacheManager } from "@studio/templates";

export function useTemplates() {
  const { user } = useAuth();
  const { showCompactSuccess, showCompactError } = useNotifications();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.localAccountId || user?.homeAccountId || "";

  /**
   * Load templates with caching (SWR pattern)
   */
  const loadTemplates = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;

      try {
        // Step 1: Load from cache immediately
        if (!forceRefresh) {
          const cachedTemplates = templateCacheManager.getTemplates(userId);
          if (cachedTemplates) {
            setTemplates(cachedTemplates);
            setLoading(false);
          }
        }

        // Step 2: Check if refresh needed
        const shouldRefresh =
          forceRefresh || templateCacheManager.shouldRefresh(userId);
        if (!shouldRefresh && !forceRefresh) return;

        // Only show loading if no cached data
        const hasCachedData =
          templateCacheManager.getTemplates(userId) !== null;
        if (!hasCachedData) {
          setLoading(true);
        }

        // Fetch fresh data
        const userTemplates = await azureApiClient.getTemplatesForUser(userId);

        // Update cache and state
        templateCacheManager.setTemplates(userId, userTemplates);
        setTemplates(userTemplates);
        setError(null);
      } catch (err) {
        console.error("Error loading templates:", err);

        // Only show error if we don't have cached data
        const hasCachedData =
          templateCacheManager.getTemplates(userId) !== null;
        if (!hasCachedData) {
          setError("Failed to load templates");
          showCompactError("Failed to load templates");
        }
      } finally {
        setLoading(false);
      }
    },
    [userId, showCompactError]
  );

  /**
   * Delete template with optimistic update
   */
  const deleteTemplate = useCallback(
    async (templateId: string, templateName: string) => {
      if (!userId) throw new Error("User ID not available");

      // Store original for rollback
      const originalTemplates = templates;

      try {
        // Optimistic update
        templateCacheManager.removeTemplate(userId, templateId);
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));

        // Background sync
        await azureApiClient.deleteTemplate(templateId);

        showCompactSuccess(`"${templateName}" deleted`);
      } catch (err) {
        console.error("Error deleting template:", err);

        // Rollback on error
        templateCacheManager.setTemplates(userId, originalTemplates);
        setTemplates(originalTemplates);

        showCompactError("Failed to delete template");
        throw err;
      }
    },
    [userId, templates, showCompactSuccess, showCompactError]
  );

  /**
   * Add template to cache (after creation elsewhere)
   */
  const addTemplate = useCallback(
    (template: Template) => {
      if (!userId) return;
      templateCacheManager.addTemplate(userId, template);
      setTemplates((prev) => [template, ...prev]);
    },
    [userId]
  );

  /**
   * Share template with recipient
   */
  const shareTemplate = useCallback(
    async (templateId: string, recipientEmail: string) => {
      if (!userId) throw new Error("User ID not available");

      try {
        // Get token the same way azureApiClient does
        const token = (window as any).__authToken;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`/api/templates/${templateId}/share`, {
          method: "POST",
          headers,
          body: JSON.stringify({ user_email: recipientEmail }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to share template");
        }

        const { template } = await response.json();
        showCompactSuccess(`Template shared with ${recipientEmail}`);

        // Refresh templates to see if recipient is current user
        await loadTemplates(true);

        return template;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to share template";
        showCompactError(message);
        throw error;
      }
    },
    [userId, showCompactError, loadTemplates]
  );

  /**
   * Refresh templates (force reload)
   */
  const refresh = useCallback(() => {
    return loadTemplates(true);
  }, [loadTemplates]);

  /**
   * Initial load
   */
  useEffect(() => {
    if (userId) {
      loadTemplates();
    }
  }, [userId]);

  return {
    templates,
    loading,
    error,
    deleteTemplate,
    addTemplate,
    shareTemplate,
    refresh,
  };
}
