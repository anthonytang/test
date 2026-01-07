// app/api/files/download/[filename]/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureBlobClient } from "@studio/api/server";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// -----------------------------
// Decode user from Bearer token
// -----------------------------
function decodeUserFromToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, userEmail: null, userName: null };
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return { userId: null, userEmail: null, userName: null };
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

    const userName =
      payload.name ||
      payload.displayName ||
      payload.given_name ||
      (userEmail ? userEmail.split("@")[0] : null) ||
      null;

    return { userId, userEmail, userName };
  } catch (e) {
    console.error("[DOWNLOAD URL] Failed to decode token payload", e);
    return { userId: null, userEmail: null, userName: null };
  }
}

// -----------------------------
// Extract request context
// -----------------------------
function getRequestContext(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  const authHeader = request.headers.get("authorization");
  const { userId: tUserId, userEmail: tUserEmail, userName: tUserName } =
    decodeUserFromToken(authHeader);

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-client-ip") ??
    "unknown";

  const userId = tUserId ?? "unknown";
  const userEmail = tUserEmail ?? "unknown";
  const userName = tUserName ?? "unknown";

  return { correlationId, userId, userEmail, userName, clientIp };
}

// -----------------------------
// GET /api/files/download/[filename]
// Returns a SAS download URL (1 hour)
// -----------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { correlationId, userId, userEmail, userName, clientIp } =
    getRequestContext(request);

  const { filename } = params;
  const container = "default"; // adjust if you support multiple containers

  try {
    if (!filename) {
      await logFileAudit({
        action: "download-url-failed",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "Filename is required", correlationId },
        { status: 400 }
      );
    }

    // Log: SAS URL requested
      await logFileAudit({
        action: "download-url-requested",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
        storedFileName: filename,
        container,
      });

    // Generate download URL with SAS token (valid for 1 hour)
    const expiresInSeconds = 3600; // 1 hour
    const downloadUrl = await azureBlobClient.getDownloadUrl(
      filename,
      1 // hours
    );

    // Log: SAS URL generated
      await logFileAudit({
        action: "download-url-generated",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
        storedFileName: filename,
        container,
        blobUrl: downloadUrl,
      });

    return NextResponse.json(
      {
        downloadUrl,
        expiresIn: expiresInSeconds,
        correlationId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[DOWNLOAD URL] Error generating download URL:", error);

    await logFileAudit({
      action: "download-url-failed",
      userId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      storedFileName: filename,
      container,
    });

    return NextResponse.json(
      { error: "Failed to generate download URL", correlationId },
      { status: 500 }
    );
  }
}
