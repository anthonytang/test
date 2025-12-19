import { describe, it, expect, beforeEach, vi } from "vitest";
import { templateCacheManager } from "../template-cache-manager";
import type { Template } from "@studio/core";

describe("template-cache-manager", () => {
  const mockTemplate1: Template = {
    id: "template1",
    name: "Template 1",
    metadata: { description: "Description 1" },
    owner_id: "user1",
    created_at: "2024-01-01T00:00:00Z",
  };

  const mockTemplate2: Template = {
    id: "template2",
    name: "Template 2",
    metadata: { description: "Description 2" },
    owner_id: "user1",
    created_at: "2024-01-02T00:00:00Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getTemplates", () => {
    it("should return null when no cache exists", () => {
      expect(templateCacheManager.getTemplates("unknown")).toBeNull();
    });

    it("should return cached templates", () => {
      templateCacheManager.setTemplates("user1", [mockTemplate1]);
      expect(templateCacheManager.getTemplates("user1")).toEqual([
        mockTemplate1,
      ]);
    });
  });

  describe("shouldRefresh", () => {
    it("should return true when no cache exists", () => {
      expect(templateCacheManager.shouldRefresh("unknown")).toBe(true);
    });

    it("should return false when cache is fresh", () => {
      templateCacheManager.setTemplates("user1", [mockTemplate1]);
      expect(templateCacheManager.shouldRefresh("user1")).toBe(false);
    });

    it("should return true when cache TTL exceeded", () => {
      templateCacheManager.setTemplates("user1", [mockTemplate1]);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(templateCacheManager.shouldRefresh("user1")).toBe(true);
    });
  });

  describe("setTemplates", () => {
    it("should set templates in cache", () => {
      templateCacheManager.setTemplates("user1", [mockTemplate1]);
      expect(templateCacheManager.getTemplates("user1")).toEqual([
        mockTemplate1,
      ]);
    });
  });

  describe("addTemplate", () => {
    it("should add template to empty cache", () => {
      templateCacheManager.addTemplate("user1", mockTemplate1);
      expect(templateCacheManager.getTemplates("user1")).toEqual([
        mockTemplate1,
      ]);
    });

    it("should prepend template to existing cache", () => {
      templateCacheManager.setTemplates("user1", [mockTemplate1]);
      templateCacheManager.addTemplate("user1", mockTemplate2);
      expect(templateCacheManager.getTemplates("user1")).toEqual([
        mockTemplate2,
        mockTemplate1,
      ]);
    });
  });

  describe("removeTemplate", () => {
    it("should remove template from cache", () => {
      templateCacheManager.setTemplates("user1", [
        mockTemplate1,
        mockTemplate2,
      ]);
      templateCacheManager.removeTemplate("user1", "template1");

      const templates = templateCacheManager.getTemplates("user1");
      expect(templates).toEqual([mockTemplate2]);
    });

    it("should handle removing from empty cache gracefully", () => {
      templateCacheManager.removeTemplate("unknown", "template1");
      expect(templateCacheManager.getTemplates("unknown")).toBeNull();
    });
  });
});
