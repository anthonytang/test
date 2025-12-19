import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjectMembers } from '../useProjectMembers';

const fetchMock = vi.fn();
// @ts-expect-error - attach mock fetch globally
global.fetch = fetchMock;

const notificationMocks = vi.hoisted(() => ({
  showCompactSuccess: vi.fn(),
  showCompactError: vi.fn(),
}));

vi.mock('@studio/notifications', () => ({
  useNotifications: () => notificationMocks,
}));

describe('useProjectMembers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    notificationMocks.showCompactError.mockReset();
    notificationMocks.showCompactSuccess.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads members when modal opens', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ members: [{ user_id: 'user-2', email: 'test@example.com' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() =>
      useProjectMembers('project-1', 'owner-1', true)
    );

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/share?userId=owner-1'
    );
  });

  it('shares project member and refreshes list', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ members: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ members: [{ user_id: 'user-3', email: 'new@example.com' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const { result } = renderHook(() =>
      useProjectMembers('project-1', 'owner-1', true)
    );

    await waitFor(() => expect(result.current.members).toHaveLength(0));

    await act(async () => {
      await result.current.shareProject('new@example.com', 'editor');
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/share',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          user_email: 'new@example.com',
          role: 'editor',
          granted_by: 'owner-1',
        }),
      })
    );

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
    });
  });

  it('rolls back member removal on failure', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ members: [{ user_id: 'user-2', email: 'test@example.com' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() =>
      useProjectMembers('project-1', 'owner-1', true)
    );

    await waitFor(() => expect(result.current.members).toHaveLength(1));

    await expect(
      act(async () => {
        await result.current.removePermission('user-2');
      })
    ).rejects.toThrow('network error');

    expect(result.current.members).toHaveLength(1);
    expect(notificationMocks.showCompactError).toHaveBeenCalledWith(
      'Failed to remove access'
    );
  });
});

