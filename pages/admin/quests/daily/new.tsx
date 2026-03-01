import AdminLayout from "@/components/layouts/AdminLayout";
import { DailyQuestForm } from "@/components/admin/DailyQuestForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewDailyQuestPage() {
  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/quests?tab=daily"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          <h1 className="text-3xl font-bold text-white">
            Create New Daily Quest
          </h1>
        </div>

        <DailyQuestForm />
      </div>
    </AdminLayout>
  );
}
