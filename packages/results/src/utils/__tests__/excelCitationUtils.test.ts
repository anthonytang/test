import { describe, it, expect } from 'vitest';
import {
  isExcelCitation,
  extractCellCoordinate,
  extractSheetName,
  getExcelFileMap,
} from '../excelCitationUtils';
import type { LineMapItem } from '@studio/core';

describe('excelCitationUtils', () => {
  const mockFileInfoCache: Record<string, any> = {
    'file1': {
      name: 'test.xlsx',
      file_name: 'test.xlsx',
      excel_file_map: {
        'Sheet1': {
          sheet_name: 'Sheet1',
          table_id: 'table1',
          dimensions: { start_row: 1, end_row: 10, start_col: 1, end_col: 5 },
          cells: {},
          headers: [],
          data_start_row: 2,
          row_labels: {},
        },
      },
    },
    'file2': {
      name: 'document.pdf',
      file_name: 'document.pdf',
    },
  };

  describe('isExcelCitation', () => {
    it('should return true for Excel chunk type', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
        chunk_type: 'excel',
      };

      expect(isExcelCitation(lineInfo, mockFileInfoCache)).toBe(true);
    });

    it('should return true for .xlsx file extension', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      expect(isExcelCitation(lineInfo, mockFileInfoCache)).toBe(true);
    });

    it('should return true for .xls file extension', () => {
      const fileInfoCache = {
        'file1': { name: 'test.xls', file_name: 'test.xls' },
      };
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      expect(isExcelCitation(lineInfo, fileInfoCache)).toBe(true);
    });

    it('should return true for .csv file extension', () => {
      const fileInfoCache = {
        'file1': { name: 'test.csv', file_name: 'test.csv' },
      };
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      expect(isExcelCitation(lineInfo, fileInfoCache)).toBe(true);
    });

    it('should return false for non-Excel files', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file2',
        local_num: 1,
        text: 'test',
      };

      expect(isExcelCitation(lineInfo, mockFileInfoCache)).toBe(false);
    });

    it('should return false when file info is missing', () => {
      const lineInfo: LineMapItem = {
        file_id: 'unknown',
        local_num: 1,
        text: 'test',
      };

      expect(isExcelCitation(lineInfo, mockFileInfoCache)).toBe(false);
    });
  });

  describe('extractCellCoordinate', () => {
    it('should return cell coordinate from lineInfo', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
        excel_coord: 'A1',
      };

      expect(extractCellCoordinate(lineInfo)).toBe('A1');
    });

    it('should return null when excel_coord is missing', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      expect(extractCellCoordinate(lineInfo)).toBeNull();
    });

    it('should return null when lineInfo is undefined', () => {
      expect(extractCellCoordinate(undefined)).toBeNull();
    });
  });

  describe('extractSheetName', () => {
    it('should return sheet name from lineInfo', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
        sheet_name: 'Sheet1',
      };

      expect(extractSheetName(lineInfo)).toBe('Sheet1');
    });

    it('should return null when sheet_name is missing', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      expect(extractSheetName(lineInfo)).toBeNull();
    });

    it('should return null when lineInfo is undefined', () => {
      expect(extractSheetName(undefined)).toBeNull();
    });
  });

  describe('getExcelFileMap', () => {
    it('should return Excel file map for specified sheet', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
        sheet_name: 'Sheet1',
      };

      const result = getExcelFileMap('file1', mockFileInfoCache, lineInfo);

      expect(result).toBeDefined();
      expect(result?.sheet_name).toBe('Sheet1');
    });

    it('should return first sheet when sheet name not found', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
        sheet_name: 'NonExistentSheet',
      };

      const result = getExcelFileMap('file1', mockFileInfoCache, lineInfo);

      expect(result).toBeDefined();
      expect(result?.sheet_name).toBe('Sheet1'); // Falls back to first sheet
    });

    it('should return first sheet when sheet_name is not provided', () => {
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      const result = getExcelFileMap('file1', mockFileInfoCache, lineInfo);

      expect(result).toBeDefined();
      expect(result?.sheet_name).toBe('Sheet1');
    });

    it('should return null when file info is missing', () => {
      const lineInfo: LineMapItem = {
        file_id: 'unknown',
        local_num: 1,
        text: 'test',
      };

      const result = getExcelFileMap('unknown', mockFileInfoCache, lineInfo);

      expect(result).toBeNull();
    });

    it('should return null when excel_file_map is missing', () => {
      const fileInfoCache = {
        'file1': { name: 'test.xlsx' },
      };
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      const result = getExcelFileMap('file1', fileInfoCache, lineInfo);

      expect(result).toBeNull();
    });

    it('should return null when excel_file_map is empty', () => {
      const fileInfoCache = {
        'file1': { name: 'test.xlsx', excel_file_map: {} },
      };
      const lineInfo: LineMapItem = {
        file_id: 'file1',
        local_num: 1,
        text: 'test',
      };

      const result = getExcelFileMap('file1', fileInfoCache, lineInfo);

      expect(result).toBeNull();
    });
  });
});

