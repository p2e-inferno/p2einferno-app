import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import ProgramHighlightsForm from "@/components/admin/ProgramHighlightsForm";
import ProgramRequirementsForm from "@/components/admin/ProgramRequirementsForm";
import { ArrowLeft, Star, CheckCircle } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import type { Cohort, ProgramHighlight, ProgramRequirement } from "@/lib/supabase/types";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

export default function ProgramDetailsPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
  const router = useRouter();
  const { cohortId } = router.query;

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [highlights, setHighlights] = useState<ProgramHighlight[]>([]);
  const [requirements, setRequirements] = useState<ProgramRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState("highlights");

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || loading) return;

    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, loading, router, isClient]);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch cohort
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select(`
          *,
          bootcamp_program:bootcamp_program_id (
            id,
            name
          )
        `)
        .eq("id", cohortId)
        .single();

      if (cohortError) throw cohortError;
      if (!cohortData) throw new Error("Cohort not found");

      setCohort(cohortData);

      // Fetch highlights
      const { data: highlightsData } = await supabase
        .from("program_highlights")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("order_index");

      setHighlights(highlightsData || []);

      // Fetch requirements
      const { data: requirementsData } = await supabase
        .from("program_requirements")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("order_index");

      setRequirements(requirementsData || []);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient || !cohortId) return;

    fetchData();
  }, [authenticated, isAdmin, isClient, cohortId, fetchData]);

  const handleHighlightsSuccess = () => {
    fetchData();
  };

  const handleRequirementsSuccess = () => {
    fetchData();
  };

  if (loading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!authenticated || !isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/cohorts"
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to cohorts
          </Link>

          {isLoading ? (
            <h1 className="text-2xl font-bold text-white">
              Loading program details...
            </h1>
          ) : error ? (
            <h1 className="text-2xl font-bold text-white">
              Error Loading Program Details
            </h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">
                Program Details: {cohort?.name}
              </h1>
              <p className="text-gray-400 mt-1">
                Bootcamp Program
              </p>
            </>
          )}
        </div>

        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {!isLoading && !error && cohort && (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-card border border-gray-800">
                <TabsTrigger value="highlights" className="text-white data-[state=active]:bg-steel-red">
                  Program Highlights
                </TabsTrigger>
                <TabsTrigger value="requirements" className="text-white data-[state=active]:bg-steel-red">
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
                      {highlights.length > 0 ? "Update" : "Add"} Program Highlights
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
                      {requirements.length > 0 ? "Update" : "Add"} Program Requirements
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
      </div>
    </AdminLayout>
  );
}