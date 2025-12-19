"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@studio/auth";
import { useRouter } from "next/navigation";

export default function AccountDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const router = useRouter();

  // Close dropdown when clicking outside or pressing ESC
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscKey);
      };
    }
    return undefined;
  }, [isOpen]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.push("/");
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  // Get user display information
  const userEmail = user?.username || "User";
  const userName =
    user?.name || user?.idTokenClaims?.name || userEmail.split("@")[0];

  if (!userName) {
    return null;
  }

  const userInitial = userName.charAt(0).toUpperCase();

  // Get account type
  // const claims = user?.idTokenClaims || {};
  // const idp = claims.idp || claims.iss || "";
  // const tenantId = user?.tenantId || "";
  // const isPersonalAccount =
  //   idp.includes("live.com") ||
  //   tenantId === "9188040d-6c67-4c5b-b112-36a304b66dad";
  // const accountType = isPersonalAccount ? "Personal" : "Work";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Account Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500 shadow-sm hover:bg-violet-600 transition-colors"
        aria-label="Account menu"
      >
        <span className="text-white font-semibold text-xs">{userInitial}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-6 w-80 bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden z-50">
          {/* User Info */}
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-2.5 uppercase tracking-wider">
              Account
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white font-semibold text-sm">
                {userInitial}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{userName}</p>
                <p className="text-xs text-gray-500">{userEmail}</p>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <div className="p-3">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                isSigningOut
                  ? "text-gray-400 bg-gray-50 cursor-not-allowed"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {isSigningOut ? "Signing out" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
