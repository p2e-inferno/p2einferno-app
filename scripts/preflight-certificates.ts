/*
 * Pre-flight check: block deployment when certificates already exist
 */
import { createAdminClient } from "@/lib/supabase/server";

async function checkCertificates() {
  const supabase = createAdminClient();
  console.log("🔍 Checking for existing certificates...");
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
  console.log("✅ Pre-flight check passed: No certificates issued");
}

checkCertificates().catch((err) => {
  console.error("Pre-flight check failed:", err);
  process.exit(1);
});

