import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:leads");

export async function GET(req: NextRequest) {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    try {
        const { searchParams } = new URL(req.url);
        const exportFormat = searchParams.get("export");
        const ids = searchParams.get("ids")?.split(",").filter(Boolean);

        // Pagination (ignored if export)
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 200);
        const offset = parseInt(searchParams.get("offset") || "0");
        const query = (searchParams.get("q") || "").trim();
        const intent = (searchParams.get("intent") || "").trim();

        const supabase = createAdminClient();
        let builder = supabase
            .from("marketing_leads")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });

        if (intent) {
            builder = builder.eq("intent", intent);
        }

        if (query) {
            // Search email or name.
            builder = builder.or(`email.ilike.%${query}%,name.ilike.%${query}%`);
        }

        if (ids && ids.length > 0) {
            builder = builder.in("id", ids);
        }

        if (exportFormat === "csv" || exportFormat === "json") {
            // Fetch all for export - limiting to 5000 for safety
            const { data, error } = await builder.limit(5000);

            if (error) throw error;

            if (exportFormat === "json") {
                return NextResponse.json(data);
            }

            // CSV
            const headers = ["ID", "Registered At", "Name", "Email", "Intent", "Source", "Track", "Metadata"];
            const csvRows = [headers.join(",")];

            data?.forEach((row: any) => {
                const metadataStr = row.metadata ? JSON.stringify(row.metadata).replace(/"/g, '""') : "";
                const values = [
                    row.id,
                    new Date(row.created_at).toISOString(),
                    `"${(row.name || "").replace(/"/g, '""')}"`,
                    `"${(row.email || "").replace(/"/g, '""')}"`,
                    `"${(row.intent || "").replace(/"/g, '""')}"`,
                    `"${(row.source || "").replace(/"/g, '""')}"`,
                    `"${(row.track_label || "").replace(/"/g, '""')}"`,
                    `"${metadataStr}"`
                ];
                csvRows.push(values.join(","));
            });

            return new NextResponse(csvRows.join("\n"), {
                headers: {
                    "Content-Type": "text/csv",
                    "Content-Disposition": `attachment; filename="leads-${new Date().toISOString()}.csv"`
                }
            });
        }

        // Normal Paginated Response
        builder = builder.range(offset, offset + limit - 1);
        const { data, error, count } = await builder;

        if (error) throw error;

        return NextResponse.json({
            success: true,
            leads: data || [],
            total: count || 0,
            limit,
            offset,
        });

    } catch (error: any) {
        log.error("Failed to fetch leads", { error });
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
        const body = await req.json();
        const { ids } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { success: false, error: "No IDs provided" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const { error, count } = await supabase
            .from("marketing_leads")
            .delete({ count: "exact" })
            .in("id", ids);

        if (error) {
            log.error("Failed to delete leads", { error, count: ids.length });
            return NextResponse.json(
                { success: false, error: "Failed to delete leads" },
                { status: 500 }
            );
        }

        log.info("Leads deleted", { count });

        return NextResponse.json({ success: true, count });
    } catch (error: any) {
        log.error("Delete leads request failed", { error });
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
