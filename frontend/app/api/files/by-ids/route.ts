import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureDbClient } from "@studio/api/server";
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
    console.error("[BY-IDS] Failed to decode token payload", e);
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
// POST /api/files/by-ids
// -----------------------------
export async function POST(request: NextRequest) {
  const { correlationId, userId, userEmail, userName, clientIp } =
    getRequestContext(request);

  try {
    const { fileIds } = await request.json();

    // Log request
      await logFileAudit({
        action: "files-by-ids-requested",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
      });

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      await logFileAudit({
        action: "files-by-ids-failed",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "fileIds array is required", correlationId },
        { status: 400 }
      );
    }

    if (typeof azureDbClient.getFilesByIds !== "function") {
      console.error("[BY-IDS] getFilesByIds is not available on azureDbClient");

      await logFileAudit({
        action: "files-by-ids-failed",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "getFilesByIds method not available", correlationId },
        { status: 500 }
      );
    }

    // Fetch files by IDs
    const files = await azureDbClient.getFilesByIds(fileIds);

    // Log success
      await logFileAudit({
        action: "files-by-ids-completed",
        userId,
        userEmail,
        userName,
        clientIp,
        correlationId,
      });

    return NextResponse.json(
      { files, correlationId },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching files by IDs:", error);

    await logFileAudit({
      action: "files-by-ids-failed",
      userId,
      userEmail,
      clientIp,
      correlationId,
    });

    return NextResponse.json(
      { error: "Failed to fetch files", correlationId },
      { status: 500 }
    );
  }
}
