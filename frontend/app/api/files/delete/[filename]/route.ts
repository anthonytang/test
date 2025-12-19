// app/api/files/delete/[filename]/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureBlobClient } from "@studio/api/server";
import { azureDbClient } from "@studio/api/server";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    console.error("[FILE DELETE] Failed to decode token", e);
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

  return {
    correlationId,
    userId: tUserId ?? "unknown",
    userEmail: tUserEmail ?? "unknown",
    clientIp,
  };
}

// -----------------------------
// DELETE /api/files/delete/[filename]
// -----------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { correlationId, userId, userEmail, clientIp } =
    getRequestContext(request);

  const { filename } = params;
  const container = "default";

  try {
    if (!filename) {
      // Log failure (no details/error fields)
      await logFileAudit({
        action: "delete-failed",
        userId,
        userEmail,
        clientIp,
        correlationId,
      });

      return NextResponse.json(
        { error: "Filename is required", correlationId },
        { status: 400 }
      );
    }

    // Log "requested"
    await logFileAudit({
      action: "delete-requested",
      userId,
      userEmail,
      clientIp,
      correlationId,
      storedFileName: filename,
      container,
    });

    // 🔹 Delete from Azure Blob Storage
    await azureBlobClient.deleteFile(filename);

    // 🔹 Also delete DB record if method exists
    if (typeof (azureDbClient as any).deleteFileByPath === "function") {
      try {
        await (azureDbClient as any).deleteFileByPath(filename);
      } catch (err) {
        console.warn("[FILE DELETE] Failed DB delete:", err);
      }
    }

    // Log "completed"
    await logFileAudit({
      action: "delete-completed",
      userId,
      userEmail,
      clientIp,
      correlationId,
      storedFileName: filename,
      container,
    });

    return NextResponse.json(
      {
        success: true,
        message: "File deleted successfully",
        fileName: filename,
        correlationId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[FILE DELETE] Error:", error);

    // Log "failed" (but without error/details)
    await logFileAudit({
      action: "delete-failed",
      userId,
      userEmail,
      clientIp,
      correlationId,
      storedFileName: filename,
      container,
    });

    return NextResponse.json(
      { error: "Failed to delete file", correlationId },
      { status: 500 }
    );
  }
}
