"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Section, ProjectWithPermissions, File as DatabaseFile } from "@studio/core";
import {
  captureAllChartImages,
  ErrorBoundary,
  TemplateErrorFallback,
  AppHeader,
  Skeleton,
} from "@studio/ui";
import {
  TemplateModal,
  TemplateControls,
  SectionList,
  useTemplate,
} from "@studio/templates";
import {
  Sources,
  Document,
  useResults,
  exportToExcel,
  exportToWord,
} from "@studio/results";
import { useAuthUser, ProtectedRoute } from "@studio/auth";
import { azureApiClient } from "@studio/api";
import { useNotifications, NotificationContainer } from "@studio/notifications";
import { useTemplates } from "@studio/templates";
import { FilesPanel, FilesPanelHandle } from "@studio/storage";

export default function ProjectTemplatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const templateId = params.templateId as string;
  const { isAuthenticated, loading, getUserId } = useAuthUser();
  const { showSuccess, showError, notifications, removeNotification } =
    useNotifications();

  // UI state
  const [selectedTag, setSelectedTag] = useState<{
    sectionId: string;
    tag: string;
    unitIds: string[];
  } | null>(null);
  const [citationPanelWidth, setCitationPanelWidth] = useState<number>(20);
  const [isResizingCitations, setIsResizingCitations] = useState<
    "left" | false
  >(false);
  const [contextPanelWidth, setContextPanelWidth] = useState<number>(30);
  const [isResizingContext, setIsResizingContext] = useState<"left" | false>(
    false
  );
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartWidth, setDragStartWidth] = useState<number>(0);
  const [selectedItem, setSelectedItem] = useState<{
    sectionId: string;
    text: string;
    tags: string[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [unsavedSectionsHighlight, setUnsavedSectionsHighlight] = useState<
    number[]
  >([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Refs
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const filesPanelRef = useRef<FilesPanelHandle>(null);
  const hasSetInitialSelection = useRef(false);

  const { refresh: refreshTemplates } = useTemplates();

  const handleTemplateCreated = useCallback(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  // Custom hooks
  const {
    template,
    sections,
    setSections,
    isLoading,
    isEditingName,
    setIsEditingName,
    editingName,
    setEditingName,
    justStartedEditingName,
    setJustStartedEditingName,
    setIsEditingDescription,
    editingDescription,
    setEditingDescription,
    editingMetadata,
    setEditingMetadata,
    editingSections,
    sectionOperations,
    sectionErrors: templateSectionErrors,
    setSectionErrors: setTemplateSectionErrors,
    handleUpdateTemplate,
    toggleSectionEdit,
    updateSection,
    handleSaveSection,
    addSection,
    removeSection,
  } = useTemplate(
    templateId,
    (message: string) => showSuccess("Templates Updated", message),
    (title: string, message: string) => showError(title, message),
    handleTemplateCreated
  );

  // Project state - we load a single project for this page
  const [project, setProject] = useState<ProjectWithPermissions | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  // Files state - received from FilesPanel via onFilesChange callback
  const [files, setFiles] = useState<DatabaseFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

  // File selection state - controlled by parent, passed to FilesPanel
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set()
  );

  // Handle files change from FilesPanel - updates files and selection
  const handleFilesChange = useCallback((newFiles: DatabaseFile[]) => {
    setFiles(newFiles);
    setIsLoadingFiles(false);
    // Only auto-select all files on initial load
    if (!hasSetInitialSelection.current && newFiles.length > 0) {
      setSelectedFileIds(new Set(newFiles.map((f) => f.id)));
      hasSetInitialSelection.current = true;
    }
  }, []);

  // Load saved panel widths from localStorage
  useEffect(() => {
    const savedCitationWidth = localStorage.getItem("citationPanelWidth");
    if (savedCitationWidth) {
      setCitationPanelWidth(parseInt(savedCitationWidth));
    }

    const savedContextWidth = localStorage.getItem("contextPanelWidth");
    if (savedContextWidth) {
      setContextPanelWidth(parseInt(savedContextWidth));
    }
  }, []);


  // Memoize the error callback to prevent infinite loops
  const handleResultsError = useCallback(
    (error: string | null) => {
      if (error) {
        showError("Processing Error", error);
      }
    },
    [showError]
  );

  const {
    results,
    fileCache,
    updateResultMetadata,
    processingSectionId,
    isProcessingTemplate,
    currentProgress,
    sectionErrors: resultsSectionErrors,
    runs,
    selectedRun,
    setSelectedRun,
    updateRunMetadata,
    processSingleSection,
    handleProcessTemplate,
    handleStopProcessing,
    handleAbortSection,
    handleDeleteRun,
  } = useResults(
    template,
    projectId,
    handleResultsError,
    sections,
    project?.metadata,
    Array.from(selectedFileIds),
    isLoadingFiles
  );

  // Keep section errors separate - don't merge them
  // templateSectionErrors are for validation (empty names, etc)
  // resultsSectionErrors are for processing errors

  // Determine if we're viewing a read-only run and get snapshot data
  const currentRun = selectedRun
    ? runs.find((r) => r.id === selectedRun)
    : null;

  // Read-only if we have a selected run that's NOT the latest run (first in array, sorted DESC)
  const latestRunId = runs.length > 0 ? runs[0].id : null;
  const isReadOnly = !!(selectedRun && selectedRun !== latestRunId);

  // Use snapshot data when viewing read-only run, otherwise use current template
  const displayTemplate =
    isReadOnly && currentRun
      ? {
          ...template,
          name: currentRun.metadata?.template_snapshot?.name || template?.name,
          metadata: {
            ...template?.metadata,
            ...currentRun.metadata?.template_snapshot?.metadata,
            current_version: currentRun.metadata?.template_snapshot?.version,
          },
        }
      : template;

  const displaySections =
    isReadOnly && currentRun?.metadata?.template_snapshot?.sections
      ? (currentRun.metadata.template_snapshot.sections as Section[])
      : sections;

  const runInfo = currentRun
    ? {
        date: new Date(currentRun.created_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        version: currentRun.metadata?.template_snapshot?.version || "Unknown",
        name: currentRun.metadata?.name || "Unnamed Run",
      }
    : null;

  // Load project data when component mounts
  useEffect(() => {
    const loadProjectData = async () => {
      const userId = getUserId();
      if (!projectId || !userId) return;

      setIsLoadingProject(true);
      try {
        const projectData = await azureApiClient.getProjectWithPermissions(
          projectId,
          userId
        );
        setProject(projectData);
      } catch (err) {
        console.error("Error loading project:", err);
        showError("Load Error", "Failed to load project");
      } finally {
        setIsLoadingProject(false);
      }
    };

    if (!loading && isAuthenticated) {
      loadProjectData();
    }
  }, [projectId, loading, isAuthenticated, getUserId, showError]);

  // Check for edit mode from query parameter
  useEffect(() => {
    if (template && searchParams.get("edit") === "true" && !isEditingName) {
      setIsEditingName(true);
      setJustStartedEditingName(true);
      setEditingName(template.name);
      // Remove the query parameter after using it
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [
    template,
    searchParams,
    isEditingName,
    setIsEditingName,
    setEditingName,
    setJustStartedEditingName,
  ]);

  // Clear unsaved sections highlight after a delay
  useEffect(() => {
    if (unsavedSectionsHighlight.length > 0) {
      const timer = setTimeout(() => {
        setUnsavedSectionsHighlight([]);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [unsavedSectionsHighlight]);

  // Close template menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        templateMenuRef.current &&
        !templateMenuRef.current.contains(event.target as Node)
      ) {
        setShowTemplateMenu(false);
      }
    };

    if (showTemplateMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTemplateMenu]);

  // Handle citation panel resizing with RAF for smooth performance
  useEffect(() => {
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingCitations) return;
      e.preventDefault();

      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        // Only handle left edge dragging for citations panel
        // Dragging left edge - use delta from start position
        const deltaX = dragStartX - e.clientX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        let newWidth = dragStartWidth + deltaPercent;

        // Apply constraints
        const maxAvailable = selectedTag ? 100 - contextPanelWidth : 100;
        newWidth = Math.max(20, Math.min(maxAvailable - 1, newWidth));

        setCitationPanelWidth(newWidth);
      });
    };

    const handleMouseUp = () => {
      if (isResizingCitations) {
        setIsResizingCitations(false);
        // Save to localStorage when resizing ends
        setTimeout(() => {
          localStorage.setItem(
            "citationPanelWidth",
            citationPanelWidth.toString()
          );
        }, 0);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    if (isResizingCitations) {
      document.addEventListener("mousemove", handleMouseMove, {
        passive: false,
      });
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [
    isResizingCitations,
    dragStartX,
    dragStartWidth,
    selectedTag,
    contextPanelWidth,
    citationPanelWidth,
  ]);

  // Handle context panel resizing with RAF for smooth performance
  useEffect(() => {
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingContext) return;
      e.preventDefault();

      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        // Use delta from start position for smooth resize
        const deltaX = dragStartX - e.clientX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        let newWidth = dragStartWidth + deltaPercent;

        // Apply constraints
        newWidth = Math.max(20, Math.min(80, newWidth));
        setContextPanelWidth(newWidth);
      });
    };

    const handleMouseUp = () => {
      if (isResizingContext) {
        setIsResizingContext(false);
        // Save to localStorage when resizing ends
        setTimeout(() => {
          localStorage.setItem(
            "contextPanelWidth",
            contextPanelWidth.toString()
          );
        }, 0);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    if (isResizingContext) {
      document.addEventListener("mousemove", handleMouseMove, {
        passive: false,
      });
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingContext, dragStartX, dragStartWidth, contextPanelWidth]);


  // ESC key handler for sidebars - just close them
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Close Context sidebar if it's open
        if (selectedTag) {
          setSelectedTag(null);
        }
        // Otherwise close Citations sidebar if it's open
        else if (selectedItem) {
          setSelectedItem(null);
        }
      }
    };

    // Only add listener if at least one sidebar is open
    if (selectedTag || selectedItem) {
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("keydown", handleEscKey);
      };
    }
  }, [selectedTag, selectedItem]);

  // Handle section reordering
  const reorderSections = async (reorderedSections: Section[]) => {
    try {
      // Update local state immediately for smooth UI
      setSections(reorderedSections);

      // Update each section's sort_order in the database
      const updatePromises = reorderedSections.map((section, index) =>
        azureApiClient.updateSection(section.id, { sort_order: index })
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error reordering sections:", error);
      showError("Update Error", "Failed to reorder sections");
      // Reload sections on error to restore correct order
      if (template) {
        const sectionsData = await azureApiClient.getSections(template.id);
        setSections(sectionsData || []);
      }
    }
  };


  // Duplicate template
  const handleDuplicateTemplate = async () => {
    const userId = getUserId();
    if (!template || !userId) return;

    try {

      // Create new template with copied data
      const newTemplate = await azureApiClient.createTemplate({
        name: `${template.name} (Copy)`,
        metadata: { description: template.metadata?.description || "" },
        owner_id: userId,
      });

      // Copy all sections to the new template
      const sectionPromises = sections.map((section, index) =>
        azureApiClient.createSection({
          template_id: newTemplate.id,
          name: section.name,
          description: section.description,
          metadata: section.metadata,
          sort_order: index,
        })
      );

      await Promise.all(sectionPromises);

      // Add the duplicated template to the current project
      await azureApiClient.addTemplatesToProject(
        projectId,
        [newTemplate.id],
        userId
      );

      showSuccess("Template Duplicated", "Template duplicated successfully");

      // Navigate to the new template within the same project
      router.push(`/projects/${projectId}/templates/${newTemplate.id}`);
    } catch (error) {
      console.error("Error duplicating template:", error);
      showError("Duplicate Error", "Failed to duplicate template");
    }
  };

  // Export functionality
  const handleSaveResults = async () => {
    if (!template || !results || Object.keys(results).length === 0) {
      return;
    }

    // Use snapshot data if viewing read-only run, otherwise use current data
    const exportTemplate =
      isReadOnly && displayTemplate ? displayTemplate : template;
    const exportSections =
      isReadOnly && displaySections ? displaySections : sections;
    const exportFiles =
      isReadOnly && currentRun?.metadata?.available_files
        ? currentRun.metadata.available_files
        : files;
    const exportFileIds =
      isReadOnly && currentRun?.metadata?.available_files
        ? new Set<string>(
            currentRun.metadata.available_files.map((f: any) => f.id as string)
          )
        : selectedFileIds;

    setIsSaving(true);
    try {
      // Capture chart images for chart-type sections
      const chartSectionIds = exportSections
        .filter((f: Section) => f.metadata?.type === "chart")
        .map((f: Section) => f.id);

      const chartImages = await captureAllChartImages(chartSectionIds);

      await exportToExcel({
        template: exportTemplate,
        sections: exportSections,
        results,
        selectedProject: project,
        files: exportFiles,
        selectedFileIds: exportFileIds,
        chartImages,
      });

      setIsSaving(false);
      showSuccess("Export Complete", "Results exported to Excel successfully");
    } catch (error) {
      console.error("Error saving results:", error);
      showError(
        "Export Error",
        `Failed to save results: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setIsSaving(false);
    }
  };

  // Export to Word
  const handleExportWord = async () => {
    if (!template || !results || Object.keys(results).length === 0) {
      showError("Export Error", "No results to export");
      return;
    }

    // Use snapshot data if viewing read-only run, otherwise use current data
    const exportTemplate =
      isReadOnly && displayTemplate ? displayTemplate : template;
    const exportSections =
      isReadOnly && displaySections ? displaySections : sections;

    try {
      // Capture chart images for chart-type sections
      const chartSectionIds = exportSections
        .filter((f: Section) => f.metadata?.type === "chart")
        .map((f: Section) => f.id);

      const chartImages = await captureAllChartImages(chartSectionIds);

      // Use the new Word export utility
      await exportToWord({
        template: exportTemplate,
        sections: exportSections,
        results,
        chartImages,
      });

      showSuccess("Export Complete", "Results exported to Word successfully");
    } catch (error) {
      console.error("Error exporting to Word:", error);
      showError("Export Error", "Failed to export to Word document");
    }
  };

  // Wrapper for handleProcessTemplate that checks for unsaved sections
  const handleProcessTemplateWithValidation = async () => {
    // Check if there are any sections being edited
    if (editingSections.length > 0) {
      // Highlight unsaved sections
      setUnsavedSectionsHighlight(editingSections);

      // Scroll to the first unsaved section
      const firstUnsavedIndex = editingSections[0];
      const sectionElements = document.querySelectorAll("[data-section-index]");
      const unsavedSectionElement = sectionElements[firstUnsavedIndex];
      if (unsavedSectionElement) {
        unsavedSectionElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }

    // If all sections are saved, proceed with processing
    await handleProcessTemplate();
  };

  // Wait for both template and project to load
  if (isLoading || isLoadingProject) {
    return (
      <ProtectedRoute>
        <div className="h-screen flex flex-col bg-white">
          {/* Header skeleton */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-gray-300">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-4 h-4" />
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-4 h-4" />
              <Skeleton className="w-32 h-4" />
            </div>
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>

          {/* Content skeleton */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              {/* Template title section */}
              <div className="mb-8 mt-4">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-4 w-24 mt-3" />
              </div>

              {/* Controls row */}
              <div className="mb-8">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              </div>

              {/* Sections */}
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mt-8">
                    <Skeleton className="h-9 w-48 mb-3" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <ErrorBoundary fallback={<TemplateErrorFallback />}>
        <div className="h-screen flex bg-white">
          <div
            className={`flex-1 flex flex-col ${
              isResizingCitations || isResizingContext
                ? ""
                : "transition-all duration-200"
            }`}
            style={{
              marginRight: selectedItem
                ? selectedTag
                  ? `calc(${citationPanelWidth}vw + ${contextPanelWidth}vw)`
                  : `${citationPanelWidth}vw`
                : "0",
            }}
          >
            <AppHeader
              breadcrumbs={[
                { label: "Dashboard", href: "/dashboard" },
                ...(project?.name ? [{ label: project.name, href: `/projects/${projectId}` }] : []),
                { label: displayTemplate?.name || template!.name }
              ]}
            />

            {/* Read-Only Run Banner */}
            {isReadOnly && runInfo && (
              <div className="bg-gradient-to-r from-accent-50 to-accent-100/50 px-6 py-4">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg
                        className="h-6 w-6 text-accent-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <div className="flex items-center gap-3 text-base">
                        <span className="font-medium text-accent-900">
                          Viewing Read-Only Run:
                        </span>
                        <span className="text-accent-800">{runInfo.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-600 text-sm font-semibold uppercase tracking-wider">
                        READ-ONLY
                      </span>
                      <button
                        onClick={() => setSelectedRun(latestRunId)}
                        className="px-10 py-1.5 bg-white text-accent-700 hover:bg-gray-50 hover:text-accent-800 text-sm font-medium rounded-md border border-gray-300 transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto relative">
                {/* Collapsible Files Panel - hidden in read-only mode */}
                {!isReadOnly && (
                  <FilesPanel
                    ref={filesPanelRef}
                    projectId={projectId}
                    isCollapsible
                    defaultCollapsed
                    selectionMode
                    onFilesChange={handleFilesChange}
                    selectedFileIds={selectedFileIds}
                    onSelectionChange={setSelectedFileIds}
                  />
                )}

                {/* Template Title Section */}
                <div className="mb-8 mt-4">
                  <div className="group relative flex items-start">
                    <div className="absolute -left-20 flex items-center gap-2 top-0">
                      {!isEditingName && !isReadOnly ? (
                        <>
                          <div className="relative" ref={templateMenuRef}>
                            <button
                              onClick={() =>
                                setShowTemplateMenu(!showTemplateMenu)
                              }
                              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                              title="Template options"
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
                                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                />
                              </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {showTemplateMenu && (
                              <div className="absolute right-full mr-2 top-0 w-48 bg-white rounded-lg shadow-lg border border-gray-300 py-1 z-10">
                                {!isReadOnly && (
                                  <>
                                    <button
                                      onClick={() => {
                                        handleDuplicateTemplate();
                                        setShowTemplateMenu(false);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
                                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                      </svg>
                                      Duplicate Template
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowShareModal(true);
                                        setShowTemplateMenu(false);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
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
                                          strokeWidth={2}
                                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                                        />
                                      </svg>
                                      Share Template
                                    </button>
                                  </>
                                )}
                                {isReadOnly && (
                                  <div className="px-4 py-3 text-xs text-gray-500 text-center italic">
                                    Options unavailable in read-only mode
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (isReadOnly) return;
                              setIsEditingName(true);
                              setJustStartedEditingName(true);
                              setIsEditingDescription(true);
                              setEditingMetadata(template?.metadata || {});
                            }}
                            disabled={isReadOnly}
                            className={`p-1.5 rounded-md transition-colors ${
                              isReadOnly
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                            }`}
                            title={
                              isReadOnly
                                ? "Cannot edit in read-only mode"
                                : "Edit template details"
                            }
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
                      ) : !isReadOnly && isEditingName ? (
                        <>
                          <button
                            onClick={() => {
                              setIsEditingName(false);
                              setIsEditingDescription(false);
                              setEditingName(template?.name || "");
                              setEditingDescription(
                                template?.metadata?.description || ""
                              );
                              setEditingMetadata(template?.metadata || {});
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
                                await handleUpdateTemplate({
                                  name: editingName,
                                  metadata: {
                                    ...editingMetadata,
                                    description: editingDescription,
                                  },
                                });
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              } catch (error) {
                                console.error(
                                  "Error updating template:",
                                  error
                                );
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
                      ) : null}
                    </div>

                    {isEditingName ? (
                      <div className="w-full">
                        <div className="bg-white border border-gray-300 rounded-md shadow-sm focus-within:border-accent transition-colors">
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
                                await handleUpdateTemplate({
                                  name: editingName,
                                  metadata: {
                                    ...editingMetadata,
                                    description: editingDescription,
                                  },
                                });
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              } else if (e.key === "Escape") {
                                setEditingName(template?.name || "");
                                setEditingDescription(
                                  template?.metadata?.description || ""
                                );
                                setEditingMetadata(template?.metadata || {});
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
                        <div className="mt-2">
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
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = "auto";
                              target.style.height = target.scrollHeight + "px";
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && e.ctrlKey) {
                                e.preventDefault();
                                await handleUpdateTemplate({
                                  name: editingName,
                                  metadata: {
                                    ...editingMetadata,
                                    description: editingDescription,
                                  },
                                });
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              } else if (e.key === "Escape") {
                                setEditingName(template?.name || "");
                                setEditingDescription(
                                  template?.metadata?.description || ""
                                );
                                setEditingMetadata(template?.metadata || {});
                                setIsEditingName(false);
                                setIsEditingDescription(false);
                              }
                            }}
                            className="w-full px-2 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors resize-none overflow-hidden"
                            placeholder="Description"
                            style={{ minHeight: "60px" }}
                          />
                        </div>

                        {/* Metadata Sections - Compact Grid */}
                        <div className="mt-2">
                          <div>
                            <select
                              value={editingMetadata.template_type || ""}
                              onChange={(e) =>
                                setEditingMetadata((prev: any) => ({
                                  ...prev,
                                  template_type: e.target.value,
                                }))
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors bg-white appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20viewBox%3d%220%200%2024%2024%22%20fill%3d%22none%22%20stroke%3d%22%23999%22%20stroke-width%3d%222%22%3e%3cpath%20d%3d%22M6%209l6%206%206-6%22/%3e%3c/svg%3e')] bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                            >
                              <option value="">Select type</option>
                              <option value="financial">
                                Financial Analysis
                              </option>
                              <option value="operational">
                                Operational Review
                              </option>
                              <option value="legal">Legal Documentation</option>
                              <option value="technical">
                                Technical Assessment
                              </option>
                              <option value="market">Market Research</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h1 className="text-4xl font-normal text-gray-900 leading-tight">
                          {template?.name || "Untitled Template"}
                        </h1>

                        {/* Date Info */}
                        <div className="mt-3 text-[13px] text-gray-400 font-normal">
                          {template?.created_at && new Date(template.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* No Files Warning */}
                {projectId && !isLoadingFiles && files.length === 0 && (
                  <div className="mb-4 rounded-lg bg-accent-50 p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <svg
                        className="h-4 w-4 flex-shrink-0 text-accent-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-gray-900 font-medium">
                        This project doesn&apos;t have any documents yet.{" "}
                        <button
                          onClick={() => filesPanelRef.current?.open()}
                          className="font-semibold text-accent-600 hover:text-accent-700 hover:underline"
                        >
                          Upload documents
                        </button>{" "}
                        to get started.
                      </span>
                    </div>
                  </div>
                )}

                {/* Controls section */}
                <TemplateControls
                  template={template}
                  project={project}
                  isProcessing={isProcessingTemplate}
                  runs={runs}
                  selectedRun={selectedRun}
                  setSelectedRun={setSelectedRun}
                  updateRunMetadata={updateRunMetadata}
                  handleDeleteRun={handleDeleteRun}
                  handleProcessTemplate={
                    isReadOnly
                      ? async () => {}
                      : handleProcessTemplateWithValidation
                  }
                  handleStopProcessing={handleStopProcessing}
                  results={results}
                  isSaving={isSaving}
                  handleSaveResults={handleSaveResults}
                  onExportWord={handleExportWord}
                  hasFiles={isLoadingFiles ? true : files.length > 0}
                  processingSectionId={processingSectionId}
                  onShowVersionHistory={() =>
                    !isReadOnly && setShowVersionHistory(true)
                  }
                  isReadOnly={isReadOnly}
                />

                {/* Sections section */}
                <SectionList
                  key={selectedRun || "new"}
                  sections={displaySections}
                  editingSections={isReadOnly ? [] : editingSections}
                  sectionOperations={
                    isReadOnly
                      ? {
                          saving: [],
                          deleting: [],
                          adding: false,
                        }
                      : sectionOperations
                  }
                  sectionErrors={templateSectionErrors}
                  resultsErrors={resultsSectionErrors}
                  results={results}
                  updateResultMetadata={updateResultMetadata}
                  processingSectionId={processingSectionId}
                  isProcessingTemplate={isProcessingTemplate}
                  currentProgress={currentProgress}
                  selectedItem={selectedItem}
                  setSelectedItem={setSelectedItem}
                  setSelectedTag={setSelectedTag}
                  toggleSectionEdit={isReadOnly ? () => {} : toggleSectionEdit}
                  updateSection={isReadOnly ? () => {} : updateSection}
                  handleSaveSection={
                    isReadOnly ? async () => {} : handleSaveSection
                  }
                  removeSection={isReadOnly ? async () => {} : removeSection}
                  processSingleSection={
                    isReadOnly ? async () => {} : processSingleSection
                  }
                  handleAbortSection={handleAbortSection}
                  addSection={isReadOnly ? () => {} : addSection}
                  unsavedSectionsHighlight={unsavedSectionsHighlight}
                  reorderSections={reorderSections}
                  hasFiles={isLoadingFiles ? true : files.length > 0}
                  setSectionErrors={setTemplateSectionErrors}
                  isReadOnly={isReadOnly}
                  projectId={projectId}
                  onImportComplete={() => filesPanelRef.current?.refresh()}
                />
              </div>
              {/* Bottom padding for better spacing */}
              <div className="h-32"></div>
            </div>
          </div>

          {/* Fixed Side Panels */}
          {selectedItem && (
            <>
              {/* First Panel - Referenced Lines */}
              <div
                className="fixed top-0 h-screen bg-white border-l border-gray-300 shadow-sm overflow-hidden flex flex-col transform z-40"
                style={{
                  width: `${citationPanelWidth}vw`,
                  right: selectedTag ? `${contextPanelWidth}vw` : "0",
                  transition:
                    isResizingCitations || isResizingContext
                      ? "none"
                      : "all 0.2s ease-in-out",
                }}
              >
                {/* Left resize handle for citations panel */}
                <div
                  className="absolute left-0 top-0 w-2 h-full cursor-col-resize hover:bg-blue-400/50 transition-colors z-20"
                  style={{
                    backgroundColor:
                      isResizingCitations === "left"
                        ? "rgba(59, 130, 246, 0.5)"
                        : "transparent",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDragStartX(e.clientX);
                    setDragStartWidth(citationPanelWidth);
                    setIsResizingCitations("left");
                  }}
                />
                {/* No right resize handle - only context panel should resize from between panels */}
                <div className="h-16 px-4 border-b border-gray-300 bg-white flex justify-between items-center flex-shrink-0">
                  <div className="text-lg font-semibold text-gray-900">
                    Citations
                  </div>
                  <button
                    onClick={() => {
                      setSelectedItem(null);
                      setSelectedTag(null);
                    }}
                    className="text-gray-500 hover:text-accent p-1 rounded hover:bg-gray-100"
                  >
                    <svg
                      className="w-5 h-5"
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
                </div>
                <div
                  className="flex-1 overflow-y-auto"
                  style={{ scrollBehavior: "auto" }}
                >
                  <Sources
                    tags={selectedItem?.tags || []}
                    citations={
                      results[selectedItem?.sectionId || ""]?.citations || {}
                    }
                    onTagSelect={(
                      tag: string | null,
                      unitIds: string[] | null
                    ) => {
                      if (tag === null || unitIds === null) {
                        setSelectedTag(null);
                      } else {
                        setSelectedTag({
                          sectionId: selectedItem?.sectionId || "",
                          tag: tag,
                          unitIds: unitIds,
                        });
                      }
                    }}
                    selectedTag={selectedTag?.tag || null}
                  />
                </div>
              </div>

              {/* Second Panel - Context View */}
              <div
                className={`fixed top-0 right-0 h-screen bg-white border-l border-gray-300 shadow-sm overflow-hidden flex flex-col 
              transform z-50 ${
                selectedTag ? "translate-x-0" : "translate-x-full"
              }`}
                style={{
                  width: `${contextPanelWidth}vw`,
                  transition: isResizingContext
                    ? "none"
                    : "all 0.2s ease-in-out",
                }}
              >
                {/* Left resize handle for context panel */}
                <div
                  className="absolute left-0 top-0 w-2 h-full cursor-col-resize hover:bg-blue-400/50 transition-colors z-20"
                  style={{
                    backgroundColor:
                      isResizingContext === "left"
                        ? "rgba(59, 130, 246, 0.5)"
                        : "transparent",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDragStartX(e.clientX);
                    setDragStartWidth(contextPanelWidth);
                    setIsResizingContext("left");
                  }}
                />
                <div className="h-16 px-4 border-b border-gray-300 bg-white flex justify-between items-center flex-shrink-0">
                  <div className="text-lg font-semibold text-gray-900">
                    Context
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTag(null);
                    }}
                    className="text-gray-500 hover:text-accent p-1 rounded hover:bg-gray-100"
                  >
                    <svg
                      className="w-5 h-5"
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
                </div>
                {selectedTag && (
                  <div className="flex-1 overflow-hidden">
                    <Document
                      citations={
                        results[selectedTag.sectionId]?.citations || {}
                      }
                      selectedTags={[selectedTag.tag]}
                      fileCache={fileCache}
                      key={`${selectedTag.sectionId}-${selectedTag.tag}`}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Modals */}

          <TemplateModal
            isOpen={showVersionHistory}
            onClose={() => setShowVersionHistory(false)}
            initialTemplate={template}
            initialScreen="history"
            onRestore={() => window.location.reload()}
          />

          <TemplateModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            initialTemplate={template}
            initialScreen="share"
          />
        </div>

        <NotificationContainer
          notifications={notifications}
          onRemove={removeNotification}
        />
      </ErrorBoundary>
    </ProtectedRoute>
  );
}
