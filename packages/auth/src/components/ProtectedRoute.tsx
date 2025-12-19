"use client";

import { useAuth, AuthenticatedTemplate } from "../lib/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({
  children,
}: // fallback,
ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/auth/signin");
    }
  }, [isAuthenticated, loading, router]);

  // Redirect if not authenticated (GlobalLoadingOverlay handles the loading state)
  if (!isAuthenticated) {
    return null;
  }

  return <AuthenticatedTemplate>{children}</AuthenticatedTemplate>;
}
