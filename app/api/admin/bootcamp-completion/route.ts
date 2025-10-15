import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:bootcamp-completion");

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    return NextResponse.json({ error: "Certificate feature not enabled" }, { status: 403 });
  }

  const supabase = createAdminClient();
  try {
    const { action, enrollmentId, attestationUid } = (await req.json()) as {
      action: "fix-status" | "force-unlock" | "save-attestation";
      enrollmentId?: string;
      attestationUid?: string;
    };

    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    if (action === "fix-status") {
      if (!enrollmentId) return NextResponse.json({ error: "Missing enrollmentId" }, { status: 400 });
      const { data, error } = await supabase.rpc("fix_completion_status", { p_enrollment_id: enrollmentId });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "force-unlock") {
      if (!enrollmentId) return NextResponse.json({ error: "Missing enrollmentId" }, { status: 400 });
      const { data, error } = await supabase.rpc("force_clear_claim_lock", { p_enrollment_id: enrollmentId });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "save-attestation") {
      if (!enrollmentId || !attestationUid) return NextResponse.json({ error: "Missing enrollmentId or attestationUid" }, { status: 400 });
      const { error } = await supabase
        .from("bootcamp_enrollments")
        .update({
          certificate_attestation_uid: attestationUid,
          certificate_last_error: null,
          certificate_last_error_at: null,
        })
        .eq("id", enrollmentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    log.error("Admin bootcamp-completion error", { error });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

