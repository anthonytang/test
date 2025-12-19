"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth, useAuthUser } from "@studio/auth";
import { File as DatabaseFile, getAcceptString } from "@studio/core";
import { useNotifications } from "@studio/notifications";
import {
  useFileUpload,
  useFileProcessing,
  ProcessingProgress,
  LocalFilesBrowser,
  fileCacheManager,
} from "@studio/storage";
import { azureApiClient } from "@studio/api";

interface FileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  projectId?: string;
  onFileAddedToProject?: (file: File) => void;
  showLibraryFiles?: boolean;
  onSelectFiles?: (files: DatabaseFile[]) => void;
  selectionMode?: boolean;
  selectedFiles?: DatabaseFile[];
}

interface ProcessingFileStatus {
  file: DatabaseFile;
  progress: ProcessingProgress;
  isProcessing: boolean;
}

export default function FileManagerModal({
  isOpen,
  onClose,
  title = "File Library",
  projectId,
  onFileAddedToProject,
  showLibraryFiles = false,
  onSelectFiles,
  selectionMode = false,
  selectedFiles = [],
}: FileManagerModalProps) {
  const { getAccessToken } = useAuth();
  const { getUserId, isAuthenticated } = useAuthUser();
  const [libraryFiles, setLibraryFiles] = useState<DatabaseFile[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedLibraryFiles, setSelectedLibraryFiles] = useState<Set<string>>(
    new Set()
  );
  const [isDragging, setIsDragging] = useState(false);
  const [recentlyUploaded, setRecentlyUploaded] = useState<Set<string>>(
    new Set()
  );
  const [processingStatus, setProcessingStatus] = useState<
    Map<string, ProcessingFileStatus>
  >(new Map());
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [selectedFilesForDelete, setSelectedFilesForDelete] = useState<
    Set<string>
  >(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showCompactSuccess, showCompactError } = useNotifications();

  // Initialize selected files from props
  useEffect(() => {
    if (selectedFiles && selectedFiles.length > 0) {
      setSelectedLibraryFiles(new Set(selectedFiles.map((f) => f.id)));
    }
  }, [selectedFiles]);

  // File upload hook
  const {
    uploadFiles,
    uploadingFiles,
    setUploadError,
  } = useFileUpload({
    onFileUploaded: async (file) => {
      if (showLibraryFiles) {
        const userId = getUserId();
        if (userId) {
          fileCacheManager.addLibraryFile(userId, file);
        }
        setLibraryFiles((prev) => [file, ...prev]);
        setRecentlyUploaded((prev) => {
          const newSet = new Set(prev);
          newSet.add(file.id);
          return newSet;
        });

        setTimeout(() => {
          setRecentlyUploaded((prev) => {
            const newSet = new Set(prev);
            newSet.delete(file.id);
            return newSet;
          });
        }, 3000);

        try {
          if (!isAuthenticated()) throw new Error("User not authenticated");
          const userId = getUserId();
          if (!userId) throw new Error("User ID not available");

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

          const accessToken = await getAccessToken();
          await startProcessing(
            userId,
            file.id,
            file.file_name,
            accessToken || undefined
          );
        } catch (err) {
          console.error("Error starting processing for library file:", err);
        }
      }

      if (projectId) {
        try {
          if (!isAuthenticated()) throw new Error("User not authenticated");
          const userId = getUserId();
          if (!userId) throw new Error("User ID not available");

          await azureApiClient.addFileToProject(projectId, file.id, userId);

          if (onFileAddedToProject) {
            onFileAddedToProject(file);
          }

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

          const accessToken = await getAccessToken();
          await startProcessing(
            userId,
            file.id,
            file.file_name,
            accessToken || undefined
          );
        } catch (err) {
          console.error("Error adding file to project:", err);
          showCompactError("File uploaded but failed to add to project");
        }
      }
    },
  });

  // File processing hook
  const { processingFiles, startProcessing, abortProcessing } =
    useFileProcessing({
      onProgress: (progress) => {
        setProcessingStatus((prev) => {
          const newMap = new Map(prev);
          const file =
            libraryFiles.find((f) => f.id === progress.fileId) ||
            Array.from(prev.values()).find(
              (item) => item.file.id === progress.fileId
            )?.file;
          if (file) {
            newMap.set(progress.fileId, {
              file,
              progress,
              isProcessing:
                progress.stage !== "completed" &&
                progress.stage !== "error" &&
                progress.stage !== "cancelled",
            });
          }
          return newMap;
        });
      },
      onComplete: (fileId) => {
        setProcessingStatus((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(fileId);
          if (existing) {
            newMap.set(fileId, {
              ...existing,
              isProcessing: false,
            });
          }
          return newMap;
        });

        const userId = getUserId();
        if (userId) {
          fileCacheManager.updateLibraryFile(userId, fileId, {
            processing_status: "completed",
          });
        }
        setLibraryFiles((prev) =>
          prev.map((file) =>
            file.id === fileId
              ? { ...file, processing_status: "completed" }
              : file
          )
        );
      },
      onError: (fileId) => {
        const userId = getUserId();
        if (userId) {
          fileCacheManager.updateLibraryFile(userId, fileId, {
            processing_status: "failed",
          });
        }
        setLibraryFiles((prev) =>
          prev.map((file) =>
            file.id === fileId ? { ...file, processing_status: "failed" } : file
          )
        );

        setTimeout(() => {
          setProcessingStatus((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 3000);
      },
      onCancel: (fileId) => {
        const userId = getUserId();
        if (userId) {
          fileCacheManager.updateLibraryFile(userId, fileId, {
            processing_status: "cancelled",
          });
        }
        setLibraryFiles((prev) =>
          prev.map((file) =>
            file.id === fileId
              ? { ...file, processing_status: "cancelled" }
              : file
          )
        );
      },
    });

  // Sync processing status with global processing files
  React.useEffect(() => {
    const newProcessingStatus = new Map<string, ProcessingFileStatus>();
    processingFiles.forEach((progress, fileId) => {
      const file =
        libraryFiles.find((f) => f.id === fileId) ||
        ({
          id: fileId,
          file_name: progress.file_name || "Unknown file",
          file_size: 0,
          file_path: "",
          created_at: new Date().toISOString(),
          user_id: "",
          processing_status: "processing",
          file_hash: "",
          metadata: {},
          file_map: {},
          page_map: {},
        } as DatabaseFile);
      newProcessingStatus.set(fileId, {
        file,
        progress,
        isProcessing:
          progress.stage !== "completed" &&
          progress.stage !== "error" &&
          progress.stage !== "cancelled",
      });
    });
    setProcessingStatus(newProcessingStatus);
  }, [processingFiles, libraryFiles]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("keydown", handleEscKey);
      };
    }
    return undefined;
  }, [isOpen, onClose]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (showLibraryFiles) {
        const userId = getUserId();
        if (!userId || !isAuthenticated()) {
          return;
        }

        const cachedFiles = fileCacheManager.getLibraryFiles(userId);
        if (cachedFiles) {
          setLibraryFiles(cachedFiles);
        }

        const loadFiles = async () => {
          try {
            if (!cachedFiles) {
              setIsLoadingLibrary(true);
            }
            const filesData = await azureApiClient.getFilesWithProjects(userId);

            fileCacheManager.setLibraryFiles(userId, filesData || []);
            setLibraryFiles(filesData || []);
          } catch (err) {
            console.error("Error loading library files:", err);
            if (!cachedFiles) {
              showCompactError("Failed to load library files");
            }
          } finally {
            setIsLoadingLibrary(false);
          }
        };

        loadFiles();
        fileCacheManager.startBackgroundRefresh(`library-${userId}`, loadFiles);

        return () => {
          fileCacheManager.stopBackgroundRefresh(`library-${userId}`);
        };
      }
    } else {
      setSelectedLibraryFiles(new Set());
      setRecentlyUploaded(new Set());
      setDeletingFiles(new Set());
      setSelectedFilesForDelete(new Set());
      setShowBulkDelete(false);
    }
    return undefined;
  }, [isOpen, showLibraryFiles, getUserId, isAuthenticated, showCompactError]);

  const handleFileUpload = async (filesToUpload: File[]) => {
    await uploadFiles(filesToUpload);
  };

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

  const handleLibraryFileSelect = (fileId: string) => {
    setSelectedLibraryFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleConfirmSelection = async () => {
    if (onSelectFiles) {
      const selectedFiles = libraryFiles.filter((f) =>
        selectedLibraryFiles.has(f.id)
      );
      onSelectFiles(selectedFiles);
      onClose();
    }
  };

  const handleFileClick = async (file: DatabaseFile) => {
    if (selectionMode || showBulkDelete) return;

    try {
      const isWebPage = file.metadata?.source_type === "website";

      if (isWebPage) {
        const url = file.metadata?.source_url || file.file_path;
        window.open(url, "_blank");
      } else {
        const downloadUrl = await azureApiClient.getFileDownloadUrl(
          file.file_path
        );

        if (downloadUrl) {
          window.open(downloadUrl, "_blank");
        } else {
          showCompactError("Unable to generate file link");
        }
      }
    } catch (err) {
      console.error("Error opening file:", err);
      showCompactError("Failed to open file");
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    const originalLibraryFiles = libraryFiles;
    const originalSelectedFiles = new Set(selectedLibraryFiles);

    try {
      setDeletingFiles((prev) => new Set(prev).add(fileId));

      if (!isAuthenticated()) throw new Error("User not authenticated");
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      fileCacheManager.removeLibraryFile(userId, fileId);
      setLibraryFiles((prev) => prev.filter((f) => f.id !== fileId));
      setSelectedLibraryFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });

      const freshToken = await getAccessToken();
      if (freshToken && typeof window !== "undefined") {
        (window as any).__authToken = freshToken;
      }

      await azureApiClient.deleteFileComplete(fileId, userId);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadError(null);
      showCompactSuccess(`${fileName} deleted successfully`);
    } catch (err) {
      console.error("Error deleting file:", err);
      setLibraryFiles(originalLibraryFiles);
      setSelectedLibraryFiles(originalSelectedFiles);
      showCompactError("Failed to delete file");
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const handleBulkDelete = async (fileIds: string[]) => {
    const originalLibraryFiles = libraryFiles;
    const originalSelectedFiles = new Set(selectedLibraryFiles);

    try {
      if (!isAuthenticated()) throw new Error("User not authenticated");
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      fileIds.forEach((id) => {
        setDeletingFiles((prev) => new Set(prev).add(id));
      });

      fileIds.forEach((id) => {
        if (userId) {
          fileCacheManager.removeLibraryFile(userId, id);
        }
      });
      setLibraryFiles((prev) => prev.filter((f) => !fileIds.includes(f.id)));

      setSelectedLibraryFiles((prev) => {
        const newSet = new Set(prev);
        fileIds.forEach((id) => newSet.delete(id));
        return newSet;
      });

      const freshToken = await getAccessToken();
      if (freshToken && typeof window !== "undefined") {
        (window as any).__authToken = freshToken;
      }

      await Promise.all(
        fileIds.map((fileId) =>
          azureApiClient.deleteFileComplete(fileId, userId)
        )
      );

      showCompactSuccess(`${fileIds.length} files deleted successfully`);
    } catch (error) {
      console.error("Error deleting files:", error);
      setLibraryFiles(originalLibraryFiles);
      setSelectedLibraryFiles(originalSelectedFiles);
      showCompactError(`Failed to delete files`);
    } finally {
      fileIds.forEach((id) => {
        setDeletingFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      });
    }
  };

  const handleAbortProcessing = async (fileId: string) => {
    if (!isAuthenticated()) throw new Error("User not authenticated");
    const userId = getUserId();
    if (!userId) throw new Error("User ID not available");
    await abortProcessing(userId, fileId);
  };

  const handleProcessFile = async (file: DatabaseFile) => {
    try {
      if (!isAuthenticated()) throw new Error("User not authenticated");
      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

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

      const accessToken = await getAccessToken();
      await startProcessing(
        userId,
        file.id,
        file.file_name,
        accessToken || undefined
      );

      showCompactSuccess(`Processing ${file.file_name}`);
    } catch (error) {
      console.error("Error processing file:", error);
      showCompactError("Failed to start file processing");
    }
  };

  const filteredFiles = libraryFiles.filter((file) =>
    file.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div
        className="bg-white rounded-2xl w-full max-w-7xl h-full shadow-xl flex overflow-hidden"
        style={{ fontFamily: "Lato, system-ui, sans-serif" }}
      >
        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-gray-100 flex flex-col">
          <div className="p-4">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Locations
            </h3>
            <div className="space-y-1">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors bg-accent-100 text-accent-600"
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
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                <span>My Files</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div
          className="flex-1 flex flex-col bg-white"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl text-gray-900 font-light">{title}</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
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

            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <svg
                  className="absolute left-3 top-2 w-4 h-4 text-gray-400"
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
                <input
                  type="text"
                  placeholder="Search files"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-full focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent/20 focus:outline-none transition-all placeholder-gray-400"
                />
              </div>

              {/* Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-accent border border-accent rounded-full hover:bg-accent-50 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
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
                <span>Upload</span>
              </button>

              {/* Bulk Delete Toggle */}
              {!selectionMode && filteredFiles.length > 0 && (
                <button
                  onClick={() => {
                    setShowBulkDelete(!showBulkDelete);
                    setSelectedFilesForDelete(new Set());
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-full transition-colors ${
                    showBulkDelete
                      ? "text-red-600 border-red-600 bg-red-50"
                      : "text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{showBulkDelete ? "Cancel" : "Select"}</span>
                </button>
              )}

              {/* Delete Selected Button */}
              {showBulkDelete && selectedFilesForDelete.size > 0 && (
                <button
                  onClick={async () => {
                    const deletePromises = Array.from(
                      selectedFilesForDelete
                    ).map((fileId) => {
                      const file = filteredFiles.find((f) => f.id === fileId);
                      if (file) {
                        return handleDeleteFile(fileId, file.file_name);
                      }
                      return Promise.resolve();
                    });

                    await Promise.all(deletePromises);
                    setSelectedFilesForDelete(new Set());
                    setShowBulkDelete(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-600 rounded-full hover:bg-red-700 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  <span>Delete {selectedFilesForDelete.size}</span>
                </button>
              )}

              {/* Select Button */}
              {selectionMode && selectedLibraryFiles.size > 0 && (
                <button
                  onClick={handleConfirmSelection}
                  className="px-3 py-1.5 bg-accent text-white text-sm rounded-full hover:bg-accent-600 transition-colors"
                >
                  Select {selectedLibraryFiles.size}
                </button>
              )}
            </div>
          </div>

          {/* File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) =>
              e.target.files && handleFileUpload(Array.from(e.target.files))
            }
            className="hidden"
            multiple
            accept={getAcceptString()}
          />

          {/* Content Area */}
          <div
            className={`flex-1 overflow-y-auto relative ${
              isDragging ? "bg-accent-50" : ""
            }`}
          >
            <LocalFilesBrowser
              files={filteredFiles}
              loading={isLoadingLibrary}
              searchQuery={searchQuery}
              isDragging={isDragging}
              selectionMode={selectionMode}
              showBulkDelete={showBulkDelete}
              selectedFiles={selectedLibraryFiles}
              selectedFilesForDelete={selectedFilesForDelete}
              processingStatus={processingStatus}
              deletingFiles={deletingFiles}
              recentlyUploaded={recentlyUploaded}
              uploadingFiles={uploadingFiles}
              onFileClick={(file) => {
                if (selectionMode) {
                  handleLibraryFileSelect(file.id);
                } else if (!showBulkDelete) {
                  handleFileClick(file);
                }
              }}
              onFileSelect={(fileId) => {
                if (selectionMode) {
                  handleLibraryFileSelect(fileId);
                } else if (showBulkDelete) {
                  setSelectedFilesForDelete((prev) => {
                    const newSet = new Set(prev);
                    if (newSet.has(fileId)) {
                      newSet.delete(fileId);
                    } else {
                      newSet.add(fileId);
                    }
                    return newSet;
                  });
                }
              }}
              onBulkSelect={(fileIds) => {
                if (selectionMode) {
                  fileIds.forEach((id) => handleLibraryFileSelect(id));
                } else if (showBulkDelete) {
                  setSelectedFilesForDelete((prev) => {
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
                }
              }}
              onFileDelete={showBulkDelete ? undefined : handleDeleteFile}
              onBulkDelete={showBulkDelete ? undefined : handleBulkDelete}
              onProcessingCancel={handleAbortProcessing}
              onProcessFile={handleProcessFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
