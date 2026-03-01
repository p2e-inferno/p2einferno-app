import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useTelegramNotifications");

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60 seconds

export function openTelegramDeepLinkInPopup(deepLink: string): boolean {
  try {
    const popup = window.open("", "_blank");
    if (!popup) return false;

    try {
      popup.opener = null;
    } catch {
      // Ignore browser restrictions on opener assignment.
    }

    popup.location.href = deepLink;
    return true;
  } catch (error) {
    log.warn("Failed to open Telegram deep link popup", { error });
    return false;
  }
}

interface TelegramNotificationStatus {
  enabled: boolean;
  linked: boolean;
  loading: boolean;
  linking: boolean;
  blockedDeepLink: string | null;
  dismissBlockedDeepLink: () => void;
  retryBlockedDeepLink: () => boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useTelegramNotifications(): TelegramNotificationStatus {
  const [enabled, setEnabled] = useState(false);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [blockedDeepLink, setBlockedDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRequestInFlightRef = useRef(false);
  const pollGenerationRef = useRef(0);

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollRequestInFlightRef.current = false;
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

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
    stopPolling();

    const currentGeneration = pollGenerationRef.current;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      if (pollRequestInFlightRef.current) return;

      attempts++;
      pollRequestInFlightRef.current = true;
      try {
        const res = await fetch("/api/user/telegram/activate");
        if (res.ok) {
          const data = await res.json();
          if (currentGeneration !== pollGenerationRef.current) {
            return;
          }
          if (data.enabled) {
            setEnabled(true);
            setLinked(true);
            setLinking(false);
            setBlockedDeepLink(null);
            stopPolling();
            toast.success("Telegram notifications enabled!");
            return;
          }
        }
      } catch {
        // Ignore fetch errors during polling
      } finally {
        pollRequestInFlightRef.current = false;
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setLinking(false);
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const dismissBlockedDeepLink = useCallback(() => {
    setBlockedDeepLink(null);
  }, []);

  const retryBlockedDeepLink = useCallback((): boolean => {
    if (!blockedDeepLink) return false;

    const popupOpened = openTelegramDeepLinkInPopup(blockedDeepLink);
    if (!popupOpened) return false;

    // If linking flow is still incomplete, restart polling window.
    if (!enabled) {
      setLinking(true);
      startPolling();
    }

    return true;
  }, [blockedDeepLink, enabled, startPolling]);

  const enable = useCallback(async () => {
    setLinking(true);
    setBlockedDeepLink(null);
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
        const popupOpened = openTelegramDeepLinkInPopup(deepLink);
        if (!popupOpened) {
          setBlockedDeepLink(deepLink);
          toast(
            "Telegram didn't open automatically. Use the manual link to continue.",
          );
        }
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
    stopPolling();
    setLinking(false);
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
      setBlockedDeepLink(null);
      toast.success("Telegram notifications disabled");
    } catch (error) {
      log.error("Error disabling Telegram notifications", { error });
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disable Telegram notifications",
      );
    }
  }, [stopPolling]);

  return {
    enabled,
    linked,
    loading,
    linking,
    blockedDeepLink,
    dismissBlockedDeepLink,
    retryBlockedDeepLink,
    enable,
    disable,
    refetch: fetchStatus,
  };
}
