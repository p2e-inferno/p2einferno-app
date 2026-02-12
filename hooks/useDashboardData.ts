import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { Application } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { isExternalWallet } from "@/lib/utils/wallet-address";

const log = getLogger("hooks:useDashboardData");

export interface UserProfile {
  id: string;
  privy_user_id: string;
  display_name: string;
  email: string;
  wallet_address: string;
  linked_wallets: string[];
  level: number;
  experience_points: number;
  status: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  user_profile_id: string;
  cohort_id: string;
  enrollment_status: string;
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  cohort?: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_profile_id: string;
  activity_type: string;
  activity_data: any;
  points_earned: number;
  created_at: string;
}

export interface UserDashboardData {
  profile: UserProfile;
  applications: Application[];
  enrollments: Enrollment[];
  recentActivities: Activity[];
  stats: {
    totalApplications: number;
    completedBootcamps: number;
    enrolledBootcamps: number; // Added for enrolled bootcamps
    totalPoints: number;
    pendingPayments: number;
    questsCompleted: number; // Added for live stats
  };
}

interface UseDashboardDataResult {
  data: UserDashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useDashboardData = (): UseDashboardDataResult => {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, authenticated, ready, getAccessToken } = usePrivy();
  const selectedWallet = useSmartWalletSelection();
  const lastSyncKeyRef = useRef<string | null>(null);
  const authStartTimeRef = useRef<number | null>(null);
  const deferredSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [syncTick, setSyncTick] = useState(0);

  const hasLinkedExternalWallet = useMemo(() => {
    const accounts = user?.linkedAccounts || [];
    return accounts.some((account) => {
      if (account.type !== "wallet") return false;
      const walletAccount = account as { walletClientType?: string };
      return isExternalWallet(walletAccount.walletClientType);
    });
  }, [user?.linkedAccounts]);

  const selectedWalletIsExternal = useMemo(() => {
    return isExternalWallet(selectedWallet?.walletClientType);
  }, [selectedWallet?.walletClientType]);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error("No user data available");
      }
      const token = await getAccessToken();

      // Use smart wallet selection to prioritize external wallets
      const userData = {
        privyUserId: user.id,
        email: user.email?.address,
        walletAddress: selectedWallet?.address,
        linkedWallets:
          user.linkedAccounts
            ?.filter((acc) => acc.type === "wallet")
            ?.map((w) => w.address) || [],
      };

      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(selectedWallet?.address
            ? { "X-Active-Wallet": selectedWallet.address }
            : {}),
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch dashboard data");
      }

      const result = await response.json();
      setData(result.data);
    } catch (err: any) {
      log.error("Dashboard data fetch error:", err);
      setError(err.message);
      toast.error(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, selectedWallet?.address, user]);

  useEffect(() => {
    const clearDeferred = () => {
      if (deferredSyncTimerRef.current) {
        clearTimeout(deferredSyncTimerRef.current);
        deferredSyncTimerRef.current = null;
      }
    };

    if (ready && authenticated && user) {
      if (authStartTimeRef.current === null) {
        authStartTimeRef.current = Date.now();
      }

      const currentWallet = selectedWallet?.address || null;
      const syncKey = `${user.id}:${currentWallet ?? ""}`;

      // Guard: if the user has a linked external wallet, avoid syncing the embedded wallet
      // during the brief window where external wallets may not have hydrated yet.
      const shouldDeferEmbeddedSync =
        hasLinkedExternalWallet &&
        !!currentWallet &&
        !selectedWalletIsExternal;

      if (shouldDeferEmbeddedSync) {
        const elapsedMs = Date.now() - authStartTimeRef.current;
        const deferMs = 2500; // matches the wallet hydration delay used in useSmartWalletSelection
        if (elapsedMs < deferMs) {
          if (!deferredSyncTimerRef.current) {
            log.debug("Deferring profile sync during wallet hydration window", {
              userId: user.id,
              selectedWallet: currentWallet,
              elapsedMs,
              deferMs,
            });
            deferredSyncTimerRef.current = setTimeout(() => {
              deferredSyncTimerRef.current = null;
              setSyncTick((v) => v + 1);
            }, deferMs - elapsedMs);
          }
          return;
        }
      }

      clearDeferred();

      if (lastSyncKeyRef.current === syncKey) return;
      lastSyncKeyRef.current = syncKey;
      fetchDashboardData().catch(() => {
        // Allow retry (e.g. on wallet hydration) if the sync fails.
        if (lastSyncKeyRef.current === syncKey) {
          lastSyncKeyRef.current = null;
        }
      });
    } else if (ready && !authenticated) {
      clearDeferred();
      authStartTimeRef.current = null;
      lastSyncKeyRef.current = null;
      setLoading(false);
    }
    return () => {
      clearDeferred();
    };
  }, [
    ready,
    authenticated,
    user,
    selectedWallet?.address,
    hasLinkedExternalWallet,
    selectedWalletIsExternal,
    fetchDashboardData,
    syncTick,
  ]);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboardData,
  };
};
