/**
 * useResults - Simplified results management
 *
 * Now delegates field processing to useFieldProcessor (no global state, no race conditions)
 * Focuses on: results storage, runs management, database persistence
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ProcessedResults,
  DatabaseResult,
  Template,
  Field,
  ProjectMetadata,
  handleError,
} from "@studio/core";
import { azureApiClient } from "@studio/api";
import { v4 as uuidv4 } from "uuid";
import { useFieldProcessor } from "@studio/templates";
import { useNotifications } from "@studio/notifications";

// Utility functions
const sanitizeErrorMessage = (error: unknown): string => {
  if (!error) return "An unknown error occurred";
  if (error instanceof Error) {
    return error.message
      .replace(/\/[a-zA-Z0-9_\-.\/]+\.(ts|js|tsx|jsx)/g, "[file]")
      .replace(/http[s]?:\/\/[^\s]+/g, "[url]")
      .slice(0, 200);
  }
  if (typeof error === "string") {
    return error.slice(0, 200);
  }
  return "An unknown error occurred";
};

const createSafeTimestamp = (): string => {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatResults = (
  runResults: DatabaseResult[] | undefined
): [Record<string, ProcessedResults>, Record<string, string>] => {
  const formattedResults: Record<string, ProcessedResults> = {};
  const formattedResultIds: Record<string, string> = {};

  if (!Array.isArray(runResults)) {
    return [formattedResults, formattedResultIds];
  }

  for (const result of runResults) {
    if (!result?.field_id || typeof result.field_id !== "string") continue;

    const resultValue: ProcessedResults = {
      text: Array.isArray(result.value?.text) ? result.value.text : [],
      lineMap: result.value?.lineMap || {},
      evidenceAnalysis: result.value?.evidenceAnalysis,
    };

    formattedResults[result.field_id] = {
      ...resultValue,
      metadata: result.metadata || {},
    };
    formattedResultIds[result.field_id] = result.id;
  }

  return [formattedResults, formattedResultIds];
};

// Type definitions
interface UseResultsReturn {
  results: Record<string, ProcessedResults>;
  setResults: React.Dispatch<
    React.SetStateAction<Record<string, ProcessedResults>>
  >;
  updateResultMetadata: (fieldId: string, metadata: any) => Promise<void>;
  processingFieldId: string | null;
  isProcessingTemplate: boolean;
  currentProgress: { stage: string; progress: number; message: string } | null;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  runs: Array<{
    id: string;
    created_at: string;
    status: string;
    metadata?: { name?: string; description?: string; [key: string]: any };
  }>;
  selectedRun: string | null;
  setSelectedRun: React.Dispatch<React.SetStateAction<string | null>>;
  setRuns: React.Dispatch<React.SetStateAction<any[]>>;
  loadStoredResults: () => Promise<void>;
  processSingleFieldWithRetry: (field: Field) => Promise<void>;
  handleProcessTemplate: () => Promise<void>;
  handleStopProcessing: () => void;
  handleAbortField: (fieldId: string) => void;
  handleClearResults: () => void;
  handleDeleteRun: (runId: string) => void;
}

// Main hook
export const useResults = (
  template: Template | null,
  selectedProjectId: string,
  setError: (error: string | null) => void,
  preloadFileInfo: (results: Record<string, ProcessedResults>) => Promise<void>,
  fields: Field[],
  projectMetadata: ProjectMetadata | undefined,
  selectedFileIds?: string[],
  isLoadingFiles?: boolean
): UseResultsReturn => {
  // State management
  const [results, setResults] = useState<Record<string, ProcessedResults>>({});
  const [resultIds, setResultIds] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const selectedRunRef = useRef<string | null>(null);
  const userSelectedNewAnalysisRef = useRef(false);
  const sectionAbortedRef = useRef(false);

  const { showError, showSuccess } = useNotifications();

  // Use new clean field processor hook
  const {
    activeFieldId: processingFieldId,
    isProcessingAll: isProcessingTemplate,
    currentProgress,
    processField,
    processAllFields,
    stop,
  } = useFieldProcessor(
    selectedFileIds || [],
    projectMetadata || {},
    template?.metadata || {}
  );

  // Keep ref in sync
  useEffect(() => {
    selectedRunRef.current = selectedRun;
  }, [selectedRun]);

  // Load runs on mount
  useEffect(() => {
    if (!template?.id || !selectedProjectId) return;

    const loadRunsAndResults = async () => {
      try {
        const runs = await azureApiClient.getRunsForTemplate(
          template.id,
          selectedProjectId
        );
        setRuns(runs || []);

        const latestRun = runs?.[0];
        if (latestRun && !userSelectedNewAnalysisRef.current) {
          setSelectedRun(latestRun.id);

          const runResults = await azureApiClient.getResultsForRun(
            latestRun.id
          );
          const [formatted, ids] = formatResults(
            runResults as DatabaseResult[]
          );

          setResults(formatted);
          setResultIds(ids);

          if (Object.keys(formatted).length > 0) {
            preloadFileInfo(formatted).catch((err) =>
              console.error("[useResults] Error preloading file info:", err)
            );
          }
        } else {
          setSelectedRun(null);
          setResults({});
        }
      } catch (err) {
        // Silently fail - user will see empty state
      }
    };

    loadRunsAndResults();
  }, [template?.id, selectedProjectId, preloadFileInfo]);

  // Set selected run with tracking
  const setSelectedRunWithTracking = useCallback(
    (value: React.SetStateAction<string | null>) => {
      const resolvedValue =
        typeof value === "function" ? value(selectedRun) : value;
      userSelectedNewAnalysisRef.current = resolvedValue === null;
      setSelectedRun(resolvedValue);
    },
    [selectedRun]
  );

  // Load stored results
  const loadStoredResults = useCallback(
    async (runId?: string) => {
      const runToLoad = runId || selectedRun;
      if (!runToLoad) return;

      try {
        const runResults = await azureApiClient.getResultsForRun(runToLoad);
        const [formatted, ids] = formatResults(runResults as DatabaseResult[]);

        if (selectedRunRef.current === runToLoad) {
          setResults(formatted);
          setResultIds(ids);

          if (Object.keys(formatted).length > 0) {
            preloadFileInfo(formatted).catch((err) =>
              console.error("[useResults] Error preloading file info:", err)
            );
          }
        }
      } catch (error) {
        if (selectedRunRef.current === runToLoad) {
          setError(`Failed to load results: ${sanitizeErrorMessage(error)}`);
        }
      }
    },
    [selectedRun, setError, preloadFileInfo]
  );

  // Delete run
  const handleDeleteRun = useCallback((runId: string) => {
    setRuns((prevRuns) => {
      const updatedRuns = prevRuns.filter((run) => run.id !== runId);

      if (selectedRunRef.current === runId) {
        const nextRun = updatedRuns.length > 0 ? updatedRuns[0] : null;
        setSelectedRun(nextRun?.id || null);
      }

      return updatedRuns;
    });

    azureApiClient.deleteRun(runId).catch(() => {});
  }, []);

  // Auto-load results when run changes
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      return;
    }

    if (selectedRun) {
      loadStoredResults();
    } else {
      setResults({});
      setFieldErrors({});
    }
  }, [selectedRun, loadStoredResults]);

  // Process single field
  const processSingleFieldWithRetry = useCallback(
    async (field: Field) => {
      if (
        isProcessingTemplate ||
        processingFieldId !== null ||
        isLoadingFiles
      ) {
        if (isLoadingFiles) {
          setError(
            "Files are still loading. Please wait a moment and try again."
          );
        }
        return;
      }

      if (!selectedFileIds?.length) {
        setError("No files selected for processing");
        return;
      }

      setFieldErrors((prev) => ({ ...prev, [field.id]: "" }));

      // Create run if needed
      let currentRunId = selectedRun;
      if (!currentRunId) {
        const runId = uuidv4();
        const optimisticRun = {
          id: runId,
          template_id: template!.id,
          project_id: selectedProjectId,
          status: "in_progress" as const,
          created_at: new Date().toISOString(),
          metadata: { name: createSafeTimestamp() },
        };
        setRuns((prev) => [optimisticRun, ...prev]);

        // Update ref immediately to prevent stale loads
        selectedRunRef.current = runId;
        setSelectedRun(runId);
        currentRunId = runId;

        // Create in background
        azureApiClient
          .createRun({
            id: runId,
            template_id: template!.id,
            project_id: selectedProjectId,
            status: "in_progress",
            metadata: { name: createSafeTimestamp() },
          })
          .catch(() => {});
      }

      try {
        // Build dependent results
        const depResults: Array<{
          field_id: string;
          field_name: string;
          field_type: string;
          response: string;
        }> = [];
        const fieldIndex = fields.findIndex((f) => f.id === field.id);
        for (let i = 0; i < fieldIndex; i++) {
          const depField = fields[i];
          if (!depField) continue;
          const depResult = results[depField.id];
          if (depResult?.text?.length) {
            const fieldType = depField.metadata.type;
            let response: string;
            if (fieldType === 'table' || fieldType === 'chart') {
              response = JSON.stringify(depResult.text[0]);
            } else {
              response = depResult.text.map((item) => item.line).join("\n");
            }
            depResults.push({
              field_id: depField.id,
              field_name: depField.name,
              field_type: fieldType,
              response,
            });
          }
        }

        // Process field
        const result = await processField(field, depResults);

        if (result) {
          // Update local state
          setResults((prev) => ({ ...prev, [field.id]: result }));

          // Preload file info
          preloadFileInfo({ [field.name]: result }).catch((err) =>
            console.error("[useResults] Error preloading file info:", err)
          );

          // Save to database
          const resultId = await azureApiClient.saveResult({
            run_id: currentRunId!,
            field_id: field.id,
            value: result,
            metadata: {},
            status: "completed",
          });
          setResultIds((prev) => ({ ...prev, [field.id]: resultId }));

          showSuccess(
            "Field Processed",
            `${field.name} completed successfully`
          );
        }
      } catch (error) {
        const errorMessage = sanitizeErrorMessage(error);
        setFieldErrors((prev) => ({ ...prev, [field.id]: errorMessage }));
        showError("Processing Error", errorMessage);
      }
    },
    [
      isProcessingTemplate,
      processingFieldId,
      isLoadingFiles,
      selectedFileIds,
      selectedRun,
      template,
      selectedProjectId,
      fields,
      results,
      processField,
      preloadFileInfo,
      setError,
      showSuccess,
      showError,
    ]
  );

  // Process all fields
  const handleProcessTemplate = useCallback(async () => {
    if (isProcessingTemplate || processingFieldId !== null || isLoadingFiles) {
      if (isLoadingFiles) {
        setError(
          "Files are still loading. Please wait a moment and try again."
        );
      }
      return;
    }

    if (!selectedFileIds?.length) {
      setError("No files selected for processing");
      return;
    }

    setFieldErrors({});

    // Create new run
    const runId = uuidv4();
    const optimisticRun = {
      id: runId,
      template_id: template!.id,
      project_id: selectedProjectId,
      status: "in_progress" as const,
      created_at: new Date().toISOString(),
      metadata: { name: createSafeTimestamp() },
    };
    setRuns((prev) => [optimisticRun, ...prev]);

    // Update ref immediately to prevent any in-flight loads from setting stale results
    selectedRunRef.current = runId;
    setSelectedRun(runId);
    setResults({});

    // Create run in background
    const runPromise = azureApiClient.createRun({
      id: runId,
      template_id: template!.id,
      project_id: selectedProjectId,
      status: "in_progress",
      metadata: { name: createSafeTimestamp() },
    });

    try {
      let hasErrors = false;

      const wasCancelled = await processAllFields(
        fields,
        // onResult
        async (fieldId, result) => {
          setResults((prev) => ({ ...prev, [fieldId]: result }));

          // Preload file info for this result
          preloadFileInfo({ [fieldId]: result }).catch((err) =>
            console.error("[useResults] Error preloading file info:", err)
          );

          // Save to database
          try {
            await runPromise;
            const resultId = await azureApiClient.saveResult({
              run_id: runId,
              field_id: fieldId,
              value: result,
              metadata: {},
              status: "completed",
            });
            setResultIds((prev) => ({ ...prev, [fieldId]: resultId }));
          } catch (err) {
            // Result saved to state but not persisted
          }
        },
        // onError
        (fieldId, error) => {
          hasErrors = true;
          setFieldErrors((prev) => ({ ...prev, [fieldId]: error }));
          showError("Field Error", error);
        }
      );

      await runPromise;

      if (wasCancelled) {
        // Only show notification if whole template was stopped, not individual section
        if (!sectionAbortedRef.current) {
          showSuccess("Processing Cancelled", "Template processing stopped");
        }
        sectionAbortedRef.current = false;
      } else {
        await azureApiClient.updateRun(runId, {
          status: hasErrors ? "completed_with_errors" : "completed",
        });

        if (!hasErrors) {
          showSuccess(
            "Template Processed",
            "All fields completed successfully"
          );
        }
      }
    } catch (error) {
      setError(`Failed to process template: ${sanitizeErrorMessage(error)}`);
    }
  }, [
    isProcessingTemplate,
    processingFieldId,
    isLoadingFiles,
    selectedFileIds,
    template,
    selectedProjectId,
    fields,
    processAllFields,
    preloadFileInfo,
    setError,
    showSuccess,
    showError,
  ]);

  // Stop processing - now uses the clean stop() from useFieldProcessor
  const handleStopProcessing = useCallback(() => {
    stop();
  }, [stop]);

  // Abort single field - same as stop for single field mode
  const handleAbortField = useCallback(
    (fieldId: string) => {
      if (processingFieldId === fieldId) {
        // Mark that a section was aborted (notification handled by ResultsDisplay)
        sectionAbortedRef.current = true;
        stop();
      }
    },
    [processingFieldId, stop]
  );

  // Clear results
  const handleClearResults = useCallback(() => {
    try {
      setResults({});
      setFieldErrors({});
    } catch (err) {
      handleError(err, setError);
    }
  }, [setError]);

  // Update result metadata
  const updateResultMetadata = useCallback(
    async (fieldId: string, metadata: any) => {
      const resultId = resultIds[fieldId];
      if (!resultId) {
        return;
      }

      try {
        await azureApiClient.updateResultMetadata(resultId, metadata);

        setResults((prev) => {
          const existing = prev[fieldId] || { text: [], lineMap: {} };
          return {
            ...prev,
            [fieldId]: {
              ...existing,
              metadata,
            },
          };
        });
      } catch (error) {
        throw new Error(sanitizeErrorMessage(error));
      }
    },
    [resultIds]
  );

  return {
    results,
    setResults,
    updateResultMetadata,
    processingFieldId,
    isProcessingTemplate,
    currentProgress,
    fieldErrors,
    setFieldErrors,
    runs,
    selectedRun,
    setSelectedRun: setSelectedRunWithTracking,
    setRuns,
    loadStoredResults,
    processSingleFieldWithRetry,
    handleProcessTemplate,
    handleStopProcessing,
    handleAbortField,
    handleClearResults,
    handleDeleteRun,
  };
};
