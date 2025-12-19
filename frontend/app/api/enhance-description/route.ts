// app/api/enhance-description/route.ts
import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? undefined;

  // Cloud mode: Use APIM
  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/enhance-description`);
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

      const text = await apimResponse.text().catch(() => "");

      if (!apimResponse.ok) {
        console.error(
          "[ENHANCE-DESC] APIM Error:",
          apimResponse.status,
          apimResponse.statusText,
          text
        );
        try {
          const json = JSON.parse(text);
          return NextResponse.json(json, { status: apimResponse.status });
        } catch {
          return NextResponse.json(
            {
              error: "Failed to enhance description",
              status: apimResponse.status,
              statusText: apimResponse.statusText,
            },
            { status: apimResponse.status }
          );
        }
      }

      try {
        return NextResponse.json(JSON.parse(text), {
          status: apimResponse.status,
        });
      } catch {
        return new NextResponse(text, {
          status: apimResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[ENHANCE-DESC] Proxy error:", err);
      return NextResponse.json(
        { error: "Error calling backend enhance-description" },
        { status: 500 }
      );
    }
  }

  // Local mode: Call backend directly
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/enhance-description`;

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

    const text = await backendResponse.text().catch(() => "");

    if (!backendResponse.ok) {
      console.error(
        "[ENHANCE-DESC] Backend Error:",
        backendResponse.status,
        backendResponse.statusText,
        text
      );
      try {
        const json = JSON.parse(text);
        return NextResponse.json(json, { status: backendResponse.status });
      } catch {
        return NextResponse.json(
          {
            error: "Failed to enhance description",
            status: backendResponse.status,
            statusText: backendResponse.statusText,
          },
          { status: backendResponse.status }
        );
      }
    }

    try {
      return NextResponse.json(JSON.parse(text), {
        status: backendResponse.status,
      });
    } catch {
      return new NextResponse(text, {
        status: backendResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[ENHANCE-DESC] Backend error:", err);
    return NextResponse.json(
      { error: "Error calling backend enhance-description" },
      { status: 500 }
    );
  }
}
