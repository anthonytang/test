"use client";

import { useMemo, useEffect, useRef } from "react";

/**
 * Convert 0-based column index to Excel column letter (A, B, ..., Z, AA, AB, ...)
 * Handles columns beyond Z correctly
 */
function colToExcel(col: number): string {
  let result = "";
  let remaining = col;
  while (remaining >= 0) {
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return result;
}

interface ExcelCell {
  value: any;
  type: "header" | "data";
  coord: string;
  row_label: string;
  column_path: string[];
  data_type: string;
  unit_info: Record<string, any>;
}

interface ExcelFileMap {
  sheet_name: string;
  table_id: string;
  dimensions: {
    start_row?: number;
    end_row?: number;
    start_col?: number;
    end_col?: number;
    total_rows?: number;
    total_cols?: number;
    max_row?: number;
    max_col?: number;
  };
  cells: Record<string, ExcelCell>;
  headers: string[][];
  data_start_row?: number;
  row_labels: Record<number, string>;
}

interface ExcelCitationViewerProps {
  excelFileMap: ExcelFileMap;
  citedCell: string | null;
  citedRowLabel?: string | null; // Row label to highlight entire row
  className?: string;
}

export const ExcelCitationViewer: React.FC<ExcelCitationViewerProps> = ({
  excelFileMap,
  citedCell,
  citedRowLabel,
  className = "",
}) => {
  const citedCellRef = useRef<HTMLTableCellElement>(null);
  const citedRowRef = useRef<HTMLTableRowElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableData = useMemo(() => {
    const { dimensions, cells } = excelFileMap;

    // Handle both old format (start_row, end_row) and new format (max_row, max_col)
    const start_row = dimensions.start_row ?? 1;
    const end_row = dimensions.end_row ?? dimensions.max_row ?? 1;
    const start_col = dimensions.start_col ?? 1;
    const end_col = dimensions.end_col ?? dimensions.max_col ?? 1;

    // Build table structure
    const table: Array<{
      cells: Array<{ cell: ExcelCell; coord: string; isCited: boolean }>;
      rowIndex: number;
      isRowCited: boolean;
      rowLabel?: string;
    }> = [];

    for (let rowIdx = start_row; rowIdx <= end_row; rowIdx++) {
      const rowCells: Array<{
        cell: ExcelCell;
        coord: string;
        isCited: boolean;
      }> = [];
      let rowLabel: string | undefined;
      let isRowCited = false;

      for (let colIdx = start_col; colIdx <= end_col; colIdx++) {
        // Convert to Excel coordinate (A1, B2, etc., AA26, BG7, etc.)
        // Use 1-based index (colIdx starts at 1), so subtract 1 for 0-based conversion
        const coord = colToExcel(colIdx - 1) + rowIdx;
        const cell = cells[coord];
        const isCited = Boolean(citedCell && coord === citedCell);

        // Check ALL cells in the row for the cited row label (not just first column)
        if (cell && cell.value && citedRowLabel) {
          const cellValue = String(cell.value).trim();
          if (cellValue) {
            // Set rowLabel from first column with content
            if (colIdx === start_col) {
              rowLabel = cellValue;
            }

            // Check if this cell matches the cited row label - EXACT MATCH ONLY
            const cellLabel = cellValue.toLowerCase().trim();
            const citedLabel = citedRowLabel.toLowerCase().trim();

            // Only exact match to avoid highlighting multiple rows
            if (cellLabel === citedLabel) {
              isRowCited = true;
            }
          }
        }

        if (cell) {
          rowCells.push({ cell, coord, isCited: Boolean(isCited) });
        } else {
          // Empty cell
          rowCells.push({
            cell: {
              value: "",
              type:
                rowIdx < (excelFileMap.data_start_row ?? 2) ? "header" : "data",
              coord,
              row_label: "",
              column_path: [],
              data_type: "str",
              unit_info: {},
            },
            coord,
            isCited: Boolean(isCited),
          });
        }
      }

      table.push({
        cells: rowCells,
        rowIndex: rowIdx,
        isRowCited,
        rowLabel,
      });
    }

    return table;
  }, [excelFileMap, citedCell, citedRowLabel]);

  // Position the view on the cited cell without animation - just like text citations
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    // Priority: position on cited row first, then cited cell
    const elementToScroll = citedRowRef.current || citedCellRef.current;

    if (elementToScroll) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = elementToScroll.getBoundingClientRect();

      const scrollTop =
        container.scrollTop +
        (elementRect.top - containerRect.top) -
        container.clientHeight / 2 +
        elementRect.height / 2;
      const scrollLeft =
        container.scrollLeft +
        (elementRect.left - containerRect.left) -
        container.clientWidth / 2 +
        elementRect.width / 2;

      // Use instant positioning instead of smooth scroll for consistency with text citations
      container.scrollTop = Math.max(0, scrollTop);
      container.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [citedCell, citedRowLabel, tableData]);

  const formatCellValue = (cell: ExcelCell) => {
    if (cell.value === null || cell.value === undefined || cell.value === "") {
      return "";
    }

    // Format numbers with units if available
    if (typeof cell.value === "number" && cell.unit_info?.currency) {
      const currency = cell.unit_info.currency;
      const scale = cell.unit_info.scale || 1;
      const scaledValue = cell.value * scale;

      if (currency === "USD") {
        return `$${scaledValue.toLocaleString()}`;
      }
    }

    return String(cell.value);
  };

  const getCellClasses = (
    cell: ExcelCell,
    isCited: boolean,
    isRowCited: boolean
  ) => {
    const baseClasses = "px-2 py-1 border text-sm relative";

    // Check if this cell is in the same row or column as the cited cell
    let isInCitedRow = false;
    let isInCitedColumn = false;

    if (citedCell) {
      // Parse the cited cell coordinate (e.g., "B5" -> column "B", row 5)
      const citedColumn = citedCell.replace(/[0-9]/g, "");
      const citedRow = parseInt(citedCell.replace(/[A-Z]/g, ""));

      // Parse current cell coordinate
      const cellColumn = cell.coord.replace(/[0-9]/g, "");
      const cellRow = parseInt(cell.coord.replace(/[A-Z]/g, ""));

      isInCitedRow = cellRow === citedRow;
      isInCitedColumn = cellColumn === citedColumn;
    }

    // Build border classes for cross-hair effect
    let borderStyle = "border-gray-300";
    let bgStyle = "";

    if (isCited) {
      // The cited cell itself - matches PDF highlighting
      borderStyle = "border-accent-400 border-2";
      bgStyle = "bg-accent-100";
    } else if (isInCitedRow && isInCitedColumn) {
      // At the intersection but not the cited cell
      borderStyle = "border-accent-200";
      bgStyle = "bg-accent-50/40";
    } else if (isInCitedRow) {
      // Same row as cited cell
      borderStyle = "border-y-primary-200 border-x-gray-200";
      bgStyle = "bg-accent-50/20";
    } else if (isInCitedColumn) {
      // Same column as cited cell
      borderStyle = "border-x-primary-200 border-y-gray-200";
      bgStyle = "bg-accent-50/20";
    }

    // Individual cell citation takes priority
    if (isCited) {
      return `${baseClasses} ${bgStyle} ${borderStyle} font-semibold text-accent-900 z-10`;
    }

    // Add subtle background for cells in same row/column
    if (isInCitedRow || isInCitedColumn) {
      return `${baseClasses} ${bgStyle} ${borderStyle}`;
    }

    // Row citation highlighting - matches text highlighting style
    if (isRowCited) {
      return `${baseClasses} bg-accent-100 ${borderStyle}`;
    }

    return `${baseClasses} hover:bg-gray-50 ${borderStyle}`;
  };

  const getRowClasses = (_isRowCited: boolean) => {
    // Remove row-level background to avoid double highlighting
    // The cell-level bg-accent-100 will handle the visual indication
    return "";
  };

  return (
    <div className={`excel-citation-viewer h-full flex flex-col ${className}`}>
      {/* Table */}
      <div
        ref={tableContainerRef}
        className="overflow-auto border border-gray-300 rounded-lg flex-1 min-h-0"
      >
        <table className="min-w-full">
          <tbody>
            {tableData.map((rowData, tableRowIndex) => (
              <tr
                key={tableRowIndex}
                ref={rowData.isRowCited ? citedRowRef : null}
                className={getRowClasses(rowData.isRowCited)}
              >
                {rowData.cells.map(({ cell, coord, isCited }, colIndex) => {
                  const isHeader = cell.type === "header";
                  const Tag = isHeader ? "th" : "td";

                  return (
                    <Tag
                      key={colIndex}
                      ref={isCited ? citedCellRef : null}
                      className={getCellClasses(
                        cell,
                        isCited,
                        rowData.isRowCited
                      )}
                      title={
                        rowData.isRowCited
                          ? `Cited Row: ${rowData.rowLabel || coord}`
                          : isCited
                          ? `Cited Cell: ${coord}`
                          : coord
                      }
                    >
                      <div className="min-w-0">{formatCellValue(cell)}</div>
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExcelCitationViewer;
