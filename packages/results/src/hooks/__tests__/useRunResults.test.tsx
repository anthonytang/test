import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRunResults } from '../useRunResults';
import { azureApiClient } from '@studio/api';

// Mock @studio/api
vi.mock('@studio/api', () => ({
  azureApiClient: {
    getResultsForRun: vi.fn(),
    saveResult: vi.fn(),
  },
}));

describe('useRunResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty results when runId is null', () => {
      const { result } = renderHook(() => useRunResults(null));

      expect(result.current.results).toEqual({});
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should initialize with empty results when runId is invalid', () => {
      const { result } = renderHook(() => useRunResults(''));

      expect(result.current.results).toEqual({});
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('loadResults', () => {
    it('should load results for valid runId', async () => {
      const mockResults = [
        {
          id: 'result1',
          run_id: 'run1',
          field_id: 'field1',
          value: {
            text: [{ line: 'Test', tags: [] }],
            lineMap: {},
          },
          metadata: {},
          status: 'completed',
        },
      ];

      (azureApiClient.getResultsForRun as any).mockResolvedValue(mockResults);

      const { result } = renderHook(() => useRunResults('run1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(azureApiClient.getResultsForRun).toHaveBeenCalledWith('run1');
      expect(Object.keys(result.current.results)).toContain('field1');
    });

    it('should handle loading errors', async () => {
      (azureApiClient.getResultsForRun as any).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => useRunResults('run1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.results).toEqual({});
    });

    it('should not load when runId is invalid', async () => {
      const { result } = renderHook(() => useRunResults(''));

      await result.current.loadResults();

      expect(azureApiClient.getResultsForRun).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.error).toBe('No valid run ID');
      });
    });
  });

  describe('saveResult', () => {
    it('should save result and update state', async () => {
      const mockResult = {
        text: [{ line: 'Test', tags: [] }],
        lineMap: {},
      };

      (azureApiClient.saveResult as any).mockResolvedValue('result-id');
      (azureApiClient.getResultsForRun as any).mockResolvedValue([]);

      const { result } = renderHook(() => useRunResults('run1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.saveResult('field1', mockResult);

      expect(azureApiClient.saveResult).toHaveBeenCalledWith({
        run_id: 'run1',
        field_id: 'field1',
        value: mockResult,
        metadata: {},
        status: 'completed',
      });

      await waitFor(() => {
        expect(result.current.results.field1).toEqual(mockResult);
      });
    });

    it('should rollback on save error', async () => {
      const initialResults = {
        field1: {
          text: [{ line: 'Original', tags: [] }],
          lineMap: {},
        },
      };

      // First load initial results
      (azureApiClient.getResultsForRun as any).mockResolvedValue([
        {
          id: 'result1',
          run_id: 'run1',
          field_id: 'field1',
          value: initialResults.field1,
          metadata: {},
          status: 'completed',
        },
      ]);

      const { result } = renderHook(() => useRunResults('run1'));

      await waitFor(() => {
        expect(result.current.results.field1).toBeDefined();
      });

      const newResult = {
        text: [{ line: 'New', tags: [] }],
        lineMap: {},
      };

      (azureApiClient.saveResult as any).mockRejectedValue(
        new Error('Save failed')
      );

      await expect(
        result.current.saveResult('field1', newResult)
      ).rejects.toThrow();

      // Should rollback to original
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });

    it('should validate result structure before saving', async () => {
      const { result } = renderHook(() => useRunResults('run1'));

      await result.current.saveResult('field1', null as any);

      expect(azureApiClient.saveResult).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.error).toBe('Invalid result structure');
      });
    });

    it('should not save when runId is invalid', async () => {
      const { result } = renderHook(() => useRunResults(''));

      const mockResult = {
        text: [{ line: 'Test', tags: [] }],
        lineMap: {},
      };

      await result.current.saveResult('field1', mockResult);

      expect(azureApiClient.saveResult).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.error).toBe('Invalid run ID or field ID');
      });
    });
  });

  describe('clearResults', () => {
    it('should clear all results', async () => {
      const mockResults = [
        {
          id: 'result1',
          run_id: 'run1',
          field_id: 'field1',
          value: {
            text: [{ line: 'Test', tags: [] }],
            lineMap: {},
          },
          metadata: {},
          status: 'completed',
        },
      ];

      (azureApiClient.getResultsForRun as any).mockResolvedValue(mockResults);

      const { result } = renderHook(() => useRunResults('run1'));

      await waitFor(() => {
        expect(result.current.results.field1).toBeDefined();
      });

      result.current.clearResults();

      await waitFor(() => {
        expect(result.current.results).toEqual({});
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('auto-loading on runId change', () => {
    it('should load results when runId changes', async () => {
      const mockResults = [
        {
          id: 'result1',
          run_id: 'run1',
          field_id: 'field1',
          value: {
            text: [{ line: 'Test', tags: [] }],
            lineMap: {},
          },
          metadata: {},
          status: 'completed',
        },
      ];

      (azureApiClient.getResultsForRun as any).mockResolvedValue(mockResults);

      const { result, rerender } = renderHook(
        ({ runId }) => useRunResults(runId),
        {
          initialProps: { runId: null as string | null },
        }
      );

      rerender({ runId: 'run1' });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(azureApiClient.getResultsForRun).toHaveBeenCalledWith('run1');
    });

    it('should clear results when runId becomes null', () => {
      const { result, rerender } = renderHook(
        ({ runId }) => useRunResults(runId),
        {
          initialProps: { runId: 'run1' as string | null },
        }
      );

      result.current.results = {
        field1: {
          text: [{ line: 'Test', tags: [] }],
          lineMap: {},
        },
      };

      rerender({ runId: null });

      expect(result.current.results).toEqual({});
    });
  });
});

