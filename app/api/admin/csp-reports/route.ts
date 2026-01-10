import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { isValidUuid, escapeIlike } from "@/lib/utils/validation";

const log = getLogger("api:admin:csp-reports");

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");
    const query = (searchParams.get("q") || "").trim();
    const directive = (searchParams.get("directive") || "").trim();

    const supabase = createAdminClient();
    let builder = supabase
      .from("csp_reports")
      .select("*", { count: "exact" })
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (directive) {
      builder = builder.eq("violated_directive", directive);
    }

    if (query) {
      const escaped = escapeIlike(query);
      builder = builder.or(
        `document_uri.ilike.%${escaped}%,blocked_uri.ilike.%${escaped}%,source_file.ilike.%${escaped}%,violated_directive.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await builder;

    if (error) {
      log.error("Failed to fetch CSP reports", { error });
      return NextResponse.json(
        { success: false, error: "Failed to fetch CSP reports" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      reports: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    log.error("CSP reports request failed", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    const supabase = createAdminClient();

    if (clearAll) {
      const { error } = await supabase
        .from("csp_reports")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        log.error("Failed to clear all CSP reports", { error });
        return NextResponse.json(
          { success: false, error: "Failed to clear reports" },
          { status: 500 },
        );
      }

      log.info("All CSP reports cleared by admin");
      return NextResponse.json({ success: true, message: "All reports cleared" });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Report ID required" },
        { status: 400 },
      );
    }

    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid report ID format" },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("csp_reports").delete().eq("id", id);

    if (error) {
      log.error("Failed to delete CSP report", { error, id });
      return NextResponse.json(
        { success: false, error: "Failed to delete report" },
        { status: 500 },
      );
    }

    log.info("CSP report deleted by admin", { id });
    return NextResponse.json({ success: true, message: "Report deleted" });
  } catch (error) {
    log.error("CSP report deletion failed", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
