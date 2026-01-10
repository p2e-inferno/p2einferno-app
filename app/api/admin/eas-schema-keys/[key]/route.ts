import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  normalizeSchemaKey,
  isValidSchemaKey,
} from "@/lib/attestation/schemas/schema-key-utils";

const log = getLogger("api:admin:eas-schema-keys:[key]");

type UpdateSchemaKeyBody = {
  label?: string;
  description?: string | null;
  active?: boolean;
};

export async function PATCH(
  req: NextRequest,
  context: { params: { key: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const paramKey = normalizeSchemaKey(context.params.key || "");
  if (!isValidSchemaKey(paramKey)) {
    return NextResponse.json({ error: "Invalid schema key" }, { status: 400 });
  }

  const body = (await req.json()) as UpdateSchemaKeyBody;
  const { label, description, active } = body || ({} as any);

  if (label === undefined && description === undefined && active === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const update: Record<string, any> = {};
  if (label !== undefined) update.label = label;
  if (description !== undefined) update.description = description;
  if (active !== undefined) update.active = Boolean(active);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("eas_schema_keys")
    .update(update)
    .eq("key", paramKey)
    .select("key")
    .maybeSingle();

  if (error) {
    log.error("Failed to update schema key", { error });
    return NextResponse.json({ error: "Failed to update schema key" }, { status: 500 });
  }

  if (!data?.key) {
    return NextResponse.json({ error: "Schema key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: { key: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const paramKey = normalizeSchemaKey(context.params.key || "");
  if (!isValidSchemaKey(paramKey)) {
    return NextResponse.json({ error: "Invalid schema key" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("eas_schema_keys")
    .update({ active: false })
    .eq("key", paramKey)
    .select("key")
    .maybeSingle();

  if (error) {
    log.error("Failed to disable schema key", { error });
    return NextResponse.json({ error: "Failed to disable schema key" }, { status: 500 });
  }

  if (!data?.key) {
    return NextResponse.json({ error: "Schema key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
