"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@studio/auth";

export default function AuthCallback() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) {
      return;
    }

    // Redirect based on auth state
    if (isAuthenticated) {
      router.replace("/dashboard");
    } else {
      router.replace("/auth/signin");
    }
  }, [isAuthenticated, loading, router]);

  // Return null - the AuthProvider shows the loading screen
  return null;
}
