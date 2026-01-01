"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ProjectWithPermissions,
  Template,
  File as DatabaseFile,
  getAcceptString,
  getTemplateTypeClasses,
} from "@studio/core";
import { useAuth, useAuthUser, ProtectedRoute } from "@studio/auth";
import { azureApiClient } from "@studio/api";
import { useNotifications, NotificationContainer } from "@studio/notifications";
import { useFileProcessing, useFileUpload } from "@studio/storage";

// Import components directly instead of lazy loading to avoid chunk load errors
import {
  ProjectFileSelector,
  TemplateLibrary as ProjectTemplateSelector,
  ProjectMetadataDisplay,
  ProjectTabs,
  SearchAgent,
  projectCacheManager,
} from "@studio/projects";
import {
  CreateTemplateModal,
  GenerateTemplateModal,
  GenerateTemplateFromDocumentModal,
} from "@studio/templates";

import { GroupedFileList } from "@studio/storage";

interface ProjectFileWithDetails extends DatabaseFile {
  added_at: string;
  added_by?: string;
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { user, getAccessToken } = useAuth();
  const { getUserId, isAuthenticated } = useAuthUser();
  const { showSuccess, showError, notifications, removeNotification } =
    useNotifications();

  // State
  const [project, setProject] = useState<ProjectWithPermissions | null>(null);
  const [files, setFiles] = useState<ProjectFileWithDetails[]>([]);
  const [projectTemplates, setProjectTemplates] = useState<Template[]>([]);
  const [totalSectionCount, setTotalSectionCount] = useState<number>(0);
  const [templateSectionCounts, setTemplateSectionCounts] = useState<
    Map<string, number>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isFileLibraryOpen, setIsFileLibraryOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] =
    useState(false);
  const [isGenerateTemplateModalOpen, setIsGenerateTemplateModalOpen] =
    useState(false);
  const [isGenerateFromDocumentModalOpen, setIsGenerateFromDocumentModalOpen] =
    useState(false);
  const [showTemplateCreateMenu, setShowTemplateCreateMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [removingFiles, setRemovingFiles] = useState<Set<string>>(new Set());
  const [removingTemplates, setRemovingTemplates] = useState<Set<string>>(
    new Set()
  );
  const [processingStatus, setProcessingStatus] = useState<Map<string, any>>(
    new Map()
  );
  const [showSearchAgent, setShowSearchAgent] = useState(false);

  // Project editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState("");
  const [editingMetadata, setEditingMetadata] = useState<any>({});
  const [justStartedEditingName, setJustStartedEditingName] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File processing hook
  const { processingFiles, startProcessing, abortProcessing } =
    useFileProcessing({
      onProgress: (progress) => {
        setProcessingStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(progress.fileId, progress);
          return newMap;
        });
      },
      onComplete: (fileId) => {
        // Update file status
        setFiles((prev) =>
          prev.map((file) =>
            file.id === fileId
              ? { ...file, processing_status: "completed" }
              : file
          )
        );
        // Remove from processing status after a delay
        setTimeout(() => {
          setProcessingStatus((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 3000);
      },
      onError: (fileId) => {
        // Update file status
        setFiles((prev) =>
          prev.map((file) =>
            file.id === fileId ? { ...file, processing_status: "failed" } : file
          )
        );
      },
      onCancel: (fileId) => {
        // Update file's processing status to cancelled
        setFiles((prev) =>
          prev.map((file) =>
            file.id === fileId
              ? { ...file, processing_status: "cancelled" }
              : file
          )
        );
        // Remove processing status after a short delay to ensure state update
        setTimeout(() => {
          setProcessingStatus((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 100);
      },
    });

  // Sync processing status with global processing files - EXACT SAME AS DASHBOARD
  useEffect(() => {
    const newProcessingStatus = new Map();
    processingFiles.forEach((progress, fileId) => {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        newProcessingStatus.set(fileId, {
          file,
          progress,
          isProcessing:
            progress.stage !== "completed" &&
            progress.stage !== "error" &&
            progress.stage !== "cancelled",
        });
      }
    });
    setProcessingStatus(newProcessingStatus);
  }, [processingFiles, files]);

  // File upload hook
  const { uploadFiles, uploadingFiles } = useFileUpload({
    handleExistingFiles: true, // Enable handling of existing files
    onExistingFile: async (file: DatabaseFile) => {
      try {
        const userId = getUserId();
        if (!userId) throw new Error("User ID not available");

        // Check if file is already in project
        const isAlreadyInProject = files.some((f) => f.id === file.id);
        if (!isAlreadyInProject) {
          // Add existing file to project
          await azureApiClient.addFilesToProject(projectId, [file.id], userId);

          // Reload files
          await loadProjectFiles();

          showSuccess("File Added", `"${file.file_name}" added to project`);
        } else {
          showSuccess(
            "Already Added",
            `"${file.file_name}" is already in this project`
          );
        }
      } catch (err) {
        console.error("Error adding existing file to project:", err);
        showError("Upload Error", "Failed to add existing file to project");
      }
    },
    onFileUploaded: async (file: DatabaseFile) => {
      try {
        const userId = getUserId();
        if (!userId) throw new Error("User ID not available");

        // Add to project using API client
        await azureApiClient.addFilesToProject(projectId, [file.id], userId);

        // Add the file directly to state instead of reloading all files
        const newFile: ProjectFileWithDetails = {
          ...file,
          added_at: new Date().toISOString(),
          added_by: userId,
        };
        setFiles((prev) => [...prev, newFile]);

        // Initialize processing status to show progress bar immediately - EXACT SAME AS DASHBOARD
        setProcessingStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(file.id, {
            file: newFile,
            progress: {
              fileId: file.id,
              stage: "starting",
              progress: 0,
              message: "Initializing processing",
              timestamp: Date.now(),
              file_name: file.file_name,
            },
            isProcessing: true,
          });
          return newMap;
        });

        // Start processing the file
        const accessToken = await getAccessToken();
        await startProcessing(
          file.id,
          file.file_name,
          accessToken || undefined
        );
      } catch (err) {
        console.error("Error adding file to project:", err);
        showError("Upload Error", "File uploaded but failed to add to project");
      }
    },
  });

  // Load project files
  const loadProjectFiles = useCallback(async () => {
    const projectFileAssociations = await azureApiClient.getProjectFiles(
      projectId
    );
    const transformedFiles =
      projectFileAssociations
        ?.map((association) => ({
          ...association.userFile,
          added_at: association.projectFile.added_at,
          added_by: association.projectFile.added_by,
        }))
        .filter((file) => file.id) || [];
    setFiles(transformedFiles);
  }, [projectId]);

  // Load project data
  useEffect(() => {
    const loadProjectData = async () => {
      if (!user || !projectId) return;

      setIsLoading(true);
      try {
        const userId = user.localAccountId || user.homeAccountId;
        if (!userId) throw new Error("User ID not available");

        // Check cache first for project data to ensure consistency with dashboard
        const cachedProjects = projectCacheManager.getProjects(userId);
        const cachedProject = cachedProjects?.find((p) => p.id === projectId);

        // Load files and project templates in parallel
        // Also fetch project from API but prefer cache if available
        const [apiProjectData, , projectTemplatesData] = await Promise.all([
          azureApiClient.getProjectWithPermissions(projectId, userId),
          loadProjectFiles(),
          azureApiClient.getTemplatesForProject(projectId),
        ]);

        // Use cached project data if available (more up-to-date than potentially stale API response)
        // Fall back to API data if not in cache
        const projectData = cachedProject || apiProjectData;

        // Set project data
        setProject(projectData);
        setEditingName(projectData.name);
        setEditingDescription(projectData.metadata.description);
        setEditingMetadata(projectData.metadata);

        // Set templates
        setProjectTemplates(projectTemplatesData || []);

        // Load section counts for all templates in parallel
        let totalSections = 0;
        const sectionCounts = new Map<string, number>();
        if (projectTemplatesData && projectTemplatesData.length > 0) {
          const sectionLoadPromises = projectTemplatesData.map((template) =>
            azureApiClient
              .getTemplateWithSections(template.id)
              .then((templateWithSections) => ({
                templateId: template.id,
                count: templateWithSections?.sections?.length || 0,
              }))
              .catch((error) => {
                console.error(
                  `Error loading sections for template ${template.id}:`,
                  error
                );
                return { templateId: template.id, count: 0 };
              })
          );

          const results = await Promise.all(sectionLoadPromises);
          results.forEach(({ templateId, count }) => {
            sectionCounts.set(templateId, count);
            totalSections += count;
          });
        }
        setTemplateSectionCounts(sectionCounts);
        setTotalSectionCount(totalSections);
      } catch (error) {
        console.error("Error loading project data:", error);
        showError("Load Error", "Failed to load project data");
      } finally {
        setIsLoading(false);
      }
    };

    loadProjectData();
  }, [projectId, user, loadProjectFiles, showError]);

  // Handle ESC key to close modals and dropdowns
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showTemplateCreateMenu) {
          setShowTemplateCreateMenu(false);
        } else if (isFileLibraryOpen) {
          setIsFileLibraryOpen(false);
        } else if (isTemplateLibraryOpen) {
          setIsTemplateLibraryOpen(false);
        }
      }
    };

    document.addEventListener("keydown", handleEscKey);
    return () => document.removeEventListener("keydown", handleEscKey);
  }, [isFileLibraryOpen, isTemplateLibraryOpen, showTemplateCreateMenu]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const dropdown = document.getElementById("template-create-dropdown");
      const button = document.getElementById("template-create-button");

      if (
        showTemplateCreateMenu &&
        dropdown &&
        button &&
        !dropdown.contains(target) &&
        !button.contains(target)
      ) {
        setShowTemplateCreateMenu(false);
      }
    };

    if (showTemplateCreateMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTemplateCreateMenu]);

  // Handle updating project
  const handleUpdateProject = async (updates: {
    name?: string;
    metadata?: any;
  }) => {
    const userId = getUserId();
    if (!userId) {
      showError("Update Error", "User not authenticated");
      return;
    }

    try {
      const updatePayload: any = {};
      if (updates.name) updatePayload.name = updates.name;
      if (updates.metadata) {
        updatePayload.metadata = updates.metadata;
      }

      await azureApiClient.updateProject(projectId, updatePayload, userId);

      // Update local state
      setProject((prev) => {
        if (!prev) return prev;
        const newProject = { ...prev };
        if (updates.name) newProject.name = updates.name;
        if (updates.metadata) {
          newProject.metadata = updates.metadata;
        }
        return newProject;
      });

      // Update the project cache so dashboard reflects the changes
      projectCacheManager.updateProject(userId, projectId, updatePayload);

      showSuccess("Project Updated", "Project updated successfully");
    } catch (error) {
      console.error("Error updating project:", error);
      showError("Update Error", "Failed to update project");
      throw error;
    }
  };

  // Handle removing file from project
  const handleRemoveFile = async (fileId: string) => {
    // Store the original files in case we need to restore
    const originalFiles = files;

    try {
      // Add to removing set
      setRemovingFiles((prev) => new Set(prev).add(fileId));
      // Optimistic update - remove from UI immediately
      setFiles((prev) => prev.filter((f) => f.id !== fileId));

      // Then make the API call
      await azureApiClient.removeFilesFromProject(projectId, [fileId]);
      showSuccess("File Removed", "File removed from project");
    } catch (error) {
      console.error("Error removing file:", error);
      // Restore the original files on error
      setFiles(originalFiles);
      showError("Remove Error", "Failed to remove file from project");
    } finally {
      // Remove from removing set
      setRemovingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Handle canceling file processing
  const handleProcessingCancel = async (fileId: string) => {
    try {
      await abortProcessing(fileId);
      showSuccess("Processing Cancelled", "File processing has been cancelled");
    } catch (error) {
      console.error("Error cancelling processing:", error);
      showError("Cancel Error", "Failed to cancel file processing");
    }
  };

  // Handle processing/reprocessing a file
  const handleProcessFile = async (file: DatabaseFile) => {
    try {
      const userId = getUserId();
      if (!userId) {
        showError("Auth Error", "User ID not available");
        return;
      }

      // Initialize processing status to show progress bar immediately
      setProcessingStatus((prev) => {
        const newMap = new Map(prev);
        newMap.set(file.id, {
          file,
          progress: {
            fileId: file.id,
            stage: "starting",
            progress: 0,
            message: "Initializing processing",
            timestamp: Date.now(),
            file_name: file.file_name,
          },
          isProcessing: true,
        });
        return newMap;
      });

      // Start processing the file
      const accessToken = await getAccessToken();
      await startProcessing(
        file.id,
        file.file_name,
        accessToken || undefined
      );

      showSuccess("Processing Started", `Processing ${file.file_name}`);
    } catch (error) {
      console.error("Error processing file:", error);
      showError("Processing Error", "Failed to start file processing");
    }
  };

  // Handle bulk removal of files (for websites)
  const handleBulkRemoveFiles = async (fileIds: string[]) => {
    // Store the original files in case we need to restore
    const originalFiles = files;

    try {
      // Add all files to removing set
      setRemovingFiles((prev) => {
        const next = new Set(prev);
        fileIds.forEach((id) => next.add(id));
        return next;
      });

      // Optimistic update - remove from UI immediately
      setFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));

      // Show immediate feedback
      const firstFile = originalFiles.find((f) => fileIds.includes(f.id));
      if (firstFile?.file_name.startsWith("http")) {
        const domain = new URL(firstFile.file_name).hostname;
        showSuccess("Website Removed", `${domain} removed from project`);
      } else {
        showSuccess(
          "Files Removed",
          `${fileIds.length} files removed from project`
        );
      }

      // Then make the API call
      await azureApiClient.removeFilesFromProject(projectId, fileIds);
    } catch (error) {
      console.error("Error removing files:", error);
      // Restore the original files on error
      setFiles(originalFiles);
      showError("Remove Error", "Failed to remove files from project");
    } finally {
      // Remove all files from removing set
      setRemovingFiles((prev) => {
        const next = new Set(prev);
        fileIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  // Handle file click for download
  const handleFileClick = async (file: DatabaseFile) => {
    try {
      const isWebsite = file.file_name.startsWith("http");

      if (isWebsite) {
        window.open(file.file_name, "_blank");
      } else {
        const downloadUrl = await azureApiClient.getFileDownloadUrl(
          file.file_path
        );
        if (downloadUrl) {
          window.open(downloadUrl, "_blank");
        } else {
          showError("File Error", "Unable to generate file link");
        }
      }
    } catch (err) {
      console.error("Error opening file:", err);
      showError("File Error", "Failed to open file");
    }
  };

  // Handle file upload
  const handleFileUpload = async (filesToUpload: File[]) => {
    if (!isAuthenticated) return;

    const userId = getUserId();
    if (!userId) {
      showError("Auth Error", "User ID not available");
      return;
    }

    await uploadFiles(filesToUpload);
  };

  const handleCreateTemplate = async (
    name: string,
    metadata: { description: string; [key: string]: any }
  ) => {
    if (!isAuthenticated || !projectId) return;

    try {
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      const template = await azureApiClient.createTemplate({
        name,
        metadata,
        owner_id: userId,
      });

      await azureApiClient.addTemplatesToProject(
        projectId,
        [template.id],
        userId
      );

      await refreshTemplates();
      showSuccess("Template Created", `Template "${name}" has been created`);
    } catch (error) {
      console.error("Error creating template:", error);
      showError("Template Creation Failed", "Failed to create template");
    }
  };

  const handleTemplateSelection = async (
    templateIdsToAdd: string[],
    templateIdsToRemove?: string[]
  ) => {
    if (!isAuthenticated || !projectId) return;

    // Store for rollback on error
    const originalProjectTemplates = projectTemplates;
    const originalSectionCount = totalSectionCount;
    const originalSectionCounts = new Map(templateSectionCounts);

    try {
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      setIsTemplateLibraryOpen(false);

      // Apply removals immediately
      if (templateIdsToRemove && templateIdsToRemove.length > 0) {
        const removedSectionCount = templateIdsToRemove.reduce(
          (sum, id) => sum + (templateSectionCounts.get(id) || 0),
          0
        );
        setProjectTemplates((prev) =>
          prev.filter((t) => !templateIdsToRemove.includes(t.id))
        );
        setTotalSectionCount((prev) => Math.max(0, prev - removedSectionCount));
        setTemplateSectionCounts((prev) => {
          const next = new Map(prev);
          templateIdsToRemove.forEach((id) => next.delete(id));
          return next;
        });
      }

      // Make API calls
      const operations = [];

      if (templateIdsToAdd.length > 0) {
        operations.push(
          azureApiClient.addTemplatesToProject(
            projectId,
            templateIdsToAdd,
            userId
          )
        );
      }

      if (templateIdsToRemove && templateIdsToRemove.length > 0) {
        operations.push(
          azureApiClient.removeTemplatesFromProject(
            projectId,
            templateIdsToRemove
          )
        );
      }

      if (operations.length > 0) {
        await Promise.all(operations);
      }

      // Refresh to get correct order from server
      if (templateIdsToAdd.length > 0) {
        await refreshTemplates();
      }

      let message = "";
      if (templateIdsToAdd.length > 0) {
        message += `Added ${templateIdsToAdd.length} template${
          templateIdsToAdd.length > 1 ? "s" : ""
        }`;
      }
      if (templateIdsToRemove && templateIdsToRemove.length > 0) {
        if (message) message += " and ";
        message += `removed ${templateIdsToRemove.length} template${
          templateIdsToRemove.length > 1 ? "s" : ""
        }`;
      }

      if (message) {
        showSuccess("Templates Updated", message);
      }
    } catch (error) {
      console.error("Error updating templates:", error);
      setProjectTemplates(originalProjectTemplates);
      setTotalSectionCount(originalSectionCount);
      setTemplateSectionCounts(originalSectionCounts);
      showError("Template Error", "Failed to update project templates");
    }
  };

  const handleRemoveTemplate = async (templateId: string) => {
    // Store for rollback on error
    const originalTemplates = projectTemplates;
    const originalSectionCount = totalSectionCount;
    const originalSectionCounts = new Map(templateSectionCounts);

    try {
      setRemovingTemplates((prev) => new Set(prev).add(templateId));

      // Update UI immediately
      const removedSectionCount = templateSectionCounts.get(templateId) || 0;
      setProjectTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setTotalSectionCount((prev) => Math.max(0, prev - removedSectionCount));
      setTemplateSectionCounts((prev) => {
        const next = new Map(prev);
        next.delete(templateId);
        return next;
      });

      await azureApiClient.removeTemplatesFromProject(projectId, [templateId]);

      showSuccess("Template Removed", "Template removed from project");
    } catch (error) {
      console.error("Error removing template:", error);
      // Restore the original state on error
      setProjectTemplates(originalTemplates);
      setTotalSectionCount(originalSectionCount);
      setTemplateSectionCounts(originalSectionCounts);
      showError("Template Error", "Failed to remove template from project");
    } finally {
      // Remove from removing set
      setRemovingTemplates((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  };

  const refreshTemplates = useCallback(async () => {
    const templates = await azureApiClient.getTemplatesForProject(projectId);

    // Fetch all section counts in parallel
    let totalSections = 0;
    const sectionCounts = new Map<string, number>();

    if (templates && templates.length > 0) {
      const results = await Promise.all(
        templates.map((t) =>
          azureApiClient
            .getTemplateWithSections(t.id)
            .then((data) => ({ id: t.id, count: data?.sections?.length || 0 }))
            .catch(() => ({ id: t.id, count: 0 }))
        )
      );

      for (const { id, count } of results) {
        sectionCounts.set(id, count);
        totalSections += count;
      }
    }

    // Batch update to prevent flickering
    setProjectTemplates(templates || []);
    setTemplateSectionCounts(sectionCounts);
    setTotalSectionCount(totalSections);
  }, [projectId]);

  // Handle opening the generate template modal
  const handleGenerateTemplate = () => {
    if (!project) {
      showError("Generation Error", "No project data available");
      return;
    }

    if (!project.metadata?.description) {
      showError(
        "Generation Error",
        "Please add a project description first to generate templates"
      );
      return;
    }

    setIsGenerateTemplateModalOpen(true);
  };

  const handleTemplateGeneration = async (templateData: any) => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      const template = await azureApiClient.createTemplate({
        name: templateData.template.name,
        metadata: {
          description: templateData.template.metadata.description,
          template_type:
            templateData.template.metadata.template_type || "financial",
          department: templateData.template.metadata.department || "",
          tags: templateData.template.metadata.tags || [],
        },
        owner_id: userId,
      });

      if (template) {
        await azureApiClient.addTemplatesToProject(
          projectId,
          [template.id],
          userId
        );

        // Create all sections in parallel
        const sectionCount = templateData.sections?.length || 0;
        if (sectionCount > 0) {
          await Promise.all(
            templateData.sections.map((section: any) =>
              azureApiClient.createSection({
                template_id: template.id,
                name: section.name,
                description: section.description,
                sort_order: section.sort_order,
                metadata: { type: section.type },
              })
            )
          );
        }

        await refreshTemplates();
        showSuccess(
          "Template Generated",
          `"${template.name}" has been created with ${sectionCount} section${
            sectionCount !== 1 ? "s" : ""
          }`
        );
      }
    } catch (error) {
      console.error("Error creating generated template:", error);
      showError("Generation Error", "Failed to create the generated template");
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    await handleFileUpload(droppedFiles);
  };

  if (isLoading) {
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

  if (!project) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-white p-6">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Project not found</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-accent hover:text-accent-600"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="h-screen flex flex-col bg-white">
        {/* Header - Same as template page */}
        <div className="p-4 border-b border-gray-300 bg-gradient-to-r from-gray-50 via-white to-gray-50 shadow-sm">
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {/* Placeholder to match edit button alignment */}
              <div className="p-1.5">
                <div className="h-4 w-4"></div>
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Logo and Breadcrumbs */}
            <div className="flex items-center gap-2">
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

              {/* Breadcrumbs */}
              <div className="flex items-center gap-2 ml-4">
                <span className="text-gray-400">/</span>
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Dashboard
                </Link>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-900 font-medium">
                  {project?.name || "Project"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Project Title and Metadata */}
            <div className="mb-8 mt-4">
              <div className="group relative flex items-start">
                <div className="absolute -left-20 flex items-center gap-2 top-0">
                  {!isEditingName ? (
                    <>
                      {/* Placeholder to match template menu button spacing (p-1.5 + h-4 w-4 icon = 28px) */}
                      <div className="p-1.5">
                        <div className="h-4 w-4"></div>
                      </div>
                      <button
                        onClick={() => {
                          setIsEditingName(true);
                          setJustStartedEditingName(true);
                          setIsEditingDescription(true);
                          setEditingMetadata(project?.metadata || {});
                        }}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Edit project details"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsEditingName(false);
                          setIsEditingDescription(false);
                          setEditingName(project?.name || "");
                          setEditingDescription(
                            project?.metadata.description || ""
                          );
                          setEditingMetadata(project?.metadata || {});
                        }}
                        className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-100 transition-colors"
                        title="Cancel"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={async () => {
                          if (editingName.trim() === "") return;
                          try {
                            await handleUpdateProject({
                              name: editingName,
                              metadata: {
                                ...editingMetadata,
                                description: editingDescription,
                              },
                            });
                            setIsEditingName(false);
                            setIsEditingDescription(false);
                          } catch (error) {
                            console.error("Error updating project:", error);
                          }
                        }}
                        className="p-1.5 rounded-md text-green-500 hover:text-green-700 hover:bg-green-100 transition-colors"
                        title="Save changes"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                <div className="flex-1">
                  <div>
                    <div className="flex-1">
                      {isEditingName ? (
                        <div className="w-full bg-white border border-gray-300 rounded-md shadow-sm focus-within:border-accent transition-colors">
                          <textarea
                            value={editingName}
                            onChange={(e) => {
                              setEditingName(e.target.value);
                              // Auto-adjust height to fit content
                              e.target.style.height = "auto";
                              e.target.style.height =
                                e.target.scrollHeight + "px";
                            }}
                            onKeyDown={async (e) => {
                              if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                editingName.trim() !== ""
                              ) {
                                e.preventDefault();
                                await handleUpdateProject({
                                  name: editingName,
                                  metadata: {
                                    ...editingMetadata,
                                    description: editingDescription,
                                  },
                                });
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              } else if (e.key === "Escape") {
                                setEditingName(project?.name || "");
                                setEditingDescription(
                                  project?.metadata.description || ""
                                );
                                setEditingMetadata(project?.metadata || {});
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              }
                            }}
                            ref={(el) => {
                              if (el) {
                                // Auto-size on mount
                                el.style.height = "auto";
                                el.style.height = el.scrollHeight + "px";
                                // Only set cursor to end when first entering edit mode
                                if (justStartedEditingName) {
                                  el.focus();
                                  el.setSelectionRange(
                                    el.value.length,
                                    el.value.length
                                  );
                                  setJustStartedEditingName(false);
                                }
                              }
                            }}
                            className="resize-none overflow-hidden w-full px-4 py-3 text-4xl font-normal text-gray-900 bg-transparent focus:outline-none rounded-md"
                            style={{ minHeight: "60px", lineHeight: "1.2" }}
                            placeholder="Name"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div>
                          <h1 className="text-4xl font-normal text-gray-900 leading-tight mb-4">
                            {project.name}
                          </h1>

                          {/* Simplified Metadata Display */}
                          <ProjectMetadataDisplay
                            metadata={project.metadata}
                            updatedAt={project.updated_at || project.created_at}
                            userName={user?.name || "You"}
                          />
                        </div>
                      )}

                      {/* Description and Metadata */}
                      <div className="mt-4">
                        {isEditingDescription ? (
                          <div className="space-y-2">
                            {/* Description */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Description
                              </label>
                              <textarea
                                value={editingDescription}
                                onChange={(e) =>
                                  setEditingDescription(e.target.value)
                                }
                                ref={(el) => {
                                  if (el) {
                                    // Auto-expand on mount/edit mode
                                    setTimeout(() => {
                                      el.style.height = "auto";
                                      el.style.height = el.scrollHeight + "px";
                                    }, 0);
                                  }
                                }}
                                onInput={(e) => {
                                  const target =
                                    e.target as HTMLTextAreaElement;
                                  target.style.height = "auto";
                                  target.style.height =
                                    target.scrollHeight + "px";
                                }}
                                className="w-full px-2 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors resize-none overflow-hidden"
                                placeholder="Description"
                                style={{ minHeight: "60px" }}
                              />
                            </div>

                            {/* Project Details Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {/* Project Type */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                  Project Type
                                </label>
                                <select
                                  value={editingMetadata.project_type || ""}
                                  onChange={(e) =>
                                    setEditingMetadata({
                                      ...editingMetadata,
                                      project_type: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-accent transition-colors bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                                >
                                  <option value="">Select type</option>
                                  <option value="M&A">
                                    Mergers & Acquisitions
                                  </option>
                                  <option value="capital_raise">
                                    Capital Raise
                                  </option>
                                  <option value="equity_research">
                                    Equity Research
                                  </option>
                                  <option value="investment_memo">
                                    Investment Memo
                                  </option>
                                  <option value="due_diligence">
                                    Due Diligence
                                  </option>
                                  <option value="portfolio_analysis">
                                    Portfolio Analysis
                                  </option>
                                  <option value="market_research">
                                    Market Research
                                  </option>
                                  <option value="other">Other</option>
                                </select>
                              </div>

                              {/* Transaction Side */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                  Transaction Side
                                </label>
                                <select
                                  value={editingMetadata.transaction_side || ""}
                                  onChange={(e) =>
                                    setEditingMetadata({
                                      ...editingMetadata,
                                      transaction_side: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-accent transition-colors bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                                >
                                  <option value="">Select side</option>
                                  <option value="buy_side">Buy Side</option>
                                  <option value="sell_side">Sell Side</option>
                                  <option value="advisor">Advisor</option>
                                  <option value="neutral">Neutral</option>
                                </select>
                              </div>

                              {/* Deal Stage */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                  Deal Stage
                                </label>
                                <select
                                  value={editingMetadata.deal_stage || ""}
                                  onChange={(e) =>
                                    setEditingMetadata({
                                      ...editingMetadata,
                                      deal_stage: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-accent transition-colors bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                                >
                                  <option value="">Select stage</option>
                                  <option value="prospecting">
                                    Prospecting
                                  </option>
                                  <option value="initial_review">
                                    Initial Review
                                  </option>
                                  <option value="due_diligence">
                                    Due Diligence
                                  </option>
                                  <option value="negotiation">
                                    Negotiation
                                  </option>
                                  <option value="closing">Closing</option>
                                  <option value="post_merger">
                                    Post-Merger
                                  </option>
                                  <option value="monitoring">Monitoring</option>
                                </select>
                              </div>

                              {/* Industry Focus */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                  Industry Focus
                                </label>
                                <select
                                  value={editingMetadata.industry_focus || ""}
                                  onChange={(e) =>
                                    setEditingMetadata({
                                      ...editingMetadata,
                                      industry_focus: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-accent transition-colors bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                                >
                                  <option value="">
                                    Select an industry...
                                  </option>
                                  <option value="Technology">Technology</option>
                                  <option value="Healthcare">Healthcare</option>
                                  <option value="Finance">Finance</option>
                                  <option value="Real Estate">
                                    Real Estate
                                  </option>
                                  <option value="Energy">Energy</option>
                                  <option value="Consumer Goods">
                                    Consumer Goods
                                  </option>
                                  <option value="Industrial">Industrial</option>
                                  <option value="Telecom">Telecom</option>
                                  <option value="Materials">Materials</option>
                                  <option value="Utilities">Utilities</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabbed Content */}
            <div>
              <ProjectTabs
                tabs={[
                  {
                    id: "templates",
                    label: "Templates",
                    count: projectTemplates.length,
                    content: (
                      <div className="pt-6">
                        {/* Template Actions */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
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
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                Templates
                              </h3>
                              <p className="text-sm text-gray-500">
                                {projectTemplates.length} template
                                {projectTemplates.length !== 1
                                  ? "s"
                                  : ""} • {totalSectionCount} section
                                {totalSectionCount !== 1 ? "s" : ""} total
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setIsTemplateLibraryOpen(true)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                            >
                              <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                />
                              </svg>
                              <span>Library</span>
                            </button>

                            <div className="relative">
                              <button
                                id="template-create-button"
                                onClick={() =>
                                  setShowTemplateCreateMenu(
                                    !showTemplateCreateMenu
                                  )
                                }
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                              >
                                <svg
                                  className="w-4 h-4 text-accent"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                                <span>New</span>
                                <svg
                                  className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                                    showTemplateCreateMenu ? "rotate-180" : ""
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>

                              {showTemplateCreateMenu && (
                                <div
                                  id="template-create-dropdown"
                                  className="absolute right-0 mt-2 w-[218px] bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden z-10"
                                >
                                  {/* Generate from document */}
                                  <button
                                    onClick={() => {
                                      setShowTemplateCreateMenu(false);
                                      setIsGenerateFromDocumentModalOpen(true);
                                    }}
                                    className="w-full px-4 py-3 text-left hover:bg-accent-50 flex items-center gap-3 transition-colors"
                                  >
                                    <svg
                                      className="w-5 h-5 text-accent"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>
                                    <span className="text-base font-medium text-gray-700">
                                      From document
                                    </span>
                                  </button>

                                  {/* Generate from chat/AI */}
                                  <button
                                    onClick={() => {
                                      setShowTemplateCreateMenu(false);
                                      handleGenerateTemplate();
                                    }}
                                    disabled={!project?.metadata?.description}
                                    className="w-full px-4 py-3 text-left hover:bg-accent-50 flex items-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                                  >
                                    <svg
                                      className="w-5 h-5 text-accent"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                      />
                                    </svg>
                                    <span className="text-base font-medium text-gray-700">
                                      From description
                                    </span>
                                  </button>

                                  {/* Create manually */}
                                  <button
                                    onClick={() => {
                                      setShowTemplateCreateMenu(false);
                                      setIsCreateTemplateModalOpen(true);
                                    }}
                                    className="w-full px-4 py-3 text-left hover:bg-accent-50 flex items-center gap-3 transition-colors"
                                  >
                                    <svg
                                      className="w-5 h-5 text-accent"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="1.5"
                                        d="M12 4v16m8-8H4"
                                      />
                                    </svg>
                                    <span className="text-base font-medium text-gray-700">
                                      From scratch
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Templates Grid - with minimum height */}
                        <div className="min-h-[420px]">
                          {projectTemplates.length === 0 ? (
                            <div className="rounded-xl border border-gray-300 bg-white p-8 h-full">
                              <div className="text-center mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                  Define your analysis
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Templates specify what data to extract from
                                  your data
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto">
                                <button
                                  onClick={() => setIsTemplateLibraryOpen(true)}
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From library
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      Use existing template
                                    </p>
                                  </div>
                                </button>

                                <button
                                  onClick={() =>
                                    setIsGenerateFromDocumentModalOpen(true)
                                  }
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From document
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      AI extracts structure
                                    </p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => handleGenerateTemplate()}
                                  disabled={!project?.metadata?.description}
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:bg-white"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white group-disabled:group-hover:bg-accent-50 group-disabled:group-hover:text-accent transition-colors">
                                    <svg
                                      className="w-4 h-4"
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
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From description
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      AI generates sections
                                    </p>
                                  </div>
                                </button>

                                <button
                                  onClick={() =>
                                    setIsCreateTemplateModalOpen(true)
                                  }
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M12 4v16m8-8H4"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From scratch
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      Build manually
                                    </p>
                                  </div>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              {projectTemplates.map((template) => (
                                <div
                                  key={template.id}
                                  className="group bg-white border border-gray-300 hover:border-accent-300 rounded-xl p-5 transition-all hover:shadow-sm cursor-pointer flex flex-col h-full"
                                  onClick={() =>
                                    router.push(
                                      `/projects/${projectId}/templates/${template.id}`
                                    )
                                  }
                                >
                                  <div className="flex items-start justify-between mb-3">
                                    <div
                                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getTemplateTypeClasses(
                                        template.metadata?.template_type
                                      )}`}
                                    >
                                      {template.metadata?.template_type ===
                                      "financial" ? (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <line
                                            x1="18"
                                            y1="20"
                                            x2="18"
                                            y2="10"
                                          />
                                          <line
                                            x1="12"
                                            y1="20"
                                            x2="12"
                                            y2="4"
                                          />
                                          <line x1="6" y1="20" x2="6" y2="14" />
                                        </svg>
                                      ) : template.metadata?.template_type ===
                                        "operational" ? (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <circle cx="12" cy="12" r="3" />
                                          <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
                                        </svg>
                                      ) : template.metadata?.template_type ===
                                        "legal" ? (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <path d="M12 3v18m-4-6h8M6 6h12l-2 5h-8L6 6z" />
                                          <line
                                            x1="9"
                                            y1="21"
                                            x2="15"
                                            y2="21"
                                          />
                                        </svg>
                                      ) : template.metadata?.template_type ===
                                        "technical" ? (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <polyline points="16 18 22 12 16 6" />
                                          <polyline points="8 6 2 12 8 18" />
                                        </svg>
                                      ) : template.metadata?.template_type ===
                                        "market" ? (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                        </svg>
                                      ) : (
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                          <polyline points="14 2 14 8 20 8" />
                                          <line
                                            x1="9"
                                            y1="15"
                                            x2="15"
                                            y2="15"
                                          />
                                        </svg>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveTemplate(template.id);
                                        }}
                                        disabled={removingTemplates.has(
                                          template.id
                                        )}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                        title="Remove from project"
                                      >
                                        {removingTemplates.has(template.id) ? (
                                          <svg
                                            className="animate-spin h-4 w-4"
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
                                        ) : (
                                          <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth="2"
                                              d="M6 18L18 6M6 6l12 12"
                                            />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex-1 flex flex-col">
                                    <h4 className="font-semibold text-gray-900 group-hover:text-accent transition-colors mb-2">
                                      {template.name}
                                    </h4>

                                    <p className="text-sm text-gray-500 line-clamp-2 flex-1">
                                      {template.metadata?.description || (
                                        <span className="text-gray-400 italic">
                                          No description
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-between mt-3">
                                    <span className="text-xs text-gray-400">
                                      Click to open
                                    </span>
                                    <svg
                                      className="w-4 h-4 text-gray-400 group-hover:text-accent transition-colors"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 5l7 7-7 7"
                                      />
                                    </svg>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "files",
                    label: "Files",
                    count: files.length,
                    content: (
                      <div
                        className="pt-6"
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        {/* Files Actions */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
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
                                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                Files
                              </h3>
                              <p className="text-sm text-gray-500">
                                {files.length} document
                                {files.length !== 1 ? "s" : ""} •{" "}
                                {(() => {
                                  const totalBytes = files.reduce(
                                    (acc, f) => acc + (f.file_size || 0),
                                    0
                                  );
                                  const kb = totalBytes / 1024;
                                  if (kb < 1024) return `${kb.toFixed(0)} KB`;
                                  return `${(kb / 1024).toFixed(1)} MB`;
                                })()}{" "}
                                total
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setIsFileLibraryOpen(true)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                            >
                              <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                />
                              </svg>
                              <span>Library</span>
                            </button>

                            <button
                              onClick={() => setShowSearchAgent(true)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                            >
                              <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                              </svg>
                              <span>Web</span>
                            </button>

                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                            >
                              <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                />
                              </svg>
                              <span>Upload</span>
                            </button>
                          </div>
                        </div>

                        {/* Files Content */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept={getAcceptString()}
                          onChange={(e) =>
                            e.target.files &&
                            handleFileUpload(Array.from(e.target.files))
                          }
                          className="hidden"
                        />

                        {/* Files Content - with minimum height */}
                        <div className="min-h-[420px]">
                          {files.length === 0 &&
                          !isDragging &&
                          uploadingFiles.length === 0 ? (
                            <div className="rounded-xl border border-gray-300 bg-white p-8 h-full">
                              <div className="text-center mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                  Add your data
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Upload documents or import from the web
                                </p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-xl mx-auto">
                                <button
                                  onClick={() => setIsFileLibraryOpen(true)}
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From library
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      Existing files
                                    </p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => setShowSearchAgent(true)}
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From web
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      Search and import
                                    </p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => fileInputRef.current?.click()}
                                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 hover:border-accent hover:bg-accent-50 transition-all text-left group"
                                >
                                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                      />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-medium text-gray-900">
                                      From local
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      Upload files
                                    </p>
                                  </div>
                                </button>
                              </div>
                            </div>
                          ) : isDragging ? (
                            <div className="bg-accent-50 rounded-xl py-16 text-center border-2 border-dashed border-accent-300">
                              <div className="w-16 h-16 rounded-full bg-accent-100 flex items-center justify-center mx-auto mb-4">
                                <svg
                                  className="w-8 h-8 text-accent"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                  />
                                </svg>
                              </div>
                              <h3 className="text-lg font-semibold text-accent-800 mb-2">
                                Drop files here
                              </h3>
                              <p className="text-accent-600">
                                Release to upload files to this project
                              </p>
                            </div>
                          ) : (
                            <GroupedFileList
                              files={files}
                              onFileClick={handleFileClick}
                              onFileDelete={handleRemoveFile}
                              onBulkDelete={handleBulkRemoveFiles}
                              onProcessingCancel={handleProcessingCancel}
                              onProcessFile={handleProcessFile}
                              processingStatus={processingStatus}
                              deletingFiles={removingFiles}
                              uploadingFiles={uploadingFiles}
                              rounded
                            />
                          )}
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
          <div className="h-24"></div>
        </div>

        <ProjectFileSelector
          isOpen={isFileLibraryOpen}
          onClose={() => setIsFileLibraryOpen(false)}
          projectId={projectId}
          currentProjectFiles={files}
          onFilesUpdated={loadProjectFiles}
        />

        <ProjectTemplateSelector
          isOpen={isTemplateLibraryOpen}
          onClose={() => setIsTemplateLibraryOpen(false)}
          onSelectTemplates={handleTemplateSelection}
          projectTemplateIds={projectTemplates.map((t) => t.id)}
          title="Add Templates to Project"
        />

        <CreateTemplateModal
          isOpen={isCreateTemplateModalOpen}
          onClose={() => setIsCreateTemplateModalOpen(false)}
          onSubmit={handleCreateTemplate}
        />

        <GenerateTemplateModal
          isOpen={isGenerateTemplateModalOpen}
          onClose={() => setIsGenerateTemplateModalOpen(false)}
          onGenerate={handleTemplateGeneration}
          projectName={project?.name || ""}
          projectDescription={project?.metadata?.description || ""}
          projectMetadata={project?.metadata || {}}
        />

        <GenerateTemplateFromDocumentModal
          isOpen={isGenerateFromDocumentModalOpen}
          onClose={() => setIsGenerateFromDocumentModalOpen(false)}
          onTemplateGenerated={handleTemplateGeneration}
        />

        {/* Search Agent Modal */}
        <SearchAgent
          isOpen={showSearchAgent}
          onClose={() => setShowSearchAgent(false)}
          selectedProjectId={projectId}
          onCrawlComplete={loadProjectFiles}
          onRefreshData={loadProjectFiles}
        />

        <NotificationContainer
          notifications={notifications}
          onRemove={removeNotification}
        />
      </div>
    </ProtectedRoute>
  );
}
