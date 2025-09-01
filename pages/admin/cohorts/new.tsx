import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import CohortForm from "@/components/admin/CohortForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

export default function NewCohortPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
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
      <div className="w-full max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/cohorts"
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to cohorts
          </Link>
          <h1 className="text-2xl font-bold text-white">Create New Cohort</h1>
          <p className="text-gray-400 mt-1">
            Create a new cohort for students to enroll in
          </p>
        </div>

        <div className="bg-card border border-gray-800 rounded-lg p-6">
          <CohortForm />
        </div>
      </div>
    </AdminLayout>
  );
}
