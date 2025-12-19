import { describe, it, expect } from 'vitest';
import {
  getLineInfoForTag,
  getDisplayTextForTag,
  parseTagToNumbers,
  getAllCitationsForTags,
  getAverageScore,
  getAggregatedCitationInfo,
} from '../tagUtils';
import type { LineMapItem } from '../../types';

describe('tagUtils', () => {
  const mockLineMap: Record<string, LineMapItem> = {
    '1': {
      file_id: 'file1',
      local_num: 10,
      text: 'Line 1 text',
      score: 0.95,
      display_tag: '[1]',
    },
    '2': {
      file_id: 'file1',
      local_num: 20,
      text: 'Line 2 text',
      score: 0.85,
      display_tag: '[2]',
    },
    '3': {
      file_id: 'file2',
      local_num: 30,
      text: 'Line 3 text',
      score: 0.75,
    },
    '1-3': {
      file_id: 'file1',
      local_num: 10,
      text: 'Combined text',
      score: 0.90,
      display_tag: '[1-3]',
      is_grouped: true,
    },
  };

  describe('getLineInfoForTag', () => {
    it('should return line info for existing tag', () => {
      const result = getLineInfoForTag('1', mockLineMap);
      expect(result).toEqual(mockLineMap['1']);
    });

    it('should return null for non-existent tag', () => {
      const result = getLineInfoForTag('999', mockLineMap);
      expect(result).toBeNull();
    });

    it('should return null when lineMap is undefined', () => {
      const result = getLineInfoForTag('1', undefined);
      expect(result).toBeNull();
    });

    it('should return null when tag is empty', () => {
      const result = getLineInfoForTag('', mockLineMap);
      expect(result).toBeNull();
    });
  });

  describe('getDisplayTextForTag', () => {
    it('should return display tag from lineMap when available', () => {
      const result = getDisplayTextForTag('1', mockLineMap);
      expect(result).toBe('1'); // Should remove brackets
    });

    it('should extract tag from individual citation format', () => {
      const result = getDisplayTextForTag('individual_1_0_hash', mockLineMap);
      expect(result).toBe('1');
    });

    it('should extract tag from group citation format', () => {
      const result = getDisplayTextForTag('group_1-3_0_hash', mockLineMap);
      expect(result).toBe('1-3');
    });

    it('should return numeric tag as-is', () => {
      const result = getDisplayTextForTag('5', mockLineMap);
      expect(result).toBe('5');
    });

    it('should return range tag as-is', () => {
      const result = getDisplayTextForTag('1-3', mockLineMap);
      expect(result).toBe('1-3');
    });

    it('should remove brackets from bracketed tag', () => {
      const result = getDisplayTextForTag('[5]', mockLineMap);
      expect(result).toBe('5');
    });

    it('should handle empty tag', () => {
      const result = getDisplayTextForTag('', mockLineMap);
      expect(result).toBe('');
    });

    it('should handle invalid individual citation format', () => {
      // When parts.length < 3, it falls through to return tag as-is
      const result = getDisplayTextForTag('individual_', mockLineMap);
      expect(result).toBe('individual_');
    });

    it('should handle invalid group citation format', () => {
      // When parts.length < 3, it falls through to return tag as-is
      const result = getDisplayTextForTag('group_', mockLineMap);
      expect(result).toBe('group_');
    });
  });

  describe('parseTagToNumbers', () => {
    it('should parse single number tag', () => {
      const result = parseTagToNumbers('5');
      expect(result).toEqual([5]);
    });

    it('should parse range tag', () => {
      const result = parseTagToNumbers('1-3');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse Excel cell tag', () => {
      const result = parseTagToNumbers('123A');
      expect(result).toEqual([123]);
    });

    it('should return empty array for invalid tag', () => {
      const result = parseTagToNumbers('invalid');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty tag', () => {
      const result = parseTagToNumbers('');
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid range', () => {
      const result = parseTagToNumbers('3-1'); // start > end
      expect(result).toEqual([]);
    });

    it('should return empty array for malformed range', () => {
      const result = parseTagToNumbers('1-');
      expect(result).toEqual([]);
    });

    it('should handle whitespace in range', () => {
      const result = parseTagToNumbers(' 1 - 3 ');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array for non-string input', () => {
      const result = parseTagToNumbers(null as any);
      expect(result).toEqual([]);
    });
  });

  describe('getAllCitationsForTags', () => {
    const mockFileNameMap: Record<string, string> = {
      file1: 'document1.pdf',
      file2: 'document2.pdf',
    };

    const mockFileInfoCache: Record<string, any> = {
      file1: {
        page_map: { 10: 1, 20: 2 },
      },
      file2: {
        page_map: { 30: 3 },
      },
    };

    it('should return citations for valid tags', () => {
      const result = getAllCitationsForTags(['1', '2'], mockLineMap, mockFileNameMap, mockFileInfoCache);
      
      expect(result).toHaveLength(2);
      expect(result[0]?.tag).toBe('1');
      expect(result[0]?.file_id).toBe('file1');
      expect(result[0]?.fileName).toBe('document1.pdf');
      expect(result[0]?.pageNum).toBe(1);
    });

    it('should handle tags without line map entries', () => {
      const result = getAllCitationsForTags(['999'], mockLineMap, mockFileNameMap, mockFileInfoCache);
      expect(result).toHaveLength(0);
    });

    it('should handle empty tags array', () => {
      const result = getAllCitationsForTags([], mockLineMap, mockFileNameMap, mockFileInfoCache);
      expect(result).toHaveLength(0);
    });

    it('should handle missing file info in cache', () => {
      const result = getAllCitationsForTags(['1'], mockLineMap, mockFileNameMap, {});
      expect(result).toHaveLength(1);
      expect(result[0]?.pageNum).toBeUndefined();
    });

    it('should handle missing fileName in map', () => {
      const result = getAllCitationsForTags(['1'], mockLineMap, {}, mockFileInfoCache);
      expect(result).toHaveLength(1);
      expect(result[0]?.fileName).toBe('');
    });
  });

  describe('getAverageScore', () => {
    it('should calculate average score for multiple tags', () => {
      const result = getAverageScore(['1', '2', '3'], mockLineMap);
      expect(result).toBeCloseTo((0.95 + 0.85 + 0.75) / 3, 2);
    });

    it('should return null for empty tags array', () => {
      const result = getAverageScore([], mockLineMap);
      expect(result).toBeNull();
    });

    it('should return null when lineMap is undefined', () => {
      const result = getAverageScore(['1'], undefined);
      expect(result).toBeNull();
    });

    it('should handle tags without scores', () => {
      const lineMapWithoutScore: Record<string, LineMapItem> = {
        '1': {
          file_id: 'file1',
          local_num: 10,
          text: 'Text',
        },
      };
      const result = getAverageScore(['1'], lineMapWithoutScore);
      expect(result).toBeNull();
    });

    it('should handle duplicate tags', () => {
      const result = getAverageScore(['1', '1', '2'], mockLineMap);
      expect(result).toBeCloseTo((0.95 + 0.85) / 2, 2);
    });

    it('should handle tags with null scores', () => {
      const lineMapWithNull: Record<string, LineMapItem> = {
        '1': {
          file_id: 'file1',
          local_num: 10,
          text: 'Text',
          score: null as any,
        },
        '2': {
          file_id: 'file1',
          local_num: 20,
          text: 'Text',
          score: 0.85,
        },
      };
      const result = getAverageScore(['1', '2'], lineMapWithNull);
      expect(result).toBe(0.85);
    });
  });

  describe('getAggregatedCitationInfo', () => {
    it('should return aggregated info for multiple tags', () => {
      const result = getAggregatedCitationInfo(['1', '2', '3'], mockLineMap);
      
      expect(result.count).toBe(3);
      expect(result.averageScore).toBeCloseTo((0.95 + 0.85 + 0.75) / 3, 2);
      expect(result.uniqueFiles).toBe(2); // file1 and file2
      expect(result.citationNumbers.length).toBeGreaterThan(0);
    });

    it('should return empty info for empty tags', () => {
      const result = getAggregatedCitationInfo([], mockLineMap);
      
      expect(result.count).toBe(0);
      expect(result.averageScore).toBeNull();
      expect(result.uniqueFiles).toBe(0);
      expect(result.displayText).toBe('');
      expect(result.citationNumbers).toEqual([]);
    });

    it('should handle single tag', () => {
      const result = getAggregatedCitationInfo(['1'], mockLineMap);
      
      expect(result.count).toBe(1);
      expect(result.averageScore).toBe(0.95);
      expect(result.uniqueFiles).toBe(1);
    });

    it('should sort citation numbers correctly', () => {
      const result = getAggregatedCitationInfo(['3', '1', '2'], mockLineMap);
      
      expect(result.citationNumbers[0]).toBe('1');
    });

    it('should create range display text for consecutive citations', () => {
      const lineMap: Record<string, LineMapItem> = {
        '1': { file_id: 'file1', local_num: 10, text: 'Text', display_tag: '[1]' },
        '2': { file_id: 'file1', local_num: 20, text: 'Text', display_tag: '[2]' },
        '3': { file_id: 'file1', local_num: 30, text: 'Text', display_tag: '[3]' },
        '4': { file_id: 'file1', local_num: 40, text: 'Text', display_tag: '[4]' },
      };
      const result = getAggregatedCitationInfo(['1', '2', '3', '4'], lineMap);
      
      expect(result.displayText).toContain('-');
    });

    it('should handle tags without line map entries', () => {
      const result = getAggregatedCitationInfo(['999'], mockLineMap);
      
      expect(result.count).toBe(1);
      expect(result.averageScore).toBeNull();
      expect(result.uniqueFiles).toBe(0);
    });

    it('should handle duplicate tags', () => {
      const result = getAggregatedCitationInfo(['1', '1', '2'], mockLineMap);
      
      expect(result.count).toBe(2); // Unique tags only
    });
  });
});

