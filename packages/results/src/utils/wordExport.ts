import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
} from "docx";
import { saveAs } from "file-saver";
import { Field, getAllCitationsForTags } from "@studio/core";

interface WordExportOptions {
  template: any;
  fields: Field[];
  results: any;
  fileNameMap: Record<string, string>;
  fileInfoCache: any;
  chartImages: Map<
    string,
    string | { base64: string; width: number; height: number }
  >;
}

// Spacing constants
const SPACING = {
  TITLE_AFTER: 400,
  FIELD_BEFORE: 300,
  FIELD_AFTER: 150,
  FIELD_END: 200,
  SOURCES_BEFORE: 100,
  SOURCES_AFTER: 50,
  SOURCE_ITEM: 50,
  PARAGRAPH: 100,
  IMAGE_AFTER: 200,
} as const;

// Image constants
const IMAGE = {
  MAX_WIDTH: 468,
} as const;

// Helper to calculate proportional height based on aspect ratio
function calculateProportionalHeight(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number
): number {
  const aspectRatio = imageHeight / imageWidth;
  return Math.round(maxWidth * aspectRatio);
}

// Clean text by removing citation artifacts and extra spaces
function cleanText(text: string): string {
  if (!text) return text;

  // Remove inline citation markers like [1], [2-3], etc.
  let cleaned = text.replace(/\s*\[\d+(-\d+)?\]/g, "");

  // Fix space before punctuation (e.g., "word ." -> "word.")
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, "$1");

  // Remove multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  // Trim leading/trailing spaces
  cleaned = cleaned.trim();

  return cleaned;
}

// Process inline formatting (**bold**, *italic*)
function processInlineFormatting(text: string): TextRun[] {
  // Clean the text first
  const cleanedText = cleanText(text);

  const runs: TextRun[] = [];
  let currentIndex = 0;
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let match;

  while ((match = regex.exec(cleanedText)) !== null) {
    if (match.index > currentIndex) {
      runs.push(
        new TextRun({
          text: cleanedText.substring(currentIndex, match.index),
        })
      );
    }

    if (match[0].startsWith("**")) {
      runs.push(
        new TextRun({
          text: match[2],
          bold: true,
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: match[3],
          italics: true,
        })
      );
    }

    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < cleanedText.length) {
    runs.push(
      new TextRun({
        text: cleanedText.substring(currentIndex),
      })
    );
  }

  return runs.length > 0 ? runs : [new TextRun({ text: cleanedText })];
}

// Parse markdown line and return Paragraph with appropriate styling
function markdownToParagraph(text: string): Paragraph {
  // Check for headings
  const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch && headingMatch[1]) {
    const level = headingMatch[1].length;
    const headingText = headingMatch[2];

    const headingLevels: Record<number, any> = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6,
    };

    return new Paragraph({
      text: headingText,
      heading: headingLevels[level],
      spacing: { after: SPACING.PARAGRAPH },
    });
  }

  // Check for numbered list (e.g., "1. Text" or "3. Text")
  const numberedListMatch = text.match(/^(\d+)\.\s+(.+)$/);
  if (numberedListMatch) {
    const listText = numberedListMatch[2];

    if (!listText) {
      return new Paragraph({
        text: "",
        spacing: { after: SPACING.PARAGRAPH },
      });
    }

    return new Paragraph({
      children: processInlineFormatting(listText),
      numbering: {
        reference: "numbered-list",
        level: 0,
      },
      spacing: { after: SPACING.PARAGRAPH },
    });
  }

  // Check for bullet list (e.g., "- Text" or "* Text")
  const bulletListMatch = text.match(/^[-*]\s+(.+)$/);
  if (bulletListMatch) {
    const listText = bulletListMatch[1];

    if (!listText) {
      return new Paragraph({
        text: "",
        spacing: { after: SPACING.PARAGRAPH },
      });
    }

    return new Paragraph({
      children: processInlineFormatting(listText),
      numbering: {
        reference: "bullet-list",
        level: 0,
      },
      spacing: { after: SPACING.PARAGRAPH },
    });
  }

  // Default: process inline formatting for regular text
  return new Paragraph({
    children: processInlineFormatting(text),
    spacing: { after: SPACING.PARAGRAPH },
  });
}

// Helper to extract citations from cells/items
function extractCitations(
  items: any[],
  lineMap: any,
  fileNameMap: Record<string, string>,
  fileInfoCache: any
): Set<string> {
  const citations = new Set<string>();

  items.forEach((item: any) => {
    if (item?.tags && Array.isArray(item.tags)) {
      const itemCitations = getAllCitationsForTags(
        item.tags,
        lineMap,
        fileNameMap,
        fileInfoCache
      );
      itemCitations.forEach((citation) => {
        if (citation.fileName) {
          // Check if this is an Excel file citation and get sheet name from lineMap
          const lineInfo = lineMap?.[citation.tag];
          const fileInfo = fileInfoCache?.[lineInfo?.file_id];
          const isWebsite = fileInfo?.metadata?.source_type === "website";
          let locationStr = "";

          if (lineInfo?.sheet_name) {
            // Excel file - use sheet name
            locationStr = `, s. ${lineInfo.sheet_name}`;
          } else if (citation.pageNum && !isWebsite) {
            // PDF/other file - use page number (but not for websites)
            locationStr = `, p. ${citation.pageNum}`;
          }

          citations.add(`${citation.fileName}${locationStr}`);
        }
      });
    }
  });

  return citations;
}

// Helper to add sources section
function createSourcesParagraphs(citations: Set<string>): Paragraph[] {
  if (citations.size === 0) return [];

  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "Sources:", italics: true })],
      spacing: { before: SPACING.SOURCES_BEFORE, after: SPACING.SOURCES_AFTER },
    }),
  ];

  citations.forEach((citation) => {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: citation })],
        numbering: {
          reference: "bullet-list",
          level: 0,
        },
        spacing: { after: SPACING.SOURCE_ITEM },
      })
    );
  });

  return paragraphs;
}

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function exportToWord(options: WordExportOptions): Promise<void> {
  const { template, fields, results, fileNameMap, fileInfoCache, chartImages } =
    options;

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: template.name,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: SPACING.TITLE_AFTER },
    })
  );

  // Process each field
  for (const field of fields) {
    const fieldData = results[field.id];
    if (!fieldData) continue;

    // Field name
    children.push(
      new Paragraph({
        text: field.name,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: SPACING.FIELD_BEFORE, after: SPACING.FIELD_AFTER },
      })
    );

    // Extract table/chart data once
    const structuredData = fieldData.text?.find(
      (item: any) => item && typeof item === "object" && "rows" in item
    );

    // Check if chart field
    if (field.metadata.type === "chart") {
      const chartData = chartImages.get(field.id);

      if (chartData) {
        try {
          // Handle both old format (just base64 string) and new format (object with dimensions)
          const base64Image =
            typeof chartData === "string" ? chartData : chartData.base64;
          const chartWidth =
            typeof chartData === "string" ? IMAGE.MAX_WIDTH : chartData.width;
          const chartHeight =
            typeof chartData === "string" ? 280 : chartData.height;

          // Calculate proper height maintaining aspect ratio
          const proportionalHeight = calculateProportionalHeight(
            chartWidth,
            chartHeight,
            IMAGE.MAX_WIDTH
          );

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: base64ToUint8Array(base64Image),
                  transformation: {
                    width: IMAGE.MAX_WIDTH,
                    height: proportionalHeight,
                  },
                  type: "png",
                } as any),
              ],
              spacing: { after: SPACING.IMAGE_AFTER },
              alignment: AlignmentType.CENTER,
            })
          );
        } catch (error) {
          console.error("Error adding chart image:", error);
        }
      }

      // Add citations for chart
      if (structuredData?.rows) {
        const allCells = structuredData.rows.flatMap(
          (row: any) => row.cells || []
        );
        const citations = extractCitations(
          allCells,
          fieldData.lineMap,
          fileNameMap,
          fileInfoCache
        );
        children.push(...createSourcesParagraphs(citations));
      }
    }
    // Check if table field
    else if (field.metadata.type === "table") {
      if (
        structuredData?.rows &&
        Array.isArray(structuredData.rows) &&
        structuredData.rows.length > 0
      ) {
        const [headerRow, ...dataRows] = structuredData.rows;

        // Create table rows
        const tableRows: TableRow[] = [];

        // Header row
        if (headerRow?.cells) {
          tableRows.push(
            new TableRow({
              children: headerRow.cells.map(
                (cell: any) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: cleanText(String(cell.text || "")),
                            bold: true,
                          }),
                        ],
                      }),
                    ],
                    shading: { fill: "F0F0F0" },
                  })
              ),
            })
          );
        }

        // Data rows
        dataRows.forEach((row: any) => {
          if (row?.cells) {
            tableRows.push(
              new TableRow({
                children: row.cells.map(
                  (cell: any) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: cleanText(String(cell.text || "")),
                            }),
                          ],
                        }),
                      ],
                    })
                ),
              })
            );
          }
        });

        // Add table to children
        children.push(
          new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
          })
        );

        // Add citations for table
        const allCells = dataRows.flatMap((row: any) => row.cells || []);
        const citations = extractCitations(
          allCells,
          fieldData.lineMap,
          fileNameMap,
          fileInfoCache
        );
        children.push(...createSourcesParagraphs(citations));
      }
    }
    // Regular text field
    else {
      if (Array.isArray(fieldData.text)) {
        // Add text content
        fieldData.text.forEach((item: any) => {
          if (item.line) {
            children.push(markdownToParagraph(item.line));
          }
        });

        // Add citations
        const citations = extractCitations(
          fieldData.text,
          fieldData.lineMap,
          fileNameMap,
          fileInfoCache
        );
        children.push(...createSourcesParagraphs(citations));
      }
    }

    // Add spacing after field
    children.push(
      new Paragraph({
        text: "",
        spacing: { after: SPACING.FIELD_END },
      })
    );
  }

  // Create document
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
        {
          reference: "bullet-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${template.name}.docx`);
}
