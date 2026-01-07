import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

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
      builder = builder.or(
        `document_uri.ilike.%${query}%,blocked_uri.ilike.%${query}%,source_file.ilike.%${query}%,violated_directive.ilike.%${query}%`,
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
