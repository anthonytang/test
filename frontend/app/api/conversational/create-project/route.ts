// app/api/conversational/create-project/route.ts
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
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? undefined;

  // Cloud mode: Use APIM
  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/conversational/create-project`);
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
          "[CONVERSATIONAL] APIM returned non-OK",
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
              error: "Failed to create project conversationally",
              status: apimResponse.status,
              statusText: apimResponse.statusText,
              body: text,
            },
            { status: apimResponse.status }
          );
        }
      }

      try {
        const json = JSON.parse(text);
        return NextResponse.json(json, { status: apimResponse.status });
      } catch {
        return new NextResponse(text, {
          status: apimResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[CONVERSATIONAL] Error proxying to APIM", err);
      return NextResponse.json(
        { error: "Error calling conversational create-project backend" },
        { status: 500 }
      );
    }
  }

  // Local mode: Call backend directly
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/conversational/create-project`;

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
        "[CONVERSATIONAL] Backend returned non-OK",
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
            error: "Failed to create project conversationally",
            status: backendResponse.status,
            statusText: backendResponse.statusText,
            body: text,
          },
          { status: backendResponse.status }
        );
      }
    }

    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: backendResponse.status });
    } catch {
      return new NextResponse(text, {
        status: backendResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[CONVERSATIONAL] Error calling backend", err);
    return NextResponse.json(
      { error: "Error calling conversational create-project backend" },
      { status: 500 }
    );
  }
}
