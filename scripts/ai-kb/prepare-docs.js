/**
 * AI Knowledge Base — Non-DB Source Preparation
 *
 * Converts registry-backed repository sources (docs/playbooks/content files)
 * into JSONL files under automation/data/ai-kb/raw/docs/ so build.ts can
 * ingest them alongside DB snapshots.
 *
 * Usage: node scripts/ai-kb/prepare-docs.js
 */

const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("fs");
const { resolve } = require("path");

const DOCS_RAW_DIR = resolve(process.cwd(), "automation/data/ai-kb/raw/docs");
const REGISTRY_PATH = resolve(
  process.cwd(),
  "automation/config/ai-kb-sources.json",
);

function outputPathForSource(sourcePath) {
  return resolve(DOCS_RAW_DIR, `${sourcePath.replace(/\//g, "_")}.jsonl`);
}

function log(message, data) {
  if (data) {
    console.log(message, data);
    return;
  }

  console.log(message);
}

function main() {
  log("=== AI KB Non-DB Source Preparation ===");

  mkdirSync(DOCS_RAW_DIR, { recursive: true });

  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const nonDbSources = registry.sources.filter((s) => s.sourceType !== "db_snapshot");

  log(`Preparing ${nonDbSources.length} non-db source(s)`);

  let written = 0;
  let missing = 0;

  for (const entry of nonDbSources) {
    const sourceFilePath = resolve(process.cwd(), entry.sourcePath);
    if (!existsSync(sourceFilePath)) {
      console.error(`Missing source file: ${entry.sourcePath}`);
      missing++;
      continue;
    }

    const content = readFileSync(sourceFilePath, "utf-8");
    const record = {
      sourcePath: entry.sourcePath,
      title: entry.title,
      content,
      recordId: entry.sourcePath,
    };

    writeFileSync(outputPathForSource(entry.sourcePath), `${JSON.stringify(record)}\n`);
    written++;
    log(`Prepared: ${entry.sourcePath}`);
  }

  log("Preparation summary", {
    written,
    missing,
    outputDir: DOCS_RAW_DIR,
  });

  if (missing > 0) {
    process.exit(1);
  }
}

main();
