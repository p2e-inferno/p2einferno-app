import React from "react";
import Link from "next/link";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { isAdmin, loading: authLoading, authenticated } = useAdminAuth();

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-flame-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not authenticated or not an admin
  if (!authenticated || !isAdmin) {
    return <AdminAccessRequired message="You need admin access to view this page" />;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-gray-900 min-h-screen p-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-flame-yellow">
              Admin Panel
            </h1>
            <p className="text-gray-400 text-sm">P2E Inferno Management</p>
          </div>

          <nav className="space-y-2">
            <Link
              href="/admin"
              className="block px-4 py-2 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/cohorts"
              className="block px-4 py-2 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cohorts
            </Link>
            <Link
              href="/admin/bootcamps"
              className="block px-4 py-2 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
            >
              Bootcamps
            </Link>
            <Link
              href="/admin/quests"
              className="block px-4 py-2 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
            >
              Quests
            </Link>
            <Link
              href="/admin/payments"
              className="block px-4 py-2 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
            >
              Payments
            </Link>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
