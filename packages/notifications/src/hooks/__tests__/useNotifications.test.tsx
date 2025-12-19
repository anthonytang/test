import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNotifications } from "../useNotifications";
import { NotificationProvider } from "../../components/NotificationProvider";
import { ReactNode } from "react";

describe("useNotifications", () => {
  it("should return fallback implementation when used outside provider", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useNotifications());

    expect(consoleSpy).toHaveBeenCalledWith(
      "useNotifications called outside of NotificationProvider, using fallback"
    );
    expect(result.current.notifications).toEqual([]);
    expect(typeof result.current.addNotification).toBe("function");
    expect(typeof result.current.showSuccess).toBe("function");

    consoleSpy.mockRestore();
  });

  it("should return context implementation when used inside provider", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NotificationProvider>{children}</NotificationProvider>
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications).toEqual([]);
    expect(typeof result.current.addNotification).toBe("function");
    expect(typeof result.current.showSuccess).toBe("function");
    expect(typeof result.current.showError).toBe("function");
    expect(typeof result.current.showWarning).toBe("function");
    expect(typeof result.current.showInfo).toBe("function");
    expect(typeof result.current.showCompactSuccess).toBe("function");
    expect(typeof result.current.showCompactError).toBe("function");
    expect(typeof result.current.showCompactInfo).toBe("function");
  });
});
