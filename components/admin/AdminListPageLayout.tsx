import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import AdminLayout from "@/components/layouts/AdminLayout";

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
  return (
    <AdminLayout>
      <div className="w-full">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{title}</h1>
            </div>
            <div className="flex-shrink-0">
              <Link href={newButtonLink}>
                <Button className="w-full sm:w-auto">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {newButtonText}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-6">
          {/* Error State */}
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && isEmpty && (
            <div className="text-center py-12">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PlusCircle className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">{emptyStateTitle}</h3>
                <p className="text-gray-400 mb-6">{emptyStateMessage}</p>
                <Link href={newButtonLink}>
                  <Button>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    {newButtonText}
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Main Content */}
          {!isLoading && !error && !isEmpty && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              {children}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminListPageLayout;
