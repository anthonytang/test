// GET /api/templates/extractions/[fileId]/stream - SSE stream for template extraction
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";
export const fetchCache = "force-no-store";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL!;

const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

async function createStreamingResponse(
  upstreamUrl: string,
  headers: Record<string, string>
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const response = await fetch(upstreamUrl, {
        method: "GET",
        headers,
      });

      if (!response.ok || !response.body) {
        const errorMsg = `event: error\ndata: ${JSON.stringify({ error: "Upstream connection failed", status: response.status })}\n\n`;
        await writer.write(encoder.encode(errorMsg));
        await writer.close();
        return;
      }

      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (readError) {
        console.error("[TEMPLATE EXTRACTION STREAM] Error reading:", readError);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore
        }
      }
    } catch (fetchError) {
      console.error("[TEMPLATE EXTRACTION STREAM] Fetch error:", fetchError);
      const errorMsg = `event: error\ndata: ${JSON.stringify({ error: "Connection failed" })}\n\n`;
      await writer.write(encoder.encode(errorMsg));
    } finally {
      try {
        await writer.close();
      } catch {
        // Ignore
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, no-transform, must-revalidate",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Missing token query parameter" },
      { status: 400 }
    );
  }

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = `${base}/studio/templates/extractions/${encodeURIComponent(fileId)}/stream?token=${encodeURIComponent(token)}&subscription-key=${encodeURIComponent(APIM_SUBSCRIPTION_KEY!)}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
      "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
    };

    return createStreamingResponse(apimUrl, headers);
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/templates/extractions/${encodeURIComponent(fileId)}/stream?token=${encodeURIComponent(token)}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
  };

  return createStreamingResponse(backendUrl, headers);
}
