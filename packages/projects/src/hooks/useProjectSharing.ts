import { useState } from "react";
import {
  ProjectWithPermissions,
  ProjectRole,
  ShareProjectResponse,
} from "@studio/core";

interface UseProjectSharingProps {
  currentUserId: string;
}

export function useProjectSharing({ currentUserId }: UseProjectSharingProps) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] =
    useState<ProjectWithPermissions | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const openShareModal = (project: ProjectWithPermissions) => {
    setSelectedProject(project);
    setIsShareModalOpen(true);
  };

  const closeShareModal = () => {
    setIsShareModalOpen(false);
    setSelectedProject(null);
  };

  const shareProject = async (
    userEmail: string,
    role: ProjectRole
  ): Promise<void> => {
    if (!selectedProject) throw new Error("No project selected");

    setIsSharing(true);
    try {
      const response = await fetch(
        `/api/projects/${selectedProject.id}/share`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_email: userEmail,
            role,
            granted_by: currentUserId,
          }),
        }
      );

      const result: ShareProjectResponse = await response.json();

      console.log("Share response:", {
        status: response.status,
        ok: response.ok,
        result,
      });

      if (!response.ok) {
        console.error("Share failed - HTTP error:", result);
        throw new Error(result.error || "Failed to share project");
      }

      if (!result.success) {
        console.error("Share failed - Logic error:", result);
        throw new Error(result.error || "Failed to share project");
      }

      console.log("Share succeeded!", result);
    } finally {
      setIsSharing(false);
    }
  };

  const shareProjectById = async (
    projectId: string,
    userEmail: string,
    role: ProjectRole
  ): Promise<void> => {
    const response = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_email: userEmail,
        role,
        granted_by: currentUserId,
      }),
    });

    const result: ShareProjectResponse = await response.json();

    if (!response.ok) {
      console.error("Share failed - HTTP error:", result);
      throw new Error(result.error || "Failed to share project");
    }

    if (!result.success) {
      console.error("Share failed - Logic error:", result);
      throw new Error(result.error || "Failed to share project");
    }
  };

  const removePermission = async (userId: string): Promise<void> => {
    if (!selectedProject) throw new Error("No project selected");

    const response = await fetch(
      `/api/projects/${selectedProject.id}/permissions?userId=${userId}&removedBy=${currentUserId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to remove permission");
    }
  };

  return {
    isShareModalOpen,
    selectedProject,
    isSharing,
    openShareModal,
    closeShareModal,
    shareProject,
    shareProjectById,
    removePermission,
  };
}
