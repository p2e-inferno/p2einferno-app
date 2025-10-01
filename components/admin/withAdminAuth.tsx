import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAdminAuthContext } from "@/contexts/admin-context";
import AdminAccessRequired from "./AdminAccessRequired";

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
  },
) {
  return function WithAdminAuth(props: P) {
    const { isAdmin, isLoadingAuth, authStatus } = useAdminAuthContext();
    const router = useRouter();
    const redirectTo = options?.redirectTo;

    const isLoading = authStatus === "loading" || isLoadingAuth;

    // Handle redirect if specified in options once auth state resolves
    useEffect(() => {
      if (!isLoading && !isAdmin && redirectTo) {
        router.replace(redirectTo);
      }
    }, [isLoading, isAdmin, redirectTo, router]);

    // Show loading state
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-white text-sm">Loading...</p>
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
