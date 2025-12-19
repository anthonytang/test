"use client";

import React, { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ProcessedResults, Field } from "@studio/core";
import { ErrorDisplay } from "../components/evidence/ErrorDisplay";
import { TableDisplay } from "../components/display/TableDisplay";
import { ChartDisplay } from "../components/display/ChartDisplay";
import { TextDisplay } from "../components/display/TextDisplay";
import { EvidenceAnalysisDisplay } from "../components/evidence/EvidenceAnalysisDisplay";
import { useAuthUser } from "@studio/auth";
import { useNotifications } from "@studio/notifications";

interface ResultsDisplayProps {
  results: ProcessedResults | undefined;
  resultMetadata?: any;
  onUpdateResultMetadata?: (metadata: any) => void;
  fieldName: string;
  fieldId: string;
  field?: Field;
  selectedSentence: { fieldId: string; line: string; tags: string[] } | null;
  setSelectedSentence: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      line: string;
      tags: string[];
    } | null>
  >;
  setSelectedTag: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      tag: string;
      lineNumbers: number[];
    } | null>
  >;
  error?: string;
  isEditing?: boolean;
  onProcessField?: () => void;
  onAbort?: () => void; // Callback to clear processing state
  isProcessing?: boolean; // This field is processing
  isAnyProcessing?: boolean; // Any field or template is processing
  currentProgress?: { stage: string; progress: number; message: string } | null; // Progress state from useFieldProcessor
  hasFiles?: boolean;
  projectId?: string; // For web search import
  onImportComplete?: () => void; // Called after web sources imported
  isReadOnly?: boolean; // Disable search/import for historical view
}

// Helper function to check if the field is a table type
const isTableField = (field?: Field): boolean => {
  return field?.metadata.type === "table";
};

// Helper function to check if the field is a chart type
const isChartField = (field?: Field): boolean => {
  return field?.metadata.type === "chart";
};

// Helper function to get structured data (table/chart)
// Backend guarantees: results.text[0] contains {rows: [...], suggested_chart_type?: "..."} for table/chart fields
const getStructuredData = (
  results: ProcessedResults,
  field?: Field
): any | null => {
  // Only extract if field type is table or chart
  if (!field || (!isTableField(field) && !isChartField(field))) {
    return null;
  }

  if (
    !results?.text ||
    !Array.isArray(results.text) ||
    results.text.length === 0
  ) {
    return null;
  }

  // Backend wraps table/chart data in results.text[0]
  const data = results.text[0];

  // Validate structure
  if (data && typeof data === "object" && "rows" in data) {
    return data;
  }

  return null;
};

// Helper function to render JSON table
const renderJsonTable = (
  tableData: any,
  fieldId: string,
  selectedSentence: { fieldId: string; line: string; tags: string[] } | null,
  setSelectedSentence: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      line: string;
      tags: string[];
    } | null>
  >,
  setSelectedTag: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      tag: string;
      lineNumbers: number[];
    } | null>
  >,
  results: ProcessedResults
) => {
  return (
    <TableDisplay
      tableData={tableData}
      fieldId={fieldId}
      selectedSentence={selectedSentence}
      setSelectedSentence={setSelectedSentence}
      setSelectedTag={setSelectedTag}
      results={results}
    />
  );
};

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  onUpdateResultMetadata,
  fieldName,
  fieldId,
  field,
  selectedSentence,
  setSelectedSentence,
  setSelectedTag,
  error,
  isEditing = false,
  onProcessField,
  onAbort,
  isProcessing = false,
  isAnyProcessing = false,
  currentProgress = null,
  hasFiles = true,
  projectId,
  onImportComplete,
  isReadOnly = false,
}) => {
  const params = useParams();
  const { showError } = useNotifications();

  // Determine if results should be shown based on evidence score
  const evScore = results?.evidenceAnalysis?.sufficiency_score ?? 0; // Use nullish coalescing to handle 0 scores properly
  const defaultShow = evScore >= 40; // Show by default if score >= 40
  const [showResults, setShowResults] = useState(defaultShow);

  // Update default when evidence score changes
  React.useEffect(() => {
    setShowResults(evScore >= 40);
  }, [evScore]);

  // Use passed currentProgress prop instead of calling getProgress
  const fieldProgress = currentProgress;
  const { showSuccess } = useNotifications();
  const { getAccessToken } = useAuthUser();

  // Extract structured data (table/chart) based on field type
  const structuredData = useMemo(() => {
    if (!results || !field) return null;
    return getStructuredData(results, field);
  }, [results, field]);

  // Detect data errors and show notification
  React.useEffect(() => {
    if (!results?.text || typeof results.text === "string") return;

    // Chart field missing data
    if (isChartField(field) && !structuredData) {
      showError("Invalid Chart Data", "Response not formatted correctly.");
    }

    // Table field missing data
    if (isTableField(field) && !structuredData) {
      showError("Invalid Table Data", "Response not formatted correctly.");
    }
  }, [results, field, structuredData, showError]);

  const formatTextWithTags = useMemo(() => {
    if (!results?.text) return null;
    if (typeof results.text === "string") return null;

    // 1. CHART TYPE: Render chart if field type is 'chart'
    if (isChartField(field)) {
      if (!structuredData) {
        return null; // Return empty state - notification shown by useEffect above
      }

      if (!onUpdateResultMetadata || !field) {
        return null; // Return empty state
      }

      return (
        <ChartDisplay
          chartData={structuredData}
          field={field}
          fieldId={fieldId}
          selectedSentence={selectedSentence}
          setSelectedSentence={setSelectedSentence}
          setSelectedTag={setSelectedTag}
          results={results}
          onUpdateResultMetadata={onUpdateResultMetadata}
          isEditing={isEditing}
        />
      );
    }

    // 2. TABLE TYPE: Render table if field type is 'table'
    if (isTableField(field)) {
      if (!structuredData) {
        return null; // Return empty state - notification shown by useEffect above
      }

      return renderJsonTable(
        structuredData,
        fieldId,
        selectedSentence,
        setSelectedSentence,
        setSelectedTag,
        results
      );
    }

    // 3. TEXT TYPE: Default display for text fields
    return (
      <TextDisplay
        results={results}
        fieldId={fieldId}
        fieldName={fieldName}
        selectedSentence={selectedSentence}
        setSelectedSentence={setSelectedSentence}
        setSelectedTag={setSelectedTag}
      />
    );
  }, [
    results,
    fieldId,
    fieldName,
    field,
    structuredData,
    selectedSentence,
    setSelectedSentence,
    setSelectedTag,
    onUpdateResultMetadata,
    isEditing,
  ]);

  // Show error if there's an error for this field
  if (error) {
    return <ErrorDisplay error={error} fieldName={fieldName} />;
  }

  if (
    isProcessing ||
    !results ||
    !results.text ||
    (Array.isArray(results.text) && results.text.length === 0)
  ) {
    // Show placeholder box if field hasn't been run or is currently processing
    return (
      <div className="relative">
        <div
          className={`border border-dashed rounded-lg text-center flex items-center justify-center transition-colors ${
            isEditing ? "h-[120px]" : "h-[100px]"
          } ${
            !isEditing &&
            onProcessField &&
            !isProcessing &&
            !isAnyProcessing &&
            hasFiles
              ? "bg-gray-50 border-gray-300 cursor-pointer hover:bg-gray-100 hover:border-gray-400"
              : "bg-gray-50/50 border-gray-300 cursor-default"
          }`}
          onClick={
            !isEditing &&
            onProcessField &&
            !isProcessing &&
            !isAnyProcessing &&
            hasFiles
              ? onProcessField
              : undefined
          }
        >
          <div className="flex flex-col items-center p-2 w-full max-w-md overflow-hidden">
            {isProcessing ? (
              <svg
                className="w-6 h-6 animate-spin text-accent mb-1"
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
              <svg
                className="w-6 h-6 text-gray-400 mb-1"
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
            )}
            <p className="text-gray-500 text-xs font-medium">
              {isProcessing
                ? fieldProgress
                  ? `${fieldProgress.progress}%`
                  : "0%"
                : "Empty"}
            </p>
          </div>
        </div>
        {/* Abort button for active processing */}
        {isProcessing && (
          <button
            onClick={(e) => {
              e.stopPropagation();

              // Call the abort callback (handles everything)
              if (onAbort) {
                onAbort();
              }

              showSuccess(
                "Processing Cancelled",
                `Processing cancelled for ${fieldName}`
              );
            }}
            className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Cancel processing"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Render the table and sources section
  return (
    <div className="text-gray-700">
      {/* Evidence Analysis Display - Show first for poor evidence */}
      {results?.evidenceAnalysis && (
        <div className="mb-4">
          <EvidenceAnalysisDisplay
            evidenceAnalysis={results.evidenceAnalysis}
            fieldName={fieldName}
            isCompact={true}
            showResults={showResults}
            onToggleResults={(show) => setShowResults(show)}
            projectId={projectId || (params.projectId as string) || ""}
            onImportComplete={onImportComplete}
            onRerun={onProcessField}
            isReadOnly={isReadOnly}
            getAccessToken={async () => {
              const token = await getAccessToken();
              return token || null;
            }}
          />
        </div>
      )}

      {/* Results - can be hidden for poor evidence */}
      {showResults && (
        <div className="text-base relative">
          {formatTextWithTags}

          {/* Queries toggle button - hidden */}
        </div>
      )}
    </div>
  );
};
