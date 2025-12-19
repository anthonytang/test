import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_FILE_TYPES,
  validateFiles,
  getAcceptString,
  getSupportedTypesString,
  getUnsupportedFilesErrorMessage,
  type FileValidationResult,
} from '../fileValidation';

describe('fileValidation', () => {
  describe('SUPPORTED_FILE_TYPES', () => {
    it('should have all required file type categories', () => {
      expect(SUPPORTED_FILE_TYPES.pdf).toBeDefined();
      expect(SUPPORTED_FILE_TYPES.word).toBeDefined();
      expect(SUPPORTED_FILE_TYPES.excel).toBeDefined();
      expect(SUPPORTED_FILE_TYPES.powerpoint).toBeDefined();
      expect(SUPPORTED_FILE_TYPES.text).toBeDefined();
      expect(SUPPORTED_FILE_TYPES.html).toBeDefined();
    });

    it('should have correct structure for each file type', () => {
      Object.values(SUPPORTED_FILE_TYPES).forEach((type) => {
        expect(type.extensions).toBeInstanceOf(Array);
        expect(type.mimeTypes).toBeInstanceOf(Array);
        expect(typeof type.category).toBe('string');
        expect(type.extensions.length).toBeGreaterThan(0);
        expect(type.mimeTypes.length).toBeGreaterThan(0);
      });
    });

    it('should have PDF file type with correct extensions', () => {
      expect(SUPPORTED_FILE_TYPES.pdf.extensions).toContain('.pdf');
      expect(SUPPORTED_FILE_TYPES.pdf.mimeTypes).toContain('application/pdf');
    });

    it('should have Word file type with correct extensions', () => {
      expect(SUPPORTED_FILE_TYPES.word.extensions).toContain('.docx');
      expect(SUPPORTED_FILE_TYPES.word.extensions).toContain('.doc');
    });

    it('should have Excel file type with correct extensions', () => {
      expect(SUPPORTED_FILE_TYPES.excel.extensions).toContain('.xlsx');
      expect(SUPPORTED_FILE_TYPES.excel.extensions).toContain('.xls');
      expect(SUPPORTED_FILE_TYPES.excel.extensions).toContain('.csv');
    });
  });

  describe('validateFiles', () => {
    it('should validate PDF files', () => {
      const pdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const result = validateFiles([pdfFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
      expect(result.invalidFiles).toHaveLength(0);
    });

    it('should validate Word files', () => {
      const docxFile = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = validateFiles([docxFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });

    it('should validate Excel files', () => {
      const xlsxFile = new File(['content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const csvFile = new File(['content'], 'test.csv', { type: 'text/csv' });
      const result = validateFiles([xlsxFile, csvFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(2);
    });

    it('should validate PowerPoint files', () => {
      const pptxFile = new File(['content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const result = validateFiles([pptxFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });

    it('should validate text files', () => {
      const txtFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const mdFile = new File(['content'], 'test.md', { type: 'text/markdown' });
      const result = validateFiles([txtFile, mdFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(2);
    });

    it('should validate HTML files', () => {
      const htmlFile = new File(['content'], 'test.html', { type: 'text/html' });
      const result = validateFiles([htmlFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });

    it('should reject unsupported file types', () => {
      const unsupportedFile = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });
      const result = validateFiles([unsupportedFile]);
      
      expect(result.isValid).toBe(false);
      expect(result.validFiles).toHaveLength(0);
      expect(result.invalidFiles).toHaveLength(1);
      expect(result.invalidFiles[0]?.reason).toContain('Unsupported file type');
    });

    it('should handle mixed valid and invalid files', () => {
      const pdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const unsupportedFile = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });
      const result = validateFiles([pdfFile, unsupportedFile]);
      
      expect(result.isValid).toBe(false);
      expect(result.validFiles).toHaveLength(1);
      expect(result.invalidFiles).toHaveLength(1);
    });

    it('should validate files by extension even if mime type is missing', () => {
      const pdfFile = new File(['content'], 'test.pdf', { type: '' });
      const result = validateFiles([pdfFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });

    it('should validate files by mime type even if extension is missing', () => {
      const pdfFile = new File(['content'], 'test', { type: 'application/pdf' });
      const result = validateFiles([pdfFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });

    it('should handle empty file array', () => {
      const result = validateFiles([]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(0);
      expect(result.invalidFiles).toHaveLength(0);
    });

    it('should be case-insensitive for file extensions', () => {
      const pdfFile = new File(['content'], 'test.PDF', { type: 'application/pdf' });
      const result = validateFiles([pdfFile]);
      
      expect(result.isValid).toBe(true);
      expect(result.validFiles).toHaveLength(1);
    });
  });

  describe('getAcceptString', () => {
    it('should return a non-empty string', () => {
      const acceptString = getAcceptString();
      expect(typeof acceptString).toBe('string');
      expect(acceptString.length).toBeGreaterThan(0);
    });

    it('should include all supported extensions', () => {
      const acceptString = getAcceptString();
      expect(acceptString).toContain('.pdf');
      expect(acceptString).toContain('.docx');
      expect(acceptString).toContain('.xlsx');
      expect(acceptString).toContain('.pptx');
      expect(acceptString).toContain('.txt');
      expect(acceptString).toContain('.html');
    });

    it('should include all supported mime types', () => {
      const acceptString = getAcceptString();
      expect(acceptString).toContain('application/pdf');
      expect(acceptString).toContain('text/plain');
      expect(acceptString).toContain('text/html');
    });
  });

  describe('getSupportedTypesString', () => {
    it('should return a human-readable string', () => {
      const typesString = getSupportedTypesString();
      expect(typeof typesString).toBe('string');
      expect(typesString.length).toBeGreaterThan(0);
    });

    it('should include all file type categories', () => {
      const typesString = getSupportedTypesString();
      expect(typesString).toContain('PDF');
      expect(typesString).toContain('Word');
      expect(typesString).toContain('Excel');
    });

    it('should format correctly with "and" for multiple types', () => {
      const typesString = getSupportedTypesString();
      // Should have proper formatting with commas and "and"
      expect(typesString.split(',').length).toBeGreaterThan(0);
    });
  });

  describe('getUnsupportedFilesErrorMessage', () => {
    it('should return error message with file names', () => {
      const invalidFiles = [
        { file: new File([''], 'test1.exe'), reason: 'Unsupported file type: test1.exe' },
        { file: new File([''], 'test2.zip'), reason: 'Unsupported file type: test2.zip' },
      ];
      
      const errorMessage = getUnsupportedFilesErrorMessage(invalidFiles);
      
      expect(errorMessage).toContain('test1.exe');
      expect(errorMessage).toContain('test2.zip');
      expect(errorMessage).toContain('Only');
    });

    it('should include supported types in error message', () => {
      const invalidFiles = [
        { file: new File([''], 'test.exe'), reason: 'Unsupported file type: test.exe' },
      ];
      
      const errorMessage = getUnsupportedFilesErrorMessage(invalidFiles);
      const supportedTypes = getSupportedTypesString();
      
      expect(errorMessage).toContain(supportedTypes);
    });

    it('should handle empty invalid files array', () => {
      const errorMessage = getUnsupportedFilesErrorMessage([]);
      expect(errorMessage).toContain('Only');
    });
  });
});

