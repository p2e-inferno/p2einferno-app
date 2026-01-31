import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { sendEmail, getStarterKitEmail } from "@/lib/email";

const log = getLogger("api:leads");

type Intent = "starter_kit" | "bootcamp_waitlist" | "track_waitlist" | string;

interface LeadPayload {
  name?: string;
  email?: string;
  bootcampProgramId?: string;
  cohortId?: string;
  trackLabel?: string;
  intent?: Intent;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function isValidEmail(email?: string) {
  if (!email) return false;
  return /.+@.+\..+/.test(email);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const payload: LeadPayload = req.body || {};

    const name = typeof payload.name === "string" ? payload.name.trim() : null;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const bootcampProgramId = payload.bootcampProgramId ?? null;
    const cohortId = payload.cohortId ?? null;
    const trackLabel = payload.trackLabel ?? null;
    const intent = payload.intent ?? "starter_kit";
    const source = payload.source ?? null;
    const metadata = payload.metadata ?? null;

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("marketing_leads").insert({
      name,
      email,
      bootcamp_program_id: bootcampProgramId,
      cohort_id: cohortId,
      track_label: trackLabel,
      intent,
      source,
      metadata,
    });

    if (error) {
      log.error("Failed to insert marketing lead", { error });
      return res
        .status(500)
        .json({ success: false, error: "Failed to save lead" });
    }

    // Send Starter Kit Email if applicable
    if (intent === "starter_kit") {
      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.APP_URL ||
          "http://localhost:3000";
        const pdfUrl = `${appUrl}/P2E-INFERNO-Web3-Starter-Kit.pdf`;

        // Fetch the PDF from the public URL
        const pdfRes = await fetch(pdfUrl);
        if (!pdfRes.ok) {
          log.error("Failed to fetch starter kit PDF", {
            url: pdfUrl,
            status: pdfRes.status,
          });
        } else {
          const pdfBuffer = await pdfRes.arrayBuffer();

          const emailData = getStarterKitEmail({ name });
          await sendEmail({
            to: email,
            ...emailData,
            attachment: {
              filename: "P2E-INFERNO-Web3-Starter-Kit.pdf",
              data: pdfBuffer,
            },
          });
          log.info("Sent starter kit email", { email });
        }
      } catch (emailError) {
        log.error("Failed to send starter kit email", { error: emailError });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    log.error("Unexpected error saving lead", { error });
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
