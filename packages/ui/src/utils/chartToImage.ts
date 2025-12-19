/**
 * Utility to convert Recharts chart to base64 image for Word export
 */

import html2canvas from "html2canvas";

export async function captureChartAsImage(
  chartContainerId: string
): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const chartElement = document.getElementById(chartContainerId);
    if (!chartElement) {
      console.warn(`Chart element not found: ${chartContainerId}`);
      return null;
    }

    // Get the actual rendered dimensions of the chart
    const rect = chartElement.getBoundingClientRect();
    const chartWidth = rect.width;
    const chartHeight = rect.height;

    // Capture the chart - let html2canvas use the element's natural size
    const canvas = await html2canvas(chartElement, {
      backgroundColor: "#ffffff",
      scale: 2, // Higher quality
      logging: false,
      useCORS: true,
      allowTaint: true,
      // Don't force dimensions here - let it use the element's natural size
    });

    const base64 = canvas.toDataURL("image/png").split(",")[1];

    if (!base64) {
      console.warn("Failed to capture chart as image");
      return null;
    }

    return {
      base64,
      width: chartWidth,
      height: chartHeight,
    };
  } catch (error) {
    console.error("Error capturing chart as image:", error);
    return null;
  }
}

export async function captureAllChartImages(
  chartFieldIds: string[]
): Promise<Map<string, { base64: string; width: number; height: number }>> {
  const chartImages = new Map<
    string,
    { base64: string; width: number; height: number }
  >();

  for (const fieldId of chartFieldIds) {
    const chartId = `chart-${fieldId}`;
    const imageData = await captureChartAsImage(chartId);

    if (imageData) {
      chartImages.set(fieldId, imageData);
    }
  }

  return chartImages;
}
