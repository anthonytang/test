import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOffline, OfflineIndicator } from '../useOffline';
import { render } from '@testing-library/react';

describe('useOffline', () => {
  beforeEach(() => {
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with current online status', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    const { result } = renderHook(() => useOffline());
    expect(result.current.isOffline).toBe(false);
    expect(result.current.wasOffline).toBe(false);
  });

  it('should detect offline status on initialization', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    const { result } = renderHook(() => useOffline());
    expect(result.current.isOffline).toBe(true);
  });

  it('should update when going offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    const { result } = renderHook(() => useOffline());

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    window.dispatchEvent(new Event('offline'));

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
    });
    expect(result.current.wasOffline).toBe(true);
  });

  it('should update when coming back online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    const { result } = renderHook(() => useOffline());

    // First go offline
    window.dispatchEvent(new Event('offline'));

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
    });

    // Then come back online
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(result.current.isOffline).toBe(false);
    });
  });

  it('should reload page when coming back online after being offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});

    const { result } = renderHook(() => useOffline());

    // Go offline first
    window.dispatchEvent(new Event('offline'));

    await waitFor(() => {
      expect(result.current.wasOffline).toBe(true);
    });

    // Come back online
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(reloadSpy).toHaveBeenCalled();
    });

    reloadSpy.mockRestore();
  });
});

describe('OfflineIndicator', () => {
  it('should not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeTruthy();
    expect(container.textContent).toContain("You're offline");
  });
});

