/**
 * Get the backend URL based on the environment
 * Always use the configured backend URL for API routes
 */
export function getBackendUrl(): string {
  // For server-side API routes in production, use the environment variable
  // This allows proper configuration in Azure App Service
  if (typeof window === "undefined") {
    // Server-side: use BACKEND_SERVER_URL or fall back to NEXT_PUBLIC_BACKEND_SERVER_URL
    return (
      process.env.BACKEND_SERVER_URL ||
      process.env.NEXT_PUBLIC_BACKEND_SERVER_URL ||
      "http://localhost:8000"
    );
  }
  // Client-side: always use NEXT_PUBLIC_BACKEND_SERVER_URL
  return process.env.NEXT_PUBLIC_BACKEND_SERVER_URL || "http://localhost:8000";
}
