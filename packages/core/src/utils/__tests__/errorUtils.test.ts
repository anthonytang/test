import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERROR_MESSAGES, handleError } from '../errorUtils';

describe('errorUtils', () => {
  describe('ERROR_MESSAGES', () => {
    it('should have all required error message keys', () => {
      expect(ERROR_MESSAGES.failed_loading_template).toBeDefined();
      expect(ERROR_MESSAGES.failed_loading_projects).toBeDefined();
      expect(ERROR_MESSAGES.failed_loading_results).toBeDefined();
      expect(ERROR_MESSAGES.template_not_found).toBeDefined();
      expect(ERROR_MESSAGES.template_update_failed).toBeDefined();
      expect(ERROR_MESSAGES.template_name_required).toBeDefined();
      expect(ERROR_MESSAGES.field_update_failed).toBeDefined();
      expect(ERROR_MESSAGES.field_name_required).toBeDefined();
      expect(ERROR_MESSAGES.processing_failed).toBeDefined();
      expect(ERROR_MESSAGES.backend_error).toBeDefined();
      expect(ERROR_MESSAGES.file_upload_failed).toBeDefined();
      expect(ERROR_MESSAGES.project_not_found).toBeDefined();
      expect(ERROR_MESSAGES.network_error).toBeDefined();
      expect(ERROR_MESSAGES.unknown_error).toBeDefined();
    });

    it('should have all error messages as strings', () => {
      Object.values(ERROR_MESSAGES).forEach((message) => {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe('handleError', () => {
    let mockSetError: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSetError = vi.fn();
      vi.clearAllMocks();
    });

    it('should handle database error code PGRST301', () => {
      const error = { code: 'PGRST301' };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.project_permission_denied);
    });

    it('should handle database error code PGRST404', () => {
      const error = { code: 'PGRST404' };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.template_not_found);
    });

    it('should handle network errors (Failed to fetch)', () => {
      const error = new TypeError('Failed to fetch');
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.network_error);
    });

    it('should handle HTTP 401 status', () => {
      const error = { response: { status: 401 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.project_permission_denied);
    });

    it('should handle HTTP 403 status', () => {
      const error = { response: { status: 403 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.project_permission_denied);
    });

    it('should handle HTTP 404 status', () => {
      const error = { response: { status: 404 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.template_not_found);
    });

    it('should handle HTTP 500 status', () => {
      const error = { response: { status: 500 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.backend_error);
    });

    it('should handle HTTP 502 status', () => {
      const error = { response: { status: 502 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.backend_error);
    });

    it('should handle HTTP 503 status', () => {
      const error = { response: { status: 503 } };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.backend_error);
    });

    it('should use default error message for unknown errors', () => {
      const error = { unknown: 'property' };
      handleError(error, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.unknown_error);
    });

    it('should use custom default key when provided', () => {
      const error = { unknown: 'property' };
      handleError(error, mockSetError, 'network_error');
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.network_error);
    });

    it('should handle errors with name property matching error key', () => {
      const error = { name: 'TemplateNotFoundError' };
      handleError(error, mockSetError);
      // Should try to match against error name
      expect(mockSetError).toHaveBeenCalled();
    });

    it('should not log sensitive data in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = { message: 'sensitive data', code: 'PGRST301' };
      handleError(error, mockSetError);
      
      expect(consoleSpy).toHaveBeenCalled();
      const callArgs = consoleSpy.mock.calls[0]?.[0];
      expect(callArgs).not.toContain('sensitive data');
      
      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle null/undefined errors gracefully', () => {
      handleError(null, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.unknown_error);
      
      handleError(undefined, mockSetError);
      expect(mockSetError).toHaveBeenCalledWith(ERROR_MESSAGES.unknown_error);
    });
  });
});

