import AdminLayout from "@/components/layouts/AdminLayout";
import QuestForm from "@/components/admin/QuestForm";
import { DailyQuestForm } from "@/components/admin/DailyQuestForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter } from "next/router";

export default function NewQuestPage() {
  const router = useRouter();
  const tab =
    typeof router.query.tab === "string" ? router.query.tab : "quests";
  const activeTab = tab === "daily" ? "daily" : "quests";

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/admin/quests?tab=${activeTab}`}
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          <h1 className="text-3xl font-bold text-white">
            Create New {activeTab === "daily" ? "Daily Quest" : "Quest"}
          </h1>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            router.replace(`/admin/quests/new?tab=${v}`, undefined, {
              shallow: true,
            })
          }
        >
          <TabsList className="mb-6">
            <TabsTrigger value="quests">Quests</TabsTrigger>
            <TabsTrigger value="daily">Daily Quests</TabsTrigger>
          </TabsList>

          <TabsContent value="quests">
            <QuestForm />
          </TabsContent>
          <TabsContent value="daily">
            <DailyQuestForm />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
