import { useAuth } from "./auth-provider";
import { useCallback, useMemo } from "react";

export function useAuthUser() {
  const { user, getAccessToken, getIdToken, isAuthenticated } = useAuth();

  const getUserId = useCallback(() => {
    // Simple approach - just return what Azure gives us
    return user?.localAccountId || user?.homeAccountId || null;
  }, [user]);

  const isAuthenticatedWrapper = useCallback(
    () => isAuthenticated,
    [isAuthenticated]
  );

  return useMemo(
    () => ({
      getUserId,
      isAuthenticated: isAuthenticatedWrapper,
      getAccessToken,
      getIdToken,
      user,
    }),
    [getUserId, isAuthenticatedWrapper, getAccessToken, getIdToken, user]
  );
}
