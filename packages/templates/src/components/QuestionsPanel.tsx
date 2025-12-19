"use client";

import React, { useState, useMemo } from "react";

interface QuestionsPanelProps {
  results: Record<string, any>;
  fields: Array<{ id: string; name: string }>;
  onFieldClick?: (fieldId: string) => void;
  selectedRun?: string | null;
  isReadOnly?: boolean;
}

export const QuestionsPanel: React.FC<QuestionsPanelProps> = ({
  results,
  fields,
  onFieldClick,
  selectedRun,
  isReadOnly = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset to collapsed when selectedRun changes (new run or historical view)
  React.useEffect(() => {
    setIsExpanded(false);
  }, [selectedRun]);

  // Aggregate fields with issues from evidence analysis
  const fieldsWithIssues = useMemo(() => {
    const fieldMap: Record<
      string,
      {
        fieldId: string;
        fieldName: string;
        importance: "critical" | "high";
        score: number;
        summary: string;
        searchCount: number;
      }
    > = {};

    fields.forEach((field) => {
      const fieldResult = results[field.id];
      if (!fieldResult?.evidenceAnalysis) return;

      const analysis = fieldResult.evidenceAnalysis;
      const score = analysis.sufficiency_score || 0;

      if (score >= 70) return;

      const searchQueries = analysis.search_queries || [];
      const highPrioritySearches = searchQueries.filter(
        (q: any) => q.priority === "high"
      );

      // Use the summary from the analysis, or generate one based on searches
      let summaryText = analysis.summary || "";
      if (!summaryText && searchQueries.length > 0) {
        summaryText = `${searchQueries.length} suggested search${searchQueries.length > 1 ? "es" : ""}`;
        if (highPrioritySearches.length > 0) {
          summaryText += ` (${highPrioritySearches.length} high priority)`;
        }
      }

      if (!summaryText) return;

      fieldMap[field.id] = {
        fieldId: field.id,
        fieldName: field.name,
        importance: score < 40 ? "critical" : "high",
        score,
        summary: summaryText,
        searchCount: searchQueries.length,
      };
    });

    return Object.values(fieldMap).sort((a, b) => {
      const importanceOrder = { critical: 0, high: 1 };
      const importanceDiff =
        importanceOrder[a.importance] - importanceOrder[b.importance];
      if (importanceDiff !== 0) return importanceDiff;
      return a.score - b.score;
    });
  }, [results, fields]);

  const totalFieldCount = fieldsWithIssues.length;

  // Hide in read-only mode or if no issues
  if (totalFieldCount === 0 || isReadOnly) return null;

  return (
    <div className="mb-4 rounded-xl border border-gray-300 bg-white overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1 rounded-full bg-amber-50">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-800">
            {totalFieldCount} section{totalFieldCount > 1 ? "s" : ""} to review
          </span>
        </div>

        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Expanded list */}
      {isExpanded && (
        <div className="px-4 pb-3 border-t border-gray-100">
          <div className="mt-2 space-y-1">
            {fieldsWithIssues.map((field) => (
              <button
                key={field.fieldId}
                onClick={() => {
                  if (onFieldClick) {
                    onFieldClick(field.fieldId);
                    const element = document.getElementById(
                      `field-${field.fieldId}`
                    );
                    if (element) {
                      element.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      field.importance === "critical"
                        ? "bg-red-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <span className="text-sm text-gray-700">{field.fieldName}</span>
                </div>

                <svg
                  className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
