import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToExcel } from '../excelExport';
import { Workbook } from 'exceljs';
import { saveAs } from 'file-saver';

// Mock dependencies
vi.mock('exceljs', () => ({
  Workbook: vi.fn(),
  Row: vi.fn(),
}));
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));
vi.mock('@studio/core', () => ({
  getAllCitationsForTags: vi.fn((tags: string[], lineMap?: any) => {
    return tags.map((tag) => ({
      tag,
      text: `Text for ${tag}`,
      file_id: 'file1',
      lineNum: 1,
      fileName: 'test.pdf',
      pageNum: 1,
    }));
  }),
}));

describe('excelExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportToExcel', () => {
    const mockOptions = {
      template: { name: 'Test Template' },
      fields: [
        {
          id: 'field1',
          name: 'Field 1',
          description: 'Description 1',
          sort_order: 0,
          created_at: '2024-01-01',
          template_id: 'template1',
        },
      ],
      results: {
        field1: {
          text: [{ line: 'Result text', tags: ['1'] }],
          lineMap: { '1': { file_id: 'file1', local_num: 1, text: 'Text' } },
        },
      },
      selectedProject: { id: 'project1', name: 'Test Project' },
      files: [{ id: 'file1', file_name: 'test.pdf' }],
      selectedFileIds: new Set(['file1']),
      fileInfoCache: {
        file1: { name: 'test.pdf', page_map: { 1: 1 } },
      },
    };

    it('should validate export options', async () => {
      const invalidOptions = {
        ...mockOptions,
        template: null,
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'Template name is required'
      );
    });

    it('should validate fields array', async () => {
      const invalidOptions = {
        ...mockOptions,
        fields: [],
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'At least one field is required'
      );
    });

    it('should validate max fields limit', async () => {
      const invalidOptions = {
        ...mockOptions,
        fields: Array(501).fill(mockOptions.fields[0]),
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'Maximum 500 fields allowed'
      );
    });

    it('should validate results object', async () => {
      const invalidOptions = {
        ...mockOptions,
        results: null,
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'Results object is required'
      );
    });

    it('should validate files array', async () => {
      const invalidOptions = {
        ...mockOptions,
        files: null,
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'Files array is required'
      );
    });

    it('should validate selectedFileIds is a Set', async () => {
      const invalidOptions = {
        ...mockOptions,
        selectedFileIds: [],
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'selectedFileIds must be a Set'
      );
    });

    it('should validate fileInfoCache', async () => {
      const invalidOptions = {
        ...mockOptions,
        fileInfoCache: null,
      };

      await expect(exportToExcel(invalidOptions as any)).rejects.toThrow(
        'fileInfoCache is required'
      );
    });

    it('should create workbook and save file', async () => {
      // Mock window.URL and document.createElement
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      global.window = {
        URL: {
          createObjectURL: vi.fn(() => 'blob:url'),
          revokeObjectURL: vi.fn(),
        },
      } as any;
      global.document = {
        createElement: vi.fn(() => mockLink),
      } as any;

      const mockRow = {
        font: {},
        fill: {},
        alignment: {},
        height: 0,
        number: 1,
        getCell: vi.fn().mockReturnValue({
          value: '',
          font: {},
          alignment: {},
          border: {},
          eachCell: vi.fn(),
        }),
        eachCell: vi.fn(),
      };

      const mockSheet = {
        addRow: vi.fn().mockReturnValue(mockRow),
        getRow: vi.fn().mockReturnValue(mockRow),
        mergeCells: vi.fn(),
        columns: [],
        eachRow: vi.fn((callback) => {
          callback(mockRow, 1);
        }),
      };

      const mockWorkbook = {
        addWorksheet: vi.fn().mockReturnValue(mockSheet),
        worksheets: [mockSheet],
        xlsx: {
          writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        },
      };

      vi.mocked(Workbook).mockImplementation(() => mockWorkbook as any);

      await exportToExcel(mockOptions);

      expect(Workbook).toHaveBeenCalled();
      expect(mockWorkbook.addWorksheet).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should sanitize file names', async () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      global.window = {
        URL: {
          createObjectURL: vi.fn(() => 'blob:url'),
          revokeObjectURL: vi.fn(),
        },
      } as any;
      global.document = {
        createElement: vi.fn(() => mockLink),
      } as any;

      const optionsWithSpecialChars = {
        ...mockOptions,
        template: { name: 'Test/Template*Name' },
      };

      const mockRow = {
        font: {},
        fill: {},
        alignment: {},
        height: 0,
        number: 1,
        getCell: vi.fn().mockReturnValue({
          value: '',
          font: {},
          alignment: {},
          border: {},
          eachCell: vi.fn(),
        }),
        eachCell: vi.fn(),
      };

      const mockSheet = {
        addRow: vi.fn().mockReturnValue(mockRow),
        getRow: vi.fn().mockReturnValue(mockRow),
        mergeCells: vi.fn(),
        columns: [],
        eachRow: vi.fn((callback) => {
          callback(mockRow, 1);
        }),
      };

      const mockWorkbook = {
        addWorksheet: vi.fn().mockReturnValue(mockSheet),
        worksheets: [mockSheet],
        xlsx: {
          writeBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        },
      };

      vi.mocked(Workbook).mockImplementation(() => mockWorkbook as any);

      await exportToExcel(optionsWithSpecialChars);

      expect(mockLink.download).not.toContain('/');
      expect(mockLink.download).not.toContain('*');
    });
  });
});

