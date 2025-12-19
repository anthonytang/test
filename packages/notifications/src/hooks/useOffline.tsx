"use client";

import { useState, useEffect, useCallback } from "react";

export function useOffline() {
  // Initialize with false (online) - we'll check the real status in useEffect
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Check actual online status once mounted in browser
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const handleOnline = () => {
      setIsOffline(false);
      if (wasOffline) {
        // Trigger any reconnection logic here
        window.location.reload();
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [wasOffline]);

  return { isOffline, wasOffline };
}

// Offline indicator component
export function OfflineIndicator() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              You're offline
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Some features may be limited
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for retry logic
export function useRetry<T>(
  fn: () => Promise<T>,
  {
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = () => true,
  }: {
    maxRetries?: number;
    delay?: number;
    backoff?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let currentAttempt = 0;
    let currentDelay = delay;

    while (currentAttempt <= maxRetries) {
      try {
        const result = await fn();
        setData(result);
        setAttempt(currentAttempt);
        setIsLoading(false);
        return result;
      } catch (err) {
        currentAttempt++;
        setAttempt(currentAttempt);

        if (
          currentAttempt > maxRetries ||
          !shouldRetry(err as Error, currentAttempt)
        ) {
          setError(err as Error);
          setIsLoading(false);
          throw err;
        }

        // Wait before retrying - using Promise with setTimeout
        await new Promise((resolve) => {
          const timeoutId = setTimeout(resolve, currentDelay);
          // Store timeout ID for potential cleanup if needed
          return () => clearTimeout(timeoutId);
        });
        currentDelay *= backoff;
      }
    }
    return undefined;
  }, [fn, maxRetries, delay, backoff, shouldRetry]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setAttempt(0);
  }, []);

  return {
    data,
    error,
    isLoading,
    attempt,
    execute,
    reset,
    retry: execute,
  };
}
