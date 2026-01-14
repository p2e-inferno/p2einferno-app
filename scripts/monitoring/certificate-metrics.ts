import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const logger = getLogger("certificate-metrics");

/**
 * Collects recent certificate-related records for metrics within the past `hours` hours.
 *
 * Executes queries against the `bootcamp_enrollments` table to retrieve recent certificate issuance fields,
 * potentially stale in-progress claims, and recent certificate errors. Query results are not returned or persisted.
 *
 * @param hours - Lookback window in hours to query for recent records (default: 24)
 */
async function getCertificateMetrics(hours: number = 24) {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  await supabase
    .from('bootcamp_enrollments')
    .select('certificate_issued, certificate_last_error, certificate_issued_at')
    .gte('certificate_issued_at', since);

  await supabase
    .from('bootcamp_enrollments')
    .select('id, cohort_id, certificate_claim_in_progress, updated_at')
    .eq('certificate_claim_in_progress', true)
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: errors } = await supabase
    .from('bootcamp_enrollments')
    .select('certificate_last_error, certificate_last_error_at')
    .not('certificate_last_error', 'is', null)
    .gte('certificate_last_error_at', since);

  void errors;
}

getCertificateMetrics().catch((err) => {
  logger.error("Metrics script failed:", err);
  process.exit(1);
});