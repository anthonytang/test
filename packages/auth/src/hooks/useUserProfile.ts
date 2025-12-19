import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-provider";

interface UserProfile {
  id: string;
  azure_id: string;
  email: string;
  display_name: string;
  given_name: string;
  surname: string;
  job_title: string;
  department: string;
  company_name: string;
  profile_picture_url: string;
  is_active: boolean;
  last_login_at: string;
  created_at: string;
  updated_at: string;
}

interface GraphUserInfo {
  mail?: string;
  userPrincipalName?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  companyName?: string;
}

export function useUserProfile() {
  const { user, getAccessToken, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Get Microsoft Graph user info
  const fetchGraphUserInfo =
    useCallback(async (): Promise<GraphUserInfo | null> => {
      try {
        const token = await getAccessToken();
        if (!token) return null;

        const response = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) return null;
        return await response.json();
      } catch (error) {
        console.error("Error fetching Graph user info:", error);
        return null;
      }
    }, [getAccessToken]);

  // Register or update user profile
  const registerUserProfile = useCallback(async () => {
    if (!user || !isAuthenticated) return;

    setIsRegistering(true);
    try {
      // Get additional user info from Microsoft Graph
      const graphInfo = await fetchGraphUserInfo();

      const token = await getAccessToken();
      if (!token) throw new Error("No access token available");

      const email =
        graphInfo?.mail || graphInfo?.userPrincipalName || user.username;

      const profileData = {
        email,
        displayName: graphInfo?.displayName || user.name,
        givenName: graphInfo?.givenName,
        surname: graphInfo?.surname,
        jobTitle: graphInfo?.jobTitle,
        department: graphInfo?.department,
        companyName: graphInfo?.companyName,
        profilePictureUrl: null, // Could fetch user photo from Graph API if needed
      };

      const response = await fetch("/api/auth/profile", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error("Failed to register user profile");
      }

      console.log("User profile registered/updated successfully");

      // Refresh profile after registration
      await fetchUserProfile();
    } catch (error) {
      console.error("Error registering user profile:", error);
    } finally {
      setIsRegistering(false);
    }
  }, [user, isAuthenticated, getAccessToken, fetchGraphUserInfo]);

  // Fetch existing user profile
  const fetchUserProfile = useCallback(async () => {
    if (!user || !isAuthenticated) return;

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch("/api/auth/profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      } else if (response.status === 404) {
        // Profile doesn't exist yet, register it
        await registerUserProfile();
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, getAccessToken, registerUserProfile]);

  // Auto-register/fetch profile when user authenticates
  useEffect(() => {
    if (isAuthenticated && user && !profile && !isLoading && !isRegistering) {
      fetchUserProfile();
    }
  }, [
    isAuthenticated,
    user,
    profile,
    isLoading,
    isRegistering,
    fetchUserProfile,
  ]);

  return {
    profile,
    isLoading,
    isRegistering,
    registerUserProfile,
    fetchUserProfile,
    refreshProfile: fetchUserProfile,
  };
}
