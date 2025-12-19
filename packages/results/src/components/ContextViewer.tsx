"use client";

import { useEffect, useRef, useMemo, useState, useLayoutEffect } from "react";
import { LineMapItem } from "@studio/core";
import { azureApiClient } from "@studio/api";
import { MarkdownText } from "@studio/ui";
import { isExcelCitation, getExcelFileMap } from "../utils/excelCitationUtils";
import { ExcelCitationViewer } from "../components/citations/ExcelCitationViewer";

// COMMENTED OUT: Complex coordinate lookup approach - too brittle for calculated values
interface ContextViewerProps {
  lineMap: Record<string, LineMapItem>;
  selectedLines: string[]; // Changed from number[] to string[] since citation IDs are strings
  fileInfoCache: Record<string, any>;
  aiResponseText?: string; // AI response text to match values against
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
  lineMap,
  selectedLines,
  fileInfoCache,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerSelectedLineRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  // const lastScrollPositionRef = useRef<number>(0);
  const hasScrolledToSelection = useRef(false);

  // Get file details from cache - selectedLines now contains citation IDs
  const firstSelectedTag = selectedLines[0];

  // Find the lineMap entry - the lineMap now uses citation IDs as keys
  // We need to find the entry that matches our selected citation tag
  let selectedLineInfo = null;

  // First, try to find the lineMap entry by looking for the citation ID directly
  if (firstSelectedTag && lineMap[firstSelectedTag]) {
    selectedLineInfo = lineMap[firstSelectedTag];
  }

  // If no direct match found, try to find by original tag or display tag
  if (!selectedLineInfo && firstSelectedTag) {
    for (const [_citationId, lineInfo] of Object.entries(lineMap)) {
      // Check if this entry has the original tag or display tag that matches
      if (lineInfo.display_tag === firstSelectedTag) {
        selectedLineInfo = lineInfo;
        break;
      }
    }
  }

  // If still no match, try to find any entry that might work
  if (!selectedLineInfo && Object.keys(lineMap).length > 0) {
    // Just take the first entry as a fallback for debugging
    const firstEntry = Object.values(lineMap)[0];
    selectedLineInfo = firstEntry;
  }

  const fileDetails = selectedLineInfo?.file_id
    ? fileInfoCache[selectedLineInfo.file_id]
    : null;

  // Removed - scrolling now happens in the visible range effect

  // Handle scroll to dynamically expand visible range
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Expand range if near top or bottom
      const threshold = 600; // pixels from edge (expand much earlier)
      const expandBy = 500; // number of lines to expand (much more aggressive)

      if (scrollTop < threshold) {
        setVisibleRange((prev) => {
          const newStart = Math.max(0, prev.start - expandBy);
          if (newStart < prev.start) {
            return { start: newStart, end: prev.end };
          }
          return prev;
        });
      } else if (scrollTop + clientHeight > scrollHeight - threshold) {
        setVisibleRange((prev) => {
          const newEnd = prev.end + expandBy;
          if (newEnd > prev.end) {
            return { start: prev.start, end: newEnd };
          }
          return prev;
        });
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Initialize visible range based on highlighted lines and then scroll
  useEffect(() => {
    if (!selectedLineInfo || !fileDetails) return;

    const localLineNumbers = new Set<number>();

    if (selectedLineInfo.is_grouped && selectedLineInfo.local_num) {
      const startLocalNum = selectedLineInfo.local_num;
      // Parse the display_tag to get the range (e.g., "20-25")
      const rangeMatch = selectedLineInfo.display_tag?.match(/(\d+)-(\d+)/);
      const numLines = rangeMatch ? parseInt(rangeMatch[2]) - parseInt(rangeMatch[1]) + 1 : 1;
      for (let i = 0; i < numLines; i++) {
        localLineNumbers.add(startLocalNum + i);
      }
    } else if (selectedLineInfo.local_num) {
      localLineNumbers.add(selectedLineInfo.local_num);
    }

    const lineNumbers = Object.keys(fileDetails.file_map)
      .map(Number)
      .sort((a, b) => a - b);

    const sortedLocalNums = Array.from(localLineNumbers).sort((a, b) => a - b);
    const centerLocalLineNum =
      sortedLocalNums[Math.floor(sortedLocalNums.length / 2)];

    if (centerLocalLineNum) {
      const centerSelectedIndex = lineNumbers.findIndex(
        (num) => num === centerLocalLineNum
      );

      if (centerSelectedIndex >= 0) {
        const windowStart = Math.max(0, centerSelectedIndex - 50);
        const windowEnd = Math.min(lineNumbers.length, windowStart + 100);

        setVisibleRange({ start: windowStart, end: windowEnd });
      }
    }
  }, [selectedLineInfo, fileDetails]);

  // Scroll to center the selected lines after content renders
  useLayoutEffect(() => {
    if (!centerSelectedLineRef.current || !containerRef.current) return;
    if (visibleRange.start === 0 && visibleRange.end === 0) return;
    if (hasScrolledToSelection.current) return;

    const lineElement = centerSelectedLineRef.current;
    const container = containerRef.current;

    // Center the middle line in the viewport
    const containerHeight = container.clientHeight;
    const lineTop = lineElement.offsetTop;
    const lineHeight = lineElement.clientHeight;
    const scrollTop = lineTop - containerHeight / 2 + lineHeight / 2;

    container.scrollTop = scrollTop;
    hasScrolledToSelection.current = true;
  }, [visibleRange]);

  // Reset the scroll flag when selection changes
  useEffect(() => {
    hasScrolledToSelection.current = false;
  }, [selectedLineInfo, selectedLines]);

  const content = useMemo(() => {
    if (!selectedLineInfo || !fileDetails) {
      return null;
    }

    // Check if this is an Excel citation
    const isExcel = isExcelCitation(selectedLineInfo, fileInfoCache);

    // COMMENTED OUT: Coordinate extraction is too brittle for calculated/aggregated values
    /* let citedCell = null;
    if (isExcel && aiResponseText && selectedLineInfo.text && selectedLineInfo.text.includes(' | ') && !selectedLineInfo.text.includes('CELL_RECORD:')) {
      // New simple approach: extract coordinate from matched value
      const result = extractMatchedValueAndCoordinate(aiResponseText, selectedLineInfo.text, selectedLineInfo, fileInfoCache);
      citedCell = result?.coordinate || null;
    } else if (isExcel) {
      // Legacy approach: use existing extraction method
      citedCell = extractCellCoordinate(selectedLineInfo.text || '');
    } */

    // No coordinate extraction - Excel context will show without specific cell highlighting

    console.log("Excel citation debug:", {
      isExcel,
      selectedLineText: selectedLineInfo.text,
    });
    const excelFileMap =
      isExcel && selectedLineInfo.file_id
        ? getExcelFileMap(
            selectedLineInfo.file_id,
            fileInfoCache,
            selectedLineInfo.text,
            selectedLineInfo
          )
        : null;

    // If Excel citation, show table viewer instead of text
    if (isExcel && excelFileMap) {
      console.log("Rendering ExcelCitationViewer with data:", {
        hasExcelFileMap: !!excelFileMap,
        sheetName: excelFileMap.sheet_name,
        hasCells: !!excelFileMap.cells,
        cellsCount: excelFileMap.cells
          ? Object.keys(excelFileMap.cells).length
          : 0,
        dimensions: excelFileMap.dimensions,
      });
      return (
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-gray-300">
            <div className="flex items-center gap-2">
              <svg
                className="h-3.5 w-3.5 text-blue-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <button
                onClick={async () => {
                  try {
                    const downloadUrl = await azureApiClient.getFileDownloadUrl(
                      fileDetails.path
                    );
                    if (downloadUrl) {
                      window.open(downloadUrl, "_blank");
                    } else {
                      throw new Error("Failed to generate download URL");
                    }
                  } catch (err) {
                    console.error("Error accessing file:", err);
                    alert("Failed to access file. Please try again.");
                  }
                }}
                className="text-xs text-gray-700 hover:text-accent overflow-hidden whitespace-nowrap flex-1 text-left transition-colors"
                title={fileDetails.name}
              >
                {fileDetails.name}
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <ExcelCitationViewer
              excelFileMap={excelFileMap}
              citedCell={(selectedLineInfo as any)?.excel_coord || null}
              citedRowLabel={null}
              className="w-full h-full"
            />
          </div>
        </div>
      );
    }

    // Convert selectedLines (citation IDs) to local_num values for highlighting
    const localLineNumbers = new Set<number>();

    // For grouped tags, calculate consecutive local line numbers from the first line
    if (selectedLineInfo.is_grouped && selectedLineInfo.local_num) {
      const startLocalNum = selectedLineInfo.local_num;
      // Parse the display_tag to get the range (e.g., "20-25")
      const rangeMatch = selectedLineInfo.display_tag?.match(/(\d+)-(\d+)/);
      const numLines = rangeMatch ? parseInt(rangeMatch[2]) - parseInt(rangeMatch[1]) + 1 : 1;

      // Add consecutive local line numbers starting from the first
      for (let i = 0; i < numLines; i++) {
        localLineNumbers.add(startLocalNum + i);
      }
    } else if (selectedLineInfo.local_num) {
      // For single tags, use the local_num directly
      localLineNumbers.add(selectedLineInfo.local_num);
    }

    // Get all line numbers from the file_map (these are local_num values)
    const lineNumbers = Object.keys(fileDetails.file_map)
      .map(Number)
      .sort((a, b) => a - b);

    // Find the center of the selected lines for better scrolling/centering
    const sortedLocalNums = Array.from(localLineNumbers).sort((a, b) => a - b);
    const centerLocalLineNum =
      sortedLocalNums[Math.floor(sortedLocalNums.length / 2)];

    // Use the visible range that was calculated in the initialization effect
    const linesToRender = lineNumbers.slice(
      visibleRange.start,
      visibleRange.end
    );

    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-gray-300">
          <div className="flex items-center gap-2">
            <svg
              className="h-3.5 w-3.5 text-gray-400 flex-shrink-0"
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
            <button
              onClick={async () => {
                try {
                  if (fileDetails.metadata?.source_type === "website") {
                    // For websites, open the source URL directly
                    const url =
                      fileDetails.metadata?.source_url || fileDetails.path;
                    window.open(url, "_blank");
                  } else {
                    // For files, use Azure API client for file download
                    const downloadUrl = await azureApiClient.getFileDownloadUrl(
                      fileDetails.path
                    );
                    if (downloadUrl) {
                      window.open(downloadUrl, "_blank");
                    } else {
                      throw new Error("Failed to generate download URL");
                    }
                  }
                } catch (err) {
                  console.error("Error accessing file:", err);
                  alert("Failed to access file. Please try again.");
                }
              }}
              className="text-xs text-gray-700 hover:text-accent overflow-hidden whitespace-nowrap flex-1 text-left transition-colors"
              title={fileDetails.metadata?.source_type === "website" ? (fileDetails.metadata?.source_url || fileDetails.name) : fileDetails.name}
            >
              {fileDetails.name}
            </button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="relative">
              {linesToRender.map((num) => {
                const isSelected = localLineNumbers.has(num);
                const isCenterSelected = num === centerLocalLineNum;
                return (
                  <div
                    key={num}
                    ref={isCenterSelected ? centerSelectedLineRef : null}
                    className={`py-1 ${
                      isSelected ? "bg-accent-100 -mx-4 px-4" : "px-0"
                    }`}
                  >
                    <MarkdownText
                      text={fileDetails.file_map[num] || ""}
                      className="whitespace-pre-wrap break-words font-lato text-[13px] leading-relaxed"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }, [selectedLineInfo, fileDetails, visibleRange, fileInfoCache]); // eslint-disable-line react-hooks/exhaustive-deps

  return content;
};
