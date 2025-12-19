import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTemplates } from "../useTemplates";
import { azureApiClient } from "@studio/api";
import { templateCacheManager } from "../../lib/template-cache-manager";
import type { Template } from "@studio/core";

// Mock dependencies
vi.mock("@studio/api");
vi.mock("@studio/auth", () => ({
  useAuth: vi.fn(() => ({
    user: {
      localAccountId: "user1",
      homeAccountId: "user1",
    },
  })),
}));
vi.mock("@studio/notifications", () => ({
  useNotifications: vi.fn(() => ({
    showCompactSuccess: vi.fn(),
    showCompactError: vi.fn(),
  })),
}));
vi.mock("../../lib/template-cache-manager", () => ({
  templateCacheManager: {
    getTemplates: vi.fn(),
    shouldRefresh: vi.fn(),
    setTemplates: vi.fn(),
    removeTemplate: vi.fn(),
    addTemplate: vi.fn(),
  },
}));

describe("useTemplates", () => {
  const mockTemplates: Template[] = [
    {
      id: "template1",
      name: "Template 1",
      metadata: { description: "Description 1" },
      owner_id: "user1",
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "template2",
      name: "Template 2",
      metadata: { description: "Description 2" },
      owner_id: "user1",
      created_at: "2024-01-02T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (templateCacheManager.getTemplates as any).mockReturnValue(null);
    (templateCacheManager.shouldRefresh as any).mockReturnValue(true);
  });

  describe("initialization", () => {
    it("should load templates from API when no cache exists", async () => {
      (azureApiClient.getTemplatesForUser as any).mockResolvedValue(
        mockTemplates
      );

      const { result } = renderHook(() => useTemplates());

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 5000 }
      );

      expect(azureApiClient.getTemplatesForUser).toHaveBeenCalledWith("user1");
      expect(result.current.templates).toEqual(mockTemplates);
    });

    it("should load templates from cache immediately", async () => {
      (templateCacheManager.getTemplates as any).mockReturnValue(mockTemplates);
      (templateCacheManager.shouldRefresh as any).mockReturnValue(false);

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.templates).toEqual(mockTemplates);
      expect(azureApiClient.getTemplatesForUser).not.toHaveBeenCalled();
    });
  });

  describe("loadTemplates", () => {
    it("should refresh templates when forceRefresh is true", async () => {
      (templateCacheManager.getTemplates as any).mockReturnValue(mockTemplates);
      (azureApiClient.getTemplatesForUser as any).mockResolvedValue(
        mockTemplates
      );

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(azureApiClient.getTemplatesForUser).toHaveBeenCalled();
    });

    it("should not refresh when cache is fresh and forceRefresh is false", async () => {
      (templateCacheManager.getTemplates as any).mockReturnValue(mockTemplates);
      (templateCacheManager.shouldRefresh as any).mockReturnValue(false);

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(azureApiClient.getTemplatesForUser).not.toHaveBeenCalled();
    });
  });

  describe("deleteTemplate", () => {
    it("should call delete API and cache manager", async () => {
      (azureApiClient.getTemplatesForUser as any).mockResolvedValue(
        mockTemplates
      );
      (azureApiClient.deleteTemplate as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const deletePromise = act(async () => {
        await result.current.deleteTemplate("template1", "Template 1");
      });

      expect(templateCacheManager.removeTemplate).toHaveBeenCalledWith(
        "user1",
        "template1"
      );

      await deletePromise;

      expect(azureApiClient.deleteTemplate).toHaveBeenCalledWith("template1");
    });

    it("should handle delete error", async () => {
      (azureApiClient.getTemplatesForUser as any).mockResolvedValue(
        mockTemplates
      );
      (azureApiClient.deleteTemplate as any).mockRejectedValue(
        new Error("Delete failed")
      );

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.deleteTemplate("template1", "Template 1")
        ).rejects.toThrow("Delete failed");
      });

      expect(templateCacheManager.setTemplates).toHaveBeenCalled();
    });
  });

  describe("addTemplate", () => {
    it("should add template to cache and state", async () => {
      (azureApiClient.getTemplatesForUser as any).mockResolvedValue([]);

      const { result } = renderHook(() => useTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newTemplate: Template = {
        id: "template3",
        name: "Template 3",
        metadata: { description: "Description 3" },
        owner_id: "user1",
        created_at: "2024-01-03T00:00:00Z",
      };

      act(() => {
        result.current.addTemplate(newTemplate);
      });

      expect(templateCacheManager.addTemplate).toHaveBeenCalledWith(
        "user1",
        newTemplate
      );
      expect(result.current.templates).toContainEqual(newTemplate);
    });
  });
});
