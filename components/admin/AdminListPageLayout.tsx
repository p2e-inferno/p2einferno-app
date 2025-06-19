import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth"; // For auth check

interface AdminListPageLayoutProps {
  title: string;
  newButtonText: string;
  newButtonLink: string;
  isLoading: boolean;
  error?: string | null;
  isEmpty: boolean;
  emptyStateTitle: string;
  emptyStateMessage: string;
  children: React.ReactNode; // For the table or list content
}

const AdminListPageLayout: React.FC<AdminListPageLayoutProps> = ({
  title,
  newButtonText,
  newButtonLink,
  isLoading,
  error,
  isEmpty,
  emptyStateTitle,
  emptyStateMessage,
  children,
}) => {
  const { isAdmin, loading: authLoading, authenticated } = useAdminAuth();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Ensure client-side execution for router push
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Protect admin route
  useEffect(() => {
    if (!isClient || authLoading) return;

    if (!authenticated || !isAdmin) {
      router.push("/"); // Or your designated redirect path for non-admins
    }
  }, [authenticated, isAdmin, authLoading, router, isClient]);

  // Main loading state: consider both auth check and data loading
  const combinedLoading = authLoading || isLoading;

  // Show a global loading spinner while auth is in progress or initial client check
  if (authLoading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // If not authenticated or not an admin, and we are client-side, it will redirect.
  // Return null to prevent flash of content.
  if (!authenticated || !isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <Link href={newButtonLink}>
            <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
              <PlusCircle className="mr-2 h-4 w-4" />
              {newButtonText}
            </Button>
          </Link>
        </div>

        {combinedLoading && !authLoading ? ( // Show specific loading for data if auth is done
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        ) : isEmpty ? (
          <div className="bg-card border border-gray-800 rounded-lg p-12 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">
              {emptyStateTitle}
            </h3>
            <p className="text-gray-400 mb-6">{emptyStateMessage}</p>
            <Link href={newButtonLink}>
              <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
                <PlusCircle className="mr-2 h-4 w-4" />
                {newButtonText}
              </Button>
            </Link>
          </div>
        ) : (
          children // This is where the table/list will be rendered
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminListPageLayout;
