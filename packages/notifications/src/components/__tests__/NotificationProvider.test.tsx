import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  NotificationProvider,
  useNotificationContext,
} from "../NotificationProvider";
import { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>{children}</NotificationProvider>
);

describe("NotificationProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should provide notification context", () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    expect(result.current.notifications).toEqual([]);
    expect(typeof result.current.addNotification).toBe("function");
    expect(typeof result.current.removeNotification).toBe("function");
    expect(typeof result.current.clearNotifications).toBe("function");
  });

  it("should add notification", () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    act(() => {
      const id = result.current.addNotification({
        type: "success",
        title: "Test",
        message: "Test message",
      });

      expect(id).toBeTruthy();
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe("Test");
    expect(result.current.notifications[0].message).toBe("Test message");
  });

  it("should remove notification", () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    let notificationId: string;

    act(() => {
      notificationId = result.current.addNotification({
        type: "success",
        title: "Test",
        message: "Test message",
      });
    });

    expect(result.current.notifications).toHaveLength(1);

    act(() => {
      result.current.removeNotification(notificationId!);
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it("should clear all notifications", () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    act(() => {
      result.current.addNotification({
        type: "success",
        title: "Test 1",
        message: "Message 1",
      });
      result.current.addNotification({
        type: "error",
        title: "Test 2",
        message: "Message 2",
      });
    });

    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.clearNotifications();
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it("should auto-remove notification after duration", async () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    act(() => {
      result.current.addNotification({
        type: "success",
        title: "Test",
        message: "Test message",
        duration: 100,
      });
    });

    expect(result.current.notifications).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(150);
      await vi.runAllTimersAsync();
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it("should not auto-remove notification with duration 0", async () => {
    const { result } = renderHook(() => useNotificationContext(), { wrapper });

    act(() => {
      result.current.addNotification({
        type: "success",
        title: "Test",
        message: "Test message",
        duration: 0,
      });
    });

    expect(result.current.notifications).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.notifications).toHaveLength(1);
  });

  describe("show methods", () => {
    it("should show success notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        const id = result.current.showSuccess("Success", "Operation completed");
        expect(id).toBeTruthy();
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("success");
      expect(result.current.notifications[0].title).toBe("Success");
      expect(result.current.notifications[0].message).toBe(
        "Operation completed"
      );
      expect(result.current.notifications[0].duration).toBe(5000);
    });

    it("should show error notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showError("Error", "Operation failed");
      });

      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].duration).toBe(7000);
    });

    it("should show warning notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showWarning("Warning", "Please check");
      });

      expect(result.current.notifications[0].type).toBe("warning");
      expect(result.current.notifications[0].duration).toBe(6000);
    });

    it("should show info notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showInfo("Info", "Information message");
      });

      expect(result.current.notifications[0].type).toBe("info");
      expect(result.current.notifications[0].duration).toBe(5000);
    });

    it("should show compact success notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showCompactSuccess("File uploaded");
      });

      expect(result.current.notifications[0].type).toBe("success");
      expect(result.current.notifications[0].title).toBe("");
      expect(result.current.notifications[0].message).toBe("File uploaded");
      expect(result.current.notifications[0].duration).toBe(3000);
    });

    it("should show compact error notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showCompactError("Upload failed");
      });

      expect(result.current.notifications[0].type).toBe("error");
      expect(result.current.notifications[0].title).toBe("");
      expect(result.current.notifications[0].duration).toBe(4000);
    });

    it("should show compact info notification", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showCompactInfo("Processing...");
      });

      expect(result.current.notifications[0].type).toBe("info");
      expect(result.current.notifications[0].title).toBe("");
      expect(result.current.notifications[0].duration).toBe(2500);
    });

    it("should allow overriding options in show methods", () => {
      const { result } = renderHook(() => useNotificationContext(), {
        wrapper,
      });

      act(() => {
        result.current.showSuccess("Success", "Message", {
          duration: 10000,
        });
      });

      expect(result.current.notifications[0].duration).toBe(10000);
    });
  });
});
