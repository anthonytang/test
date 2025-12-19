"use client";

import { useState, useEffect, useCallback } from "react";

interface TemplateVersion {
  version: number;
  created_at: string;
  change_type: string;
  change_description: string;
  field_count: number;
}

interface TemplateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
  onRestore?: (version: number) => Promise<void>;
}

export default function TemplateHistoryModal({
  isOpen,
  onClose,
  templateId,
  templateName,
  onRestore,
}: TemplateHistoryModalProps) {
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Close restore confirmation first if it's open
        if (showRestoreConfirm) {
          setShowRestoreConfirm(false);
          setSelectedVersion(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("keydown", handleEscKey);
      };
    }
    return undefined;
  }, [isOpen, onClose, showRestoreConfirm]);

  const loadVersionHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/templates/${templateId}/history`);
      if (!response.ok) throw new Error("Failed to load history");
      const history = await response.json();
      setVersions(history);
    } catch (error) {
      console.error("Error loading template history:", error);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (isOpen && templateId) {
      loadVersionHistory();
    }
  }, [isOpen, templateId, loadVersionHistory]);

  const handleRestoreClick = (version: number) => {
    setSelectedVersion(version);
    setShowRestoreConfirm(true);
  };

  const handleConfirmRestore = async () => {
    if (selectedVersion === null) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/templates/${templateId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selectedVersion }),
      });
      if (!response.ok) throw new Error("Failed to restore version");

      // Reload history to show the new restore version
      await loadVersionHistory();

      // Call parent's onRestore if provided to refresh the template
      if (onRestore) {
        await onRestore(selectedVersion);
      }

      setShowRestoreConfirm(false);
      setSelectedVersion(null);
    } catch (error) {
      console.error("Error restoring template version:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case "created":
        return (
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
              d="M12 4v16m8-8H4"
            />
          </svg>
        );
      case "field_added":
        return (
          <svg
            className="h-4 w-4 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        );
      case "field_deleted":
        return (
          <svg
            className="h-4 w-4 text-red-500"
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
        );
      case "field_updated":
        return (
          <svg
            className="h-4 w-4 text-yellow-500"
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
        );
      case "renamed":
        return (
          <svg
            className="h-4 w-4 text-purple-500"
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
        );
      case "restored":
        return (
          <svg
            className="h-4 w-4 text-indigo-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="h-4 w-4 text-gray-500"
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
        );
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-sm flex flex-col">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl text-gray-900 font-light">
                  Template History
                </h2>
                <p className="text-sm text-gray-500 mt-1">{templateName}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg
                  className="animate-spin h-8 w-8 text-accent"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No version history available
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.version}
                    className={`p-4 rounded-lg border transition-colors ${
                      index === 0
                        ? "border-accent-200 bg-accent-50"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getChangeIcon(version.change_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              Version {version.version}
                            </span>
                            {index === 0 && (
                              <span className="px-2 py-0.5 text-xs bg-accent text-white rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {version.change_description}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            <span>{formatDate(version.created_at)}</span>
                            <span>
                              {version.field_count} section
                              {version.field_count !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRestoreClick(version.version)}
                          className="p-2 text-accent hover:bg-accent hover:text-white border border-accent rounded-lg transition-colors"
                          title="Restore this version"
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
                              strokeWidth="2"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-sm">
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Restore to Version {selectedVersion}?
            </h3>
            <p className="text-base text-gray-600 mb-6">
              Replace current sections with version {selectedVersion}.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRestoreConfirm(false);
                  setSelectedVersion(null);
                }}
                disabled={isRestoring}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-600 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isRestoring && (
                  <svg
                    className="animate-spin h-4 w-4"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
