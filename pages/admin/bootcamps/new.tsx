import AdminLayout from "@/components/layouts/AdminLayout";
import BootcampForm from "@/components/admin/BootcampForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewBootcampPage() {

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
          <BootcampForm />
        </div>
      </div>
    </AdminLayout>
  );
}
