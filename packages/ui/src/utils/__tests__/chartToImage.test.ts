import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureChartAsImage, captureAllChartImages } from "../chartToImage";
import html2canvas from "html2canvas";

// Mock html2canvas
vi.mock("html2canvas");

describe("chartToImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup DOM
    document.body.innerHTML = "";
  });

  describe("captureChartAsImage", () => {
    it("should return null when chart element not found", async () => {
      const result = await captureChartAsImage("nonexistent-chart");
      expect(result).toBeNull();
    });

    it("should capture chart as base64 image", async () => {
      const mockElement = document.createElement("div");
      mockElement.id = "test-chart";
      document.body.appendChild(mockElement);

      const mockCanvas = {
        toDataURL: vi.fn(() => "data:image/png;base64,test123"),
      };

      (html2canvas as any).mockResolvedValue(mockCanvas);

      const result = await captureChartAsImage("test-chart");

      expect(html2canvas).toHaveBeenCalledWith(mockElement, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      expect(result).toEqual(expect.objectContaining({ base64: "test123" }));
    });

    it("should return null when canvas conversion fails", async () => {
      const mockElement = document.createElement("div");
      mockElement.id = "test-chart";
      document.body.appendChild(mockElement);

      const mockCanvas = {
        toDataURL: vi.fn(() => "data:image/png;base64,"),
      };

      (html2canvas as any).mockResolvedValue(mockCanvas);

      const result = await captureChartAsImage("test-chart");
      expect(result).toBeNull();
    });

    it("should handle errors gracefully", async () => {
      const mockElement = document.createElement("div");
      mockElement.id = "test-chart";
      document.body.appendChild(mockElement);

      (html2canvas as any).mockRejectedValue(new Error("Capture failed"));

      const result = await captureChartAsImage("test-chart");
      expect(result).toBeNull();
    });
  });

  describe("captureAllChartImages", () => {
    it("should capture all chart images", async () => {
      const fieldIds = ["field1", "field2"];

      fieldIds.forEach((id) => {
        const mockElement = document.createElement("div");
        mockElement.id = `chart-${id}`;
        document.body.appendChild(mockElement);
      });

      const mockCanvas = {
        toDataURL: vi.fn((format) => `data:image/png;base64,${format}-test`),
      };

      (html2canvas as any).mockResolvedValue(mockCanvas);

      const result = await captureAllChartImages(fieldIds);

      expect(result.size).toBe(2);
      expect(result.get("field1")).toBeTruthy();
      expect(result.get("field2")).toBeTruthy();
    });

    it("should skip missing charts", async () => {
      const fieldIds = ["field1", "field2"];

      // Only create one chart element
      const mockElement = document.createElement("div");
      mockElement.id = "chart-field1";
      document.body.appendChild(mockElement);

      const mockCanvas = {
        toDataURL: vi.fn(() => "data:image/png;base64,test"),
      };

      (html2canvas as any).mockResolvedValue(mockCanvas);

      const result = await captureAllChartImages(fieldIds);

      expect(result.size).toBe(1);
      expect(result.get("field1")).toBeTruthy();
      expect(result.has("field2")).toBe(false);
    });

    it("should return empty map when no charts found", async () => {
      const result = await captureAllChartImages(["field1", "field2"]);
      expect(result.size).toBe(0);
    });
  });
});
