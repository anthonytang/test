"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@studio/auth";
import { useNotifications, NotificationContainer } from "@studio/notifications";
import {
  ProjectListView,
  useProjects,
  CreateProjectModal,
} from "@studio/projects";
import { ProjectMetadata, Project } from "@studio/core";
import { useFileLibrary, AccountDropdown } from "@studio/ui";
import { useUserProfile } from "@studio/auth/hooks";
import { FileLibrary } from "@studio/storage";
import { TemplateLibrary } from "@studio/templates";

export default function DashboardPage() {
  const router = useRouter();

  // Initialize user profile registration
  useUserProfile();

  // Project management with caching and optimistic updates
  const {
    projects,
    initialLoadComplete,
    error,
    createProject,
    updateMetadata,
    deleteProject,
  } = useProjects();

  // UI state
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Notifications
  const { notifications, removeNotification } = useNotifications();

  // File library
  const {
    isFileLibraryOpen,
    isSelectionMode,
    selectedFiles,
    fileLibraryTitle,
    openFileLibrary,
    closeFileLibrary,
    handleFileSelection,
  } = useFileLibrary();

  // Template library state
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);

  // Create new project handler
  const handleCreateProject = async (
    name: string,
    metadata: ProjectMetadata
  ) => {
    try {
      setIsCreatingProject(true);
      await createProject(name, metadata);
      setIsCreateProjectModalOpen(false);
    } catch (err) {
      // Error already handled in hook
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Show loading state until initial load completes
  if (!initialLoadComplete) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center h-screen">
          <svg
            className="animate-spin h-8 w-8 text-accent"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      </div>
    );
  }

  // Show error state if loading failed
  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-white p-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-red-50 text-red-700 p-6 rounded-lg border border-red-100 shadow-sm flex items-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="font-medium">Error</h3>
                <p className="text-sm mt-1">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm underline mt-2 hover:text-red-800"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="h-screen flex bg-white">
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-300 bg-gradient-to-r from-gray-50 via-white to-gray-50 shadow-sm">
            <div className="relative max-w-4xl mx-auto">
              <div className="flex items-center">
                {/* Logo */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-accent rounded-lg shadow-sm">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <span className="text-lg font-bold text-accent">Studio</span>
                </div>
                {/* Right side buttons */}
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    onClick={() => openFileLibrary()}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-500 shadow-sm hover:bg-sky-600 transition-colors"
                    title="Files"
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </button>

                  <button
                    onClick={() => setIsTemplateLibraryOpen(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-500 shadow-sm hover:bg-indigo-600 transition-colors"
                    title="Templates"
                  >
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </button>

                  <AccountDropdown />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mt-8">
                <ProjectListView
                  projects={projects}
                  onProjectClick={(project: Project) =>
                    router.push(`/projects/${project.id}`)
                  }
                  onCreateNew={() => setIsCreateProjectModalOpen(true)}
                  onDelete={deleteProject}
                  onUpdateMetadata={updateMetadata}
                  isCreatingProject={isCreatingProject}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <>
        <CreateProjectModal
          isOpen={isCreateProjectModalOpen}
          onClose={() => setIsCreateProjectModalOpen(false)}
          onSubmit={handleCreateProject}
        />

        <FileLibrary
          isOpen={isFileLibraryOpen}
          onClose={closeFileLibrary}
          onSelectFiles={handleFileSelection}
          selectionMode={isSelectionMode}
          selectedFiles={selectedFiles}
          title={fileLibraryTitle}
        />

        <TemplateLibrary
          isOpen={isTemplateLibraryOpen}
          onClose={() => setIsTemplateLibraryOpen(false)}
        />
      </>

      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </ProtectedRoute>
  );
}
