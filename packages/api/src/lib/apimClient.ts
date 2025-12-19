// lib/apimClient.ts
import { getMsalClient, API_SCOPES } from "./msalClient";
import { Buffer } from "buffer"; // add at top if not present

const apimBaseUrl = process.env.APIM_BASE_URL!;
const apimKey = process.env.APIM_SUBSCRIPTION_KEY!;
const apimSendAuth = "true";

// if (!apimBaseUrl) {
//   throw new Error("APIM_BASE_URL is not set");
// }
// if (!apimKey) {
//   throw new Error("APIM_SUBSCRIPTION_KEY is not set");
// }

/**
 * Normalize headers from a RequestInit into a plain Record<string, string>.
 */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};

  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
  } else {
    Object.assign(result, headers);
  }

  return result;
}

/**
 * Extract a user assertion token (ID token or access token) from incoming headers.
 * We support:
 *   - x-ms-token-aad-access-token  (if App Service / Easy Auth is used)
 *   - Authorization: Bearer <token>
 */
function getUserAssertionFromHeaders(headers: Record<string, string>): string {
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    headersLower[k.toLowerCase()] = v || "";
  }

  const aadHeader = headersLower["x-ms-token-aad-access-token"];
  const authHeader = headersLower["authorization"];

  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length)
      : undefined;

  const userAssertionToken = aadHeader || bearerToken;

  if (!userAssertionToken) {
    throw new Error(
      "User access token not found (no x-ms-token-aad-access-token or Authorization header)"
    );
  }

  return userAssertionToken;
}

const hasOboConfig =
  !!process.env.AZURE_AD_CLIENT_ID &&
  !!process.env.AZURE_AD_CLIENT_SECRET &&
  !!process.env.AZURE_AD_TENANT_ID &&
  !!process.env.AZURE_AD_API_SCOPE;

/**
 * Decide which Authorization header (if any) we send to APIM.
 */
async function buildApimAuthHeader(req: {
  headers: Record<string, string>;
}): Promise<string | undefined> {
  if (!apimSendAuth) {
    // Subscription key only (like your working curl)
    return undefined;
  }

  if (hasOboConfig) {
    // Proper OBO flow using Backend API app (B)
    const userAssertion = getUserAssertionFromHeaders(req.headers);
    const cca = getMsalClient();

    console.log("[APIM] Starting OBO flow", {
      scopes: API_SCOPES,
      hasUserAssertion: !!userAssertion,
      assertionLength: userAssertion?.length || 0,
    });

    const oboResponse = await cca.acquireTokenOnBehalfOf({
      oboAssertion: String(userAssertion),
      scopes: API_SCOPES,
    });

    const accessToken = oboResponse?.accessToken;
    if (!accessToken) {
      throw new Error(
        "Failed to acquire OBO access token for API (empty token)"
      );
    }
    // DEBUG: decode JWT payload (no signature check, just for logging)
    try {
      const [, payloadB64] = accessToken.split(".");

      if (!payloadB64) {
        throw new Error("Failed to decode OBO token (empty payload)");
      }

      const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
      const payloadJson = Buffer.from(padded, "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);
      console.log("[APIM] OBO token payload", {
        aud: payload.aud,
        scp: payload.scp,
        appid: payload.appid,
        iss: payload.iss,
        tid: payload.tid,
        ver: payload.ver,
      });
    } catch (e) {
      console.error("[APIM] Failed to decode OBO token", e);
    }
    return `Bearer ${accessToken}`;
  }

  // Fallback: forward incoming Authorization if present
  const authHeader =
    req.headers["authorization"] || (req.headers as any)["Authorization"];
  return authHeader;
}

/**
 * Non-streaming helper: call APIM, return parsed JSON body.
 */
export async function callApimOnBehalfOfUser(
  req: { headers: Record<string, string> },
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const url = `${apimBaseUrl}${path}`;
  const baseHeaders = normalizeHeaders(init.headers);
  const authHeader = await buildApimAuthHeader(req);

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Ocp-Apim-Subscription-Key": apimKey,
    // Enable APIM trace so we can see validate-jwt result
    "Ocp-Apim-Trace": "true",
  };

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  console.log("[APIM] Final request headers", {
    path,
    url,
    method: init.method || "GET",
    hasAuth: !!headers.Authorization,
    authPreview: headers.Authorization
      ? headers.Authorization.slice(0, 40) + "..."
      : null,
    hasSubscriptionKey: !!headers["Ocp-Apim-Subscription-Key"],
  });

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const traceLocation = res.headers.get("Ocp-Apim-Trace-Location");
    console.error("[APIM] Error response", {
      status: res.status,
      statusText: res.statusText,
      body: bodyText,
      url,
      traceLocation,
    });
    throw new Error(`APIM error ${res.status}: ${bodyText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  return { raw: text };
}

/**
 * Streaming helper (for SSE, etc.). Returns the raw Response so the caller can
 * pipe/stream it back to the client.
 */
export async function streamFromApimOnBehalfOfUser(
  req: { headers: Record<string, string> },
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${apimBaseUrl}${path}`;
  const baseHeaders = normalizeHeaders(init.headers);
  const authHeader = await buildApimAuthHeader(req);

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Ocp-Apim-Subscription-Key": apimKey,
  };

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  console.log("[APIM] Outgoing STREAM request", {
    path,
    url,
    method: init.method || "GET",
    sendAuth: !!authHeader,
    hasSubscriptionKey: !!apimKey,
  });

  const res = await fetch(url, {
    ...init,
    headers,
  });

  return res;
}
