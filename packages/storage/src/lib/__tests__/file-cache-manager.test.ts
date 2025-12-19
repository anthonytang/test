import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileCacheManager } from '../file-cache-manager';

type DatabaseFile = {
  id: string;
  created_at: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  metadata: Record<string, any>;
  file_map: Record<number, { text: string; filename: string; local_num: number }>;
  page_map: Record<number, number>;
  processing_status?: string;
};

function createFile(overrides: Partial<DatabaseFile> = {}): DatabaseFile {
  return {
    id: overrides.id || `file-${Math.random().toString(36).slice(2)}`,
    created_at: overrides.created_at || new Date().toISOString(),
    user_id: overrides.user_id || 'user-1',
    file_name: overrides.file_name || 'Document.pdf',
    file_path: overrides.file_path || '/files/doc.pdf',
    file_hash: overrides.file_hash || 'hash',
    file_size: overrides.file_size ?? 1024,
    metadata: overrides.metadata || {},
    file_map: overrides.file_map || {},
    page_map: overrides.page_map || {},
    processing_status: overrides.processing_status,
  };
}

describe('fileCacheManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('library cache', () => {
    it('should set and retrieve library files', () => {
      const file = createFile({ id: 'file-1' });
      fileCacheManager.setLibraryFiles('user-1', [file]);

      const cached = fileCacheManager.getLibraryFiles('user-1');
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe('file-1');
    });

    it('should return null for uncached user', () => {
      expect(fileCacheManager.getLibraryFiles('unknown-user')).toBeNull();
    });

    it('should add file to beginning of cache', () => {
      const file1 = createFile({ id: 'file-1' });
      const file2 = createFile({ id: 'file-2' });

      fileCacheManager.setLibraryFiles('user-1', [file1]);
      fileCacheManager.addLibraryFile('user-1', file2);

      const cached = fileCacheManager.getLibraryFiles('user-1');
      expect(cached).toHaveLength(2);
      expect(cached?.[0].id).toBe('file-2');
      expect(cached?.[1].id).toBe('file-1');
    });

    it('should update file in cache', () => {
      const file = createFile({ id: 'file-1', file_name: 'original.pdf' });
      fileCacheManager.setLibraryFiles('user-1', [file]);

      fileCacheManager.updateLibraryFile('user-1', 'file-1', {
        file_name: 'updated.pdf',
      });

      const cached = fileCacheManager.getLibraryFiles('user-1');
      expect(cached?.[0].file_name).toBe('updated.pdf');
    });

    it('should remove file from cache', () => {
      const file1 = createFile({ id: 'file-1' });
      const file2 = createFile({ id: 'file-2' });
      fileCacheManager.setLibraryFiles('user-1', [file1, file2]);

      fileCacheManager.removeLibraryFile('user-1', 'file-1');

      const cached = fileCacheManager.getLibraryFiles('user-1');
      expect(cached).toHaveLength(1);
      expect(cached?.[0].id).toBe('file-2');
    });

    it('should handle operations on empty cache gracefully', () => {
      fileCacheManager.updateLibraryFile('user-1', 'file-1', { file_name: 'test' });
      fileCacheManager.removeLibraryFile('user-1', 'file-1');

      expect(fileCacheManager.getLibraryFiles('user-1')).toBeNull();
    });
  });

  describe('background refresh', () => {
    it('should start and execute background refresh', () => {
      const refreshFn = vi.fn().mockResolvedValue(undefined);
      fileCacheManager.startBackgroundRefresh('test-key', refreshFn);

      vi.advanceTimersByTime(30_000);
      expect(refreshFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30_000);
      expect(refreshFn).toHaveBeenCalledTimes(2);
    });

    it('should stop background refresh', () => {
      const refreshFn = vi.fn().mockResolvedValue(undefined);
      fileCacheManager.startBackgroundRefresh('test-key', refreshFn);

      fileCacheManager.stopBackgroundRefresh('test-key');

      vi.advanceTimersByTime(60_000);
      expect(refreshFn).not.toHaveBeenCalled();
    });

    it('should replace existing refresh timer when starting new one', () => {
      const refreshFn1 = vi.fn().mockResolvedValue(undefined);
      const refreshFn2 = vi.fn().mockResolvedValue(undefined);

      fileCacheManager.startBackgroundRefresh('test-key', refreshFn1);
      fileCacheManager.startBackgroundRefresh('test-key', refreshFn2);

      vi.advanceTimersByTime(30_000);
      expect(refreshFn1).not.toHaveBeenCalled();
      expect(refreshFn2).toHaveBeenCalledTimes(1);
    });

    it('should handle refresh errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));

      fileCacheManager.startBackgroundRefresh('test-key', refreshFn);
      vi.advanceTimersByTime(30_000);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
