/*
 * Pre-flight check: block deployment when certificates already exist
 */
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Performs a pre-flight check for already-issued certificates and blocks deployment if any are found.
 *
 * Queries the "bootcamp_enrollments" table for rows where `certificate_issued` is true; if the query fails
 * or if at least one issued certificate is detected, logs an error and terminates the process with exit code 1.
 */
async function checkCertificates() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bootcamp_enrollments")
    .select("id")
    .eq("certificate_issued", true)
    .limit(1);
  if (error) {
    console.error("Pre-flight check failed:", error.message);
    process.exit(1);
  }
  const count = data?.length || 0;
  if (count > 0) {
    console.error("\n❌ DEPLOYMENT BLOCKED");
    console.error(`${count} certificate(s) already issued.`);
    console.error("Migration required before deploying V2 schema.\n");
    process.exit(1);
  }
}

checkCertificates().catch((err) => {
  console.error("Pre-flight check failed:", err);
  process.exit(1);
});