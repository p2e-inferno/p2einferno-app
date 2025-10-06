import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useNotifications");

export interface Notification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export const useNotifications = () => {
  const { authenticated, getAccessToken } = usePrivy();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollInterval = 60000 * 60; // 1 hour

  const fetchNotifications = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/user/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(
          (data.notifications || []).filter((n: Notification) => !n.read)
            .length,
        );
      }
    } catch (error) {
      log.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken]);

  const markAsRead = async (notificationIds: string[]) => {
    if (!authenticated || notificationIds.length === 0) return;
    try {
      const token = await getAccessToken();
      await fetch("/api/user/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationIds }),
      });
      // Optimistically update UI
      setNotifications((prev) =>
        prev.map((n) =>
          notificationIds.includes(n.id) ? { ...n, read: true } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - notificationIds.length));
    } catch (error) {
      toast.error("Failed to mark notifications as read.");
      log.error("Failed to mark notifications as read:", error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!authenticated) return;
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/user/notifications", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId }),
      });

      if (response.ok) {
        // Optimistically update UI
        const deletedNotification = notifications.find(
          (n) => n.id === notificationId,
        );
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        if (deletedNotification && !deletedNotification.read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        toast.success("Notification deleted");
      } else {
        throw new Error("Failed to delete notification");
      }
    } catch (error) {
      toast.error("Failed to delete notification.");
      log.error("Failed to delete notification:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, pollInterval); // Poll every hour
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    deleteNotification,
  };
};
