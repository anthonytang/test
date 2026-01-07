"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ProjectWithPermissions,
  Template,
} from "@studio/core";
import { useAuthUser, ProtectedRoute } from "@studio/auth";
import { azureApiClient } from "@studio/api";
import { useNotifications, NotificationContainer } from "@studio/notifications";
import { FilesPanel } from "@studio/storage";
import { TemplateCard, AppHeader, Skeleton, TemplateCardSkeleton } from "@studio/ui";
import { TemplateModal } from "@studio/templates";

// Project type colors and labels
const PROJECT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  "M&A": { label: "M&A", color: "bg-blue-100 text-blue-700" },
  capital_raise: { label: "Capital Raise", color: "bg-green-100 text-green-700" },
  equity_research: { label: "Equity Research", color: "bg-purple-100 text-purple-700" },
  investment_memo: { label: "Investment Memo", color: "bg-orange-100 text-orange-700" },
  due_diligence: { label: "Due Diligence", color: "bg-yellow-100 text-yellow-700" },
  portfolio_analysis: { label: "Portfolio", color: "bg-pink-100 text-pink-700" },
  market_research: { label: "Market Research", color: "bg-cyan-100 text-cyan-700" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

// Edit state type
interface EditState {
  name: string;
  description: string;
  metadata: Record<string, any>;
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { getUserId, isAuthenticated, loading: authLoading } = useAuthUser();
  const { showSuccess, showError, notifications, removeNotification } =
    useNotifications();

  // Core state
  const [project, setProject] = useState<ProjectWithPermissions | null>(null);
  const [projectTemplates, setProjectTemplates] = useState<Template[]>([]);
  const [templateSectionCounts, setTemplateSectionCounts] = useState<Map<string, number>>(new Map());
  const [removingTemplates, setRemovingTemplates] = useState<Set<string>>(new Set());

  // Edit state - null when not editing
  const [editState, setEditState] = useState<EditState | null>(null);

  // Template modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Load all project data atomically
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    const loadProjectData = async () => {
      const userId = getUserId();
      if (!userId || !projectId) return;

      try {
        // Load project and templates in parallel
        const [projectData, projectTemplatesData] = await Promise.all([
          azureApiClient.getProjectWithPermissions(projectId, userId),
          azureApiClient.getTemplatesForProject(projectId),
        ]);

        // Load section counts in parallel
        const sectionCounts = new Map<string, number>();
        if (projectTemplatesData && projectTemplatesData.length > 0) {
          const results = await Promise.all(
            projectTemplatesData.map((template) =>
              azureApiClient
                .getTemplateWithSections(template.id)
                .then((data) => ({ id: template.id, count: data?.sections?.length || 0 }))
                .catch(() => ({ id: template.id, count: 0 }))
            )
          );
          results.forEach(({ id, count }) => sectionCounts.set(id, count));
        }

        // Set all state atomically
        setProject(projectData);
        setProjectTemplates(projectTemplatesData || []);
        setTemplateSectionCounts(sectionCounts);
      } catch (error) {
        console.error("Error loading project data:", error);
        showError("Load Error", "Failed to load project data");
      }
    };

    loadProjectData();
  }, [projectId, authLoading, isAuthenticated, getUserId, showError]);

  // Computed values
  const totalSectionCount = Array.from(templateSectionCounts.values()).reduce((a, b) => a + b, 0);
  const isEditing = editState !== null;

  // Start editing
  const startEditing = useCallback(() => {
    if (!project) return;
    setEditState({
      name: project.name,
      description: project.metadata?.description || "",
      metadata: project.metadata || {},
    });
  }, [project]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditState(null);
  }, []);

  // Save edits
  const saveEdits = useCallback(async () => {
    if (!editState || !project) return;

    const userId = getUserId();
    if (!userId) {
      showError("Update Error", "User not authenticated");
      return;
    }

    try {
      const updatePayload = {
        name: editState.name,
        metadata: { ...editState.metadata, description: editState.description },
      };

      await azureApiClient.updateProject(projectId, updatePayload, userId);

      setProject((prev) => prev ? { ...prev, ...updatePayload } : prev);
      setEditState(null);
      showSuccess("Project Updated", "Project updated successfully");
    } catch (error) {
      console.error("Error updating project:", error);
      showError("Update Error", "Failed to update project");
    }
  }, [editState, project, projectId, getUserId, showError, showSuccess]);

  // Remove single template
  const handleRemoveTemplate = useCallback(async (templateId: string) => {
    const originalTemplates = projectTemplates;
    const originalCounts = new Map(templateSectionCounts);

    try {
      setRemovingTemplates((prev) => new Set(prev).add(templateId));
      setProjectTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setTemplateSectionCounts((prev) => {
        const next = new Map(prev);
        next.delete(templateId);
        return next;
      });

      await azureApiClient.removeTemplatesFromProject(projectId, [templateId]);
      showSuccess("Template Removed", "Template removed from project");
    } catch (error) {
      console.error("Error removing template:", error);
      setProjectTemplates(originalTemplates);
      setTemplateSectionCounts(originalCounts);
      showError("Template Error", "Failed to remove template from project");
    } finally {
      setRemovingTemplates((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  }, [projectId, projectTemplates, templateSectionCounts, showError, showSuccess]);

  // Handle template added to project
  const handleTemplateAdded = useCallback(async (templateId: string, _projectId: string) => {
    setIsTemplateModalOpen(false);
    // Redirect to the template page
    router.push(`/projects/${projectId}/templates/${templateId}`);
  }, [router, projectId]);

  // Show skeleton while loading
  if (!project) {
    return (
      <ProtectedRoute>
        <div className="h-screen flex flex-col bg-white">
          <div className="h-16 px-4 flex items-center justify-between border-b border-gray-300">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-20 h-5" />
            </div>
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
          <div className="flex-1 flex overflow-hidden">
            <div className="w-[20%] min-w-[240px] max-w-[320px] border-r border-gray-300 p-4 space-y-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex-1 p-6 bg-surface">
              <div className="mb-8 mt-4">
                <Skeleton className="h-12 w-96 mb-3" />
                <Skeleton className="h-5 w-64" />
              </div>
              <div className="mb-4">
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-3">
                {[1, 2, 3].map((i) => (
                  <TemplateCardSkeleton key={i} />
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
      <div className="h-screen flex flex-col bg-white">
        {/* Header - full width */}
        <AppHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: project.name },
          ]}
        />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Files */}
          <div className="w-[20%] min-w-[240px] max-w-[320px] flex-shrink-0">
            <FilesPanel projectId={projectId} className="h-full" />
          </div>

          {/* Right Panel - Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-surface">
            {/* Project Header */}
            <div className="mb-8 mt-4">
              <div className="group relative">
                {isEditing && editState ? (
                  <div className="w-full">
                    {/* Edit controls - aligned to the right like the edit button */}
                    <div className="flex justify-end mb-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-100 transition-colors"
                          title="Cancel"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <button
                          onClick={saveEdits}
                          disabled={!editState?.name.trim()}
                          className="p-1.5 rounded-md text-green-500 hover:text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                          title="Save changes"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Edit Name */}
                    <div className="bg-white border border-gray-300 rounded-md shadow-sm focus-within:border-accent transition-colors">
                      <textarea
                        value={editState.name}
                        onChange={(e) => {
                          setEditState({ ...editState, name: e.target.value });
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && editState.name.trim()) {
                            e.preventDefault();
                            saveEdits();
                          } else if (e.key === "Escape") {
                            cancelEditing();
                          }
                        }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                            el.focus();
                            el.setSelectionRange(el.value.length, el.value.length);
                          }
                        }}
                        className="resize-none overflow-hidden w-full px-4 py-3 text-4xl font-normal text-gray-900 bg-transparent focus:outline-none rounded-md"
                        style={{ minHeight: "60px", lineHeight: "1.2" }}
                        placeholder="Project name"
                      />
                    </div>

                    {/* Edit Description */}
                    <div className="mt-2">
                      <textarea
                        value={editState.description}
                        onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = "auto";
                          target.style.height = target.scrollHeight + "px";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.ctrlKey) {
                            e.preventDefault();
                            saveEdits();
                          } else if (e.key === "Escape") {
                            cancelEditing();
                          }
                        }}
                        ref={(el) => {
                          if (el) {
                            setTimeout(() => {
                              el.style.height = "auto";
                              el.style.height = el.scrollHeight + "px";
                            }, 0);
                          }
                        }}
                        className="w-full px-2 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors resize-none overflow-hidden"
                        placeholder="Description"
                        style={{ minHeight: "60px" }}
                      />
                    </div>

                    {/* Metadata */}
                    <div className="mt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">Project Type</label>
                          <select
                            value={editState.metadata.project_type || ""}
                            onChange={(e) => setEditState({
                              ...editState,
                              metadata: { ...editState.metadata, project_type: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors bg-white"
                          >
                            <option value="">Select type</option>
                            <option value="M&A">Mergers & Acquisitions</option>
                            <option value="capital_raise">Capital Raise</option>
                            <option value="equity_research">Equity Research</option>
                            <option value="due_diligence">Due Diligence</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">Industry</label>
                          <select
                            value={editState.metadata.industry_focus || ""}
                            onChange={(e) => setEditState({
                              ...editState,
                              metadata: { ...editState.metadata, industry_focus: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:border-accent transition-colors bg-white"
                          >
                            <option value="">Select industry</option>
                            <option value="Technology">Technology</option>
                            <option value="Healthcare">Healthcare</option>
                            <option value="Finance">Finance</option>
                            <option value="Energy">Energy</option>
                            <option value="Consumer Goods">Consumer Goods</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start gap-3">
                      <h1 className="text-4xl font-normal text-gray-900 leading-tight flex-1">
                        {project.name}
                      </h1>
                      <button
                        onClick={startEditing}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit project"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>

                    {project.metadata?.description && (
                      <p className="mt-2 text-sm text-gray-600">{project.metadata.description}</p>
                    )}

                    {/* Date & Metadata Info - OpenAI style */}
                    <div className="mt-3 flex items-center text-[13px] text-gray-400 font-normal">
                      <span>
                        {new Date(project.updated_at || project.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {project.metadata?.project_type && (
                        <>
                          <span className="mx-2">•</span>
                          <span>
                            {PROJECT_TYPE_CONFIG[project.metadata.project_type]?.label || project.metadata.project_type}
                          </span>
                        </>
                      )}
                      {project.metadata?.industry_focus && (
                        <>
                          <span className="mx-2">•</span>
                          <span>{project.metadata.industry_focus}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Templates Section */}
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
                <p className="text-sm text-gray-500">
                  {projectTemplates.length} template{projectTemplates.length !== 1 ? "s" : ""}
                  {totalSectionCount > 0 && ` • ${totalSectionCount} section${totalSectionCount !== 1 ? "s" : ""}`}
                </p>
              </div>

              {/* Template Grid or Empty State */}
              {projectTemplates.length === 0 ? (
                <button
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="w-full flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-gray-300 rounded-xl bg-white hover:border-gray-400 hover:bg-gray-50/50 transition-colors group"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
                    <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-gray-900 mb-1">Add a template</h3>
                  <p className="text-sm text-gray-500">
                    Templates define what to extract from your documents
                  </p>
                </button>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-3">
                  {projectTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      id={template.id}
                      name={template.name}
                      description={template.metadata?.description}
                      onClick={() => router.push(`/projects/${projectId}/templates/${template.id}`)}
                      onDelete={handleRemoveTemplate}
                      isDeleting={removingTemplates.has(template.id)}
                    />
                  ))}
                  {/* Add template card */}
                  <div className="aspect-square">
                    <button
                      onClick={() => setIsTemplateModalOpen(true)}
                      className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors group"
                    >
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <NotificationContainer
          notifications={notifications}
          onRemove={removeNotification}
        />

        {/* Template Modal */}
        <TemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          projectId={projectId}
          onTemplateAdded={handleTemplateAdded}
        />
      </div>
    </ProtectedRoute>
  );
}
