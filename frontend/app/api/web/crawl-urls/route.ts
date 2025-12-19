import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";

// Check if we're in cloud mode (APIM configured) or local mode
const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

// -----------------------------
// Decode user from Bearer token
// -----------------------------
function decodeUserFromToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, userEmail: null };
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return { userId: null, userEmail: null };
    }

    const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);

    const userId =
      payload.oid || payload.sub || payload.objectId || null;

    const userEmail =
      payload.email ||
      payload.preferred_username ||
      payload.upn ||
      payload.unique_name ||
      null;

    return { userId, userEmail };
  } catch (e) {
    console.error("[CRAWL] Failed to decode token payload", e);
    return { userId: null, userEmail: null };
  }
}

// -----------------------------
// Extract request context
// -----------------------------
function getRequestContext(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  const authHeader = request.headers.get("authorization");
  const { userId: tUserId, userEmail: tUserEmail } =
    decodeUserFromToken(authHeader);

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-client-ip") ??
    "unknown";

  const userId = tUserId ?? "unknown";
  const userEmail = tUserEmail ?? "unknown";

  return { correlationId, userId, userEmail, clientIp, authHeader };
}

export async function POST(request: NextRequest) {
  const { correlationId, userId, userEmail, clientIp, authHeader } =
    getRequestContext(request);

  const body = await request.json().catch(() => null);
  if (!body) {
    await logFileAudit({
      action: "crawl-urls-failed",
      userId,
      userEmail,
      clientIp,
      correlationId,
    });

    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  // Try to extract URLs from the request body
  const urls: string[] = Array.isArray((body as any).urls)
    ? (body as any).urls
    : (body as any).url
    ? [(body as any).url]
    : [];

  // Per-URL requested logs
  if (urls.length > 0) {
    for (const url of urls) {
      await logFileAudit({
        action: "crawl-url-requested",
        userId,
        userEmail,
        clientIp,
        correlationId,
        originalFileName: url,
        container: "web-crawl",
      });
    }
  }

  // Cloud mode: Use APIM
  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/crawl-urls`);
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
          "[CRAWL] APIM returned non-OK",
          apimResponse.status,
          apimResponse.statusText,
          text
        );

        await logFileAudit({
          action: "crawl-urls-failed",
          userId,
          userEmail,
          clientIp,
          correlationId,
        });

        try {
          const json = JSON.parse(text);
          return NextResponse.json(json, { status: apimResponse.status });
        } catch {
          return NextResponse.json(
            {
              error: "Failed to crawl URLs",
              status: apimResponse.status,
              statusText: apimResponse.statusText,
              body: text,
            },
            { status: apimResponse.status }
          );
        }
      }

      // Success path
      try {
        const json = JSON.parse(text);

        // Per-URL completed logs
        if (urls.length > 0) {
          for (const url of urls) {
            await logFileAudit({
              action: "crawl-url-completed",
              userId,
              userEmail,
              clientIp,
              correlationId,
              originalFileName: url,
              container: "web-crawl",
            });
          }
        }

        return NextResponse.json(json, { status: apimResponse.status });
      } catch {
        if (urls.length > 0) {
          for (const url of urls) {
            await logFileAudit({
              action: "crawl-url-completed",
              userId,
              userEmail,
              clientIp,
              correlationId,
              originalFileName: url,
              container: "web-crawl",
            });
          }
        }

        return new NextResponse(text, {
          status: apimResponse.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[CRAWL] Error proxying to APIM", err);

      await logFileAudit({
        action: "crawl-urls-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "Error calling crawl-urls backend" },
        { status: 500 }
      );
    }
  }

  // Local mode: Call backend directly
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/crawl-urls`;

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
        "[CRAWL] Backend returned non-OK",
        backendResponse.status,
        backendResponse.statusText,
        text
      );

      await logFileAudit({
        action: "crawl-urls-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
      });

      try {
        const json = JSON.parse(text);
        return NextResponse.json(json, { status: backendResponse.status });
      } catch {
        return NextResponse.json(
          {
            error: "Failed to crawl URLs",
            status: backendResponse.status,
            statusText: backendResponse.statusText,
            body: text,
          },
          { status: backendResponse.status }
        );
      }
    }

    // Success path
    try {
      const json = JSON.parse(text);

      if (urls.length > 0) {
        for (const url of urls) {
          await logFileAudit({
            action: "crawl-url-completed",
            userId,
            userEmail,
            clientIp,
            correlationId,
            originalFileName: url,
            container: "web-crawl",
          });
        }
      }

      return NextResponse.json(json, { status: backendResponse.status });
    } catch {
      if (urls.length > 0) {
        for (const url of urls) {
          await logFileAudit({
            action: "crawl-url-completed",
            userId,
            userEmail,
            clientIp,
            correlationId,
            originalFileName: url,
            container: "web-crawl",
          });
        }
      }

      return new NextResponse(text, {
        status: backendResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[CRAWL] Error calling backend", err);

    await logFileAudit({
      action: "crawl-urls-failed",
      userId,
      userEmail,
      clientIp,
      correlationId,
    });

    return NextResponse.json(
      { error: "Error calling crawl-urls backend" },
      { status: 500 }
    );
  }
}
