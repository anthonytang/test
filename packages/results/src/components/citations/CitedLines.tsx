"use client";

import { useMemo, useEffect, useRef } from "react";
import {
  LineMapItem,
  getLineInfoForTag,
  parseTagToNumbers,
} from "@studio/core";
import { isExcelCitation } from "../../utils/excelCitationUtils";

interface CitedLinesProps {
  tags: string[];
  lineMap: Record<string, LineMapItem>;
  onTagSelect: (tag: string | null, lineNumbers: number[] | null) => void;
  selectedTag: string | null;
  fileInfoCache: Record<string, any>;
  fieldName?: string;
  fieldDescription?: string;
  projectDescription?: string;
  aiResponse?: string;
}

// Truncate Excel citation text if too long
const formatExcelCitation = (text: string): string => {
  const maxLength = 150;
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

export const CitedLines: React.FC<CitedLinesProps> = ({
  tags,
  lineMap,
  onTagSelect,
  selectedTag,
  fileInfoCache,
}) => {
  const citationRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  // Scroll to selected tag when it changes
  useEffect(() => {
    if (selectedTag && citationRefs.current[selectedTag]) {
      citationRefs.current[selectedTag]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedTag]);

  const content = useMemo(() => {
    // Calculate overall average score and group by file
    const uniqueTags = Array.from(new Set(tags));
    let totalScore = 0;
    let scoreCount = 0;

    // Group tags by file
    const tagsByFile: Record<string, {
      tags: string[];
      fileName: string;
      fileDetails: any;
      isWebsite: boolean;
    }> = {};

    uniqueTags.forEach((tag) => {
      const lineInfo = getLineInfoForTag(tag, lineMap);
      if (lineInfo && typeof lineInfo.score === "number") {
        totalScore += lineInfo.score;
        scoreCount++;
      }

      if (lineInfo?.file_id) {
        const fileId = lineInfo.file_id;
        if (!tagsByFile[fileId]) {
          const fileDetails = fileInfoCache[fileId];
          const isWebsite = fileDetails?.metadata?.source_type === "website";
          const fileName = isWebsite
            ? fileDetails?.metadata?.source_url || fileDetails?.name
            : fileDetails?.name || fileId;
          tagsByFile[fileId] = { tags: [], fileName, fileDetails, isWebsite };
        }
        tagsByFile[fileId].tags.push(tag);
      }
    });

    const averageScore = scoreCount > 0 ? totalScore / scoreCount : null;
    const sourceCount = Object.keys(tagsByFile).length;

    return (
      <>
        {/* Sticky Header Section */}
        <div className="sticky top-0 bg-white z-10 p-4 pb-3 border-b border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Sources
          </div>

          {/* Score and count row */}
          <div className="flex items-baseline justify-between gap-3 flex-nowrap overflow-hidden">
            {averageScore !== null && (
              <div className={`flex items-baseline gap-1.5 flex-shrink-0 ${
                averageScore >= 0.5
                  ? "text-score-high"
                  : averageScore >= 0.25
                  ? "text-score-medium"
                  : "text-score-low"
              }`}>
                <span className="text-4xl font-bold">
                  {(averageScore * 100).toFixed(0)}%
                </span>
                <span className="text-base font-medium">grounded</span>
              </div>
            )}
            <div className="text-base text-gray-500 whitespace-nowrap">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </div>
          </div>
        </div>

        {/* Scrollable Citations List - Sorted by File */}
        <div className="flex-1 overflow-y-auto p-4 pt-3 space-y-3">
          {Object.values(tagsByFile).flatMap(({ tags: fileTags, fileDetails, isWebsite }) =>
            fileTags.map((tag) => {
              const lineInfo = getLineInfoForTag(tag, lineMap);
              if (!lineInfo) return null;

              const lineNumber = lineInfo.local_num;
              const rawLineText = lineInfo.text || `Line ${lineNumber}`;
              const lineNumbers = parseTagToNumbers(tag);
              const isSelected = selectedTag === tag;

              // Check if this is an Excel citation
              const isExcel = isExcelCitation(lineInfo, fileInfoCache);

              // Format the line text for display - truncate long text to prevent overflow
              const maxLength = 150;
              const lineText = isExcel
                ? formatExcelCitation(rawLineText)
                : rawLineText.length > maxLength
                ? rawLineText.substring(0, maxLength) + "..."
                : rawLineText;

              // Get the score
              const score =
                typeof lineInfo.score === "number"
                  ? (lineInfo.score * 100).toFixed(1)
                  : null;

              // Get color classes based on score and selection state
              const colorClasses = !lineInfo.score
                ? isSelected
                  ? "bg-score-none-selected hover:bg-score-none-selected"
                  : "bg-score-none hover:bg-score-none-hover"
                : lineInfo.score >= 0.5
                ? isSelected
                  ? "bg-score-high-selected hover:bg-score-high-selected"
                  : "bg-score-high hover:bg-score-high-hover"
                : lineInfo.score >= 0.25
                ? isSelected
                  ? "bg-score-medium-selected hover:bg-score-medium-selected"
                  : "bg-score-medium hover:bg-score-medium-hover"
                : isSelected
                ? "bg-score-low-selected hover:bg-score-low-selected"
                : "bg-score-low hover:bg-score-low-hover";

              return (
                <button
                  key={tag}
                  ref={(el) => {
                    citationRefs.current[tag] = el;
                  }}
                  onClick={(e) => {
                    if (window.getSelection()?.toString()) return;
                    e.preventDefault();
                    onTagSelect(
                      isSelected ? null : tag,
                      isSelected ? null : lineNumbers
                    );
                  }}
                  className={`w-full text-left border border-gray-300 rounded-lg overflow-hidden transition-all duration-200 group ${colorClasses}`}
                >
                  <div className="p-3 text-sm select-text">
                    <div className="flex flex-col gap-1">
                      {/* File name and page on same line */}
                      {fileDetails && (
                        <div
                          className={`text-xs font-medium flex items-center gap-2 ${
                            !lineInfo.score
                              ? "text-score-none"
                              : lineInfo.score >= 0.5
                              ? "text-score-high"
                              : lineInfo.score >= 0.25
                              ? "text-score-medium"
                              : "text-score-low"
                          }`}
                        >
                          <span
                            className="overflow-hidden whitespace-nowrap text-ellipsis"
                            title={
                              isWebsite
                                ? fileDetails.metadata?.source_url || fileDetails.name
                                : fileDetails.name
                            }
                          >
                            {isWebsite
                              ? fileDetails.metadata?.source_url || fileDetails.name
                              : fileDetails.name}
                          </span>
                          {!isWebsite && fileDetails.page_map?.[lineNumber] && (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="flex-shrink-0">
                                {fileDetails.page_map[lineNumber]}
                              </span>
                            </>
                          )}
                          {isExcel && lineInfo.sheet_name && (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="flex-shrink-0">
                                {lineInfo.sheet_name}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      <div className="mt-2 whitespace-pre-wrap break-words">
                        {lineText}
                      </div>
                    </div>
                  </div>

                  {/* Score Display */}
                  {score && (
                    <div
                      className={`px-3 py-2 border-t flex items-center transition-all duration-200 ${
                        !lineInfo.score
                          ? isSelected
                            ? "bg-score-none-hover border-score-none"
                            : "bg-white group-hover:bg-score-none/30 border-gray-300"
                          : lineInfo.score >= 0.5
                          ? isSelected
                            ? "bg-score-high-hover border-score-high"
                            : "bg-white group-hover:bg-score-high/30 border-gray-300"
                          : lineInfo.score >= 0.25
                          ? isSelected
                            ? "bg-score-medium-hover border-score-medium"
                            : "bg-white group-hover:bg-score-medium/30 border-gray-300"
                          : isSelected
                          ? "bg-score-low-hover border-score-low"
                          : "bg-white group-hover:bg-score-low/30 border-gray-300"
                      }`}
                    >
                      <span
                        className={`text-lg font-bold ${
                          (lineInfo.score || 0) >= 0.5
                            ? "text-score-high"
                            : (lineInfo.score || 0) >= 0.25
                            ? "text-score-medium"
                            : "text-score-low"
                        }`}
                      >
                        {((lineInfo.score || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </>
    );
  }, [tags, lineMap, selectedTag, fileInfoCache, onTagSelect]);

  return (
    <div className="h-full flex flex-col">
      {content}
    </div>
  );
};
