import { useNotificationContext } from "../components/NotificationProvider";

export const useNotifications = () => {
  try {
    return useNotificationContext();
  } catch {
    console.warn(
      "useNotifications called outside of NotificationProvider, using fallback"
    );
    return {
      notifications: [],
      addNotification: (_notification: unknown) => "",
      removeNotification: (_id: string) => {},
      clearNotifications: () => {},
      showSuccess: (_title: string, _message: string, _options?: unknown) => "",
      showError: (_title: string, _message: string, _options?: unknown) => "",
      showWarning: (_title: string, _message: string, _options?: unknown) => "",
      showInfo: (_title: string, _message: string, _options?: unknown) => "",
      showCompactSuccess: (_message: string) => "",
      showCompactError: (_message: string) => "",
      showCompactInfo: (_message: string) => "",
    };
  }
};
