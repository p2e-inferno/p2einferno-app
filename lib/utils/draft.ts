export type DraftObject = {
  formData?: {
    id?: string | null;
    [key: string]: unknown;
  } | null;
};

export type DraftResolution<T> =
  | { mode: "new"; error?: unknown }
  | { mode: "existing"; entity: T; draftId: string };

interface ResolveDraftParams<T> {
  draft: DraftObject | null;
  fetchExisting: (id: string) => Promise<T | null>;
}

/**
 * Helper that checks whether a restored draft already exists in the database.
 * Returns the matching entity when found so calling forms can switch to edit mode.
 */
export async function resolveDraftById<T>({
  draft,
  fetchExisting,
}: ResolveDraftParams<T>): Promise<DraftResolution<T>> {
  const draftId = draft?.formData?.id ?? undefined;

  if (!draftId) {
    return { mode: "new" };
  }

  try {
    const existing = await fetchExisting(draftId);

    if (!existing) {
      return { mode: "new" };
    }

    return {
      mode: "existing",
      entity: existing,
      draftId,
    };
  } catch (error) {
    return { mode: "new", error };
  }
}
