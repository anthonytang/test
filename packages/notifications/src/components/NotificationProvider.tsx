"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useCallback,
} from "react";
import { NotificationContainer, Notification } from "./NotificationContainer";

export interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  showSuccess: (
    title: string,
    message: string,
    options?: Partial<Notification>
  ) => string;
  showError: (
    title: string,
    message: string,
    options?: Partial<Notification>
  ) => string;
  showWarning: (
    title: string,
    message: string,
    options?: Partial<Notification>
  ) => string;
  showInfo: (
    title: string,
    message: string,
    options?: Partial<Notification>
  ) => string;
  showCompactSuccess: (
    message: string,
    options?: Partial<Notification>
  ) => string;
  showCompactError: (
    message: string,
    options?: Partial<Notification>
  ) => string;
  showCompactInfo: (message: string, options?: Partial<Notification>) => string;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotificationContext must be used within a NotificationProvider"
    );
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({
  children,
}: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (notification: Omit<Notification, "id">) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const newNotification: Notification = { ...notification, id };
      setNotifications((prev) => [...prev, newNotification]);
      return id;
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showSuccess = useCallback(
    (title: string, message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "success",
        title,
        message,
        duration: 5000,
        ...options,
      });
    },
    [addNotification]
  );

  const showError = useCallback(
    (title: string, message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "error",
        title,
        message,
        duration: 7000,
        ...options,
      });
    },
    [addNotification]
  );

  const showWarning = useCallback(
    (title: string, message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "warning",
        title,
        message,
        duration: 6000,
        ...options,
      });
    },
    [addNotification]
  );

  const showInfo = useCallback(
    (title: string, message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "info",
        title,
        message,
        duration: 5000,
        ...options,
      });
    },
    [addNotification]
  );

  // Compact notification methods for frequent events like file uploads
  const showCompactSuccess = useCallback(
    (message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "success",
        title: "",
        message,
        duration: 3000,
        ...options,
      });
    },
    [addNotification]
  );

  const showCompactError = useCallback(
    (message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "error",
        title: "",
        message,
        duration: 4000,
        ...options,
      });
    },
    [addNotification]
  );

  const showCompactInfo = useCallback(
    (message: string, options?: Partial<Notification>) => {
      return addNotification({
        type: "info",
        title: "",
        message,
        duration: 2500,
        ...options,
      });
    },
    [addNotification]
  );

  const value: NotificationContextType = {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showCompactSuccess,
    showCompactError,
    showCompactInfo,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </NotificationContext.Provider>
  );
};
