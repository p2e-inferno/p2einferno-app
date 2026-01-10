import type { NextApiRequest, NextApiResponse } from "next";
import { getLogger } from "@/lib/utils/logger";
import { createAdminClient } from "@/lib/supabase/server";

const log = getLogger("security:csp");

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "32kb",
    },
  },
};

// Rate limiting config (5 reports per minute per IP)
const RATE_LIMIT = {
  windowSeconds: 60, // 1 minute
  max: 5,
};

function resolveClientIp(req: NextApiRequest): string | null {
  const forwardedFor = (req.headers["x-forwarded-for"] as string) || "";
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = (req.headers["x-real-ip"] as string) || "";
  if (realIp) return realIp;

  return req.socket.remoteAddress || null;
}

function isDocumentUriAllowed(req: NextApiRequest, documentUri: string) {
  const requestHost = req.headers.host?.split(":")[0];
  if (!requestHost) return false;
  try {
    const host = new URL(documentUri).hostname;
    return host === requestHost;
  } catch (err) {
    return false;
  }
}

// Helper function to parse CSP report body
function parseCspReportBody(body: any, contentType: string): any {
  if (contentType.includes("application/json")) {
    return body; // Already parsed by Next.js
  }

  if (contentType.includes("application/csp-report")) {
    // Next.js doesn't parse application/csp-report as JSON, so we need to handle it manually
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch (err) {
        log.error("Failed to parse CSP report body", { err });
        return null;
      }
    }
    return body;
  }

  return null;
}

export default async function cspReportHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const supabase = createAdminClient();

  // 1. Rate limiting
  const ip = resolveClientIp(req);
  if (!ip) {
    log.warn("CSP report missing client IP; skipping rate limiting");
  }

  if (ip) {
    const { data: rateAllowed, error: rateError } = await supabase.rpc(
      "check_and_increment_csp_rate_limit",
      {
        p_ip: ip,
        p_window_seconds: RATE_LIMIT.windowSeconds,
        p_max: RATE_LIMIT.max,
      },
    );

    if (rateError) {
      log.error("CSP rate limit check failed", { error: rateError, ip });
      return res.status(500).json({
        status: "rate_limit_error",
        message: "Failed to enforce rate limits",
      });
    }

    if (!rateAllowed) {
      log.warn("CSP report rate limited", { ip });
      return res.status(429).json({
        status: "rate_limited",
        message: "Too many requests",
        retry_after: RATE_LIMIT.windowSeconds,
      });
    }
  }

  // 2. Validate content type (accept both standard and JSON)
  const contentType = req.headers["content-type"];
  if (
    !contentType ||
    !(
      contentType.includes("application/csp-report") ||
      contentType.includes("application/json")
    )
  ) {
    return res.status(415).json({
      status: "invalid_content_type",
      message:
        "Content-Type must be application/csp-report or application/json",
      accepted_types: ["application/csp-report", "application/json"],
    });
  }

  // 3. Process valid reports
  if (req.method === "POST") {
    try {
      // Parse the request body based on content type
      const parsedBody = parseCspReportBody(req.body, contentType);

      if (!parsedBody) {
        return res.status(400).json({
          status: "parse_error",
          message: "Failed to parse request body",
          content_type: contentType,
        });
      }

      // Extract report data based on content type
      let report;
      if (contentType.includes("application/csp-report")) {
        // Standard CSP format: { "csp-report": { ... } }
        report = parsedBody["csp-report"];
      } else {
        // JSON format: direct report object
        report = parsedBody;
      }

      if (!report || typeof report !== "object") {
        return res.status(400).json({
          status: "invalid_report",
          message: "Invalid or missing report data",
          received_body: parsedBody,
          content_type: contentType,
        });
      }

      // 4. Sanitize and validate required fields
      const sanitizedReport = {
        documentUri: report["document-uri"] || report["documentUri"] || null,
        violatedDirective:
          report["violated-directive"] || report["violatedDirective"] || null,
        blockedUri: report["blocked-uri"] || report["blockedUri"] || null,
        lineNumber: report["line-number"] || report["lineNumber"] || null,
        columnNumber: report["column-number"] || report["columnNumber"] || null,
        sourceFile: report["source-file"] || report["sourceFile"] || null,
        statusCode: report["status-code"] || report["statusCode"] || null,
        userAgent: req.headers["user-agent"] || null,
        timestamp: new Date().toISOString(),
        ip: ip,
        originalReport: report, // Keep original for debugging
      };

      // 5. Validate that we have at least the essential fields
      if (!sanitizedReport.documentUri || !sanitizedReport.violatedDirective) {
        return res.status(400).json({
          status: "incomplete_report",
          message:
            "Missing required fields: document-uri and violated-directive",
          received_fields: Object.keys(report),
          sanitized_fields: Object.keys(sanitizedReport),
        });
      }

      if (!isDocumentUriAllowed(req, sanitizedReport.documentUri)) {
        log.warn("CSP report rejected for unexpected document URI", {
          documentUri: sanitizedReport.documentUri,
        });
        return res.status(400).json({
          status: "invalid_document_uri",
          message: "Report document-uri is not allowed",
        });
      }

      // 6. Log to multiple outputs
      log.warn("CSP Violation", { report: sanitizedReport }); // Local dev

      // Structured logging for production
      log.warn("CSP_VIOLATION", {
        timestamp: sanitizedReport.timestamp,
        data: sanitizedReport,
      });

      const { error: insertError } = await supabase.from("csp_reports").insert({
        received_at: sanitizedReport.timestamp,
        ip: sanitizedReport.ip,
        user_agent: sanitizedReport.userAgent,
        document_uri: sanitizedReport.documentUri,
        violated_directive: sanitizedReport.violatedDirective,
        blocked_uri: sanitizedReport.blockedUri,
        source_file: sanitizedReport.sourceFile,
        line_number: sanitizedReport.lineNumber
          ? Number(sanitizedReport.lineNumber)
          : null,
        column_number: sanitizedReport.columnNumber
          ? Number(sanitizedReport.columnNumber)
          : null,
        status_code: sanitizedReport.statusCode
          ? Number(sanitizedReport.statusCode)
          : null,
        raw_report: sanitizedReport.originalReport,
      });

      if (insertError) {
        log.error("Failed to persist CSP report", { error: insertError });
        return res.status(500).json({
          status: "storage_error",
          message: "Failed to store CSP report",
        });
      }

      // 7. Return success (202 Accepted - report received but not necessarily processed)
      return res.status(202).json({
        status: "accepted",
        message: "CSP violation report received",
        report_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content_type_processed: contentType,
      });
    } catch (err) {
      log.error("Error processing CSP report", { err });
      return res.status(500).json({
        status: "processing_error",
        message: "Failed to process report",
        error_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
    }
  }

  // 8. Handle unsupported methods
  res.setHeader("Allow", ["POST"]);
  return res.status(405).json({
    status: "method_not_allowed",
    message: "Only POST requests accepted",
    allowed_methods: ["POST"],
  });
}
