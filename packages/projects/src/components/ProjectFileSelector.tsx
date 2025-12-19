"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { File } from "@studio/core";
import { azureApiClient } from "@studio/api";
import { useAuthUser } from "@studio/auth";
import { useNotifications } from "@studio/notifications";
import { GroupedFileList } from "@studio/storage";

interface ProjectFileSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentProjectFiles: File[];
  onFilesUpdated: () => void;
}

export default function ProjectFileSelector({
  isOpen,
  onClose,
  projectId,
  currentProjectFiles,
  onFilesUpdated,
}: ProjectFileSelectorProps) {
  const { getUserId } = useAuthUser();
  const { showSuccess, showError } = useNotifications();

  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const hasLoadedRef = useRef(false);

  const loadLibraryFiles = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;

    setIsLoading(true);
    try {
      const allFiles = await azureApiClient.getFiles(userId);
      setLibraryFiles(allFiles || []);
    } catch (error) {
      console.error("Error loading library files:", error);
      showError("Files Loading Failed", "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }, [getUserId, showError]);

  // Load files only once when modal opens
  useEffect(() => {
    if (isOpen && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setSelectedFiles(new Set(currentProjectFiles.map((f) => f.id)));
      loadLibraryFiles();
    } else if (!isOpen) {
      hasLoadedRef.current = false;
    }
  }, [isOpen, currentProjectFiles, loadLibraryFiles]);

  const handleToggleFile = (fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleBulkSelect = (fileIds: string[]) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      fileIds.forEach((id) => {
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      });
      return newSet;
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      // Get current project file IDs
      const currentFileIds = new Set(currentProjectFiles.map((f) => f.id));

      // Files to add (selected but not in project)
      const filesToAdd = Array.from(selectedFiles).filter(
        (id) => !currentFileIds.has(id)
      );

      // Files to remove (in project but not selected)
      const filesToRemove = Array.from(currentFileIds).filter(
        (id) => !selectedFiles.has(id)
      );

      // Execute operations
      const operations = [];

      if (filesToAdd.length > 0) {
        operations.push(
          azureApiClient.addFilesToProject(projectId, filesToAdd, userId)
        );
      }

      if (filesToRemove.length > 0) {
        operations.push(
          azureApiClient.removeFilesFromProject(projectId, filesToRemove)
        );
      }

      if (operations.length > 0) {
        await Promise.all(operations);
        showSuccess("Files Updated", "Project files updated successfully");
      }

      onFilesUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating project files:", error);
      showError("Files Update Failed", "Failed to update project files");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFiles = libraryFiles.filter((file) =>
    file.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group files by whether they're in the project
  const projectFileIds = new Set(currentProjectFiles.map((f) => f.id));
  const filesInProject = filteredFiles.filter((f) => projectFileIds.has(f.id));
  const otherFiles = filteredFiles.filter((f) => !projectFileIds.has(f.id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-sm transform transition-all max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl text-gray-900 font-light">
              Manage Project Files
            </h2>
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
              placeholder="Search files"
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

        {/* File List */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pb-6">
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
                {/* Files in Project */}
                {filesInProject.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Files in this project
                    </h3>
                    <div>
                      <GroupedFileList
                        files={filesInProject}
                        selectedFiles={selectedFiles}
                        onFileSelect={handleToggleFile}
                        onBulkSelect={handleBulkSelect}
                        selectionMode={true}
                        showCheckboxes={true}
                        className=""
                      />
                    </div>
                  </div>
                )}

                {/* Other Available Files */}
                {otherFiles.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Other available files
                    </h3>
                    <div>
                      <GroupedFileList
                        files={otherFiles}
                        selectedFiles={selectedFiles}
                        onFileSelect={handleToggleFile}
                        onBulkSelect={handleBulkSelect}
                        selectionMode={true}
                        showCheckboxes={true}
                        className=""
                      />
                    </div>
                  </div>
                )}

                {filteredFiles.length === 0 && (
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
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      No files found
                    </h3>
                    <p className="text-sm text-gray-500">
                      {searchQuery
                        ? "Try a different search term"
                        : "No files available"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
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
