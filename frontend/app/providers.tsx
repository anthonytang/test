"use client";

import { AuthProvider } from "@studio/auth";
import { NotificationProvider } from "@studio/notifications";
import dynamic from "next/dynamic";

// Lazy load offline indicator
const OfflineIndicator = dynamic(
  () =>
    import("@studio/notifications").then((mod) => ({
      default: mod.OfflineIndicator,
    })),
  { ssr: false }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        {children}
        <OfflineIndicator />
      </NotificationProvider>
    </AuthProvider>
  );
}

