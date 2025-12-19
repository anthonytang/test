import { LineMapItem } from "@studio/core";

export interface ExcelCell {
  value: any;
  type: "header" | "data";
  coord: string;
  row_label: string;
  column_path: string[];
  data_type: string;
  unit_info: Record<string, any>;
}

export interface ExcelFileMap {
  sheet_name: string;
  table_id: string;
  dimensions: {
    start_row: number;
    end_row: number;
    start_col: number;
    end_col: number;
    total_rows: number;
    total_cols: number;
  };
  cells: Record<string, ExcelCell>;
  headers: string[][];
  data_start_row: number;
  row_labels: Record<number, string>;
}

/**
 * Check if a citation is from an Excel file
 */
export const isExcelCitation = (
  lineInfo: LineMapItem,
  fileInfoCache: Record<string, any>
): boolean => {
  // Check if chunk_type indicates Excel
  if (lineInfo.chunk_type === "excel") {
    return true;
  }

  // Fallback: check file extension
  if (lineInfo.file_id && fileInfoCache[lineInfo.file_id]) {
    const fileInfo = fileInfoCache[lineInfo.file_id];
    const fileName = fileInfo.name || fileInfo.file_name || "";
    return /\.(xlsx|xls|csv)$/i.test(fileName);
  }

  return false;
};

/**
 * Get Excel cell coordinate from lineInfo
 * Only uses lineInfo.excel_coord - no text parsing
 */
export const extractCellCoordinate = (
  // citationText: string,
  lineInfo?: any
): string | null => {
  // Only use excel_coord from lineInfo
  if (lineInfo && lineInfo.excel_coord) {
    return lineInfo.excel_coord;
  }

  return null;
};

/**
 * Get sheet name from lineInfo
 */
export const extractSheetName = (
  // citationText: string,
  lineInfo?: LineMapItem
): string | null => {
  return lineInfo?.sheet_name || null;
};

/**
 * Get Excel file map from file info cache for the specific sheet
 */
export const getExcelFileMap = (
  fileId: string,
  fileInfoCache: Record<string, any>,
  citationText?: string | null,
  lineInfo?: LineMapItem
): ExcelFileMap | null => {
  const fileInfo = fileInfoCache[fileId];

  if (!fileInfo) {
    console.warn("No file info found for fileId:", fileId);
    return null;
  }

  const fileMaps = fileInfo.excel_file_map;

  if (!fileMaps || typeof fileMaps !== "object") {
    console.warn("No Excel file map found for fileId:", fileId);
    return null;
  }

  // Direct lookup by sheet name from lineInfo
  if (lineInfo && lineInfo.sheet_name) {
    const targetSheetName = lineInfo.sheet_name;
    const sheetData = fileMaps[targetSheetName];

    if (sheetData) {
      return {
        ...sheetData,
        sheet_name: targetSheetName,
      };
    }

    console.warn("No sheet found with name:", targetSheetName);
  }

  // Fallback: return first sheet if available
  const firstSheetName = Object.keys(fileMaps)[0];
  if (firstSheetName) {
    return {
      ...fileMaps[firstSheetName],
      sheet_name: firstSheetName,
    };
  }

  return null;
};
