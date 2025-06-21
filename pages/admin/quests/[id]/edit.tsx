import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import QuestForm from "@/components/admin/QuestForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";
import type { Quest } from "@/lib/supabase/types";

export default function EditQuestPage() {
  const router = useRouter();
  const { id } = router.query;
  const { authenticated } = usePrivy();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial auth check
  useEffect(() => {
    if (!authenticated) {
      router.push("/");
    }
  }, [authenticated, router]);

  // Fetch quest data directly from Supabase
  useEffect(() => {
    async function fetchQuest() {
      if (!id || typeof id !== "string") return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch quest with tasks using Supabase client
        const { data, error: dbError } = await supabase
          .from("quests")
          .select(`
            *,
            quest_tasks (*)
          `)
          .eq("id", id)
          .single();

        if (dbError) throw dbError;

        if (!data) {
          throw new Error("Quest not found");
        }

        setQuest(data);
      } catch (err: any) {
        console.error("Error fetching quest:", err);
        setError(err.message || "Failed to load quest");
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchQuest();
    }
  }, [id]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      </AdminLayout>
    );
  }

  if (!quest) {
    return (
      <AdminLayout>
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <p className="text-yellow-300">Quest not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href={`/admin/quests/${id}`}
              className="inline-flex items-center text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quest Details
            </Link>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg border border-gray-700 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">Edit Quest</h1>
            <p className="text-gray-400">
              Modify quest details, tasks, and settings. Changes will be applied
              immediately.
            </p>
          </div>

          <QuestForm quest={quest} isEditing={true} />
        </div>
      </div>
    </AdminLayout>
  );
}
