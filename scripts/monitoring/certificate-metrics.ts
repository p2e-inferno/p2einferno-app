import { createAdminClient } from "@/lib/supabase/server";

async function getCertificateMetrics(hours: number = 24) {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const { data: claims } = await supabase
    .from('bootcamp_enrollments')
    .select('certificate_issued, certificate_last_error, certificate_issued_at')
    .gte('certificate_issued_at', since);

  const total = claims?.length || 0;
  const successful = claims?.filter((c: any) => c.certificate_issued)?.length || 0;
  const failed = claims?.filter((c: any) => c.certificate_last_error)?.length || 0;

  console.log(`\n📊 Certificate Metrics (last ${hours}h)`);
  console.log(`Total claims: ${total}`);
  console.log(`Successful: ${successful} (${total ? ((successful/total)*100).toFixed(1) : '0.0'}%)`);
  console.log(`Failed: ${failed} (${total ? ((failed/total)*100).toFixed(1) : '0.0'}%)`);

  const { data: stuck } = await supabase
    .from('bootcamp_enrollments')
    .select('id, cohort_id, certificate_claim_in_progress, updated_at')
    .eq('certificate_claim_in_progress', true)
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());

  if (stuck && (stuck as any[]).length > 0) {
    console.log(`\n⚠️  Stuck claims (in-progress >10min): ${(stuck as any[]).length}`);
    (stuck as any[]).forEach((s) => console.log(`  - ${s.id} (cohort: ${s.cohort_id})`));
  }

  const { data: errors } = await supabase
    .from('bootcamp_enrollments')
    .select('certificate_last_error, certificate_last_error_at')
    .not('certificate_last_error', 'is', null)
    .gte('certificate_last_error_at', since);

  const errorTypes = new Map<string, number>();
  (errors || []).forEach((e: any) => {
    const type = (e.certificate_last_error || '').split(':')[0] || 'unknown';
    errorTypes.set(type, (errorTypes.get(type) || 0) + 1);
  });

  if (errorTypes.size > 0) {
    console.log(`\n🐛 Error Types:`);
    for (const [type, count] of errorTypes) console.log(`  - ${type}: ${count}`);
  }
}

getCertificateMetrics().catch((err) => {
  console.error('Metrics script failed:', err);
  process.exit(1);
});

