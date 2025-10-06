import AdminLayout from "@/components/layouts/AdminLayout";
import CohortForm from "@/components/admin/CohortForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewCohortPage() {
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
