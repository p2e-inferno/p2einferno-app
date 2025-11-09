import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:cohort-fix-statuses");

export async function POST(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    return NextResponse.json({ error: "Certificate feature not enabled" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { cohortId } = await params;

  try {
    const { data: enrollments, error } = await supabase
      .from("bootcamp_enrollments")
      .select("id")
      .eq("cohort_id", cohortId)
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const fixed: any[] = [];
    const skipped: any[] = [];

    for (const e of enrollments || []) {
      const { data, error: rpcErr } = await supabase.rpc("fix_completion_status", { p_enrollment_id: e.id });
      if (rpcErr) {
        skipped.push({ id: e.id, error: rpcErr.message });
        continue;
      }
      if (data?.success) fixed.push({ id: e.id, data });
      else skipped.push({ id: e.id, data });
    }

    return NextResponse.json({ success: true, fixed, skipped });
  } catch (error: any) {
    log.error("fix-statuses error", { error });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

