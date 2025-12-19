/**
 * Server-side auth utilities for API routes
 * This file doesn't use React hooks and can be safely used in server context
 */

export async function validateAuth(
  authHeader: string | null
): Promise<{ userId: string; isValid: boolean; token?: string }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { userId: "", isValid: false };
  }

  const token = authHeader.substring(7);

  try {
    // JWT tokens have 3 parts separated by dots
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { userId: "", isValid: false };
    }

    if (!parts[1]) {
      return { userId: "", isValid: false };
    }

    // Decode the payload (middle part) - ID token should have oid claim
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8")
    );

    // For ID tokens, oid (object ID) is the user's unique identifier
    // sub is pair-wise and varies per app, so we prefer oid
    const userId = payload.oid || payload.sub;

    if (!userId) {
      console.error("[validateAuth] No userId found in token");
      return { userId: "", isValid: false };
    }

    return { userId, isValid: true, token };
  } catch (error) {
    console.error("[validateAuth] Token validation error:", error);
    return { userId: "", isValid: false };
  }
}
