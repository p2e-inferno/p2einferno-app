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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Bootcamp Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <h2 className="text-lg font-semibold text-white mb-2">Bootcamps</h2>
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
            <h2 className="text-lg font-semibold text-white mb-2">Cohorts</h2>
            <p className="text-gray-400 mb-4">
              Create and manage cohorts for bootcamps
            </p>
            <Link href="/admin/cohorts">
              <Button className="w-full bg-steel-red hover:bg-steel-red/90 text-white">
                Manage Cohorts
              </Button>
            </Link>
          </div>

          {/* Quests Card */}
          <div className="rounded-lg border border-gray-800 bg-card p-6 hover:border-flame-yellow/50 transition-all duration-300">
            <h2 className="text-lg font-semibold text-white mb-2">Quests</h2>
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
