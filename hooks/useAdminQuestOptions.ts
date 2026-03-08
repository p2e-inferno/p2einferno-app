import { useState, useEffect } from "react";
import { useAdminApi } from "@/hooks/useAdminApi";
import type { Quest } from "@/lib/supabase/types";

/**
 * Hook to fetch all available quests for selection in admin forms.
 * 
 * @param excludeQuestId - Optional ID of a quest to exclude from the list (e.g. the current quest being edited).
 * @returns An object containing the quest options, loading state, and any error that occurred.
 */
export function useAdminQuestOptions(excludeQuestId?: string) {
    const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });
    const [questOptions, setQuestOptions] = useState<Quest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchOptions = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await silentFetch<{
                    data?: { data: Quest[] };
                    success?: boolean;
                }>("/api/admin/quests-v2");

                if (cancelled) return;

                if (response.error) {
                    setError(response.error || "Failed to load missions");
                    return;
                }

                // The API returns { success: true, data: { data: Quest[], ... } }
                const result = response.data;
                const questsList = Array.isArray(result?.data) ? result?.data : [];
                const filtered = excludeQuestId
                    ? questsList.filter((item: any) => item?.id !== excludeQuestId)
                    : questsList;

                setQuestOptions(filtered as Quest[]);
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || "An unexpected error occurred");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchOptions();

        return () => {
            cancelled = true;
        };
    }, [silentFetch, excludeQuestId]);

    return { questOptions, loading, error };
}
