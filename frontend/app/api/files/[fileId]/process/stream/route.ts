// app/api/files/[fileId]/process/stream/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Use Edge runtime for better streaming support on cloud platforms
export const runtime = "edge";
export const fetchCache = "force-no-store";
export const preferredRegion = "auto";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";

// Check if we're in cloud mode (APIM configured) or local mode
const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

function decodeUserIdFromToken(token: string | null): string | null {
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    // Use atob for Edge runtime compatibility (base64 decode)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    const payload = JSON.parse(jsonPayload);

    // AAD access tokens typically have oid or sub
    return payload.oid || payload.sub || null;
  } catch (e) {
    console.error("[FILE STREAM] Failed to decode token payload", e);
    return null;
  }
}

// Create a streaming response that pipes upstream SSE events immediately
async function createStreamingResponse(
  upstreamUrl: string,
  headers: Record<string, string>
): Promise<Response> {
  // Use a TransformStream to pipe data through immediately
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  // Start the upstream fetch in the background
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
          
          if (done) {
            break;
          }
          
          // Write chunk immediately without buffering
          await writer.write(value);
        }
      } catch (readError) {
        console.error("[FILE STREAM] Error reading from upstream:", readError);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore release errors
        }
      }
    } catch (fetchError) {
      console.error("[FILE STREAM] Fetch error:", fetchError);
      const errorMsg = `event: error\ndata: ${JSON.stringify({ error: "Connection failed" })}\n\n`;
      await writer.write(encoder.encode(errorMsg));
    } finally {
      try {
        await writer.close();
      } catch {
        // Ignore close errors
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
  const searchParams = url.searchParams;

  const token = searchParams.get("token");
  let userId: string | null = searchParams.get("userId");

  if (!token) {
    return NextResponse.json(
      { error: "Missing token query parameter" },
      { status: 400 }
    );
  }

  // If userId not provided explicitly, try to decode from the token
  if (!userId) {
    userId = decodeUserIdFromToken(token);
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Missing userId (not provided or not found in token)" },
      { status: 400 }
    );
  }

  // Cloud mode: Use APIM
  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = `${base}/studio/users/${encodeURIComponent(
      userId
    )}/files/${encodeURIComponent(fileId)}/process/stream?token=${encodeURIComponent(token)}&subscription-key=${encodeURIComponent(APIM_SUBSCRIPTION_KEY!)}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
      "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
    };

    return createStreamingResponse(apimUrl, headers);
  }

  // Local mode: Call backend directly
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/users/${encodeURIComponent(
    userId
  )}/files/${encodeURIComponent(fileId)}/process/stream?token=${encodeURIComponent(token)}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
  };

  return createStreamingResponse(backendUrl, headers);
}
