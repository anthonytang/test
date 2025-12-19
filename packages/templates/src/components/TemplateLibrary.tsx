"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTemplates } from "@studio/templates";
import ShareTemplateModal from "./ShareTemplateModal";

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  projectTemplateIds?: string[];
  onSelectTemplates?: (
    templateIdsToAdd: string[],
    templateIdsToRemove?: string[]
  ) => void;
}

export default function TemplateLibrary({
  isOpen,
  onClose,
  title = "Template Library",
  projectTemplateIds = [],
  onSelectTemplates,
}: TemplateLibraryProps) {
  const { templates, loading, error, deleteTemplate, shareTemplate, refresh } =
    useTemplates();
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingTemplateIds, setDeletingTemplateIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedTemplateForShare, setSelectedTemplateForShare] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const lastProjectTemplateIdsRef = useRef<string[]>([]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        // Only close the library if share modal is not open
        if (!isShareModalOpen) {
          onClose();
        } else {
          // If share modal is open, close it first
          setIsShareModalOpen(false);
          setSelectedTemplateForShare(null);
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
      return () => document.removeEventListener("keydown", handleEscKey);
    }
    return undefined;
  }, [isOpen, onClose, isShareModalOpen]);

  // Track if modal was previously open
  const wasOpenRef = useRef(false);

  // Refresh when modal opens or project templates change
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    // Always refresh when modal first opens
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      refresh();
      lastProjectTemplateIdsRef.current = projectTemplateIds;
      return;
    }

    // Also refresh if project templates changed while open
    const projectIdsChanged =
      JSON.stringify(lastProjectTemplateIdsRef.current) !==
      JSON.stringify(projectTemplateIds);

    if (projectIdsChanged) {
      lastProjectTemplateIdsRef.current = projectTemplateIds;
      refresh();
    }
  }, [isOpen, projectTemplateIds, refresh]);

  // Filter templates based on search
  const filteredTemplates = useMemo(() => {
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.metadata?.description &&
          template.metadata.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()))
    );
  }, [templates, searchQuery]);

  const handleDeleteTemplate = async (
    templateId: string,
    templateName: string
  ) => {
    try {
      setDeletingTemplateIds((prev) => new Set(prev).add(templateId));
      await deleteTemplate(templateId, templateName);
    } catch (err) {
      // Error already handled in hook
    } finally {
      setDeletingTemplateIds((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  };

  const handleOpenShareModal = (templateId: string, templateName: string) => {
    setSelectedTemplateForShare({ id: templateId, name: templateName });
    setIsShareModalOpen(true);
  };

  const handleShareTemplate = async (recipientEmail: string) => {
    if (!selectedTemplateForShare) return;

    try {
      await shareTemplate(selectedTemplateForShare.id, recipientEmail);
      setIsShareModalOpen(false);
      setSelectedTemplateForShare(null);
    } catch (err) {
      // Error already handled in hook
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-sm transform transition-all max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <h2 className="text-2xl text-gray-900 font-light">{title}</h2>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
                  title="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-6 pb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search templates"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-0 py-2 text-sm text-gray-900 bg-transparent border-0 border-b border-gray-300 focus:border-accent focus:ring-0 focus:outline-none transition-colors"
              />
              <svg
                className="absolute right-0 top-2.5 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
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
                    d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-gray-500">{error}</p>
                <button
                  onClick={refresh}
                  className="mt-4 text-accent hover:text-accent-600"
                >
                  Try again
                </button>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="w-12 h-12 text-gray-300 mx-auto mb-4"
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
                <p className="text-gray-500 text-sm">
                  {searchQuery ? "No templates found" : "No templates yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="group relative flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-300 hover:bg-gray-50/50 transition-all"
                  >
                    {/* Template Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-accent-50 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-accent"
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
                    </div>

                    {/* Template Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900 truncate pr-2">
                          {template.name}
                        </h4>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(template.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {template.metadata?.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {template.metadata.description}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          handleOpenShareModal(template.id, template.name)
                        }
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                        title="Share template"
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

                      <button
                        onClick={() =>
                          handleDeleteTemplate(template.id, template.name)
                        }
                        disabled={deletingTemplateIds.has(template.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          deletingTemplateIds.has(template.id)
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                        }`}
                        title="Delete template"
                      >
                        {deletingTemplateIds.has(template.id) ? (
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
                              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share Template Modal */}
      {selectedTemplateForShare && (
        <ShareTemplateModal
          templateId={selectedTemplateForShare.id}
          templateName={selectedTemplateForShare.name}
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setSelectedTemplateForShare(null);
          }}
          onShare={handleShareTemplate}
        />
      )}
    </>
  );
}
