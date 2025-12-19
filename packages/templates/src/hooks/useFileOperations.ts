import { useState, useEffect, useCallback } from "react";
import {
  ProcessedResults,
  handleError,
  ERROR_MESSAGES,
  env,
} from "@studio/core";
import { useAuth, useAuthUser } from "@studio/auth";
import { azureApiClient } from "@studio/api";

interface FileInfo {
  id: string;
  name: string;
  path: string;
  file_map: any;
  page_map: Record<number, number>;
  excel_file_map?: Record<string, any>;
  sheet_map?: Record<number, string>;
  metadata?: Record<string, any>;
}

interface UseFileOperationsReturn {
  files: any[];
  setFiles: React.Dispatch<React.SetStateAction<any[]>>;
  isLoadingFiles: boolean;
  setIsLoadingFiles: React.Dispatch<React.SetStateAction<boolean>>;
  isUploading: boolean;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
  fileInfoCache: Record<string, FileInfo>;
  setFileInfoCache: React.Dispatch<
    React.SetStateAction<Record<string, FileInfo>>
  >;
  // Methods
  preloadFileInfo: (results: Record<string, ProcessedResults>) => Promise<void>;
  loadFiles: () => Promise<void>;
  handleFileUpload: (files: File[]) => Promise<void>;
  handleDeleteFile: (fileName: string) => Promise<void>;
}

export const useFileOperations = (
  selectedProjectId: string,
  selectedProject: string,
  setError: (error: string | null) => void
): UseFileOperationsReturn => {
  const { getUserId } = useAuthUser();
  const { getAccessToken } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileInfoCache, setFileInfoCache] = useState<Record<string, FileInfo>>(
    {}
  );

  // Preload file information for results
  const preloadFileInfo = useCallback(
    async (results: Record<string, ProcessedResults>) => {
      // Check if results is null or undefined
      if (!results) {
        return;
      }

      // Get all unique file IDs directly from lineMap (cleanest approach)
      const fileIds = new Set<string>();

      Object.values(results).forEach((data) => {
        // Extract file IDs from lineMap - this has all citations regardless of format
        if (data.lineMap && typeof data.lineMap === "object") {
          Object.values(data.lineMap).forEach((entry: any) => {
            if (entry?.file_id) {
              fileIds.add(entry.file_id);
            }
          });
        }
      });

      try {
        // First try to get files from the current user's library
        const userId = getUserId();
        if (!userId) {
          console.error("[preloadFileInfo] No user ID found");
          return;
        }

        let relevantFiles: any[] = [];

        try {
          // Try to get files from user's library first
          const allFiles = await azureApiClient.getFiles(userId);
          relevantFiles = allFiles.filter((file) => fileIds.has(file.id));
        } catch (err) {
          console.warn(
            "[preloadFileInfo] Could not fetch files from user library, trying by IDs...",
            err
          );
        }

        // If we don't have all the files we need, fetch them by IDs
        if (relevantFiles.length < fileIds.size) {
          try {
            const missingFileIds = Array.from(fileIds).filter(
              (id) => !relevantFiles.some((file) => file.id === id)
            );

            if (missingFileIds.length > 0) {
              const filesByIds = await azureApiClient.getFilesByIds(
                missingFileIds
              );
              relevantFiles = [...relevantFiles, ...filesByIds];
            }
          } catch (err) {
            console.error(
              "[preloadFileInfo] Error fetching files by IDs:",
              err
            );
          }
        }
        // Update cache with new file information using functional update
        setFileInfoCache((prev) => {
          const newCache = { ...prev };
          let hasChanges = false;

          relevantFiles.forEach((file) => {
            // Only update if we don't have this file or if it's different
            const newFileInfo = {
              id: file.id,
              name: file.file_name,
              path: file.file_path,
              file_map: file.file_map || {},
              page_map: file.page_map || {},
              excel_file_map: file.excel_file_map || {},
              sheet_map: file.sheet_map || {},
              metadata: file.metadata || {},
            };

            if (
              !prev[file.id] ||
              JSON.stringify(prev[file.id]) !== JSON.stringify(newFileInfo)
            ) {
              newCache[file.id] = newFileInfo;
              hasChanges = true;
            }
          });

          return hasChanges ? newCache : prev;
        });
      } catch (err) {
        console.error("Error preloading file information:", err);
      }
    },
    [getUserId]
  );

  // Load files for current project
  const loadFiles = useCallback(async () => {
    if (!selectedProjectId) return;

    setIsLoadingFiles(true);
    try {
      // Use Azure API client to get project files
      const projectFilesData = await azureApiClient.getProjectFiles(
        selectedProjectId
      );

      // Transform the data to match the expected format
      const transformedFiles = projectFilesData.map((item: any) => ({
        id: item.userFile.id,
        name: item.userFile.file_name,
        path: item.userFile.file_path,
        size: item.userFile.file_size,
        created_at: item.userFile.created_at,
        metadata: item.userFile.metadata,
        added_at: item.projectFile.added_at,
      }));

      setFiles(transformedFiles);
    } catch (error) {
      console.error("Error loading files:", error);
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [selectedProjectId]);

  // Load files when selectedProjectId changes
  useEffect(() => {
    if (selectedProjectId) {
      loadFiles();
    }
  }, [selectedProjectId, loadFiles]);

  const handleFileUpload = useCallback(
    async (_files: File[]) => {
      // In the new architecture, files should be uploaded to user's library first
      // and then added to projects via the File Library interface
      setError(
        'File uploads have been moved to the File Library. Please use the "File Library" button in the dashboard to upload files, then add them to projects through the project management interface.'
      );
    },
    [setError]
  );

  const handleDeleteFile = useCallback(
    async (fileName: string) => {
      if (!selectedProject || !selectedProjectId) {
        return;
      }

      try {
        // Get project files to find the file by name
        const projectFilesData = await azureApiClient.getProjectFiles(
          selectedProjectId
        );
        const projectFileEntry = projectFilesData.find(
          (item: any) => item.userFile.file_name === fileName
        );

        if (!projectFileEntry) throw new Error(ERROR_MESSAGES.file_not_found);

        const fileId = projectFileEntry.userFile.id;
        const userId = projectFileEntry.userFile.user_id;

        // First delete vectors using backend API
        const response = await fetch(
          `${env.NEXT_PUBLIC_BACKEND_SERVER_URL}/users/${userId}/files/${fileId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${await getAccessToken()}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(ERROR_MESSAGES.file_delete_failed);
        }

        // Remove the file from the project using Azure API client
        await azureApiClient.removeFileFromProject(selectedProjectId, fileId);

        // Only reload files after successful deletion
        await loadFiles();
      } catch (err) {
        handleError(err, setError, "file_delete_failed");
      }
    },
    [selectedProject, selectedProjectId, setError, loadFiles]
  );

  return {
    files,
    setFiles,
    isLoadingFiles,
    setIsLoadingFiles,
    isUploading,
    setIsUploading,
    fileInfoCache,
    setFileInfoCache,
    preloadFileInfo,
    loadFiles,
    handleFileUpload,
    handleDeleteFile,
  };
};
