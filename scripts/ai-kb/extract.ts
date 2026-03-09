/**
 * AI Knowledge Base — Extract Validation Script
 *
 * Loads the source registry and validates MCP-exported JSONL files
 * in automation/data/ai-kb/raw/. Does NOT perform extraction itself —
 * MCP handles that. This script validates the output.
 *
 * Usage: ts-node scripts/ai-kb/extract.ts
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, relative } from "path";
import { loadSourceRegistry } from "@/lib/ai/knowledge/sources";
import { getLogger } from "@/lib/utils/logger";

const RAW_DIR = resolve(process.cwd(), "automation/data/ai-kb/raw");
const log = getLogger("scripts:ai-kb:extract");

interface JsonlRecord {
  sourcePath?: string;
  title?: string;
  content?: string;
}

function findJsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJsonlFiles(fullPath));
    } else if (entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  log.info("=== AI KB Extract Validation ===");

  const registry = loadSourceRegistry();
  log.info(`Registry loaded: ${registry.sources.length} source(s)`);

  const jsonlFiles = findJsonlFiles(RAW_DIR);
  if (jsonlFiles.length === 0) {
    log.warn("No JSONL files found", { rawDir: RAW_DIR });
    log.info("Run MCP extraction first to populate raw data.");
    return;
  }

  log.info(`Found ${jsonlFiles.length} JSONL file(s)`);

  const registryPaths = new Set(registry.sources.map((s) => s.sourcePath));
  const foundPaths = new Set<string>();
  let totalWarnings = 0;
  let totalErrors = 0;

  for (const filePath of jsonlFiles) {
    const relPath = relative(process.cwd(), filePath);
    log.info(`Validating: ${relPath}`);

    const rawContent = readFileSync(filePath, "utf-8");
    const lines = rawContent.trim().split("\n").filter((l) => l.trim());

    let validRecords = 0;
    let invalidRecords = 0;
    const fileSourcePaths = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (line === undefined) {
          invalidRecords++;
          totalErrors++;
          continue;
        }

        const record = JSON.parse(line) as JsonlRecord;

        if (!record.sourcePath || !record.title || !record.content) {
          const missing: string[] = [];
          if (!record.sourcePath) missing.push("sourcePath");
          if (!record.title) missing.push("title");
          if (!record.content) missing.push("content");
          log.warn(`Line ${i + 1}: missing required fields`, { missing });
          invalidRecords++;
          totalErrors++;
          continue;
        }

        fileSourcePaths.add(record.sourcePath);
        foundPaths.add(record.sourcePath);
        validRecords++;
      } catch {
        log.error(`Line ${i + 1}: invalid JSON`);
        invalidRecords++;
        totalErrors++;
      }
    }

    // Check for unregistered source paths in this file
    for (const sp of fileSourcePaths) {
      if (!registryPaths.has(sp)) {
        log.warn(`Unexpected source path (not in registry): "${sp}"`);
        totalWarnings++;
      }
    }

    // For db_snapshot sources: warn on empty record count
    for (const sp of fileSourcePaths) {
      const entry = registry.sources.find((s) => s.sourcePath === sp);
      if (entry?.sourceType === "db_snapshot" && validRecords === 0) {
        log.warn(`db_snapshot source "${sp}" has 0 valid records (empty snapshot)`);
        totalWarnings++;
      }
    }

    log.info(`${relPath}: ${validRecords} valid, ${invalidRecords} invalid record(s)`);
  }

  // Check for missing sources (registry entries with no JSONL data)
  for (const entry of registry.sources) {
    if (!foundPaths.has(entry.sourcePath)) {
      log.warn(`Missing source: "${entry.sourcePath}" (in registry but no JSONL data)`);
      totalWarnings++;
    }
  }

  log.info("Extract validation summary", {
    sourcesInRegistry: registry.sources.length,
    jsonlFilesFound: jsonlFiles.length,
    sourcesCovered: `${foundPaths.size}/${registry.sources.length}`,
    warnings: totalWarnings,
    errors: totalErrors,
  });

  if (totalErrors > 0) {
    log.error("Validation failed with errors.");
    process.exit(1);
  }

  log.info("Validation complete.");
}

main().catch((err) => {
  log.error("Extract validation failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
