import { getBackendUrl } from "./backend-url";

interface BackendRequestOptions extends RequestInit {
  token?: string;
}

const isBrowser = typeof window !== "undefined";

/**
 * Unified backend client for all API routes to use
 * Handles authentication and backend URL resolution consistently
 */
export class BackendClient {
  /**
   * Make a request to the backend API
   * @param endpoint - The API endpoint (e.g., '/users/123/files/456')
   * @param options - Fetch options including token
   */
  static async fetch(
    endpoint: string,
    options: BackendRequestOptions = {}
  ): Promise<Response> {
    const { token, headers = {}, ...fetchOptions } = options;

    const backendUrl = getBackendUrl();
    const url = `${backendUrl}${endpoint}`;

    // Build headers with auth if token provided
    const requestHeaders: Record<string, string> = {
      ...(headers as Record<string, string>),
    };

    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
    });
  }

  /**
   * Get the backend URL for SSE/EventSource connections
   * @param endpoint - The SSE endpoint
   * @param token - Optional auth token to append as query param
   */
  static getSSEUrl(endpoint: string, token?: string): string {
    // For client-side EventSource, always use the public URL
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";
    let url = `${backendUrl}${endpoint}`;

    if (token) {
      url += `?token=${encodeURIComponent(token)}`;
    }

    return url;
  }
}

/**
 * Analyze a citation for a given field/project
 * Browser → /api/analyze-citation → backend
 */
export async function analyzeCitation(
  fieldName: string,
  fieldDescription: string,
  projectDescription: string,
  citedText: string,
  aiResponse: string,
  currentScores: Record<string, number>
): Promise<any> {
  try {
    if (!isBrowser) {
      throw new Error(
        "analyzeCitation is intended to be called from the browser."
      );
    }

    // Get token from window storage (set by auth provider)
    const token = (window as any).__authToken as string | undefined;
    if (!token) {
      throw new Error(
        "No access token available. Please ensure you are authenticated."
      );
    }

    // Browser → Next API route → APIM → FastAPI (same pattern as EnhancementAPI)
    const response = await fetch("/api/analyze-citation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        field_name: fieldName,
        field_description: fieldDescription,
        project_description: projectDescription,
        cited_text: citedText,
        ai_response: aiResponse,
        current_scores: currentScores,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Citation analysis failed: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Citation analysis error:", error);
    throw error;
  }
}

/**
 * Export chart as native Excel file with embedded chart
 * Browser → /api/export-chart-excel → backend
 */
export async function exportChartAsNativeExcel(
  fieldId: string,
  fieldName: string,
  chartType: string,
  chartConfig: any,
  tableData: any,
  advancedSettings?: any
): Promise<Blob> {
  try {
    if (!isBrowser) {
      throw new Error(
        "exportChartAsNativeExcel is intended to be called from the browser."
      );
    }

    // Get token from window storage (set by auth provider)
    const token = (window as any).__authToken as string | undefined;
    if (!token) {
      throw new Error(
        "No access token available. Please ensure you are authenticated."
      );
    }

    // Browser → Next API route → APIM → FastAPI (mirrors EnhancementAPI)
    const response = await fetch("/api/export-chart-excel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        field_id: fieldId,
        field_name: fieldName,
        chart_type: chartType,
        chart_config: chartConfig,
        table_data: tableData,
        advanced_settings: advancedSettings,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chart export failed: ${response.status} - ${errorText}`);
    }

    // Return blob for download
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error("Chart export error:", error);
    throw error;
  }
}
