import { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import AdminLayout from "@/components/layouts/AdminLayout";
import BootcampForm from "@/components/admin/BootcampForm";
import { withAdminFormErrorHandling } from "@/components/admin/withAdminFormErrorHandling";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Wrap the BootcampForm with our error handling HOC
const AdminBootcampForm = withAdminFormErrorHandling(BootcampForm);

export default function NewBootcampPage() {
  const { authenticated } = usePrivy();
  const router = useRouter();

  // Protect admin route
  useEffect(() => {
    if (!authenticated) {
      router.push("/");
    }
    // TODO: Add admin role check when role-based auth is implemented
  }, [authenticated, router]);

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/bootcamps"
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to bootcamps
          </Link>
          <h1 className="text-2xl font-bold text-white">Create New Bootcamp</h1>
          <p className="text-gray-400 mt-1">
            Create a new bootcamp program that users can enroll in
          </p>
        </div>

        <div className="bg-card border border-gray-800 rounded-lg p-6">
          <AdminBootcampForm />
        </div>
      </div>
    </AdminLayout>
  );
}
