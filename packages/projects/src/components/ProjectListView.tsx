import React, { memo, useState, useMemo, useCallback } from "react";
import { useAuth } from "@studio/auth";
import { Project, ProjectWithPermissions, getProjectTypeClasses } from "@studio/core";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

interface ProjectListViewProps {
  projects: (Project | ProjectWithPermissions)[];
  onProjectClick: (project: Project) => void;
  onCreateNew: () => void;
  onUpdate?: (
    projectId: string,
    name: string,
    description: string
  ) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  onUpdateMetadata?: (projectId: string, metadata: any) => Promise<void>;
  onShare?: (project: ProjectWithPermissions) => void;
  isCreatingProject: boolean;
  isLoading?: boolean;
}

type SortDirection = "asc" | "desc";
type SortField =
  | "name"
  | "deal_stage"
  | "updated_at"
  | "user_id";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "M&A": "Mergers & Acquisitions",
  capital_raise: "Capital Raise",
  equity_research: "Equity Research",
  investment_memo: "Investment Memo",
  due_diligence: "Due Diligence",
  portfolio_analysis: "Portfolio Analysis",
  market_research: "Market Research",
  other: "Other",
};

const STAGE_LABELS: Record<string, string> = {
  prospecting: "Prospecting",
  initial_review: "Initial Review",
  due_diligence: "Due Diligence",
  negotiation: "Negotiation",
  closing: "Closing",
  post_merger: "Post-Merger",
  monitoring: "Monitoring",
};

function ProjectListViewComponent({
  projects,
  onProjectClick,
  onCreateNew,
  onDelete,
  onUpdateMetadata,
  // onShare,
  isCreatingProject,
}: ProjectListViewProps) {
  const { user } = useAuth();
  const [sortField, _setSortField] = useState<SortField>("updated_at");
  const [sortDirection, _setSortDirection] = useState<SortDirection>("desc");

  // Helper to check if project has permission data
  const isProjectWithPermissions = (
    project: Project | ProjectWithPermissions
  ): project is ProjectWithPermissions => {
    return "user_role" in project;
  };
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    // Initialize with only inactive project types collapsed by default
    const allTypes = [
      "M&A",
      "capital_raise",
      "equity_research",
      "investment_memo",
      "due_diligence",
      "portfolio_analysis",
      "market_research",
      "other",
    ];
    const initialCollapsed = new Set<string>();

    // Only add inactive versions - active projects will be expanded
    allTypes.forEach((type) => {
      initialCollapsed.add(`${type}-inactive`);
    });

    return initialCollapsed;
  });

  // Filter projects based on metadata.is_active
  const activeProjects = projects.filter((p) => {
    if (p.metadata && typeof p.metadata.is_active === "boolean") {
      return p.metadata.is_active;
    }
    return true; // Default to active if no metadata
  });

  const inactiveProjects = projects.filter((p) => {
    return p.metadata && p.metadata.is_active === false;
  });

  // Group projects by type
  const groupProjectsByType = useCallback(
    (projectList: Project[]) => {
      const groups: Record<string, Project[]> = {};

      projectList.forEach((project) => {
        const type = project.metadata?.project_type || "other";
        if (!groups[type]) {
          groups[type] = [];
        }
        groups[type].push(project);
      });

      // Sort projects within each group
      Object.keys(groups).forEach((type) => {
        if (!groups[type]) {
          return;
        }
        groups[type].sort((a, b) => {
          const aValue = (a as any)[sortField] || a.metadata?.[sortField] || "";
          const bValue = (b as any)[sortField] || b.metadata?.[sortField] || "";

          if (sortDirection === "asc") {
            return aValue > bValue ? 1 : -1;
          } else {
            return aValue < bValue ? 1 : -1;
          }
        });
      });

      return groups;
    },
    [sortField, sortDirection]
  );

  const activeGroupedProjects = useMemo(
    () => groupProjectsByType(activeProjects),
    [activeProjects, groupProjectsByType]
  );
  const inactiveGroupedProjects = useMemo(
    () => groupProjectsByType(inactiveProjects),
    [inactiveProjects, groupProjectsByType]
  );

  const toggleGroup = (groupKey: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupKey)) {
      newCollapsed.delete(groupKey);
    } else {
      newCollapsed.add(groupKey);
    }
    setCollapsedGroups(newCollapsed);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const ProjectRow = ({
    project,
  }: // isInactive,
  {
    project: Project;
    // isInactive?: boolean;
  }) => {
    const isActive = project.metadata?.is_active !== false;

    const handleToggleActive = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onUpdateMetadata) {
        await onUpdateMetadata(project.id, {
          ...project.metadata,
          is_active: !isActive,
        });
      }
    };

    return (
      <div className="group relative">
        {/* Main content area using full width */}
        <div
          className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-lg transition-all duration-200 cursor-pointer border border-gray-300"
          onClick={() => onProjectClick(project)}
        >
          {/* Project Type Icon/Badge */}
          <div className="flex-shrink-0">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${getProjectTypeClasses(project.metadata?.project_type)}`}
            >
              {project.metadata?.project_type === "M&A" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              ) : project.metadata?.project_type === "equity_research" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              ) : project.metadata?.project_type === "due_diligence" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              ) : project.metadata?.project_type === "capital_raise" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : project.metadata?.project_type === "investment_memo" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              ) : project.metadata?.project_type === "portfolio_analysis" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                  />
                </svg>
              ) : project.metadata?.project_type === "market_research" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm truncate">
                {project.name}
              </h3>
              {/* Status indicator */}
              {project.metadata?.deal_stage && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    project.metadata.deal_stage === "closing"
                      ? "bg-green-100 text-green-700"
                      : project.metadata.deal_stage === "negotiation"
                      ? "bg-yellow-100 text-yellow-700"
                      : project.metadata.deal_stage === "due_diligence"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {STAGE_LABELS[project.metadata.deal_stage] ||
                    project.metadata.deal_stage}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formatDate(project.updated_at || project.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {isProjectWithPermissions(project) &&
                project.user_role === "owner"
                  ? user?.username || "You"
                  : isProjectWithPermissions(project)
                  ? `${user?.username || "You"} (${project.user_role})`
                  : user?.username || "You"}
              </span>
              {isProjectWithPermissions(project) &&
                (project.user_role === "owner" &&
                project.shared_with_count &&
                project.shared_with_count > 0 ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <svg
                      className="w-3 h-3"
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
                    Shared with {project.shared_with_count}{" "}
                    {project.shared_with_count === 1 ? "person" : "people"}
                  </span>
                ) : project.is_shared ? (
                  <span className="flex items-center gap-1 text-accent">
                    <svg
                      className="w-3 h-3"
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
                    Shared with you
                  </span>
                ) : null)}
            </div>
          </div>

          {/* Action buttons inside the card - only show for project owners */}
          {(!isProjectWithPermissions(project) ||
            project.user_role === "owner") && (
            <div className="flex items-center gap-2 transition-opacity duration-200">
              {/* Share button - only show if sharing is available and project has permissions */}
              {/* {onShare && isProjectWithPermissions(project) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShare(project);
                  }}
                  className="p-1.5 rounded-md text-gray-400 hover:text-accent hover:bg-accent-100 transition-colors"
                  title="Share project"
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
                </button>
              )} */}

              {/* Archive button */}
              <button
                onClick={handleToggleActive}
                className="p-1.5 rounded-md text-gray-400 hover:text-accent hover:bg-accent-100 transition-colors"
                title={isActive ? "Archive project" : "Activate project"}
              >
                {isActive ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
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
                      strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </button>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-100 transition-colors"
                title="Delete project"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ProjectGroup = ({
    type,
    projects: groupProjects,
    isInactive = false,
  }: {
    type: string;
    projects: Project[];
    isInactive?: boolean;
  }) => {
    const isCollapsed = collapsedGroups.has(
      `${type}-${isInactive ? "inactive" : "active"}`
    );

    return (
      <div className="mb-6">
        <button
          onClick={() =>
            toggleGroup(`${type}-${isInactive ? "inactive" : "active"}`)
          }
          className="flex items-center gap-2 mb-3 group"
        >
          <div className="p-1 rounded transition-all hover:bg-gray-100">
            {isCollapsed ? (
              <ChevronRightIcon className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {PROJECT_TYPE_LABELS[type] || type}
          </span>
          <span className="text-sm text-gray-400">
            ({groupProjects.length})
          </span>
        </button>

        {!isCollapsed && (
          <div className="space-y-2">
            {groupProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                // isInactive={isInactive}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Projects Section */}
      <div className="mb-12 pt-4">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-4xl text-accent">Projects</h1>
          <button
            onClick={onCreateNew}
            disabled={isCreatingProject}
            className="group relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            title="New Project"
          >
            {isCreatingProject ? (
              <svg
                className="animate-spin h-5 w-5 text-blue-600"
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
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5 text-blue-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            )}
          </button>
        </div>

        <div className="min-h-[200px]">
          {Object.keys(activeGroupedProjects).length === 0 ? (
            <button
              onClick={() => onCreateNew()}
              className="w-full py-16 border-2 border-dashed border-gray-300 rounded-lg hover:border-accent hover:bg-accent-50/30 transition-all duration-200 group"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-accent-100 flex items-center justify-center transition-colors">
                  <svg
                    className="w-6 h-6 text-gray-400 group-hover:text-accent transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-gray-600 font-medium group-hover:text-gray-900">
                    Create a project
                  </p>
                </div>
              </div>
            </button>
          ) : (
            Object.entries(activeGroupedProjects).map(([type, projects]) => (
              <ProjectGroup key={type} type={type} projects={projects} />
            ))
          )}
        </div>
      </div>

      {/* Inactive Projects Section */}
      <div className="mb-12">
        <div className="mb-6">
          <h1 className="text-4xl bg-gradient-to-r from-gray-600 to-gray-800 text-transparent bg-clip-text">
            Inactive
          </h1>
        </div>

        <div className="min-h-[150px]">
          {Object.entries(inactiveGroupedProjects).map(([type, projects]) => (
            <ProjectGroup
              key={type}
              type={type}
              projects={projects}
              isInactive
            />
          ))}
        </div>
      </div>
    </>
  );
}

export const ProjectListView = memo(ProjectListViewComponent);
