import { useState, useCallback, useEffect, useRef } from "react";
import { useNotifications } from "@studio/notifications";
import { BackendClient, azureApiClient } from "@studio/api";

// Helper to determine if we're in local or cloud mode for SSE URLs
function getFileSSEUrl(userId: string, fileId: string, token?: string): string {
  // Check if we're in local mode by examining NEXT_PUBLIC_BACKEND_SERVER_URL
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";
  const isLocal = backendUrl.startsWith("http://localhost");
  
  if (isLocal) {
    // Local: direct backend SSE
    return BackendClient.getSSEUrl(`/users/${userId}/files/${fileId}/process/stream`, token);
  } else {
    // Cloud: go through Next.js API route (which proxies to APIM)
    return token
      ? `/api/files/${fileId}/process/stream?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`
      : `/api/files/${fileId}/process/stream?userId=${encodeURIComponent(userId)}`;
  }
}

// Global notification manager
let globalNotificationManager: {
  showCompactSuccess: (message: string) => void;
  showCompactError: (message: string) => void;
} | null = null;

export const setGlobalNotificationManager = (
  manager: typeof globalNotificationManager
) => {
  globalNotificationManager = manager;
};

export interface ProcessingProgress {
  fileId: string;
  stage:
    | "starting"
    | "downloading"
    | "parsing"
    | "analyzing"
    | "structuring"
    | "uploading"
    | "finalizing"
    | "completed"
    | "error"
    | "cancelled";
  progress: number;
  message: string;
  timestamp: number;
  results?: {
    line_mappings: number;
    page_mappings: number;
    chunks_processed: number;
    total_chunks: number;
  };
  error?: string;
  file_name?: string;
}

interface UseFileProcessingOptions {
  onProgress?: (progress: ProcessingProgress) => void;
  onComplete?: (fileId: string, results: any) => void;
  onError?: (fileId: string, error: string) => void;
  onCancel?: (fileId: string) => void;
}

// Global state manager class for processing files
class ProcessingStateManager {
  private processingFiles = new Map<string, ProcessingProgress>();
  private eventSources = new Map<string, EventSource>();
  private completedFiles = new Set<string>();
  private listeners = new Set<
    (files: Map<string, ProcessingProgress>) => void
  >();
  private cleanupInterval: NodeJS.Timeout | null = null;
  // Track progress history for smooth animation
  private progressHistory = new Map<string, number[]>();

  constructor() {
    this.startCleanupInterval();
  }

  // Subscribe to state changes
  subscribe(listener: (files: Map<string, ProcessingProgress>) => void) {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(new Map(this.processingFiles));

    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notify all listeners of state changes
  private notify() {
    // Create a snapshot for this notification
    const snapshot = new Map(this.processingFiles);
    
    // Notify synchronously - React will handle batching
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  // Add or update a processing file
  setProcessingFile(fileId: string, progress: ProcessingProgress) {
    console.log(
      `[GLOBAL] Setting processing file ${fileId}:`,
      progress.stage,
      progress.progress + "%"
    );
    
    // Track progress history
    if (!this.progressHistory.has(fileId)) {
      this.progressHistory.set(fileId, []);
    }
    this.progressHistory.get(fileId)!.push(progress.progress);
    
    this.processingFiles.set(fileId, progress);
    this.notify();
  }

  // Get a processing file
  getProcessingFile(fileId: string): ProcessingProgress | undefined {
    return this.processingFiles.get(fileId);
  }

  // Get all processing files
  getAllProcessingFiles(): Map<string, ProcessingProgress> {
    return new Map(this.processingFiles);
  }

  // Remove a processing file
  removeProcessingFile(fileId: string) {
    console.log(`[GLOBAL] Removing processing file ${fileId}`);
    this.processingFiles.delete(fileId);
    this.completedFiles.delete(fileId);
    this.notify();
  }

  // Mark file as completed (for cleanup tracking)
  markCompleted(fileId: string) {
    this.completedFiles.add(fileId);
  }

  // Check if file is completed
  isCompleted(fileId: string): boolean {
    return this.completedFiles.has(fileId);
  }

  // Start SSE connection for a file
  async startProcessing(
    userId: string,
    fileId: string,
    fileName?: string,
    idToken?: string
  ): Promise<boolean> {
    try {
      console.log(
        `[GLOBAL] Starting SSE processing for file: ${fileName} (${fileId})`
      );
      console.log(
        `[GLOBAL] Token received - prefix: ${idToken?.substring(
          0,
          20
        )}, length: ${idToken?.length}`
      );

      // Close existing connection if any
      const existingSource = this.eventSources.get(fileId);
      if (existingSource) {
        console.log(
          `[GLOBAL] Closing existing SSE connection for file ${fileId}`
        );
        existingSource.close();
        this.eventSources.delete(fileId);
      }

      // Create new EventSource connection with ID token
      // Use cloud-aware URL - goes through Next.js API route in cloud, direct backend in local
      const sseUrl = getFileSSEUrl(userId, fileId, idToken);
      console.log(`[GLOBAL] Creating EventSource with URL: ${sseUrl}`);
      const eventSource = new EventSource(sseUrl);

      // Store the event source
      this.eventSources.set(fileId, eventSource);

      // Set initial processing state
      this.setProcessingFile(fileId, {
        fileId,
        stage: "starting",
        progress: 0,
        message: "Connecting...",
        timestamp: Date.now(),
        file_name: fileName,
      });

      // Handle connection open
      eventSource.onopen = (_event) => {
        console.log(`[GLOBAL] SSE connection opened for file ${fileId}`);
      };

      // Handle progress events
      eventSource.addEventListener("progress", (event) => {
        try {
          console.log(`[GLOBAL] Progress event for ${fileId}:`, event.data);
          const data = JSON.parse(event.data);
          const progressData: ProcessingProgress = {
            fileId,
            stage: data.stage,
            progress: data.progress,
            message: data.message,
            timestamp: data.timestamp,
            results: data.results,
            error: data.error,
            file_name: fileName || data.file_name,
          };

          this.setProcessingFile(fileId, progressData);
        } catch (err) {
          console.error(
            `[GLOBAL] Error parsing progress event for ${fileId}:`,
            err
          );
        }
      });

      // Handle completion
      eventSource.addEventListener("completed", (event) => {
        try {
          console.log(`[GLOBAL] Completed event for ${fileId}:`, event.data);
          const data = JSON.parse(event.data);
          const progressData: ProcessingProgress = {
            fileId,
            stage: "completed",
            progress: 100,
            message: data.message,
            timestamp: data.timestamp,
            results: data.results,
            file_name: fileName || data.file_name,
          };

          this.setProcessingFile(fileId, progressData);
          this.markCompleted(fileId);

          // Show global success notification
          if (globalNotificationManager) {
            globalNotificationManager.showCompactSuccess(
              `${fileName || "File"} processed successfully`
            );
          }

          // Auto-remove after 5 seconds
          setTimeout(() => {
            this.removeProcessingFile(fileId);
            this.cleanupConnection(fileId);
          }, 5000);
        } catch (err) {
          console.error(
            `[GLOBAL] Error parsing completion event for ${fileId}:`,
            err
          );
        }
      });

      // Handle errors
      eventSource.addEventListener("error", (event) => {
        try {
          if ((event as any).data) {
            console.log(
              `[GLOBAL] Error event for ${fileId}:`,
              (event as any).data
            );
            const data = JSON.parse((event as any).data);
            const progressData: ProcessingProgress = {
              fileId,
              stage: "error",
              progress: 0,
              message: "Processing failed",
              timestamp: Date.now(),
              error: data.error,
              file_name: fileName,
            };

            this.setProcessingFile(fileId, progressData);

            // Show global error notification
            if (globalNotificationManager) {
              globalNotificationManager.showCompactError(
                `Failed to process ${fileName || "file"}: ${
                  data.error || "Unknown error"
                }`
              );
            }

            // Auto-remove after 10 seconds
            setTimeout(() => {
              this.removeProcessingFile(fileId);
              this.cleanupConnection(fileId);
            }, 10000);
          }
        } catch (err) {
          console.error(
            `[GLOBAL] Error parsing error event for ${fileId}:`,
            err
          );
        }
      });

      // Handle cancellation
      eventSource.addEventListener("cancelled", (event) => {
        try {
          console.log(
            `[GLOBAL] Cancelled event for ${fileId}:`,
            (event as any).data
          );
          const data = JSON.parse((event as any).data);
          const progressData: ProcessingProgress = {
            fileId,
            stage: "cancelled",
            progress: 0,
            message: data.message,
            timestamp: data.timestamp,
            file_name: fileName,
          };

          this.setProcessingFile(fileId, progressData);

          // Auto-remove after 3 seconds
          setTimeout(() => {
            this.removeProcessingFile(fileId);
            this.cleanupConnection(fileId);
          }, 3000);
        } catch (err) {
          console.error(
            `[GLOBAL] Error parsing cancellation event for ${fileId}:`,
            err
          );
        }
      });

      // Handle connection errors
      eventSource.onerror = (_event) => {
        // Check if this file was marked as completed
        if (this.isCompleted(fileId)) {
          console.log(
            `[GLOBAL] SSE connection closed normally for completed file ${fileId}`
          );
          this.cleanupConnection(fileId);
          return;
        }

        // Check if we already have a final status
        const currentStatus = this.getProcessingFile(fileId);
        if (
          currentStatus &&
          (currentStatus.stage === "completed" ||
            currentStatus.stage === "error" ||
            currentStatus.stage === "cancelled")
        ) {
          console.log(
            `[GLOBAL] SSE connection closed normally for file ${fileId} with final status ${currentStatus.stage}`
          );
          this.cleanupConnection(fileId);
          return;
        }

        // Only treat as error if connection failed unexpectedly
        if (eventSource.readyState === 2) {
          // CLOSED
          console.log(`[GLOBAL] SSE connection closed for file ${fileId}`);
          this.cleanupConnection(fileId);
          return;
        }

        console.error(`[GLOBAL] SSE connection error for file ${fileId}`);

        const progressData: ProcessingProgress = {
          fileId,
          stage: "error",
          progress: 0,
          message: "Connection error",
          timestamp: Date.now(),
          error: "Connection to server lost",
          file_name: fileName,
        };

        this.setProcessingFile(fileId, progressData);
        this.cleanupConnection(fileId);
      };

      return true;
    } catch (err) {
      console.error(
        `[GLOBAL] Error starting SSE processing for file ${fileId}:`,
        err
      );
      return false;
    }
  }

  // Abort processing for a file
  async abortProcessing(userId: string, fileId: string): Promise<boolean> {
    try {
      console.log(`[GLOBAL] Aborting processing for file ${fileId}`);

      // Immediately update UI to show cancelled state (optimistic update)
      const current = this.getProcessingFile(fileId);
      if (current) {
        this.setProcessingFile(fileId, {
          ...current,
          stage: "cancelled",
          message: "Processing cancelled",
          timestamp: Date.now(),
        });
      }

      // Cleanup connection
      this.cleanupConnection(fileId);
      this.markCompleted(fileId);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        this.removeProcessingFile(fileId);
      }, 3000);

      // Call abort endpoint in background
      azureApiClient.abortFileProcessing(fileId, userId).catch((err) => {
        console.error(
          `[GLOBAL] Error calling abort endpoint for ${fileId}:`,
          err
        );
      });

      return true;
    } catch (err) {
      console.error(
        `[GLOBAL] Error aborting processing for file ${fileId}:`,
        err
      );
      return false;
    }
  }

  // Cleanup connection for a file
  private cleanupConnection(fileId: string) {
    const eventSource = this.eventSources.get(fileId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(fileId);
      console.log(`[GLOBAL] Cleaned up SSE connection for file ${fileId}`);
    }
  }

  // Start cleanup interval for old completed files
  private startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      const toDelete: string[] = [];

      this.processingFiles.forEach((progress, fileId) => {
        if (
          (progress.stage === "completed" ||
            progress.stage === "error" ||
            progress.stage === "cancelled") &&
          progress.timestamp < cutoff
        ) {
          toDelete.push(fileId);
        }
      });

      if (toDelete.length > 0) {
        console.log(
          `[GLOBAL] Cleaning up ${toDelete.length} old processing entries`
        );
        toDelete.forEach((fileId) => {
          this.removeProcessingFile(fileId);
          this.cleanupConnection(fileId);
        });
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  // Cleanup everything
  cleanup() {
    console.log(`[GLOBAL] Cleaning up all processing state`);

    // Close all event sources
    this.eventSources.forEach((eventSource) => {
      eventSource.close();
    });
    this.eventSources.clear();

    // Clear all state
    this.processingFiles.clear();
    this.completedFiles.clear();
    this.listeners.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Declare global type for window
declare global {
  interface Window {
    __studioProcessingManager?: ProcessingStateManager;
  }
}

// Global singleton instance - use window to ensure single instance across all bundles
const getGlobalProcessingManager = (): ProcessingStateManager => {
  if (typeof window !== 'undefined') {
    if (!window.__studioProcessingManager) {
      console.log('[GLOBAL] Creating new ProcessingStateManager on window');
      window.__studioProcessingManager = new ProcessingStateManager();
    }
    return window.__studioProcessingManager;
  }
  // Server-side, return a new instance (won't be used for actual processing)
  return new ProcessingStateManager();
};

const globalProcessingManager = getGlobalProcessingManager();

// Hook for components to use the global processing state
export const useFileProcessing = (options: UseFileProcessingOptions = {}) => {
  const [processingFiles, setProcessingFiles] = useState<
    Map<string, ProcessingProgress>
  >(new Map());
  const { showCompactSuccess, showCompactError } = useNotifications();

  // Set up global notification manager
  useEffect(() => {
    setGlobalNotificationManager({ showCompactSuccess, showCompactError });
  }, [showCompactSuccess, showCompactError]);

  const { onProgress, onComplete, onError, onCancel } = options;

  // Track processed events to avoid duplicate callbacks
  const processedEvents = useRef(new Set<string>());

  // Subscribe to global state changes
  useEffect(() => {
    const unsubscribe = globalProcessingManager.subscribe((files) => {
      setProcessingFiles(files);
    });

    return unsubscribe;
  }, []);

  // Handle callbacks separately to avoid infinite loops
  useEffect(() => {
    processingFiles.forEach((progress) => {
      const eventKey = `${progress.fileId}-${progress.stage}-${progress.timestamp}`;

      // Skip if we already processed this event
      if (processedEvents.current.has(eventKey)) {
        return;
      }

      processedEvents.current.add(eventKey);

      // Trigger appropriate callback
      if (onProgress) {
        onProgress(progress);
      }

      // Check for completion
      if (progress.stage === "completed" && onComplete) {
        onComplete(progress.fileId, progress.results);
      }

      // Check for errors
      if (progress.stage === "error" && onError) {
        onError(progress.fileId, progress.error || "Processing failed");
      }

      // Check for cancellation
      if (progress.stage === "cancelled" && onCancel) {
        onCancel(progress.fileId);
      }
    });

    // Clean up old processed events (keep only last 100)
    if (processedEvents.current.size > 100) {
      const eventsArray = Array.from(processedEvents.current);
      processedEvents.current = new Set(eventsArray.slice(-50));
    }
  }, [processingFiles, onProgress, onComplete, onError, onCancel]);

  // Wrapper functions
  const startProcessing = useCallback(
    async (
      userId: string,
      fileId: string,
      fileName?: string,
      idToken?: string
    ) => {
      return await globalProcessingManager.startProcessing(
        userId,
        fileId,
        fileName,
        idToken
      );
    },
    []
  );

  const abortProcessing = useCallback(
    async (userId: string, fileId: string) => {
      return await globalProcessingManager.abortProcessing(userId, fileId);
    },
    []
  );

  const cleanup = useCallback(() => {
    globalProcessingManager.cleanup();
  }, []);

  const isProcessing = useCallback((fileId: string) => {
    const progress = globalProcessingManager.getProcessingFile(fileId);
    return (
      progress &&
      progress.stage !== "completed" &&
      progress.stage !== "error" &&
      progress.stage !== "cancelled"
    );
  }, []);

  const getProgress = useCallback((fileId: string) => {
    return globalProcessingManager.getProcessingFile(fileId);
  }, []);

  return {
    processingFiles,
    startProcessing,
    abortProcessing,
    cleanup,
    isProcessing,
    getProgress,
  };
};
