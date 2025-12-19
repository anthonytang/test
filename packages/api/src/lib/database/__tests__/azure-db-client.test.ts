import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { AzureDbClient } from '../azure-db-client';

const hoisted = vi.hoisted(() => ({
  getServerConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  poolConnect: vi.fn(),
  poolOn: vi.fn(),
  poolCtor: vi.fn(),
}));

vi.mock('@studio/core', () => ({
  getServerConfig: hoisted.getServerConfig,
  getPublicConfig: hoisted.getPublicConfig,
}));

vi.mock('pg', () => ({
  Pool: hoisted.poolCtor.mockImplementation(() => ({
    connect: hoisted.poolConnect,
    on: hoisted.poolOn,
  })),
}));

const processOnceSpy = vi.spyOn(process, 'once');

beforeEach(() => {
  vi.useRealTimers();
  hoisted.getServerConfig.mockReturnValue({
    database: { url: 'postgres://localhost:5432/db' },
  });
  hoisted.getPublicConfig.mockReturnValue({ backendUrl: 'http://localhost:8000' });
  processOnceSpy.mockImplementation(() => process);
  hoisted.poolCtor.mockClear();
  hoisted.poolConnect.mockReset();
  hoisted.poolOn.mockReset();
});

afterAll(() => {
  processOnceSpy.mockRestore();
});

describe('AzureDbClient', () => {
  it('executes queries with parameters and returns rows', async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({}) // statement timeout
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const release = vi.fn();

    hoisted.poolConnect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    const dbClient = new AzureDbClient();
    const result = await dbClient.query('SELECT * FROM table WHERE id = $1', [
      1,
    ]);

    expect(hoisted.poolCtor).toHaveBeenCalled();
    expect(clientQuery).toHaveBeenNthCalledWith(
      1,
      'SET statement_timeout = 30000'
    );
    expect(clientQuery).toHaveBeenNthCalledWith(2, 'SELECT * FROM table WHERE id = $1', [1]);
    expect(result).toEqual([{ id: 1 }]);
    expect(release).toHaveBeenCalled();
  });

  it('retries transient query errors with backoff', async () => {
    vi.useFakeTimers();

    const firstClientQuery = vi
      .fn()
      .mockResolvedValueOnce({}) // statement timeout
      .mockRejectedValueOnce(new Error('connection lost'));
    const secondClientQuery = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ ok: true }] });

    hoisted.poolConnect
      .mockResolvedValueOnce({
        query: firstClientQuery,
        release: vi.fn(),
      })
      .mockResolvedValueOnce({
        query: secondClientQuery,
        release: vi.fn(),
      });

    const dbClient = new AzureDbClient();
    const queryPromise = dbClient.query('SELECT 1');

    await vi.advanceTimersByTimeAsync(1000);
    const result = await queryPromise;
    vi.useRealTimers();

    expect(result).toEqual([{ ok: true }]);
    expect(firstClientQuery).toHaveBeenCalledTimes(2); // SET + query
    expect(secondClientQuery).toHaveBeenCalledTimes(2);
  });

  it('validates parameters and serializes objects', () => {
    const dbClient = new AzureDbClient();
    const params = (dbClient as any).validateParams([
      'text',
      123,
      true,
      new Date('2024-01-01T00:00:00Z'),
      Buffer.from('buf'),
      { foo: 'bar' },
    ]);

    expect(params[0]).toBe('text');
    expect(params[1]).toBe(123);
    expect(params[5]).toBe(JSON.stringify({ foo: 'bar' }));
    expect(() => (dbClient as any).validateParams([() => {}])).toThrow(
      'Invalid parameter type: function'
    );
  });
});

