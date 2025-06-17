import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import AdminLayout from "@/components/layouts/AdminLayout";
import BootcampForm from "@/components/admin/BootcampForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram } from "@/lib/supabase/types";

export default function EditBootcampPage() {
  const { authenticated } = usePrivy();
  const router = useRouter();
  const { id } = router.query;

  const [bootcamp, setBootcamp] = useState<BootcampProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Protect admin route
  useEffect(() => {
    if (!authenticated) {
      router.push("/");
    }
    // TODO: Add admin role check when role-based auth is implemented
  }, [authenticated, router]);

  // Fetch bootcamp data
  useEffect(() => {
    async function fetchBootcamp() {
      if (!id) return;

      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("bootcamp_programs")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;

        if (!data) {
          throw new Error("Bootcamp not found");
        }

        setBootcamp(data);
      } catch (err: any) {
        console.error("Error fetching bootcamp:", err);
        setError(err.message || "Failed to load bootcamp");
      } finally {
        setIsLoading(false);
      }
    }

    if (authenticated && id) {
      fetchBootcamp();
    }
  }, [authenticated, id]);

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
          <h1 className="text-2xl font-bold text-white">Edit Bootcamp</h1>
          <p className="text-gray-400 mt-1">Update bootcamp program details</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        ) : bootcamp ? (
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            <BootcampForm bootcamp={bootcamp} isEditing />
          </div>
        ) : (
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Bootcamp not found. It may have been deleted.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
