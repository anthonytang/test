// app/api/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureBlobClient } from "@studio/api/server";
import { logFileAudit } from "@studio/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TokenPayload {
  userId: string;
  userEmail: string;
  userName: string;
}

function decodeUserFromToken(authHeader: string | null): TokenPayload {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.slice("Bearer ".length);
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid token format");
  }

  const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
  const payload = JSON.parse(payloadJson);

  // We request openid, profile, email scopes - these claims are guaranteed
  const userId: string = payload.oid;
  const userEmail: string = payload.preferred_username;
  const userName: string = payload.name;

  if (!userId || !userEmail || !userName) {
    throw new Error("Token missing required claims (oid, preferred_username, name)");
  }

  return { userId, userEmail, userName };
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const authHeader = request.headers.get("authorization");
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-client-ip")
    || "unknown";

  try {
    const { userId, userEmail, userName } = decodeUserFromToken(authHeader);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided", correlationId },
        { status: 400 }
      );
    }

    await logFileAudit({
      action: "upload-requested",
      userId,
      userEmail,
      userName,
      originalFileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      clientIp,
      correlationId,
    });

    const result = await azureBlobClient.uploadFile(file, file.name);

    await logFileAudit({
      action: "upload-completed",
      userId,
      userEmail,
      userName,
      originalFileName: file.name,
      storedFileName: result.fileName,
      contentType: file.type,
      sizeBytes: result.size,
      blobUrl: result.url,
      clientIp,
      correlationId,
    });

    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      url: result.url,
      size: result.size,
      correlationId,
    });
  } catch (err) {
    const error = err as Error;
    console.error("[FILE UPLOAD] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        correlationId,
      },
      { status: 500 }
    );
  }
}
