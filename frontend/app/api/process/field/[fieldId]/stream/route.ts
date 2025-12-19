import { NextRequest } from "next/server";
import { streamFromApimOnBehalfOfUser } from "@studio/api/server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { fieldId: string } }
) {
  const { fieldId } = params;

  try {
    // Collect headers from incoming request
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const url = new URL(req.url);
    const tokenFromQuery = url.searchParams.get("token");

    // This token is used as the *user assertion* for OBO
    if (tokenFromQuery) {
      headers["authorization"] = `Bearer ${tokenFromQuery}`;
    }

    const fakeReq = { headers };

    // IMPORTANT: also forward ?token=... to the backend via APIM
    const apimPath = tokenFromQuery
      ? `/studio/process/field/${fieldId}/stream?token=${encodeURIComponent(
          tokenFromQuery
        )}`
      : `/studio/process/field/${fieldId}/stream`;

    const apimRes = await streamFromApimOnBehalfOfUser(fakeReq, apimPath);

    // If APIM returned non-OK, just surface that back to the browser
    if (!apimRes.ok) {
      const errorText = await apimRes.text().catch(() => "");
      console.error(
        "[SSE] APIM returned non-OK for field",
        fieldId,
        apimRes.status,
        errorText
      );
      return new Response(errorText || "APIM SSE error", {
        status: apimRes.status || 502,
      });
    }

    const apimBody = apimRes.body;

    if (!apimBody) {
      console.error("[SSE] No body returned from APIM for field:", fieldId);
      return new Response("No stream body from APIM", { status: 500 });
    }

    // Pass through the stream directly
    const respHeaders = new Headers();
    respHeaders.set("Content-Type", "text/event-stream");
    respHeaders.set("Cache-Control", "no-cache, no-transform");
    respHeaders.set("Connection", "keep-alive");
    respHeaders.set("X-Accel-Buffering", "no");

    return new Response(apimBody as any, {
      status: 200,
      headers: respHeaders,
    });
  } catch (err) {
    console.error("[SSE] Error in SSE proxy route:", err);
    return new Response("Failed to proxy SSE", { status: 500 });
  }
}
