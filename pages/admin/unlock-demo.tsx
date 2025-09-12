import AdminLayout from "@/components/layouts/AdminLayout";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { UnlockUtilsDemo } from "@/components/unlock/UnlockUtilsDemo";

export default function UnlockDemoPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // Show access required message if not authenticated or not an admin
  if (!authenticated || !isAdmin) {
    return (
      <AdminAccessRequired message="You need admin access to view the Unlock Protocol demo" />
    );
  }

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            Unlock Protocol Demo
          </h1>
          <p className="text-gray-400">
            Test and explore Unlock Protocol functionality including lock
            deployment, key operations, and blockchain interactions.
          </p>
        </div>

        <UnlockUtilsDemo />
      </div>
    </AdminLayout>
  );
}
