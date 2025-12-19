// app/api/export-chart-excel/route.ts
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";

// Check if we're in cloud mode (APIM configured) or local mode
const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response("Invalid or missing JSON body", { status: 400 });
  }

  const authHeader = request.headers.get("authorization") ?? undefined;

  // Cloud mode: Use APIM
  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/export-chart-excel`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);


    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const apimResponse = await fetch(apimUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!apimResponse.ok) {
        const text = await apimResponse.text().catch(() => "");
        console.error(
          "[EXPORT-CHART-EXCEL] APIM returned non-OK",
          apimResponse.status,
          apimResponse.statusText,
          text
        );
        return new Response(
          `Failed to export chart: ${apimResponse.status} ${apimResponse.statusText}`,
          { status: apimResponse.status }
        );
      }

      const contentType =
        apimResponse.headers.get("Content-Type") ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const contentDisposition =
        apimResponse.headers.get("Content-Disposition") ||
        'attachment; filename="chart.xlsx"';

      return new Response(apimResponse.body, {
        status: apimResponse.status,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": contentDisposition,
        },
      });
    } catch (err) {
      console.error("[EXPORT-CHART-EXCEL] Error proxying to APIM", err);
      return new Response("Error calling export-chart-excel backend", {
        status: 500,
      });
    }
  }

  // Local mode: Call backend directly
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/export-chart-excel`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      const text = await backendResponse.text().catch(() => "");
      console.error(
        "[EXPORT-CHART-EXCEL] Backend returned non-OK",
        backendResponse.status,
        backendResponse.statusText,
        text
      );
      return new Response(
        `Failed to export chart: ${backendResponse.status} ${backendResponse.statusText}`,
        { status: backendResponse.status }
      );
    }

    const contentType =
      backendResponse.headers.get("Content-Type") ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const contentDisposition =
      backendResponse.headers.get("Content-Disposition") ||
      'attachment; filename="chart.xlsx"';

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (err) {
    console.error("[EXPORT-CHART-EXCEL] Error calling backend", err);
    return new Response("Error calling export-chart-excel backend", {
      status: 500,
    });
  }
}
