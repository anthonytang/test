"use client";

import { useRef, useState, useEffect } from "react";
import { ProjectWithPermissions, hasPermission, Template } from "@studio/core";
import { azureApiClient } from "@studio/api";

interface TemplateControlsProps {
  template: Template | null;
  project: ProjectWithPermissions | null;
  isProcessing: boolean;
  // Runs props
  runs: Array<{
    id: string;
    created_at: string;
    status: string;
    metadata?: { name?: string; description?: string; [key: string]: any };
    template_id?: string;
  }>;
  selectedRun: string | null;
  setSelectedRun:
    | ((runId: string | null) => void)
    | React.Dispatch<React.SetStateAction<string | null>>;
  setRuns?: React.Dispatch<React.SetStateAction<Array<any>>>;
  handleDeleteRun?: (runId: string) => void;
  // Actions
  handleProcessTemplate: () => Promise<void>;
  handleStopProcessing: () => void;
  // Additional props for action buttons
  results: Record<string, any>;
  isSaving: boolean;
  handleSaveResults: () => Promise<void>;
  // New export handlers
  onExportWord?: () => void;
  hasFiles?: boolean;
  processingFieldId?: string | null; // Single field ID that's processing
  // Version history
  onShowVersionHistory?: () => void;
  isReadOnly?: boolean; // Disable editing when viewing historical runs
  // File selection info
  selectedFileCount?: number;
  totalFileCount?: number;
  onOpenFilesPanel?: () => void;
}

export const TemplateControls: React.FC<TemplateControlsProps> = ({
  project,
  isProcessing,
  runs,
  selectedRun,
  setSelectedRun,
  setRuns,
  handleDeleteRun: handleDeleteRunProp,
  handleProcessTemplate,
  handleStopProcessing,
  results,
  isSaving,
  handleSaveResults,
  onExportWord,
  hasFiles = true,
  processingFieldId = null,
  onShowVersionHistory,
  isReadOnly = false,
  selectedFileCount,
  totalFileCount,
  onOpenFilesPanel,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEditingRun, setIsEditingRun] = useState(false);
  const [editingRunName, setEditingRunName] = useState("");
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Check if user can run templates on this project
  const canRunTemplates = project?.user_role
    ? hasPermission(project.user_role, "run_templates")
    : true; // Default to true for backward compatibility

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [showExportMenu]);

  const handleStartEditingRun = () => {
    if (selectedRun) {
      const run = runs.find((r) => r.id === selectedRun);
      if (run) {
        setIsEditingRun(true);
        setEditingRunId(selectedRun);
        setEditingRunName(
          run.metadata?.name || new Date(run.created_at).toLocaleString()
        );
      }
    }
  };

  const handleSaveRunName = async () => {
    if (!editingRunId || !editingRunName.trim()) return;

    try {
      const updatePayload = {
        metadata: {
          ...runs.find((r) => r.id === editingRunId)?.metadata,
          name: editingRunName.trim(),
        },
      };

      await azureApiClient.updateRun(editingRunId, updatePayload);

      // Update the runs list locally
      if (setRuns) {
        setRuns((prevRuns) =>
          prevRuns.map((run) =>
            run.id === editingRunId
              ? {
                  ...run,
                  metadata: { ...run.metadata, name: editingRunName.trim() },
                }
              : run
          )
        );
      }

      setIsEditingRun(false);
      setEditingRunId(null);
      setEditingRunName("");
    } catch (error) {
      console.error("Error renaming run:", error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingRun(false);
    setEditingRunId(null);
    setEditingRunName("");
  };

  // Use the prop if provided (from useResults hook - handles state correctly)
  // Fall back to local implementation for backwards compatibility
  const handleDeleteRun = (runId: string) => {
    if (handleDeleteRunProp) {
      handleDeleteRunProp(runId);
      return;
    }

    // Fallback: Optimistic update - update UI immediately
    if (setRuns) {
      setRuns((prevRuns) => {
        const updatedRuns = prevRuns.filter((run) => run.id !== runId);
        if (selectedRun === runId) {
          const nextRun = updatedRuns.length > 0 ? updatedRuns[0] : null;
          setSelectedRun(nextRun?.id || null);
        }
        return updatedRuns;
      });
    }

    azureApiClient.deleteRun(runId).catch((error) => {
      console.error("Error deleting run:", error);
    });
  };

  return (
    <div className="mb-8">
      <div className="space-y-2">
        {/* Controls row */}
        <div className="flex items-end gap-4">
          {/* Action buttons */}
          <div className="flex items-center gap-4">
            {/* Process/Stop button */}
            <button
              onClick={
                isProcessing ? handleStopProcessing : handleProcessTemplate
              }
              disabled={
                isReadOnly ||
                !canRunTemplates ||
                (!hasFiles && !isProcessing) ||
                (!isProcessing && processingFieldId !== null)
              }
              className={`h-9 w-24 rounded-lg flex items-center justify-center transition-colors ${
                isReadOnly ||
                !canRunTemplates ||
                (!hasFiles && !isProcessing) ||
                (!isProcessing && processingFieldId !== null)
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : isProcessing
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-accent text-white hover:bg-accent-600"
              }`}
            >
              {isProcessing ? (
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isSaving || Object.keys(results).length === 0}
                className={`h-9 w-24 rounded-lg flex items-center justify-center transition-colors ${
                  isSaving || Object.keys(results).length === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-accent text-white hover:bg-accent-600"
                }`}
                title="Export results"
              >
                {isSaving ? (
                  <svg
                    className="h-4 w-4 animate-spin"
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
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <div className="flex items-center gap-1">
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
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <svg
                      className="h-3 w-3"
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
                  </div>
                )}
              </button>

              {/* Export Menu */}
              {showExportMenu &&
                !isSaving &&
                Object.keys(results).length > 0 && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-300 py-1 z-10">
                    <button
                      onClick={() => {
                        handleSaveResults();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg
                        className="h-4 w-4 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Export to Excel
                    </button>
                    <button
                      onClick={() => {
                        if (onExportWord) {
                          onExportWord();
                          setShowExportMenu(false);
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg
                        className="h-4 w-4 text-accent"
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
                      Export to Word
                    </button>
                  </div>
                )}
            </div>

            {/* Version History button - hide in read-only mode */}
            {!isReadOnly && (
              <button
                onClick={onShowVersionHistory}
                className="h-9 w-9 rounded-lg flex items-center justify-center bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                title="Version history"
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Runs Selector */}
          <div className="relative">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 font-medium">
              Run History
            </label>
            {isEditingRun && selectedRun ? (
              // Inline editing mode
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveRunName();
                    } else if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                  className="h-9 w-52 px-3 bg-white border border-accent rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                  autoFocus
                />
                <button
                  onClick={handleSaveRunName}
                  className="h-9 px-3 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
                  title="Save"
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
                <button
                  onClick={handleCancelEdit}
                  className="h-9 px-3 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
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
              </div>
            ) : (
              // Normal dropdown mode
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={selectedRun || ""}
                    onChange={(e) => setSelectedRun(e.target.value || null)}
                    className="h-9 w-52 px-3 bg-white border border-gray-300 rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="">New analysis</option>
                    {runs.map((run) => {
                      // Use the name from metadata if available, otherwise fall back to timestamp
                      const displayName =
                        run.metadata?.name ||
                        new Date(run.created_at).toLocaleString();

                      return (
                        <option key={run.id} value={run.id}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                    <svg
                      className="h-4 w-4 text-gray-400"
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
                  </div>
                </div>

                {/* Rename and Delete buttons */}
                {selectedRun && (
                  <>
                    <button
                      onClick={handleStartEditingRun}
                      className="h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                      title="Rename run"
                    >
                      <svg
                        className="h-4 w-4 text-gray-600"
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
                    <button
                      onClick={() => handleDeleteRun(selectedRun)}
                      className="h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm hover:bg-red-50 hover:border-red-200 transition-colors"
                      title="Delete run"
                    >
                      <svg
                        className="h-4 w-4 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* File selection indicator - below controls */}
        {!isReadOnly && totalFileCount !== undefined && totalFileCount > 0 && (
          <button
            onClick={onOpenFilesPanel}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mt-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={selectedFileCount === totalFileCount ? "" : "text-amber-600"}>
              {selectedFileCount === totalFileCount
                ? `${totalFileCount} files`
                : `${selectedFileCount}/${totalFileCount} files`
              }
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
