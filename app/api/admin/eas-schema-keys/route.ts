import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  normalizeSchemaKey,
  isValidSchemaKey,
} from "@/lib/attestation/schemas/schema-key-utils";

const log = getLogger("api:admin:eas-schema-keys");

type CreateSchemaKeyBody = {
  key: string;
  label: string;
  description?: string | null;
  active?: boolean;
};

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const includeDisabled = url.searchParams.get("includeDisabled") === "1";

  const supabase = createAdminClient();
  let query = supabase.from("eas_schema_keys").select("*").order("key");
  if (!includeDisabled) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    log.error("Failed to load schema keys", { error });
    return NextResponse.json({ error: "Failed to load schema keys" }, { status: 500 });
  }

  return NextResponse.json({ keys: data || [] }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const body = (await req.json()) as CreateSchemaKeyBody;
  const { key, label, description = null, active = true } = body || ({} as any);

  if (!key || !label) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const normalizedKey = normalizeSchemaKey(key);
  if (!isValidSchemaKey(normalizedKey)) {
    return NextResponse.json({ error: "Invalid schema key" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("eas_schema_keys").insert({
    key: normalizedKey,
    label,
    description,
    active: Boolean(active),
  });

  if (error) {
    const isDuplicate = error.code === "23505";
    const message = isDuplicate ? "Schema key already exists" : "Failed to create schema key";
    log.error("Failed to create schema key", { error });
    return NextResponse.json({ error: message }, { status: isDuplicate ? 409 : 500 });
  }

  return NextResponse.json({ success: true, key: normalizedKey }, { status: 200 });
}
