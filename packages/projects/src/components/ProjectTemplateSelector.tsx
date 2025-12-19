"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Template } from "@studio/core";
import { azureApiClient } from "@studio/api";
import { useAuth } from "@studio/auth";

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplates: (
    templateIdsToAdd: string[],
    templateIdsToRemove?: string[]
  ) => void;
  projectTemplateIds: string[];
  title?: string;
}

export default function TemplateLibrary({
  isOpen,
  onClose,
  onSelectTemplates,
  projectTemplateIds = [],
  title = "Manage Project Templates",
}: TemplateLibraryProps) {
  const { user } = useAuth();
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const hasLoadedRef = useRef(false);

  const loadTemplates = useCallback(async () => {
    const userId = user?.localAccountId || user?.homeAccountId;
    if (!userId) return;

    setIsLoading(true);
    try {
      const templates = await azureApiClient.getTemplatesForUser(userId);
      setAllTemplates(templates || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.localAccountId, user?.homeAccountId]);

  // Load templates only once when modal opens
  useEffect(() => {
    if (isOpen && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setSelectedTemplates(new Set(projectTemplateIds));
      loadTemplates();
    } else if (!isOpen) {
      hasLoadedRef.current = false;
    }
  }, [isOpen, projectTemplateIds, loadTemplates]);

  const handleToggleTemplate = (templateId: string) => {
    setSelectedTemplates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Get current project template IDs
      const currentTemplateIds = new Set(projectTemplateIds);

      // Templates to add (selected but not in project)
      const templatesToAdd = Array.from(selectedTemplates).filter(
        (id) => !currentTemplateIds.has(id)
      );

      // Templates to remove (in project but not selected)
      const templatesToRemove = Array.from(currentTemplateIds).filter(
        (id) => !selectedTemplates.has(id)
      );

      // Pass both add and remove arrays to parent
      onSelectTemplates(templatesToAdd, templatesToRemove);

      onClose();
    } catch (error) {
      console.error("Error updating templates:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const { filteredTemplates, templatesInProject, otherTemplates } =
    useMemo(() => {
      const filtered = allTemplates.filter(
        (template) =>
          template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (template.metadata?.description &&
            template.metadata.description
              .toLowerCase()
              .includes(searchQuery.toLowerCase()))
      );

      // Group templates by whether they're in the project
      const projectTemplateIdsSet = new Set(projectTemplateIds);
      const inProject = filtered.filter((t) => projectTemplateIdsSet.has(t.id));
      const other = filtered.filter((t) => !projectTemplateIdsSet.has(t.id));

      return {
        filteredTemplates: filtered,
        templatesInProject: inProject,
        otherTemplates: other,
      };
    }, [allTemplates, searchQuery, projectTemplateIds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-sm transform transition-all max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl text-gray-900 font-light">{title}</h2>
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

        {/* Search */}
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

        {/* Template List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
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
          ) : (
            <div className="space-y-6">
              {/* Templates in Project */}
              {templatesInProject.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Templates in this project
                  </h3>
                  <div className="space-y-2">
                    {templatesInProject.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => handleToggleTemplate(template.id)}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedTemplates.has(template.id)
                            ? "border-accent bg-accent-50"
                            : "border-gray-300 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center flex-1">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {template.name}
                            </div>
                            {template.metadata?.description && (
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                {template.metadata.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedTemplates.has(template.id) && (
                          <div className="w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                            <svg
                              className="w-2 h-2 text-white"
                              fill="currentColor"
                              viewBox="0 0 8 8"
                            >
                              <path d="m6.564.75-3.59 3.612-1.538-1.55L0 4.26 2.974 7.25 8 2.193z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Available Templates */}
              {otherTemplates.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Other available templates
                  </h3>
                  <div className="space-y-2">
                    {otherTemplates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => handleToggleTemplate(template.id)}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedTemplates.has(template.id)
                            ? "border-accent bg-accent-50"
                            : "border-gray-300 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center flex-1">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {template.name}
                            </div>
                            {template.metadata?.description && (
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                {template.metadata.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedTemplates.has(template.id) && (
                          <div className="w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                            <svg
                              className="w-2 h-2 text-white"
                              fill="currentColor"
                              viewBox="0 0 8 8"
                            >
                              <path d="m6.564.75-3.59 3.612-1.538-1.55L0 4.26 2.974 7.25 8 2.193z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <svg
                    className="w-12 h-12 text-gray-400 mx-auto mb-4"
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
                  <h3 className="text-sm font-medium text-gray-900 mb-1">
                    No templates found
                  </h3>
                  <p className="text-sm text-gray-500">
                    {searchQuery
                      ? "Try a different search term"
                      : "No templates available"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSaving
                  ? "bg-gray-300 text-gray-500"
                  : "bg-accent text-white hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              }`}
            >
              {isSaving ? "Saving" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
