import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useTelegramNotifications");

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60 seconds

interface TelegramNotificationStatus {
  enabled: boolean;
  linked: boolean;
  loading: boolean;
  linking: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useTelegramNotifications(): TelegramNotificationStatus {
  const [enabled, setEnabled] = useState(false);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/user/telegram/activate");
      if (!res.ok) {
        // 401/404 are expected for unauthenticated or new users
        if (res.status !== 401 && res.status !== 404) {
          log.warn("Failed to fetch Telegram status", { status: res.status });
        }
        return;
      }
      const data = await res.json();
      setEnabled(data.enabled);
      setLinked(data.linked);
    } catch (error) {
      log.error("Error fetching Telegram status", { error });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const startPolling = useCallback(() => {
    // Stop any existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/user/telegram/activate");
        if (res.ok) {
          const data = await res.json();
          if (data.enabled) {
            setEnabled(true);
            setLinked(true);
            setLinking(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toast.success("Telegram notifications enabled!");
            return;
          }
        }
      } catch {
        // Ignore fetch errors during polling
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setLinking(false);
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const enable = useCallback(async () => {
    setLinking(true);
    try {
      const res = await fetch("/api/user/telegram/activate", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate activation link");
      }

      const { deepLink } = await res.json();
      if (deepLink) {
        window.open(deepLink, "_blank");
        // Poll for activation status until user completes the flow in Telegram
        startPolling();
      }
    } catch (error) {
      log.error("Error enabling Telegram notifications", { error });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to enable Telegram notifications",
      );
      setLinking(false);
    }
  }, [startPolling]);

  const disable = useCallback(async () => {
    try {
      const res = await fetch("/api/user/telegram/activate", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to disable notifications");
      }

      setEnabled(false);
      setLinked(false);
      toast.success("Telegram notifications disabled");
    } catch (error) {
      log.error("Error disabling Telegram notifications", { error });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disable Telegram notifications",
      );
    }
  }, []);

  return {
    enabled,
    linked,
    loading,
    linking,
    enable,
    disable,
    refetch: fetchStatus,
  };
}
