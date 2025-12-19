// lib/logAnalytics.ts
import crypto from "crypto";

// These must be set in App Service settings
const workspaceId = process.env.LOG_ANALYTICS_WORKSPACE_ID;
const sharedKey = process.env.LOG_ANALYTICS_SHARED_KEY;
const logType = process.env.LOG_ANALYTICS_LOG_TYPE || "StudioFileAudit";

if (!workspaceId || !sharedKey) {
  console.warn(
    "[LogAnalytics] LOG_ANALYTICS_WORKSPACE_ID or LOG_ANALYTICS_SHARED_KEY not set. Logging is disabled."
  );
}

function buildSignature(
  date: string,
  contentLength: number,
  method: string,
  contentType: string,
  resource: string
) {
  const xHeaders = "x-ms-date:" + date;
  const stringToSign = `${method}\n${contentLength}\n${contentType}\n${xHeaders}\n${resource}`;
  const decodedKey = Buffer.from(sharedKey!, "base64");
  const encodedHash = crypto
    .createHmac("sha256", decodedKey)
    .update(stringToSign, "utf8")
    .digest("base64");
  return `SharedKey ${workspaceId}:${encodedHash}`;
}

export type FileAuditEntry = {
  action: "upload" | "delete" | "download" | string;
  userId: string;
  userEmail?: string;
  originalFileName?: string;
  storedFileName?: string;
  container?: string;
  contentType?: string;
  sizeBytes?: number;
  blobUrl?: string;
  clientIp?: string;
  correlationId?: string;
  // You can add any extra fields you want here
};

export async function logFileAudit(entry: FileAuditEntry) {
  if (!workspaceId || !sharedKey) {
    // Logging disabled – avoid throwing in prod
    return;
  }

  const body = JSON.stringify([
    {
      ...entry,
      Timestamp: new Date().toISOString(),
    },
  ]);

  const method = "POST";
  const contentType = "application/json";
  const resource = "/api/logs";
  const date = new Date().toUTCString();
  const contentLength = Buffer.byteLength(body, "utf8");
  const signature = buildSignature(
    date,
    contentLength,
    method,
    contentType,
    resource
  );
  const uri = `https://${workspaceId}.ods.opinsights.azure.com${resource}?api-version=2016-04-01`;

  try {
    await fetch(uri, {
      method,
      headers: {
        "Content-Type": contentType,
        Authorization: signature,
        "Log-Type": logType,
        "x-ms-date": date,
        "time-generated-field": "Timestamp",
      },
      body,
    });
  } catch (err) {
    console.error("[LogAnalytics] Failed to send log", err);
  }
}
