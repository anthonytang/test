// app/api/files/download-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureBlobClient } from "@studio/api/server";
import { azureDbClient } from "@studio/api/server";
import { validateAuth } from "@studio/api/server";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// -----------------------------
// Decode user email from Bearer token
// -----------------------------
function decodeUserEmailFromToken(authHeader: string | null): string {
  if (!authHeader?.startsWith("Bearer ")) {
    return "unknown";
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return "unknown";
    }

    const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);

    return (
      payload.email ||
      payload.preferred_username ||
      payload.upn ||
      payload.unique_name ||
      "unknown"
    );
  } catch (e) {
    console.error("[DOWNLOAD URL] Failed to decode token payload", e);
    return "unknown";
  }
}

// -----------------------------
// Extract request context
// -----------------------------
function getRequestContext(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-client-ip") ??
    "unknown";

  return { correlationId, clientIp };
}

// -----------------------------
// POST /api/files/download-url
// Body: { filePath: string }
// -----------------------------
export async function POST(request: NextRequest) {
  const { correlationId, clientIp } = getRequestContext(request);
  const container = "default"; // adjust if you have multiple containers

  try {
    // Validate authentication and extract user info
    const authHeader = request.headers.get("authorization");
    const { userId, isValid } = await validateAuth(authHeader);

    if (!isValid || !userId) {
      return NextResponse.json(
        { error: "Authentication required", correlationId },
        { status: 401 }
      );
    }

    const userEmail = decodeUserEmailFromToken(authHeader);

    const { filePath } = await request.json();

    if (!filePath) {
      await logFileAudit({
        action: "download-url-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "filePath is required", correlationId },
        { status: 400 }
      );
    }

    // Check if user has access to this file through ownership or project permissions
    const hasAccess = await azureDbClient.checkUserFileAccess(userId, filePath);

    if (!hasAccess) {

      await logFileAudit({
        action: "download-url-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
        storedFileName: filePath,
        container,
      });

      return NextResponse.json(
        {
          error: "You do not have permission to access this file",
          correlationId,
        },
        { status: 403 }
      );
    }

    // Log: SAS URL requested
    await logFileAudit({
      action: "download-url-requested",
      userId,
      userEmail,
      clientIp,
      correlationId,
      storedFileName: filePath,
      container,
    });

    // Generate a download URL using Azure Blob Storage
    const downloadUrl = await azureBlobClient.getDownloadUrl(filePath);

    if (!downloadUrl) {
      await logFileAudit({
        action: "download-url-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
        storedFileName: filePath,
        container,
      });

      return NextResponse.json(
        { error: "Failed to generate download URL", correlationId },
        { status: 500 }
      );
    }

    // Log: SAS URL generated
    await logFileAudit({
      action: "download-url-generated",
      userId,
      userEmail,
      clientIp,
      correlationId,
      storedFileName: filePath,
      container,
      blobUrl: downloadUrl,
    });

    return NextResponse.json(
      { downloadUrl, correlationId },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error generating download URL:", error);

    // For auth failures, we probably don't have a valid userId/email
    if (error instanceof Error && error.message === "Unauthorized") {
      await logFileAudit({
        action: "download-url-failed",
        userId: "unknown",
        userEmail: "unknown",
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "Authentication required", correlationId },
        { status: 401 }
      );
    }

    await logFileAudit({
      action: "download-url-failed",
      userId: "unknown",
      userEmail: "unknown",
      clientIp,
      correlationId,
    });

    return NextResponse.json(
      { error: "Failed to generate download URL", correlationId },
      { status: 500 }
    );
  }
}
