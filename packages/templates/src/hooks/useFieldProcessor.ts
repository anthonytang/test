/**
 * useFieldProcessor - Field processing with SSE progress updates
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Field, ProcessedResults } from "@studio/core";
import { useAuthUser } from "@studio/auth";
import { BackendClient } from "@studio/api";

interface ActiveProcess {
  processingId: string;
  fieldId: string;
  eventSource: EventSource | null;
  abortController: AbortController;
}

export interface Progress {
  stage: string;
  progress: number;
  message: string;
}

// Helper to determine if we're talking to a local FastAPI backend
function isLocalBackend(): boolean {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";
  return backendUrl.startsWith("http://localhost");
}

// Helper to build the correct SSE URL for field processing
// - Local: browser connects directly to FastAPI (no APIM / CORS)
// - Cloud: browser connects to Next.js API route, which proxies to APIM
function getFieldSSEUrl(fieldId: string, token?: string): string {
  if (isLocalBackend()) {
    return BackendClient.getSSEUrl(`/process/field/${fieldId}/stream`, token);
  }

  return token
    ? `/api/process/field/${fieldId}/stream?token=${encodeURIComponent(token)}`
    : `/api/process/field/${fieldId}/stream`;
}

export function useFieldProcessor(
  fileIds: string[],
  projectMetadata: Record<string, any>,
  templateMetadata: Record<string, any>,
) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<Progress | null>(null);

  const activeProcessRef = useRef<ActiveProcess | null>(null);
  const cancelledRef = useRef(false);
  const { getAccessToken } = useAuthUser();

  const processField = useCallback(async (
    field: Field,
    dependentResults: Array<{ field_id: string; field_name: string; response: string }>,
  ): Promise<ProcessedResults | null> => {
    // Clear any existing processing
    if (activeProcessRef.current) {
      activeProcessRef.current.abortController.abort();
      activeProcessRef.current.eventSource?.close();
    }

    setActiveFieldId(field.id);
    setCurrentProgress({ stage: 'starting', progress: 0, message: 'Initializing...' });

    const abortController = new AbortController();

    try {
      const token = await getAccessToken();
      if (abortController.signal.aborted) {
        setActiveFieldId(null);
        return null;
      }

      // Start processing (with 30s timeout)
      const startResponse = await Promise.race([
        // Local: browser → FastAPI directly (no APIM / CORS)
        // Cloud: browser → Next.js API route → APIM → FastAPI
        isLocalBackend()
          ? BackendClient.fetch(`/process/field/${field.id}/start`, {
              method: "POST",
              token: token || undefined,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                field_id: field.id,
                field_name: field.name,
                field_description: field.description || "",
                file_ids: fileIds,
                project_metadata: projectMetadata,
                template_metadata: templateMetadata,
                output_format: field.metadata.type,
                execution_mode: "both",
                dependent_field_results: dependentResults,
              }),
              signal: abortController.signal,
            })
          : fetch("/api/process/field/start", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                fieldId: field.id,
                fieldName: field.name,
                fieldDescription: field.description || "",
                fileIds: fileIds,
                projectMetadata,
                templateMetadata,
                outputFormat: field.metadata.type,
                executionMode: "both",
                dependent_field_results: dependentResults,
              }),
              signal: abortController.signal,
            }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Request timeout - server did not respond")
              ),
            30000
          )
        ),
      ]);

      if (!startResponse.ok) {
        // Try to surface a meaningful error from the body if present
        const errorData = await startResponse
          .json()
          .catch(() => ({} as any));
        const message =
          (errorData?.error && (errorData.error.message || errorData.error)) ||
          errorData?.message ||
          "Failed to start processing";
        throw new Error(message);
      }

      // Local backend returns: { processingId, fieldId, ... }
      // Cloud via Next route returns: { status, data: { result: { processingId, ... }, ... } }
      const startJson: any = await startResponse.json().catch(() => ({}));
      const processingId: string | undefined =
        startJson?.processingId ??
        startJson?.data?.result?.processingId ??
        startJson?.data?.processingId;

      if (!processingId) {
        throw new Error("Backend did not return a processingId");
      }

      // Store in ref for sync access during stop()
      activeProcessRef.current = {
        processingId,
        fieldId: field.id,
        eventSource: null,
        abortController,
      };

      // Connect to SSE with retry
      const result = await new Promise<ProcessedResults | null>((resolve, reject) => {
        let retryCount = 0;
        const maxRetries = 3;
        let eventSource: EventSource | null = null;

        const connectSSE = () => {
          const sseUrl = getFieldSSEUrl(field.id, token || undefined);
          eventSource = new EventSource(sseUrl);
          if (activeProcessRef.current) {
            activeProcessRef.current.eventSource = eventSource;
          }

          eventSource.addEventListener('progress', (e) => {
            try {
              const data = JSON.parse(e.data);
              setCurrentProgress({
                stage: data.stage,
                progress: data.progress,
                message: data.message,
              });
            } catch {}
          });

          eventSource.addEventListener('completed', (e) => {
            eventSource?.close();
            try {
              const data = JSON.parse(e.data);
              resolve({
                text: data.results?.response || [],
                lineMap: data.results?.line_map || {},
                evidenceAnalysis: data.results?.evidence_analysis,
              });
            } catch {
              resolve({ text: [], lineMap: {} });
            }
          });

          eventSource.addEventListener('error', (e: any) => {
            eventSource?.close();
            if (e.data) {
              try {
                const data = JSON.parse(e.data);
                reject(new Error(data.error || 'Processing failed'));
                return;
              } catch {}
            }
            // Network error - retry
            if (retryCount < maxRetries) {
              retryCount++;
              const delay = Math.pow(2, retryCount) * 1000;
              setTimeout(connectSSE, delay);
            } else {
              reject(new Error('Connection failed after retries'));
            }
          });

          eventSource.addEventListener('cancelled', () => {
            eventSource?.close();
            resolve(null);
          });

          abortController.signal.addEventListener('abort', () => {
            eventSource?.close();
            resolve(null);
          });
        };

        connectSSE();
      });

      return result;

    } catch (err) {
      if (abortController.signal.aborted) return null;
      throw err;
    } finally {
      if (activeProcessRef.current?.fieldId === field.id) {
        setActiveFieldId(null);
        setCurrentProgress(null);
        activeProcessRef.current = null;
      }
    }
  }, [fileIds, projectMetadata, templateMetadata, getAccessToken]);

  const processAllFields = useCallback(async (
    fields: Field[],
    onResult: (fieldId: string, result: ProcessedResults) => void,
    onError?: (fieldId: string, error: string) => void,
  ): Promise<boolean> => {
    setIsProcessingAll(true);
    cancelledRef.current = false;

    const completedResults: Record<string, ProcessedResults> = {};

    for (const field of fields) {
      if (cancelledRef.current) {
        setIsProcessingAll(false);
        return true; // was cancelled
      }

      try {
        const depResults = getDependentResults(field, fields, completedResults);
        const result = await processField(field, depResults);

        if (result === null) {
          setIsProcessingAll(false);
          return true; // was cancelled
        }

        completedResults[field.id] = result;
        onResult(field.id, result);

      } catch (err) {
        onError?.(field.id, err instanceof Error ? err.message : 'Unknown error');
      }
    }

    setIsProcessingAll(false);
    return false; // completed normally
  }, [processField]);

  const stop = useCallback(() => {
    cancelledRef.current = true;

    // Sync capture before any async
    const current = activeProcessRef.current;

    // Immediate client-side cleanup
    if (current) {
      current.abortController.abort();
      current.eventSource?.close();
    }

    setActiveFieldId(null);
    setIsProcessingAll(false);
    setCurrentProgress(null);
    activeProcessRef.current = null;

    // Fire-and-forget backend abort
    if (current?.processingId) {
      getAccessToken().then(token => {
        const abortBody = JSON.stringify({
          processing_id: current.processingId,
        });

        const doAbort = () => {
          if (isLocalBackend()) {
            return BackendClient.fetch(
              `/process/field/${current.fieldId}/abort`,
              {
                method: "POST",
                token: token || undefined,
                headers: { "Content-Type": "application/json" },
                body: abortBody,
              }
            );
          }

          // Cloud: call through Next.js API route so CORS is handled server-side
          return fetch(`/api/process/field/${current.fieldId}/abort`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: abortBody,
          });
        };

        doAbort().catch(() => {});
      });
    }
  }, [getAccessToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (activeProcessRef.current) {
        activeProcessRef.current.abortController.abort();
        activeProcessRef.current.eventSource?.close();
      }
    };
  }, []);

  return {
    activeFieldId,
    isProcessing: activeFieldId !== null,
    isProcessingAll,
    currentProgress,
    processField,
    processAllFields,
    stop,
  };
}

function getDependentResults(
  field: Field,
  allFields: Field[],
  completedResults: Record<string, ProcessedResults>,
): Array<{ field_id: string; field_name: string; field_type: string; response: string }> {
  const deps = field.metadata?.dependencies;
  const depFieldIds = Array.isArray(deps) && deps.length > 0
    ? deps
    : allFields.slice(0, allFields.findIndex(f => f.id === field.id)).map(f => f.id);

  return depFieldIds
    .map(id => {
      const f = allFields.find(x => x.id === id);
      const r = completedResults[id];
      if (!f || !r?.text?.length) return null;

      const fieldType = f.metadata.type;
      let response: string;

      if (fieldType === 'table' || fieldType === 'chart') {
        response = JSON.stringify(r.text[0]);
      } else {
        response = r.text.map(item => item.line).join('\n');
      }

      return {
        field_id: f.id,
        field_name: f.name,
        field_type: fieldType,
        response,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
