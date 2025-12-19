import { Workbook, Row } from "exceljs";
import { Field, getAllCitationsForTags } from "@studio/core";
// import { azureApiClient } from "@studio/api";

// constants & configuration
const EXPORT_CONFIG = {
  MAX_FIELDS: 500,
  MAX_FILES: 10000,
  MAX_RESULTS_PER_FIELD: 10000,
  MAX_CELL_TEXT_LENGTH: 32767, // Excel limit
  MAX_FILE_NAME_LENGTH: 255,
  ROW_HEIGHT: 18,
  CHART_IMAGE_WIDTH: 600,
  CHART_IMAGE_HEIGHT: 350,
} as const;

const COLUMN_WIDTHS = {
  results: [
    { width: 25 }, // Field
    { width: 70 }, // Response
    { width: 60 }, // Citation
    { width: 40 }, // File
    { width: 25 }, // Details
    { width: 10 }, // Score
  ],
  evidence: [
    { width: 25 }, // Field
    { width: 15 }, // Sufficiency Score
    { width: 20 }, // Status
    { width: 60 }, // Summary
    { width: 70 }, // Suggested Searches
  ],
  details: [
    { width: 25 }, // Numbers/checkmarks
    { width: 80 }, // Content
  ],
} as const;

const STYLES = {
  mainHeader: {
    font: { bold: true, size: 14, color: { argb: "FF1A1A1A" } },
    fill: {
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb: "FFF5F5F5" },
    },
    alignment: { vertical: "middle" as const, horizontal: "left" as const },
  },
  tableHeader: {
    font: { bold: true, size: 10, color: { argb: "FF1A1A1A" } },
    fill: {
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb: "FFF0F0F0" },
    },
    alignment: { vertical: "middle" as const, horizontal: "left" as const },
  },
  value: {
    font: { size: 10, color: { argb: "FF555555" } },
    alignment: { vertical: "top" as const, wrapText: true },
  },
  boldValue: {
    font: { size: 10, color: { argb: "FF1A1A1A" }, bold: true },
    alignment: { vertical: "top" as const, wrapText: true },
  },
} as const;

const BORDER_STYLE = {
  top: { style: "thin" as const, color: { argb: "FFE5E5E5" } },
  left: { style: "thin" as const, color: { argb: "FFE5E5E5" } },
  bottom: { style: "thin" as const, color: { argb: "FFE5E5E5" } },
  right: { style: "thin" as const, color: { argb: "FFE5E5E5" } },
};

interface ExportOptions {
  template: any;
  fields: Field[];
  results: any;
  selectedProject: any;
  files: any[];
  selectedFileIds: Set<string>;
  fileInfoCache: any;
  projectTemplates?: any[];
  chartImages?: Map<string, { base64: string; width: number; height: number }>;
}

// validation & sanitization
/**
 * Validates export options input
 */
const validateExportOptions = (options: ExportOptions): void => {
  if (!options.template?.name) {
    throw new Error("Template name is required");
  }

  if (!Array.isArray(options.fields) || options.fields.length === 0) {
    throw new Error("At least one field is required");
  }

  if (options.fields.length > EXPORT_CONFIG.MAX_FIELDS) {
    throw new Error(`Maximum ${EXPORT_CONFIG.MAX_FIELDS} fields allowed`);
  }

  if (!options.results || typeof options.results !== "object") {
    throw new Error("Results object is required");
  }

  if (!Array.isArray(options.files)) {
    throw new Error("Files array is required");
  }

  if (options.files.length > EXPORT_CONFIG.MAX_FILES) {
    throw new Error(`Maximum ${EXPORT_CONFIG.MAX_FILES} files allowed`);
  }

  if (!(options.selectedFileIds instanceof Set)) {
    throw new Error("selectedFileIds must be a Set");
  }

  if (!options.fileInfoCache || typeof options.fileInfoCache !== "object") {
    throw new Error("fileInfoCache is required");
  }
};

/**
 * Sanitizes cell values to prevent injection and truncate oversized content
 */
const sanitizeCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, EXPORT_CONFIG.MAX_CELL_TEXT_LENGTH);
  }

  if (typeof value === "number") {
    return String(value);
  }

  return String(value).slice(0, EXPORT_CONFIG.MAX_CELL_TEXT_LENGTH);
};

/**
 * Sanitizes file names for safe file system export
 */
const sanitizeFileName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, EXPORT_CONFIG.MAX_FILE_NAME_LENGTH - 20); // Leave room for timestamp
};

/**
 * Gets file display name with source type handling
 */
const getFileDisplayName = (
  file: any,
  fileInfoCache: any,
  fallback: string = ""
): string => {
  const fileInfo = fileInfoCache[file.id];

  if (fileInfo?.metadata?.source_type === "website") {
    return sanitizeCellValue(
      fileInfo.path || file.file_name || file.name || fallback
    );
  }

  return sanitizeCellValue(file.file_name || file.name || fallback);
};

// row & styling helpers
/**
 * Applies style to row with consistent height
 */
const applyStyleToRow = (row: Row, style: any): void => {
  row.font = { ...style.font };
  row.fill = style.fill;
  row.alignment = { ...style.alignment };
  row.height = EXPORT_CONFIG.ROW_HEIGHT;
};

/**
 * Adds a cell with wrapping enabled
 */
// const addWrappedCell = (
//   row: Row,
//   index: number,
//   value: any,
//   style: any = STYLES.value
// ): void => {
//   const cell = row.getCell(index);
//   cell.value = sanitizeCellValue(value);
//   cell.font = { ...style.font };
//   cell.alignment = { ...style.alignment };
// };

/**
 * Builds citation row data efficiently
 */
const buildCitationRows = (
  citations: any[],
  lineMap: any,
  fieldName: string = "",
  responseText: string = "",
  fileInfoCache: any = {}
): Array<{
  field: string;
  response: string;
  citation: string;
  file: string;
  page: string;
  score: string;
}> => {
  if (citations.length === 0) {
    return [
      {
        field: fieldName,
        response: responseText,
        citation: "",
        file: "",
        page: "",
        score: "",
      },
    ];
  }

  return citations.map((citation, idx) => {
    const lineInfo = lineMap?.[citation.tag];
    const fileInfo = fileInfoCache?.[citation.file_id || lineInfo?.file_id];
    const isWebsite = fileInfo?.metadata?.source_type === "website";

    let detailsValue = "";

    // Don't show page numbers for websites
    if (!isWebsite) {
      if (lineInfo?.sheet_name) {
        // Excel file - show sheet name
        detailsValue = sanitizeCellValue(lineInfo.sheet_name);
      } else if (citation.pageNum) {
        // PDF/other file - show page number
        detailsValue = sanitizeCellValue(citation.pageNum);
      }
    }

    return {
      field: idx === 0 ? fieldName : "",
      response: idx === 0 ? responseText : "",
      citation: sanitizeCellValue(citation.text),
      file: sanitizeCellValue(citation.fileName),
      page: detailsValue,
      score: lineMap?.[citation.tag]?.score?.toFixed(3) || "",
    };
  });
};

// sheet builders
/**
 * Builds the Results sheet
 */
const buildResultsSheet = (
  workbook: Workbook,
  fields: Field[],
  results: any,
  fileNameMap: Record<string, string>,
  fileInfoCache: any
): void => {
  const sheet = workbook.addWorksheet("Results");

  // Title
  let row = sheet.addRow(["Results"]);
  row.font = { bold: true, size: 16, color: { argb: "FF1A1A1A" } };
  sheet.mergeCells(row.number, 1, row.number, 6);

  sheet.addRow([]);

  // Table header
  row = sheet.addRow([
    "Section",
    "Response",
    "Citation",
    "File",
    "Details",
    "Score",
  ]);
  applyStyleToRow(row, STYLES.tableHeader);

  // Extract unique file IDs once
  const fileIds = new Set<string>();
  for (const fieldResult of Object.values(results)) {
    if (
      fieldResult &&
      typeof fieldResult === "object" &&
      "lineMap" in fieldResult
    ) {
      const lineMap = (fieldResult as any).lineMap || {};
      Object.values(lineMap).forEach((lineInfo: any) => {
        if (lineInfo?.file_id) {
          fileIds.add(lineInfo.file_id);
        }
      });
    }
  }

  // Process each field
  for (const field of fields) {
    const result = results[field.id];

    if (
      !result?.text ||
      !Array.isArray(result.text) ||
      result.text.length === 0
    ) {
      row = sheet.addRow([field.name, "", "", "", "", ""]);
      row.font = STYLES.value.font;
      row.getCell(1).font = STYLES.boldValue.font;
      continue;
    }

    // Check for table/chart fields
    if (field.metadata.type === "table" || field.metadata.type === "chart") {
      const tableData = result.text.find(
        (item: any) => item && typeof item === "object" && "rows" in item
      );

      if (tableData?.rows && Array.isArray(tableData.rows)) {
        const [headerRow, ...dataRows] = tableData.rows;

        // Data rows - include field name with first non-empty row
        let isFirstRow = true;
        for (const tableRow of dataRows) {
          for (let cellIdx = 0; cellIdx < tableRow.cells.length; cellIdx++) {
            const cell = tableRow.cells[cellIdx];
            const cellText =
              cellIdx === 0
                ? sanitizeCellValue(cell.text)
                : `${headerRow.cells[cellIdx]?.text || ""}: ${cell.text}`;

            const citations = getAllCitationsForTags(
              cell.tags || [],
              result.lineMap,
              fileNameMap,
              fileInfoCache
            );

            // Skip empty cells (no text and no citations)
            if (!cellText && citations.length === 0) continue;

            const citationRows = buildCitationRows(
              citations,
              result.lineMap,
              isFirstRow ? field.name : "",
              cellText,
              fileInfoCache
            );

            citationRows.forEach((citData, idx) => {
              row = sheet.addRow([
                citData.field,
                citData.response,
                citData.citation,
                citData.file,
                citData.page,
                citData.score,
              ]);
              row.font = STYLES.value.font;
              if (idx === 0 && citData.field) {
                row.getCell(1).font = STYLES.boldValue.font;
              }
            });

            isFirstRow = false;
          }
        }

        continue;
      }
    }

    // Regular text field processing
    let isFirstResponse = true;
    for (const item of result.text) {
      if (!item?.line) continue;

      const citations = getAllCitationsForTags(
        item.tags || [],
        result.lineMap,
        fileNameMap,
        fileInfoCache
      );

      const citationRows = buildCitationRows(
        citations,
        result.lineMap,
        isFirstResponse ? field.name : "",
        sanitizeCellValue(item.line),
        fileInfoCache
      );

      citationRows.forEach((citData, idx) => {
        row = sheet.addRow([
          citData.field,
          citData.response,
          citData.citation,
          citData.file,
          citData.page,
          citData.score,
        ]);
        row.font = STYLES.value.font;
        if (idx === 0 && citData.field) {
          row.getCell(1).font = STYLES.boldValue.font;
        }
      });

      isFirstResponse = false;
    }
  }

  sheet.columns = [...COLUMN_WIDTHS.results];
};

/**
 * Builds the Evidence sheet
 */
const buildEvidenceSheet = (
  workbook: Workbook,
  fields: Field[],
  results: any
): void => {
  const sheet = workbook.addWorksheet("Evidence");

  // Title
  let row = sheet.addRow(["Evidence Analysis"]);
  row.font = { bold: true, size: 16, color: { argb: "FF1A1A1A" } };
  sheet.mergeCells(row.number, 1, row.number, 6);

  sheet.addRow([]);

  // Table header
  row = sheet.addRow([
    "Section",
    "Sufficiency Score",
    "Status",
    "Summary",
    "Suggested Searches",
  ]);
  applyStyleToRow(row, STYLES.tableHeader);

  // Process each field
  for (const field of fields) {
    const result = results[field.id];

    if (!result?.evidenceAnalysis) {
      row = sheet.addRow([field.name, "", "", "", ""]);
      row.font = STYLES.value.font;
      row.getCell(1).font = STYLES.boldValue.font;
      continue;
    }

    const evidence = result.evidenceAnalysis;
    const sufficiencyScore = Math.max(
      0,
      Math.min(100, Number(evidence.sufficiency_score) || 0)
    );

    const status =
      sufficiencyScore >= 90
        ? "Strong evidence"
        : sufficiencyScore >= 70
        ? "Adequate evidence"
        : sufficiencyScore >= 40
        ? "Weak evidence"
        : "Insufficient evidence";

    // Get summary
    const summary = sanitizeCellValue(evidence.summary || "");

    // Get suggested searches
    const searchQueries = Array.isArray(evidence.search_queries)
      ? evidence.search_queries
      : [];

    // Format searches by priority
    const formattedSearches: string[] = [];
    const highPriority = searchQueries.filter((q: any) => q.priority === "high");
    const mediumPriority = searchQueries.filter((q: any) => q.priority === "medium");
    const lowPriority = searchQueries.filter((q: any) => q.priority === "low");

    for (const q of [...highPriority, ...mediumPriority, ...lowPriority]) {
      const query = sanitizeCellValue(q.query || "");
      const reason = sanitizeCellValue(q.reason || "");
      const priority = q.priority || "medium";
      formattedSearches.push(`[${priority.toUpperCase()}] ${query} - ${reason}`);
    }

    // Determine row count
    const maxRows = Math.max(1, formattedSearches.length);

    for (let i = 0; i < maxRows; i++) {
      row = sheet.addRow([
        i === 0 ? field.name : "",
        i === 0 ? sufficiencyScore.toFixed(2) : "",
        i === 0 ? status : "",
        i === 0 ? summary : "",
        formattedSearches[i] || "",
      ]);

      row.font = STYLES.value.font;
      if (i === 0) {
        row.getCell(1).font = STYLES.boldValue.font;
      }
    }
  }

  sheet.columns = [...COLUMN_WIDTHS.evidence];
};

/**
 * Builds the Details sheet
 */
const buildDetailsSheet = (
  workbook: Workbook,
  fields: Field[],
  files: any[],
  selectedFileIds: Set<string>,
  fileInfoCache: any,
  selectedProject: any,
  generatedDate: string
): void => {
  const sheet = workbook.addWorksheet("Details");

  // Title
  let row = sheet.addRow(["Details"]);
  row.font = { bold: true, size: 16, color: { argb: "FF1A1A1A" } };
  sheet.mergeCells(row.number, 1, row.number, 2);

  row = sheet.addRow([generatedDate]);
  row.font = { size: 10, color: { argb: "FF888888" }, italic: true };

  sheet.addRow([]);

  // Overview
  row = sheet.addRow(["Overview"]);
  row.font = { bold: true, size: 11 };

  sheet.addRow([`${selectedFileIds.size} of ${files.length} files analyzed`]);
  sheet.addRow([`${fields.length} sections evaluated`]);

  sheet.addRow([]);

  // Files
  row = sheet.addRow(["Files"]);
  row.font = { bold: true, size: 11 };

  for (const file of files) {
    const analyzed = selectedFileIds.has(file.id);
    const displayName = getFileDisplayName(file, fileInfoCache, "Unknown file");

    row = sheet.addRow([analyzed ? "✓" : "", displayName]);
    row.font = {
      size: 10,
      color: { argb: analyzed ? "FF1A1A1A" : "FF999999" },
    };
    if (analyzed) {
      row.getCell(1).font = { ...row.font, color: { argb: "FF00AA00" } };
    }
  }

  sheet.addRow([]);

  // Fields
  row = sheet.addRow(["Sections"]);
  row.font = { bold: true, size: 11 };

  let index = 1;
  for (const field of fields) {
    row = sheet.addRow([`${index}.`, field.name]);
    row.font = { size: 10 };
    row.getCell(1).font = { ...row.font, color: { argb: "FF888888" } };

    if (field.description) {
      const descRow = sheet.addRow(["", sanitizeCellValue(field.description)]);
      descRow.font = { size: 9, color: { argb: "FF666666" } };
    }

    index++;
  }

  sheet.columns = [...COLUMN_WIDTHS.details];
};

/**
 * Applies formatting to all sheets
 */
const applyGlobalFormatting = (workbook: Workbook): void => {
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        if (cell.value) {
          cell.alignment = {
            ...cell.alignment,
            wrapText: true,
            vertical: "top",
          };

          // Add borders to data cells (not header rows)
          const isHeaderRow = cell.fill && (cell.fill as any).fgColor;
          if (!isHeaderRow && rowNumber > 3) {
            cell.border = BORDER_STYLE;
          }
        }
      });
    });
  }
};

/**
 * Generates a safe file name for download
 */
const generateFileName = (template: any): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const safeName = sanitizeFileName(template.name);
  return `${safeName}-${timestamp}.xlsx`;
};

// main export function
export async function exportToExcel(options: ExportOptions): Promise<void> {
  try {
    // Validate all inputs
    validateExportOptions(options);

    const {
      template,
      fields,
      results,
      selectedProject,
      files,
      selectedFileIds,
      fileInfoCache,
      //   projectTemplates = [],
      //   chartImages = new Map(),
    } = options;

    // Load project templates if needed
    // let templatesForProject = projectTemplates;
    // if (selectedProject && projectTemplates.length === 0) {
    //   try {
    //     templatesForProject =
    //       (await azureApiClient.getTemplatesForProject(selectedProject.id)) ||
    //       [];
    //   } catch (error) {
    //     console.error(
    //       "[exportToExcel] Error loading project templates:",
    //       error
    //     );
    //     templatesForProject = [];
    //   }
    // }

    // Generate timestamp
    const generatedDate = new Date().toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Create workbook
    const workbook = new Workbook();

    // Extract file IDs efficiently
    const fileIds = new Set<string>();
    for (const fieldResult of Object.values(results)) {
      if (
        fieldResult &&
        typeof fieldResult === "object" &&
        "lineMap" in fieldResult
      ) {
        const lineMap = (fieldResult as any).lineMap || {};
        Object.values(lineMap).forEach((lineInfo: any) => {
          if (lineInfo?.file_id && typeof lineInfo.file_id === "string") {
            fileIds.add(lineInfo.file_id);
          }
        });
      }
    }

    // Build file name map (use source URL for websites)
    const fileNameMap = Object.fromEntries(
      Object.entries(fileInfoCache)
        .filter(([id]) => fileIds.has(id))
        .map(([id, info]) => {
          const fileInfo = info as any;
          const displayName =
            fileInfo?.metadata?.source_type === "website"
              ? fileInfo?.metadata?.source_url || fileInfo?.name
              : fileInfo?.name;
          return [id, sanitizeCellValue(displayName)];
        })
    );

    // Build sheets
    buildResultsSheet(workbook, fields, results, fileNameMap, fileInfoCache);
    buildEvidenceSheet(workbook, fields, results);
    buildDetailsSheet(
      workbook,
      fields,
      files,
      selectedFileIds,
      fileInfoCache,
      selectedProject,
      generatedDate
    );

    // Apply global formatting
    applyGlobalFormatting(workbook);

    // Generate and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const fileName = generateFileName(template);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();

    // Cleanup
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[exportToExcel] Export failed:", error);
    throw error;
  }
}
