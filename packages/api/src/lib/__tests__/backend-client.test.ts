import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackendClient } from '../backend-client';

// Mock @studio/core
vi.mock('@studio/core', () => ({
  getBackendUrl: vi.fn(() => 'http://test-backend.com'),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BackendClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch', () => {
    it('should make a request to the correct URL', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await BackendClient.fetch('/test-endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend.com/test-endpoint',
        expect.objectContaining({
          headers: {},
        })
      );
    });

    it('should include Authorization header when token is provided', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await BackendClient.fetch('/test-endpoint', {
        token: 'test-token-123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend.com/test-endpoint',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token-123',
          },
        })
      );
    });

    it('should merge custom headers with auth header', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await BackendClient.fetch('/test-endpoint', {
        token: 'test-token-123',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend.com/test-endpoint',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
            Authorization: 'Bearer test-token-123',
          },
        })
      );
    });

    it('should pass through fetch options', async () => {
      mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await BackendClient.fetch('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend.com/test-endpoint',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: 'test' }),
        })
      );
    });

    it('should return the fetch response', async () => {
      const mockResponse = new Response('{"success": true}', { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await BackendClient.fetch('/test-endpoint');

      expect(response).toBe(mockResponse);
    });
  });

  describe('getSSEUrl', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL;

    afterEach(() => {
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL = originalEnv;
    });

    it('should construct SSE URL without token', () => {
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL = 'http://sse-backend.com';

      const url = BackendClient.getSSEUrl('/stream');

      expect(url).toBe('http://sse-backend.com/stream');
    });

    it('should construct SSE URL with token as query parameter', () => {
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL = 'http://sse-backend.com';

      const url = BackendClient.getSSEUrl('/stream', 'test-token-123');

      expect(url).toBe('http://sse-backend.com/stream?token=test-token-123');
    });

    it('should encode token in URL', () => {
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL = 'http://sse-backend.com';

      const url = BackendClient.getSSEUrl('/stream', 'token with spaces & special=chars');

      expect(url).toBe(
        'http://sse-backend.com/stream?token=token%20with%20spaces%20%26%20special%3Dchars'
      );
    });

    it('should use default URL when env var is not set', () => {
      delete process.env.NEXT_PUBLIC_BACKEND_SERVER_URL;

      const url = BackendClient.getSSEUrl('/stream');

      expect(url).toBe('http://localhost:8000/stream');
    });
  });
});
