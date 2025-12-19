import { LineMapItem } from "../types";

/**
 * Get line information for a specific tag from the line map
 */
export const getLineInfoForTag = (
  tag: string,
  lineMap?: Record<string, LineMapItem>
): LineMapItem | null => {
  if (!lineMap || !tag) return null;
  return lineMap[tag] || null;
};

/**
 * Get display text for a tag
 * If it's a citation ID, extract the original tag; otherwise return as-is
 */
export const getDisplayTextForTag = (
  tag: string,
  lineMap?: Record<string, LineMapItem>
): string => {
  // First check if we have line map data with display_tag
  if (lineMap && lineMap[tag] && "display_tag" in lineMap[tag]) {
    const displayTag = (lineMap[tag] as any).display_tag;
    // Remove square brackets if present
    return displayTag.replace(/^\[|\]$/g, "");
  }

  // If it's a citation ID format (individual_X_Y_hash or group_X_Y_hash), extract the original tag
  if (tag.includes("_")) {
    // Handle individual citations: individual_1_0_hash -> 1
    if (tag.startsWith("individual_")) {
      const parts = tag.split("_");
      if (parts.length >= 3) {
        const originalTag = parts[1]; // Extract the "1" from "individual_1_0_hash"
        if (!originalTag) {
          return "";
        }
        return originalTag;
      }
    }
    // Handle group citations: group_1-3_0_hash -> 1-3
    else if (tag.startsWith("group_")) {
      const parts = tag.split("_");
      if (parts.length >= 3) {
        const originalTag = parts[1]; // Extract the "1-3" from "group_1-3_0_hash"
        if (!originalTag) {
          return "";
        }
        return originalTag;
      }
    }
  }

  // If tag is numeric or range format, return as-is (no brackets)
  if (/^\d+(-\d+)?$/.test(tag)) {
    return tag;
  }

  // If tag is already bracketed, remove the brackets
  if (/^\[\d+(-\d+)?\]$/.test(tag)) {
    return tag.replace(/^\[|\]$/g, "");
  }

  // Return as-is for other formats
  return tag;
};

/**
 * Parse a tag into individual line numbers
 * Handles range tags like "1-3", single tags like "5", and Excel cell tags like "123A"
 */
export const parseTagToNumbers = (tag: string): number[] => {
  if (!tag || typeof tag !== "string") return [];

  // Handle Excel cell tags like "123A" - extract just the numeric part
  const excelCellMatch = tag.match(/^(\d+)[A-Z]$/);
  if (excelCellMatch) {
    const num = parseInt(excelCellMatch[1]!, 10);
    return isNaN(num) ? [] : [num];
  }

  // Handle range tags like "1-3"
  if (tag.includes("-")) {
    const parts = tag.split("-");
    if (parts.length !== 2) return []; // Ensure we have exactly two parts

    if (!parts[0] || !parts[1]) return []; // Ensure both parts are non-empty

    const start = parseInt(parts[0].trim(), 10);
    const end = parseInt(parts[1].trim(), 10);

    if (isNaN(start) || isNaN(end) || start > end) return [];

    const numbers = [];
    for (let i = start; i <= end; i++) {
      numbers.push(i);
    }
    return numbers;
  }

  // Handle single number tags like "5"
  const num = parseInt(tag.trim(), 10);
  return isNaN(num) ? [] : [num];
};

/**
 * Get all citations for a list of tags
 */
export const getAllCitationsForTags = (
  tags: string[],
  lineMap?: Record<string, LineMapItem>,
  fileNameMap: Record<string, string> = {},
  fileInfoCache: Record<string, any> = {}
): Array<{
  tag: string;
  text: string;
  file_id: string;
  lineNum: number;
  fileName: string;
  pageNum?: number;
}> => {
  const citations: Array<{
    tag: string;
    text: string;
    file_id: string;
    lineNum: number;
    fileName: string;
    pageNum?: number;
  }> = [];

  tags.forEach((tag) => {
    const lineInfo = getLineInfoForTag(tag, lineMap);
    if (lineInfo) {
      const fileInfo = fileInfoCache[lineInfo.file_id];
      const pageNum = fileInfo?.page_map?.[lineInfo.local_num] || undefined;

      // Debug logging (only in development)
      if (
        !pageNum &&
        fileInfo?.page_map &&
        process.env.NODE_ENV === "development"
      ) {
        console.log("Page lookup failed:", {
          local_num: lineInfo.local_num,
          page_map_keys: Object.keys(fileInfo.page_map).slice(0, 10),
          page_map_sample: Object.entries(fileInfo.page_map).slice(0, 5),
        });
      }

      citations.push({
        tag,
        text: lineInfo.text || "",
        file_id: lineInfo.file_id || "",
        lineNum: lineInfo.local_num || 0,
        fileName: fileNameMap[lineInfo.file_id] || "",
        pageNum,
      });
    }
  });

  return citations;
};

/**
 * Calculate average score for multiple tags
 */
export const getAverageScore = (
  tags: string[],
  lineMap?: Record<string, LineMapItem>
): number | null => {
  if (!tags || tags.length === 0 || !lineMap) return null;

  const scores: number[] = [];
  const uniqueTags = Array.from(new Set(tags));

  uniqueTags.forEach((tag) => {
    const lineInfo = getLineInfoForTag(tag, lineMap);
    if (lineInfo && lineInfo.score !== undefined && lineInfo.score !== null) {
      scores.push(lineInfo.score);
    }
  });

  if (scores.length === 0) return null;

  const sum = scores.reduce((acc, score) => acc + score, 0);
  return sum / scores.length;
};

/**
 * Get aggregated citation info for display
 * PERFORMANCE: Optimized to avoid redundant lookups and parsing
 */
export const getAggregatedCitationInfo = (
  tags: string[],
  lineMap?: Record<string, LineMapItem>
): {
  count: number;
  averageScore: number | null;
  uniqueFiles: number;
  displayText: string;
  citationNumbers: string[];
} => {
  if (!tags || tags.length === 0) {
    return {
      count: 0,
      averageScore: null,
      uniqueFiles: 0,
      displayText: "",
      citationNumbers: [],
    };
  }

  const uniqueTags = Array.from(new Set(tags));

  // Single pass: collect all data at once to avoid redundant lookups
  const fileIds = new Set<string>();
  const scores: number[] = [];
  const citationNumbersWithParsed: Array<{ original: string; num: number }> =
    [];

  uniqueTags.forEach((tag) => {
    const lineInfo = getLineInfoForTag(tag, lineMap);

    if (lineInfo) {
      // Collect file IDs
      if (lineInfo.file_id) {
        fileIds.add(lineInfo.file_id);
      }

      // Collect scores
      if (lineInfo.score !== undefined && lineInfo.score !== null) {
        scores.push(lineInfo.score);
      }
    }

    // Extract and parse citation number ONCE
    const displayTag = getDisplayTextForTag(tag, lineMap);
    if (displayTag) {
      const firstPart = displayTag.split("-")[0];
      const num = firstPart ? parseInt(firstPart, 10) : 0;
      citationNumbersWithParsed.push({
        original: displayTag,
        num: isNaN(num) ? 0 : num,
      });
    }
  });

  // Calculate average score
  const averageScore =
    scores.length > 0
      ? scores.reduce((acc, score) => acc + score, 0) / scores.length
      : null;

  // Sort using pre-parsed numbers (no repeated parsing!)
  citationNumbersWithParsed.sort((a, b) => a.num - b.num);

  // Extract sorted citation numbers
  const citationNumbers = citationNumbersWithParsed.map(
    (item) => item.original
  );

  // Create display text - format like [1,2,3] or [1-3] for ranges
  let displayText = "";
  if (citationNumbers.length === 1 && citationNumbers[0]) {
    displayText = citationNumbers[0];
  } else if (citationNumbers.length > 1) {
    const nums = citationNumbersWithParsed.map((item) => item.num);
    let isRange = true;

    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1]! + 1) {
        isRange = false;
        break;
      }
    }

    if (isRange && nums.length > 2) {
      displayText = `${nums[0]!}-${nums[nums.length - 1]!}`;
    } else if (citationNumbers.length <= 3) {
      displayText = citationNumbers.filter(Boolean).join(",");
    } else {
      displayText = `${citationNumbers.length}`;
    }
  }

  return {
    count: uniqueTags.length,
    averageScore,
    uniqueFiles: fileIds.size,
    displayText,
    citationNumbers,
  };
};
