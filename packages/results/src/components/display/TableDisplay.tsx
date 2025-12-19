"use client";

import React, { useState } from "react";
import { getAggregatedCitationInfo, ProcessedResults } from "@studio/core";
import { getTagColorClasses } from "@studio/ui";

interface TableDisplayProps {
  tableData: any;
  fieldId: string;
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
  results: ProcessedResults;
}

export const TableDisplay: React.FC<TableDisplayProps> = ({
  tableData,
  fieldId,
  selectedSentence,
  setSelectedSentence,
  setSelectedTag,
  results,
}) => {
  // State to track which specific cell is selected (row and column index)
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isScrolledLeft, setIsScrolledLeft] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Clear selectedCell when selectedSentence is cleared externally or when it's from a different field
  // Note: ESC key is handled by parent component which clears selectedSentence,
  // which then triggers this effect to clear selectedCell
  React.useEffect(() => {
    if (!selectedSentence || selectedSentence.fieldId !== fieldId) {
      setSelectedCell(null);
    }
  }, [selectedSentence, fieldId]);

  // Check if table needs horizontal scrolling
  React.useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } =
          scrollContainerRef.current;
        setCanScrollRight(
          scrollWidth > clientWidth &&
            scrollLeft < scrollWidth - clientWidth - 1
        );
        setIsScrolledLeft(scrollLeft > 1);
      }
    };

    checkScroll();
    // Small delay to ensure table is rendered
    setTimeout(checkScroll, 100);
    window.addEventListener("resize", checkScroll);

    return () => window.removeEventListener("resize", checkScroll);
  }, [tableData]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollRight(
        scrollWidth > clientWidth && scrollLeft < scrollWidth - clientWidth - 1
      );
      setIsScrolledLeft(scrollLeft > 1);
    }
  };

  if (!tableData?.rows || !Array.isArray(tableData.rows)) return null;

  const headerRow = tableData.rows[0];
  const dataRows = tableData.rows.slice(1);

  // Function to copy table data for Excel and PowerPoint
  const copyToExcel = async () => {
    try {
      // Build tab-separated values with CRLF line endings for Excel
      // CRLF (\r\n) works on both Windows and Mac
      const headers = headerRow.cells.map((cell: any) => cell.text).join("\t");
      const rows = dataRows
        .map((row: any) => row.cells.map((cell: any) => cell.text).join("\t"))
        .join("\r\n");
      const tableText = `${headers}\r\n${rows}`;

      // Build HTML table for PowerPoint
      const htmlHeaders = headerRow.cells
        .map((cell: any) => `<th>${cell.text}</th>`)
        .join("");
      const htmlRows = dataRows
        .map(
          (row: any) =>
            "<tr>" +
            row.cells.map((cell: any) => `<td>${cell.text}</td>`).join("") +
            "</tr>"
        )
        .join("");
      const htmlTable = `<table><thead><tr>${htmlHeaders}</tr></thead><tbody>${htmlRows}</tbody></table>`;

      // Copy both formats - Excel uses text/plain, PowerPoint uses text/html
      const clipboardItem = new ClipboardItem({
        "text/plain": new Blob([tableText], { type: "text/plain" }),
        "text/html": new Blob([htmlTable], { type: "text/html" }),
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy with ClipboardItem:", err);
      // Fallback to simple text copy with CRLF
      try {
        const headers = headerRow.cells
          .map((cell: any) => cell.text)
          .join("\t");
        const rows = dataRows
          .map((row: any) => row.cells.map((cell: any) => cell.text).join("\t"))
          .join("\r\n");
        const tableText = `${headers}\r\n${rows}`;
        await navigator.clipboard.writeText(tableText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy also failed:", fallbackErr);
      }
    }
  };

  // Handle click on container to deselect
  const handleContainerClick = () => {
    setSelectedCell(null);
    setSelectedSentence(null);
    setSelectedTag(null);
  };

  return (
    <div className="mb-4 relative" onClick={handleContainerClick}>
      {/* Small copy button positioned outside on the right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          copyToExcel();
        }}
        className="absolute -right-10 top-0 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Copy for Excel"
      >
        {copied ? (
          <svg
            className="h-4 w-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>

      {/* Table container with indicators */}
      <div className="relative">
        {/* Left scroll indicator - fixed position */}
        {isScrolledLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none flex items-center justify-start pl-2 rounded-l-lg">
            <div className="text-gray-400 animate-pulse">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Right scroll indicator - fixed position */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none flex items-center justify-end pr-2 rounded-r-lg">
            <div className="text-gray-400 animate-pulse">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Scrollable table container */}
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm"
          onScroll={handleScroll}
        >
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-100">
              <tr>
                {headerRow.cells.map((cell: any, cellIndex: number) => (
                  <th
                    key={`header-${cellIndex}`}
                    className="px-6 py-3 text-left text-sm font-semibold text-gray-700 whitespace-nowrap"
                  >
                    {cell.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-300">
              {dataRows.map((row: any, rowIndex: number) => (
                <tr key={`row-${rowIndex}`} className="transition-colors">
                  {row.cells.map((cell: any, cellIndex: number) => {
                    const isSelected =
                      selectedCell?.row === rowIndex &&
                      selectedCell?.col === cellIndex;
                    return (
                      <td
                        key={`cell-${rowIndex}-${cellIndex}`}
                        className={`px-6 py-4 text-sm ${
                          cellIndex === 0
                            ? "font-medium text-gray-900 whitespace-nowrap"
                            : "text-gray-700"
                        } ${
                          cell.tags && cell.tags.length > 0
                            ? `cursor-pointer transition-colors ${
                                isSelected ? "bg-accent-50" : "hover:bg-gray-50"
                              }`
                            : "cursor-default"
                        }`}
                        onClick={
                          cell.tags && cell.tags.length > 0
                            ? (e) => {
                                e.stopPropagation(); // Prevent deselection when clicking cells
                                if (
                                  selectedCell?.row === rowIndex &&
                                  selectedCell?.col === cellIndex
                                ) {
                                  // Deselect if clicking the same cell
                                  setSelectedCell(null);
                                  setSelectedSentence(null);
                                  setSelectedTag(null);
                                } else {
                                  // Select the new cell
                                  setSelectedCell({
                                    row: rowIndex,
                                    col: cellIndex,
                                  });
                                  setSelectedSentence({
                                    fieldId,
                                    line: cell.text,
                                    tags: cell.tags,
                                  });
                                  setSelectedTag(null);
                                }
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1">{cell.text}</span>
                          {cell.tags &&
                            cell.tags.length > 0 &&
                            (() => {
                              const uniqueTags = Array.from(
                                new Set(cell.tags as string[])
                              );
                              const citationInfo = getAggregatedCitationInfo(
                                uniqueTags,
                                results.lineMap
                              );
                              const isTagSelected =
                                selectedCell?.row === rowIndex &&
                                selectedCell?.col === cellIndex;

                              // Simple tooltip text
                              const tooltipText =
                                citationInfo.count === 1
                                  ? "View source"
                                  : `View ${citationInfo.count} sources`;

                              return (
                                <span
                                  className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 cursor-pointer ${
                                    citationInfo.averageScore !== null
                                      ? getTagColorClasses(
                                          citationInfo.averageScore,
                                          isTagSelected
                                        )
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  } transition-colors`}
                                  title={tooltipText}
                                >
                                  {citationInfo.count}
                                </span>
                              );
                            })()}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
