"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest, msalInstance, initializeMsal } from "./auth-config";
import BrandedLoadingScreen from "../components/BrandedLoadingScreen";

interface AuthContextType {
  user: AccountInfo | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (scopes?: string[]) => Promise<string | null>;
  getIdToken: () => Promise<string | null>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

function AuthContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { instance, accounts, inProgress } = useMsal();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AccountInfo | null>(null);

  // Enhanced getAccessToken that handles different scopes
  // This is the correct token to use for API calls (required for OBO flow)
  const getAccessToken = useCallback(
    async (requestedScopes?: string[]): Promise<string | null> => {
      const currentAccount = accounts[0];
      if (!currentAccount) return null;

      // Use requested scopes or default to loginRequest scopes
      const scopes = requestedScopes || loginRequest.scopes;

      try {
        // First try silent acquisition
        const response = await instance.acquireTokenSilent({
          scopes,
          account: currentAccount,
        });
        
        // Also update the global token storage
        if (typeof window !== "undefined") {
          (window as any).__authToken = response.accessToken;
        }
        
        return response.accessToken;
      } catch (silentError) {
        if (silentError instanceof InteractionRequiredAuthError) {
          try {
            // Fall back to interactive if silent fails
            const response = await instance.acquireTokenPopup({
              scopes,
              account: currentAccount,
            });
            
            // Also update the global token storage
            if (typeof window !== "undefined") {
              (window as any).__authToken = response.accessToken;
            }
            
            return response.accessToken;
          } catch (interactiveError) {
            console.error(
              "Interactive token acquisition failed:",
              interactiveError
            );
            return null;
          }
        }
        console.error("Token acquisition failed:", silentError);
        return null;
      }
    },
    [instance, accounts]
  );

  // Get ID token for user identity verification (NOT for API calls)
  const getIdToken = useCallback(async (): Promise<string | null> => {
    const currentAccount = accounts[0];
    if (!currentAccount) return null;

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: currentAccount,
      });

      return response.idToken;
    } catch (error) {
      try {
        const response = await instance.acquireTokenPopup({
          ...loginRequest,
          account: currentAccount,
        });

        return response.idToken;
      } catch (popupError) {
        console.error("ID token acquisition failed:", popupError);
        return null;
      }
    }
  }, [instance, accounts]);

  // Store access token for backend API calls (required for OBO flow)
  const storeAccessToken = useCallback(async (): Promise<void> => {
    const currentAccount = accounts[0];
    if (!currentAccount) return;

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: currentAccount,
      });

      // Store ACCESS token (not ID token) for backend API calls
      // OBO flow requires access tokens, not ID tokens
      if (typeof window !== "undefined") {
        (window as any).__authToken = response.accessToken;
      }
    } catch (error) {
      try {
        const response = await instance.acquireTokenPopup({
          ...loginRequest,
          account: currentAccount,
        });

        if (typeof window !== "undefined") {
          (window as any).__authToken = response.accessToken;
        }
      } catch (popupError) {
        console.error("Access token acquisition failed:", popupError);
      }
    }
  }, [instance, accounts]);

  // Initialize auth state
  useEffect(() => {
    if (inProgress === "startup") {
      return;
    }

    const currentAccount = accounts[0] || null;
    setUser(currentAccount);

    // Store access token for backend API calls (OBO flow requires access token)
    if (currentAccount) {
      storeAccessToken();
    }

    setLoading(false);
  }, [accounts, inProgress, storeAccessToken]);

  const signIn = async () => {
    try {
      await instance.loginRedirect({
        ...loginRequest,
        redirectUri:
          process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI ||
          window.location.origin + "/auth/callback",
      });
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      if (typeof window !== "undefined") {
        delete (window as any).__authToken;
      }

      await instance.logoutRedirect({
        postLogoutRedirectUri: "/",
      });
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const isAuthenticated = !!user && accounts.length > 0;

  const value: AuthContextType = {
    user,
    signIn,
    signOut,
    getAccessToken,
    getIdToken,
    loading,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  // Track if we should show loading (for auth initialization)
  const [showAuthLoading, setShowAuthLoading] = useState(true);

  useEffect(() => {
    // Initialize MSAL and handle any redirect response
    initializeMsal()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((error) => {
        console.error("MSAL initialization error:", error);
        // Still set initialized to allow the app to render
        setIsInitialized(true);
      });
  }, []);

  // Show loading during MSAL init or auth loading
  const showLoading = !isInitialized || showAuthLoading;

  return (
    <>
      {/* Single loading screen instance - always mounted, visibility controlled by CSS */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-150"
        style={{
          opacity: showLoading ? 1 : 0,
          pointerEvents: showLoading ? "auto" : "none",
        }}
      >
        <BrandedLoadingScreen />
      </div>

      {/* Only render MSAL provider after initialization */}
      {isInitialized && (
        <MsalProvider instance={msalInstance}>
          <AuthContextProvider>
            <AuthLoadingController onShowLoadingChange={setShowAuthLoading} />
            {children}
          </AuthContextProvider>
        </MsalProvider>
      )}
    </>
  );
}

/**
 * Controller component that determines if loading should be shown based on auth state.
 * This runs inside the auth context so it can access auth state.
 */
function AuthLoadingController({
  onShowLoadingChange,
}: {
  onShowLoadingChange: (show: boolean) => void;
}) {
  const { loading } = useAuth();

  useEffect(() => {
    // Only show loading during auth initialization
    // Each page handles its own data loading state
    onShowLoadingChange(loading);
  }, [loading, onShowLoadingChange]);

  return null;
}

export { AuthenticatedTemplate, UnauthenticatedTemplate };
