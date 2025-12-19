"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-provider";
import { useRouter } from "next/navigation";

// interface AuthFormProps {
//   view: "sign-in";
// }

export default function AuthForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Redirect when authentication state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log("User authenticated, redirecting to dashboard");
      router.push("/dashboard");
    }
  }, [isAuthenticated, user, router]);

  const handleMicrosoftSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("AuthForm: Starting sign in process");
      await signIn();
      console.log("AuthForm: Sign in completed successfully");
      // The useEffect will handle the redirect once auth state updates
    } catch (error: any) {
      console.error("AuthForm: Microsoft sign in error:", error);

      // Show specific error messages based on error type
      let errorMessage = "Failed to sign in with Microsoft. Please try again.";

      if (error.errorCode === "user_cancelled") {
        errorMessage = "Sign in was cancelled.";
      } else if (error.errorCode === "popup_window_error") {
        errorMessage = "Popup was blocked. Please allow popups and try again.";
      } else if (error.message) {
        errorMessage = `Sign in failed: ${error.message}`;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="min-h-screen flex flex-col items-center justify-center max-w-sm mx-auto">
          {/* Logo/Brand header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-xl shadow-lg mb-4">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-accent mb-1">Studio</h1>
          </div>

          <div className="w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
              Sign In
            </h2>

            <div className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-2">
                      <h3 className="text-xs font-medium text-red-800">
                        {error}
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={(_e) => {
                  console.log("Sign-in button clicked!");
                  handleMicrosoftSignIn();
                }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transform transition-all duration-200 hover:shadow-md"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4 text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                    <path d="M1 1h10v10H1z" fill="#f25022" />
                    <path d="M12 1h10v10H12z" fill="#00a4ef" />
                    <path d="M1 12h10v10H1z" fill="#ffb900" />
                    <path d="M12 12h10v10H12z" fill="#7fba00" />
                  </svg>
                )}
                {loading ? "Signing in" : "Sign in with Microsoft"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
