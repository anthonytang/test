// app/api/users/[userId]/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { azureDbClient } from "@studio/api/server";
import { BackendClient } from "@studio/api/server";
import { callApimOnBehalfOfUser } from "@studio/api/server";
import { getBackendUrl } from "@studio/api/server";
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

    const userId = payload.oid || payload.sub || payload.objectId || null;

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
    console.error("[USER FILES] Failed to decode token payload", e);
    return { userId: null, userEmail: null, userName: null };
  }
}

// -----------------------------
// Extract request context (for logging)
// -----------------------------
function getRequestContext(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  const authHeader = request.headers.get("authorization");
  const {
    userId: tUserId,
    userEmail: tUserEmail,
    userName: tUserName,
  } = decodeUserFromToken(authHeader);

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
// GET /api/users/[userId]/files
// -----------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get("hash");

    if (hash) {
      // Get files by hash for duplicate checking
      const files = await azureDbClient.getFilesByHash(userId, hash);
      return NextResponse.json(files);
    } else {
      // Get all user files
      const files = await azureDbClient.getFiles(userId);
      return NextResponse.json(files);
    }
  } catch (error) {
    console.error("Error fetching user files:", error);
    return NextResponse.json(
      { error: "Failed to fetch user files" },
      { status: 500 }
    );
  }
}

// -----------------------------
// POST /api/users/[userId]/files
// (create file metadata record)
// -----------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const {
    correlationId,
    userId: tokenUserId,
    userEmail,
    userName,
    clientIp,
  } = getRequestContext(request);

  let originalFileName: string | undefined;

  try {
    const { userId } = params;
    const body = await request.json();

    // Try to capture file name from payload
    originalFileName =
      body?.file_name ||
      body?.fileName ||
      body?.file_path ||
      body?.filePath ||
      undefined;

    const file = await azureDbClient.createFile({
      ...body,
      user_id: userId,
    });

    // If DB record has a better name, prefer that
    if (!originalFileName && file?.file_name) {
      originalFileName = file.file_name;
    }

    return NextResponse.json(file);
  } catch (error) {
    console.error("Error creating user file:", error);

    await logFileAudit({
      action: "user-file-create-failed",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      originalFileName,
    });

    return NextResponse.json(
      {
        error: "Failed to create user file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// -----------------------------
// PATCH /api/users/[userId]/files
// currently only supports { action: "abort", fileId }
// -----------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const {
    correlationId,
    userId: tokenUserId,
    userEmail,
    userName,
    clientIp,
  } = getRequestContext(request);

  let originalFileName: string | undefined;

  try {
    const { userId } = params;
    const body = await request.json();
    const { action, fileId } = body;

    // Try to resolve file name from DB for abort logs
    if (fileId) {
      try {
        const files = await azureDbClient.getFiles(userId);
        const file = files.find((f: any) => f.id === fileId);
        if (file?.file_name) {
          originalFileName = file.file_name;
        }
      } catch (err) {
        console.error(
          "[USER FILES] Failed to resolve file name for abort logging:",
          err
        );
      }
    }

    if (action === "abort" && fileId) {
      await logFileAudit({
        action: "user-file-abort-requested",
        userId: tokenUserId,
        userEmail,
        userName,
        clientIp,
        correlationId,
        originalFileName,
      });

      const backendUrl = getBackendUrl();
      const isLocal = backendUrl.startsWith("http://localhost");

      if (isLocal) {
        // ---------- LOCAL: abort via BackendClient ----------
        const token =
          request.headers.get("Authorization")?.replace("Bearer ", "") || "";

        const response = await BackendClient.fetch(
          `/users/${userId}/files/${fileId}/abort`,
          {
            method: "POST",
            token,
          }
        );

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Failed to abort file processing" }));

          await logFileAudit({
            action: "user-file-abort-failed",
            userId: tokenUserId,
            userEmail,
            userName,
            clientIp,
            correlationId,
            originalFileName,
          });

          return NextResponse.json(
            { error: errorData.error || "Failed to abort file processing" },
            { status: response.status }
          );
        }

        const data = await response.json().catch(() => ({ success: true }));

        await logFileAudit({
          action: "user-file-abort-completed",
          userId: tokenUserId,
          userEmail,
          userName,
          clientIp,
          correlationId,
          originalFileName,
        });

        // 🔴 Important: return backend data directly
        return NextResponse.json(data);
      }

      // ---------- CLOUD: abort via APIM ----------
      const fakeReq = {
        headers: Object.fromEntries(request.headers.entries()),
      };

      try {
        const result = await callApimOnBehalfOfUser(
          fakeReq,
          `/studio/users/${userId}/files/${fileId}/abort`,
          {
            method: "POST",
          }
        );

        await logFileAudit({
          action: "user-file-abort-completed",
          userId: tokenUserId,
          userEmail,
          userName,
          clientIp,
          correlationId,
          originalFileName,
        });

        // 🔴 Important: return result directly
        return NextResponse.json(result);
      } catch (err: any) {
        console.error(
          "Error aborting file processing via APIM:",
          err?.message || err
        );

        await logFileAudit({
          action: "user-file-abort-failed",
          userId: tokenUserId,
          userEmail,
          clientIp,
          correlationId,
          originalFileName,
        });

        return NextResponse.json(
          {
            error: "Failed to abort file processing",
          },
          { status: 500 }
        );
      }
    }

    await logFileAudit({
      action: "user-file-abort-failed",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      originalFileName,
    });

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in PATCH:", error);

    await logFileAudit({
      action: "user-file-abort-failed",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      originalFileName,
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// -----------------------------
// DELETE /api/users/[userId]/files?fileId=...
// -----------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const {
    correlationId,
    userId: tokenUserId,
    userEmail,
    userName,
    clientIp,
  } = getRequestContext(request);

  let originalFileName: string | undefined;

  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      await logFileAudit({
        action: "user-file-delete-failed",
        userId: tokenUserId,
        userEmail,
        userName,
        clientIp,
        correlationId,
        originalFileName,
      });

      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      );
    }

    // Get file info before deletion to get the file path
    const files = await azureDbClient.getFiles(userId);
    const file = files.find((f: any) => f.id === fileId);

    if (file?.file_name) {
      originalFileName = file.file_name;
    }

    if (!file) {
      await logFileAudit({
        action: "user-file-delete-failed",
        userId: tokenUserId,
        userEmail,
        userName,
        clientIp,
        correlationId,
        originalFileName,
      });

      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await logFileAudit({
      action: "user-file-delete-requested",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      storedFileName: file.file_path,
      originalFileName,
    });

    const backendUrl = getBackendUrl();
    const isLocal = backendUrl.startsWith("http://localhost");

    // 1. Delete vectors from Cosmos DB via backend
    try {
      if (isLocal) {
        // ---------- LOCAL: backend delete via BackendClient ----------
        const token =
          request.headers.get("Authorization")?.replace("Bearer ", "") || "";

        const res = await BackendClient.fetch(
          `/files/${fileId}`,
          {
            method: "DELETE",
            token,
          }
        );

        if (!res.ok) {
          console.error(
            "Failed to delete vectors from backend (local):",
            await res.text()
          );
        }
      } else {
        // ---------- CLOUD: backend delete via APIM ----------
        const fakeReq = {
          headers: Object.fromEntries(request.headers.entries()),
        };

        await callApimOnBehalfOfUser(
          fakeReq,
          `/studio/files/${fileId}`,
          {
            method: "DELETE",
          }
        );
      }
    } catch (err: any) {
      // Log but continue with Blob + DB delete
      console.error(
        "Failed to delete vectors in backend. Continuing with local cleanup:",
        err?.message || err
      );
    }

    // 2. Delete from Azure Blob Storage (original + converted PDF if exists)
    const { azureBlobClient } = await import("@studio/api/server");
    if (file.file_path) {
      try {
        await azureBlobClient.deleteFile(file.file_path);
      } catch (error) {
        console.error("Failed to delete original file from blob:", error);
      }
    }
    const displayPath = file.metadata?.display_path;
    if (displayPath && displayPath !== file.file_path) {
      try {
        await azureBlobClient.deleteFile(displayPath);
      } catch (error) {
        console.error("Failed to delete converted PDF from blob:", error);
      }
    }

    // 3. Delete from database (this also removes from project_files)
    await azureDbClient.deleteFile(fileId);

    await logFileAudit({
      action: "user-file-delete-completed",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      storedFileName: file.file_path,
      originalFileName,
    });

    // 🔴 Important: keep original shape
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user file:", error);

    await logFileAudit({
      action: "user-file-delete-failed",
      userId: tokenUserId,
      userEmail,
      userName,
      clientIp,
      correlationId,
      originalFileName,
    });

    return NextResponse.json(
      { error: "Failed to delete user file" },
      { status: 500 }
    );
  }
}
