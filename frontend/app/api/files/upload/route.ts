// app/api/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureBlobClient } from "@studio/api/server";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    // AAD typical claims
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
    console.error("[FILE UPLOAD] Failed to decode token payload", e);
    return { userId: null, userEmail: null };
  }
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  const authHeader = request.headers.get("authorization");
  const { userId: tokenUserId, userEmail: tokenUserEmail } =
    decodeUserFromToken(authHeader);

  let userId: string = tokenUserId ?? "unknown";
  let userEmail: string = tokenUserEmail ?? "unknown";
  let originalFileName = "unknown";
  let container = "default";
  let blobUrl = "unknown";
  let clientIp = "unknown";

  try {
    clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-client-ip") ??
      "unknown";

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    // Optional overrides from form-data (if you pass them from frontend)
    const formUserId = formData.get("userId") as string | null;
    const formUserEmail = formData.get("userEmail") as string | null;
    const formContainer = formData.get("container") as string | null;

    if (formUserId) userId = formUserId;
    if (formUserEmail) userEmail = formUserEmail;
    if (formContainer) container = formContainer;

    originalFileName = file?.name ?? "unnamed-file";

    const contentType = file?.type || "application/octet-stream";
    const size = file?.size ?? 0;

    // Log: upload requested (don’t let logging break the upload)
    try {
      await logFileAudit({
        action: "upload-requested",
        userId,
        userEmail,
        originalFileName,
        container,
        contentType,
        sizeBytes: size,
        clientIp,
        correlationId,
      });
    } catch (e) {
      console.error("[FILE UPLOAD] Failed to write upload-requested log", e);
    }

    if (!file) {
      try {
        await logFileAudit({
          action: "upload-failed",
          userId,
          userEmail,
          originalFileName,
          container,
          clientIp,
          correlationId,
        });
      } catch (e) {
        console.error("[FILE UPLOAD] Failed to write upload-failed log", e);
      }

      return NextResponse.json(
        { success: false, error: "No file provided", correlationId },
        { status: 400 }
      );
    }

    // Upload to Azure Blob Storage
    const result = await azureBlobClient.uploadFile(file, originalFileName);
    const { fileName: storedFileName, url, size: storedSize } = result;
    blobUrl = url;

    // Log: upload completed
    try {
      await logFileAudit({
        action: "upload-completed",
        userId,
        userEmail,
        originalFileName,
        storedFileName,
        container,
        contentType,
        sizeBytes: storedSize,
        blobUrl,
        clientIp,
        correlationId,
      });
    } catch (e) {
      console.error("[FILE UPLOAD] Failed to write upload-completed log", e);
      // We deliberately do NOT fail the request if logging fails
    }

    return NextResponse.json(
      {
        success: true,
        fileName: storedFileName,
        url: blobUrl,
        size: storedSize,
        correlationId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const message = error?.message ?? "Unknown error";

    // Log: upload failed
    try {
      await logFileAudit({
        action: "upload-failed",
        userId,
        userEmail,
        originalFileName,
        container,
        blobUrl,
        clientIp,
        correlationId,
      });
    } catch (e) {
      console.error("[FILE UPLOAD] Failed to write upload-failed log in catch", e);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload file",
        details: message,
        correlationId,
      },
      { status: 500 }
    );
  }
}
