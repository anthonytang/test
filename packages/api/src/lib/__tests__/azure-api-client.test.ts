import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureApiClient } from '../azure-api-client';

const mockFetch = vi.fn();
// @ts-expect-error - attach mock fetch globally for tests
global.fetch = mockFetch;

const originalWindow = global.window;

describe('AzureApiClient', () => {
  let client: AzureApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new AzureApiClient();
    // @ts-expect-error - minimal browser mock
    global.window = { __authToken: 'test-token' };
  });

  afterEach(() => {
    if (originalWindow) {
      global.window = originalWindow;
    } else {
      // @ts-expect-error - cleanup mock window
      delete global.window;
    }
  });

  it('fetches templates with auth header', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 't1' }]), { status: 200 })
    );

    const templates = await client.getTemplates();

    expect(templates).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/templates',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('returns null for missing template', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const result = await client.getTemplate('missing');
    expect(result).toBeNull();
  });

  it('throws descriptive error on template creation failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
    );

    await expect(
      client.createTemplate({ name: 'Test', owner_id: 'user-1' })
    ).rejects.toThrow('Failed to create template');
  });

  it('builds query string for getFiles', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await client.getFiles('user-1', {
      search: 'doc',
      tags: ['a', 'b'],
      limit: 5,
      offset: 10,
      source: 'library',
    });

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('search=doc');
    expect(calledUrl).toContain('tags=a%2Cb');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('source=library');
  });

  it('returns null for getTemplateWithFields 404', async () => {
    mockFetch.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const result = await client.getTemplateWithFields('tpl');
    expect(result).toBeNull();
  });

  it('propagates upload progress callbacks', async () => {
    const uploadSpy = vi
      .spyOn(client as any, 'uploadFile')
      .mockImplementation((_file: File, _userId: string, onProgress?: (p: number) => void) => {
        onProgress?.(50);
        return Promise.resolve({} as any);
      });

    const blob = new Blob(['content'], { type: 'text/plain' });
    const files = [
      new File([blob], 'one.txt', { type: 'text/plain' }),
      new File([blob], 'two.txt', { type: 'text/plain' }),
    ];
    const progressSpy = vi.fn();

    await client.uploadMultipleFiles(files, 'user-1', progressSpy);

    expect(uploadSpy).toHaveBeenCalledTimes(2);
    expect(progressSpy).toHaveBeenCalledWith('one.txt', 50);
    expect(progressSpy).toHaveBeenCalledWith('two.txt', 50);
  });

  it('throws detailed error when file upload fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 })
    );

    const blob = new Blob(['content'], { type: 'text/plain' });
    const file = new File([blob], 'f.txt', { type: 'text/plain' });

    await expect(client.uploadFile(file, 'user-1')).rejects.toThrow(
      'Upload failed'
    );
  });
});

