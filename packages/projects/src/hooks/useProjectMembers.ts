import { useState, useEffect, useCallback } from "react";
import { ProjectMember, ProjectRole } from "@studio/core";
import { useNotifications } from "@studio/notifications";

export function useProjectMembers(
  projectId: string,
  currentUserId: string,
  isOpen: boolean
) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { showCompactSuccess, showCompactError } = useNotifications();

  /**
   * Fetch project members
   */
  const fetchMembers = useCallback(async () => {
    if (!projectId || !currentUserId) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/projects/${projectId}/share?userId=${currentUserId}`
      );

      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      } else {
        console.error("Failed to fetch members");
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, currentUserId]);

  /**
   * Share project with user
   */
  const shareProject = useCallback(
    async (userEmail: string, role: ProjectRole) => {
      try {
        const response = await fetch(`/api/projects/${projectId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_email: userEmail,
            role,
            granted_by: currentUserId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to share project");
        }

        await fetchMembers();
      } catch (error) {
        console.error("Error sharing project:", error);
        showCompactError(
          error instanceof Error ? error.message : "Failed to share project"
        );
        throw error;
      }
    },
    [
      projectId,
      currentUserId,
      fetchMembers,
      showCompactSuccess,
      showCompactError,
    ]
  );

  /**
   * Remove member permission
   */
  const removePermission = useCallback(
    async (userId: string) => {
      // Optimistic update
      const originalMembers = members;
      setMembers((prev) => prev.filter((member) => member.user_id !== userId));

      try {
        await fetch(`/api/projects/${projectId}/share`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            targetUserId: userId,
          }),
        });
      } catch (error) {
        console.error("Error removing permission:", error);
        // Rollback
        setMembers(originalMembers);
        showCompactError("Failed to remove access");
        throw error;
      }
    },
    [projectId, currentUserId, members, showCompactSuccess, showCompactError]
  );

  /**
   * Load members when modal opens
   */
  useEffect(() => {
    if (isOpen) {
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  return {
    members,
    isLoading,
    shareProject,
    removePermission,
    refresh: fetchMembers,
  };
}
