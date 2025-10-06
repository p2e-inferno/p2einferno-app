import AdminLayout from "@/components/layouts/AdminLayout";
import QuestForm from "@/components/admin/QuestForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewQuestPage() {
  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/quests"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          <h1 className="text-3xl font-bold text-white">Create New Quest</h1>
          <p className="text-gray-400 mt-2">
            Design engaging quests with dynamic tasks and rewards
          </p>
        </div>

        <QuestForm />
      </div>
    </AdminLayout>
  );
}
