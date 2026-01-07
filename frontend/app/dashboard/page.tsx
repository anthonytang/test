"use client";

import { DashboardLayout } from "@studio/dashboard";
import { useUserProfile } from "@studio/auth/hooks";
import { NotificationContainer, useNotifications } from "@studio/notifications";

export default function DashboardPage() {
  // Initialize user profile registration
  useUserProfile();

  // Notifications
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      <DashboardLayout />
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </>
  );
}
