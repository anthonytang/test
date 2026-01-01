// POST /api/web/crawl - Crawl URLs via Firecrawl
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL!;

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

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/web/crawl`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[WEB/CRAWL] APIM error:", response.status, text);
        try {
          return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
          return NextResponse.json(
            { error: "Failed to crawl URLs", body: text },
            { status: response.status }
          );
        }
      }

      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return new NextResponse(text, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[WEB/CRAWL] Error proxying to APIM:", err);
      return NextResponse.json({ error: "Error crawling URLs" }, { status: 500 });
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/web/crawl`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[WEB/CRAWL] Backend error:", response.status, text);
      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return NextResponse.json(
          { error: "Failed to crawl URLs", body: text },
          { status: response.status }
        );
      }
    }

    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[WEB/CRAWL] Error calling backend:", err);
    return NextResponse.json({ error: "Error crawling URLs" }, { status: 500 });
  }
}
