import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import ProgramHighlightsForm from "@/components/admin/ProgramHighlightsForm";
import ProgramRequirementsForm from "@/components/admin/ProgramRequirementsForm";
import { Star, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  Cohort,
  ProgramHighlight,
  ProgramRequirement,
} from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:cohorts:[cohortId]:program-details");

export default function ProgramDetailsPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const router = useRouter();
  const { cohortId } = router.query;
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [highlights, setHighlights] = useState<ProgramHighlight[]>([]);
  const [requirements, setRequirements] = useState<ProgramRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("highlights");

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch cohort
      const cohortResult = await adminFetch<{ success: boolean; data: Cohort }>(
        `/api/admin/cohorts/${cohortId}`,
      );

      if (cohortResult.error) {
        throw new Error(cohortResult.error);
      }

      const cohortData = cohortResult.data?.data;
      if (!cohortData) {
        throw new Error("Cohort not found");
      }

      setCohort(cohortData);

      // Fetch highlights
      const highlightsResult = await adminFetch<{
        success: boolean;
        data: ProgramHighlight[];
      }>(`/api/admin/program-highlights?cohortId=${cohortId}`);

      if (highlightsResult.error) {
        log.warn("Failed to fetch highlights:", highlightsResult.error);
      } else {
        setHighlights(highlightsResult.data?.data || []);
      }

      // Fetch requirements
      const requirementsResult = await adminFetch<{
        success: boolean;
        data: ProgramRequirement[];
      }>(`/api/admin/program-requirements?cohortId=${cohortId}`);

      if (requirementsResult.error) {
        log.warn("Failed to fetch requirements:", requirementsResult.error);
      } else {
        setRequirements(requirementsResult.data?.data || []);
      }
    } catch (err: any) {
      log.error("Error fetching data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchData();
    } finally {
      setIsRetrying(false);
    }
  };

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [cohortId as string | undefined],
    fetcher: fetchData,
  });

  const handleHighlightsSuccess = () => {
    fetchData();
  };

  const handleRequirementsSuccess = () => {
    fetchData();
  };

  return (
    <AdminEditPageLayout
      title={cohort ? `Program Details: ${cohort.name}` : "Program Details"}
      backLinkHref="/admin/cohorts"
      backLinkText="Back to cohorts"
      isLoading={authLoading || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {cohort && (
        <div className="space-y-6">
          <div className="mb-6">
            <p className="text-gray-400">Bootcamp Program</p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-card border border-gray-800">
              <TabsTrigger
                value="highlights"
                className="text-white data-[state=active]:bg-steel-red"
              >
                Program Highlights
              </TabsTrigger>
              <TabsTrigger
                value="requirements"
                className="text-white data-[state=active]:bg-steel-red"
              >
                Requirements
              </TabsTrigger>
            </TabsList>

            <TabsContent value="highlights" className="space-y-6">
              {/* Current Highlights */}
              {highlights.length > 0 && (
                <Card className="bg-card border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Star className="w-5 h-5 text-flame-yellow" />
                      Current Program Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {highlights.map((highlight, index) => (
                        <div
                          key={highlight.id}
                          className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg"
                        >
                          <span className="bg-steel-red text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <p className="text-gray-300">{highlight.content}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Highlights Form */}
              <Card className="bg-card border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">
                    {highlights.length > 0 ? "Update" : "Add"} Program
                    Highlights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProgramHighlightsForm
                    cohortId={cohort.id}
                    onSubmitSuccess={handleHighlightsSuccess}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="requirements" className="space-y-6">
              {/* Current Requirements */}
              {requirements.length > 0 && (
                <Card className="bg-card border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-flame-yellow" />
                      Current Program Requirements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {requirements.map((requirement, index) => (
                        <div
                          key={requirement.id}
                          className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg"
                        >
                          <span className="bg-steel-red text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">
                            {index + 1}
                          </span>
                          <p className="text-gray-300">{requirement.content}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Requirements Form */}
              <Card className="bg-card border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">
                    {requirements.length > 0 ? "Update" : "Add"} Program
                    Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProgramRequirementsForm
                    cohortId={cohort.id}
                    onSubmitSuccess={handleRequirementsSuccess}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AdminEditPageLayout>
  );
}
