import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRetry } from "../useOffline";

describe("useRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should execute function successfully on first attempt", async () => {
    const mockFn = vi.fn().mockResolvedValue("success");

    const { result } = renderHook(() => useRetry(mockFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.attempt).toBe(0);
  });

  it("should retry on failure and succeed", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValue("success");

    const { result } = renderHook(() => useRetry(mockFn, { delay: 10 }));

    await act(async () => {
      const executePromise = result.current.execute();
      await vi.runAllTimersAsync();
      await executePromise;
    });

    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.attempt).toBe(1);
  });

  it("should respect maxRetries", async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

    const { result } = renderHook(() =>
      useRetry(mockFn, { maxRetries: 2, delay: 10 })
    );

    await act(async () => {
      const executePromise = result.current.execute().catch(() => {
        // Expected to fail
      });
      await vi.runAllTimersAsync();
      await executePromise;
    });

    expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(result.current.error).toBeTruthy();
    expect(result.current.isLoading).toBe(false);
  });

  it("should apply backoff to delay", async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

    const { result } = renderHook(() =>
      useRetry(mockFn, { maxRetries: 2, delay: 10, backoff: 2 })
    );

    await act(async () => {
      const executePromise = result.current.execute().catch(() => {
        // Expected to fail
      });
      await vi.runAllTimersAsync();
      await executePromise;
    });

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("should respect shouldRetry function", async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error("Failed"));

    const { result } = renderHook(() =>
      useRetry(mockFn, {
        maxRetries: 3,
        delay: 10,
        shouldRetry: (error, attempt) => attempt <= 1, // Only retry once
      })
    );

    await act(async () => {
      const executePromise = result.current.execute().catch(() => {
        // Expected to fail
      });
      await vi.runAllTimersAsync();
      await executePromise;
    });

    expect(mockFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it("should reset state", async () => {
    const mockFn = vi.fn().mockResolvedValue("success");

    const { result } = renderHook(() => useRetry(mockFn));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBe("success");

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.attempt).toBe(0);
  });

  it("should provide retry alias for execute", async () => {
    const mockFn = vi.fn().mockResolvedValue("success");

    const { result } = renderHook(() => useRetry(mockFn));

    await act(async () => {
      await result.current.retry();
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe("success");
  });
});
