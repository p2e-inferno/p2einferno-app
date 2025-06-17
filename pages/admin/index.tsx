import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export default function AdminDashboard() {
  const { isAdmin, loading, authenticated } = useAdminAuth();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Make sure we're on the client side before redirecting
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Protect admin route
  useEffect(() => {
    // Only run this effect on client-side and after auth check is complete
    if (!isClient || loading) return;

    // Redirect if not authenticated or not an admin
    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, loading, router, isClient]);

  // Show loading state while checking authentication
  if (loading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // Only render admin content if authenticated and is admin
  if (!authenticated || !isAdmin) {
    return null; // This avoids momentary flash of content before redirect
  }

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Bootcamp Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 mr-4 text-flame-yellow flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Bootcamps</h2>
            </div>
            <p className="text-gray-400 mb-4">
              Create and manage bootcamp programs
            </p>
            <Link href="/admin/bootcamps">
              <Button className="w-full bg-steel-red hover:bg-steel-red/90 text-white">
                Manage Bootcamps
              </Button>
            </Link>
          </div>

          {/* Cohorts Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 mr-4 text-flame-yellow flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Cohorts</h2>
            </div>
            <p className="text-gray-400 mb-4">
              Create and manage cohorts for bootcamps
            </p>
            <Link href="/admin/cohorts">
              <Button className="w-full bg-steel-red hover:bg-steel-red/90 text-white">
                Manage Cohorts
              </Button>
            </Link>
          </div>

          {/* Milestones Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 mr-4 text-flame-yellow flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Milestones</h2>
            </div>
            <p className="text-gray-400 mb-4">
              Create and manage learning milestones
            </p>
            <p className="text-xs text-gray-500 mb-4 italic">
              Manage milestones from within cohort details
            </p>
            <Link href="/admin/cohorts">
              <Button className="w-full bg-steel-red hover:bg-steel-red/90 text-white">
                View Cohorts
              </Button>
            </Link>
          </div>

          {/* Quests Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 mr-4 text-flame-yellow flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Quests</h2>
            </div>
            <p className="text-gray-400 mb-4">
              Create and manage quest programs
            </p>
            <Link href="/admin/quests">
              <Button className="w-full bg-steel-red hover:bg-steel-red/90 text-white">
                Manage Quests
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
