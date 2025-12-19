// lib/msalClient.ts
import { ConfidentialClientApplication } from "@azure/msal-node";

let cca: ConfidentialClientApplication | null = null;

// Use AZURE_AD_API_SCOPE environment variable for OBO flow
// This should match the scope requested during user login on the frontend
const apiScope =
  process.env.AZURE_AD_API_SCOPE ||
  "api://lifesci-studio-api/user_impersonation";

// Export scopes array - used by OBO flow
export const API_SCOPES: string[] = [apiScope];

export function getMsalClient(): ConfidentialClientApplication {
  if (cca) return cca;

  const clientId = process.env.AZURE_AD_CLIENT_ID; // backend APP REG client ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET; // backend APP REG secret
  const tenantId = process.env.AZURE_AD_TENANT_ID; // client tenant ID

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      "AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID must be set"
    );
  }

  cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });

  return cca;
}
