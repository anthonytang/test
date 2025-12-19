import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileLibrary } from '../useFileLibrary';
import type { File } from '@studio/core';

describe('useFileLibrary', () => {
  it('should initialize with closed state', () => {
    const { result } = renderHook(() => useFileLibrary());

    expect(result.current.isFileLibraryOpen).toBe(false);
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedFiles).toEqual([]);
    expect(result.current.fileLibraryTitle).toBe('File Library');
  });

  it('should open file library with default options', () => {
    const { result } = renderHook(() => useFileLibrary());

    act(() => {
      result.current.openFileLibrary();
    });

    expect(result.current.isFileLibraryOpen).toBe(true);
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.fileLibraryTitle).toBe('File Library');
  });

  it('should open file library with custom options', () => {
    const { result } = renderHook(() => useFileLibrary());
    const mockFiles: File[] = [
      {
        id: 'file1',
        file_name: 'test.pdf',
        project_id: 'project1',
        created_at: '2024-01-01T00:00:00Z',
      },
    ];

    act(() => {
      result.current.openFileLibrary({
        selectionMode: true,
        title: 'Select Files',
        selectedFiles: mockFiles,
      });
    });

    expect(result.current.isFileLibraryOpen).toBe(true);
    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.fileLibraryTitle).toBe('Select Files');
    expect(result.current.selectedFiles).toEqual(mockFiles);
  });

  it('should close file library and reset state', () => {
    const { result } = renderHook(() => useFileLibrary());

    act(() => {
      result.current.openFileLibrary({
        selectionMode: true,
        title: 'Custom Title',
        selectedFiles: [{ id: 'file1' } as File],
      });
    });

    expect(result.current.isFileLibraryOpen).toBe(true);

    act(() => {
      result.current.closeFileLibrary();
    });

    expect(result.current.isFileLibraryOpen).toBe(false);
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedFiles).toEqual([]);
    expect(result.current.fileLibraryTitle).toBe('File Library');
  });

  it('should handle file selection', () => {
    const { result } = renderHook(() => useFileLibrary());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    act(() => {
      result.current.handleFileSelection(['file1', 'file2']);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'File selection not implemented:',
      ['file1', 'file2']
    );

    consoleSpy.mockRestore();
  });
});

