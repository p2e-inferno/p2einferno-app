/**
 * AI Knowledge Base — Coverage Validation
 *
 * Checks that every source in ai-kb-sources.json is reachable by at least one
 * active route profile on the audience dimension. audience_filter is the only
 * hard gate in search_ai_kb_chunks — domain_tags are metadata only and do not
 * affect retrieval.
 *
 * A source that fails this check will be invisible to every chat route profile,
 * regardless of query relevance.
 *
 * Usage: node scripts/ai-kb/validate-kb-coverage.js
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { getServerChatRouteProfiles } from "@/lib/chat/server/respond-route-profile";

interface KbSource {
  sourcePath: string;
  title: string;
  audience: string[];
  domainTags: string[];
}

interface KbSourcesConfig {
  sources: KbSource[];
}

function intersects(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

export function main() {
  const configPath = resolve(
    process.cwd(),
    "automation/config/ai-kb-sources.json",
  );
  const config: KbSourcesConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  const profiles = getServerChatRouteProfiles();

  const orphans: KbSource[] = [];

  for (const source of config.sources) {
    const reachable = profiles.some((profile) =>
      intersects(source.audience, profile.audience),
    );

    if (!reachable) {
      orphans.push(source);
    }
  }

  if (orphans.length === 0) {
    console.log(
      `✓ All ${config.sources.length} KB sources are reachable by at least one active profile.`,
    );
    return;
  }

  console.error(
    `\n✗ ${orphans.length} KB source(s) not reachable by any active profile:\n`,
  );

  for (const source of orphans) {
    console.error(`  ${source.sourcePath}`);
    console.error(`    title:    ${source.title}`);
    console.error(`    audience: [${source.audience.join(", ")}]`);
    console.error(`    → No active profile has an overlapping audience value`);
    console.error();
  }

  console.error(
    `  Fix: update audience in automation/config/ai-kb-sources.json\n` +
      `  so each source shares at least one audience value with an active profile.\n` +
      `  Profile definitions: lib/chat/server/respond-route-profile.ts\n`,
  );

  process.exit(1);
}
