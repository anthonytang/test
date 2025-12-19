import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToWord } from '../wordExport';
import { Document, Packer } from 'docx';
import { saveAs } from 'file-saver';

// Mock dependencies
vi.mock('docx');
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

describe('wordExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportToWord', () => {
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
      fileNameMap: { file1: 'test.pdf' },
      fileInfoCache: {
        file1: { name: 'test.pdf', page_map: { 1: 1 } },
      },
      chartImages: new Map(),
    };

    it('should create document and save file', async () => {
      const mockDocument = {};
      const mockBlob = new Blob();

      (Document as any).mockImplementation(() => mockDocument);
      (Packer.toBlob as any).mockResolvedValue(mockBlob);

      await exportToWord(mockOptions);

      expect(Document).toHaveBeenCalled();
      expect(Packer.toBlob).toHaveBeenCalled();
      expect(saveAs).toHaveBeenCalled();
    });

    it('should handle markdown formatting in text', async () => {
      const optionsWithMarkdown = {
        ...mockOptions,
        results: {
          field1: {
            text: [
              { line: '# Heading', tags: [] },
              { line: '**Bold text**', tags: [] },
              { line: '*Italic text*', tags: [] },
            ],
            lineMap: {},
          },
        },
      };

      const mockDocument = {};
      const mockBlob = new Blob();

      (Document as any).mockImplementation(() => mockDocument);
      (Packer.toBlob as any).mockResolvedValue(mockBlob);

      await exportToWord(optionsWithMarkdown);

      expect(Document).toHaveBeenCalled();
    });

    it('should handle lists in text', async () => {
      const optionsWithLists = {
        ...mockOptions,
        results: {
          field1: {
            text: [
              { line: '1. First item', tags: [] },
              { line: '2. Second item', tags: [] },
              { line: '- Bullet point', tags: [] },
            ],
            lineMap: {},
          },
        },
      };

      const mockDocument = {};
      const mockBlob = new Blob();

      (Document as any).mockImplementation(() => mockDocument);
      (Packer.toBlob as any).mockResolvedValue(mockBlob);

      await exportToWord(optionsWithLists);

      expect(Document).toHaveBeenCalled();
    });

    it('should handle citations', async () => {
      const optionsWithCitations = {
        ...mockOptions,
        results: {
          field1: {
            text: [{ line: 'Text with citation', tags: ['1'] }],
            lineMap: {
              '1': {
                file_id: 'file1',
                local_num: 1,
                text: 'Cited text',
                pageNum: 1,
              },
            },
          },
        },
      };

      const mockDocument = {};
      const mockBlob = new Blob();

      (Document as any).mockImplementation(() => mockDocument);
      (Packer.toBlob as any).mockResolvedValue(mockBlob);

      await exportToWord(optionsWithCitations);

      expect(Document).toHaveBeenCalled();
    });

    it('should handle chart images', async () => {
      const chartImages = new Map([['field1', 'data:image/png;base64,test']]);
      const optionsWithCharts = {
        ...mockOptions,
        chartImages,
      };

      const mockDocument = {};
      const mockBlob = new Blob();

      (Document as any).mockImplementation(() => mockDocument);
      (Packer.toBlob as any).mockResolvedValue(mockBlob);

      await exportToWord(optionsWithCharts);

      expect(Document).toHaveBeenCalled();
    });
  });
});

