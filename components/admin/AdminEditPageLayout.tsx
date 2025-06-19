import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/layouts/AdminLayout"; // Assuming AdminLayout provides overall structure

interface AdminEditPageLayoutProps {
  title: string;
  backLinkHref: string;
  backLinkText: string;
  isLoading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

const AdminEditPageLayout: React.FC<AdminEditPageLayoutProps> = ({
  title,
  backLinkHref,
  backLinkText,
  isLoading = false,
  error = null,
  children,
}) => {
  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href={backLinkHref}
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> {backLinkText}
          </Link>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {/* Optional: Add a subtitle or description prop if needed later */}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        ) : (
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            {children}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEditPageLayout;
