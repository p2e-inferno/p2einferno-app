import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminAccessRequired from "./AdminAccessRequired";
import { listenForWalletChanges } from "@/lib/utils";

/**
 * Higher Order Component that wraps components requiring admin authentication
 * @param Component The component to wrap
 * @param options Optional configuration options
 * @returns A new component that includes admin authentication
 */
export function withAdminAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    redirectTo?: string;
    message?: string;
  }
) {
  return function WithAdminAuth(props: P) {
    const { isAdmin, loading, authenticated, refreshAdminStatus } =
      useAdminAuth();
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Listen for wallet changes
    useEffect(() => {
      const cleanup = listenForWalletChanges(async () => {
        // When wallet changes, show refresh state and update admin status
        setIsRefreshing(true);
        try {
          // Refresh admin status when wallet changes
          await refreshAdminStatus();
        } catch (error) {
          console.error("Error refreshing admin status:", error);
        } finally {
          // Add a small delay to ensure the UI updates are visible
          setTimeout(() => setIsRefreshing(false), 500);
        }
      });

      return cleanup;
    }, [refreshAdminStatus]);

    // Handle redirect if specified in options
    useEffect(() => {
      if (!loading && !isAdmin && options?.redirectTo) {
        router.replace(options.redirectTo);
      }
    }, [isAdmin, loading, router]);

    // Show loading state
    if (loading || isRefreshing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-white text-sm">
            {isRefreshing ? "Refreshing admin status..." : "Loading..."}
          </p>
        </div>
      );
    }

    // Show access denied if not admin
    if (!isAdmin) {
      return <AdminAccessRequired message={options?.message} />;
    }

    // Render the component if admin
    return <Component {...props} />;
  };
}
