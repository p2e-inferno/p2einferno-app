import { useEffect, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import AdminSessionGate from "@/components/admin/AdminSessionGate";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default function AdminDashboardPage() {
  const [isClient, setIsClient] = useState(false);

  // Make sure we're on the client side before rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show loading state during client-side hydration
  if (!isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminSessionGate
      loadingComponent={
        <AdminLayout>
          <div className="w-full flex justify-center items-center min-h-[400px]">
            <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
          </div>
        </AdminLayout>
      }
    >
      <AdminLayout>
        <AdminDashboard />
      </AdminLayout>
    </AdminSessionGate>
  );
}
