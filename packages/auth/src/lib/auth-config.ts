import {
  Configuration,
  PublicClientApplication,
  LogLevel,
} from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || "",
    authority: process.env.NEXT_PUBLIC_AZURE_AD_AUTHORITY || "",
    redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || "",
    knownAuthorities: [],
    navigateToLoginRequestUrl: false,
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_SITE_URL || "/",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning,
    },
    windowHashTimeout: 60000,
    iframeHashTimeout: 6000,
    loadFrameTimeout: 0,
  },
};

export const loginRequest = {
  scopes: [
    process.env.NEXT_PUBLIC_AZURE_AD_API_SCOPE || "api://lifesci-studio-api/user_impersonation",
    "openid",
    "profile",
    "email",
  ],
  prompt: "select_account",
  redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || "",
  redirectStartPage: process.env.NEXT_PUBLIC_SITE_URL || "/",
};

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Promise that resolves when MSAL is fully initialized and redirect is handled
let msalInitPromise: Promise<void> | null = null;

export async function initializeMsal(): Promise<void> {
  if (msalInitPromise) {
    return msalInitPromise;
  }

  msalInitPromise = (async () => {
    try {
      // Initialize the MSAL instance
      await msalInstance.initialize();
      
      // Handle any redirect response - this is crucial for the callback to work
      const response = await msalInstance.handleRedirectPromise();
      if (response) {
        console.log("MSAL: Redirect response handled, account:", response.account?.username);
      }
    } catch (error) {
      console.error("MSAL initialization error:", error);
      throw error;
    }
  })();

  return msalInitPromise;
}
