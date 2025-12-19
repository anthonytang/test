// Server-side utilities - NOT for client-side use
// These should only be imported in API routes or server components

export { validateAuth } from "./auth-utils";
export { azureBlobClient, getAzureBlobClient } from "./azure-blob-client";
export { azureDbClient } from "./database/azure-db-client";
export { logFileAudit } from "./logAnalytics";
export { validateServerConfig, getPublicConfig } from "./config/runtime-config";
export { getBackendUrl } from "./backend-url";
export {
  callApimOnBehalfOfUser,
  streamFromApimOnBehalfOfUser,
} from "./apimClient";
export { BackendClient } from "./backend-client";
