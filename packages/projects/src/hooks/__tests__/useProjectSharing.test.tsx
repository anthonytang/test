import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectSharing } from '../useProjectSharing';
import type { ProjectWithPermissions } from '@studio/core';

const project: ProjectWithPermissions = {
  id: 'project-1',
  name: 'Important Project',
  owner_id: 'owner-1',
  created_at: new Date().toISOString(),
  metadata: {},
  user_role: 'owner',
  shared_with_count: 0,
  is_shared: false,
};

const mockFetch = vi.fn();
// @ts-expect-error - attach to global for tests
global.fetch = mockFetch;

describe('useProjectSharing', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens and closes share modal', () => {
    const { result } = renderHook(() =>
      useProjectSharing({ currentUserId: 'owner-1' })
    );

    act(() => {
      result.current.openShareModal(project);
    });

    expect(result.current.isShareModalOpen).toBe(true);
    expect(result.current.selectedProject?.id).toBe('project-1');

    act(() => {
      result.current.closeShareModal();
    });

    expect(result.current.isShareModalOpen).toBe(false);
    expect(result.current.selectedProject).toBeNull();
  });

  it('shares project and toggles loading state', async () => {
    const successResponse = new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    mockFetch.mockResolvedValue(successResponse);

    const { result } = renderHook(() =>
      useProjectSharing({ currentUserId: 'owner-1' })
    );

    await act(async () => {
      result.current.openShareModal(project);
    });

    await act(async () => {
      await result.current.shareProject('user@example.com', 'editor');
    });

    expect(result.current.isSharing).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/share',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          user_email: 'user@example.com',
          role: 'editor',
          granted_by: 'owner-1',
        }),
      })
    );
  });

  it('throws when share response is unsuccessful', async () => {
    const failureResponse = new Response(
      JSON.stringify({ success: false, error: 'Fail' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    mockFetch.mockResolvedValue(failureResponse);

    const { result } = renderHook(() =>
      useProjectSharing({ currentUserId: 'owner-1' })
    );

    await act(async () => {
      result.current.openShareModal(project);
    });

    await expect(
      act(async () => {
        await result.current.shareProject('user@example.com', 'editor');
      })
    ).rejects.toThrow('Fail');
  });

  it('removes permission via API', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() =>
      useProjectSharing({ currentUserId: 'owner-1' })
    );

    await act(async () => {
      result.current.openShareModal(project);
    });

    await act(async () => {
      await result.current.removePermission('user-2');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/permissions?userId=user-2&removedBy=owner-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

