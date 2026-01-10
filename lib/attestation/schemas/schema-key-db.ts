import { createAdminClient } from "@/lib/supabase/server";
import {
  normalizeSchemaKey,
  isValidSchemaKey,
} from "@/lib/attestation/schemas/schema-key-utils";

export const ensureActiveSchemaKey = async (
  schemaKey: string,
): Promise<{ ok: boolean; key?: string; error?: string }> => {
  const normalized = normalizeSchemaKey(schemaKey);
  if (!normalized || !isValidSchemaKey(normalized)) {
    return { ok: false, error: "Invalid schema key" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("eas_schema_keys")
    .select("key, active")
    .eq("key", normalized)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Failed to validate schema key" };
  }

  if (!data?.key) {
    return { ok: false, error: "Schema key not found" };
  }

  if (!data.active) {
    return { ok: false, error: "Schema key is inactive" };
  }

  return { ok: true, key: normalized };
};
