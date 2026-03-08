// /lib/ai/knowledge/sources.ts
// Server-only — never import from client components.

import { readFileSync } from "fs";
import { resolve } from "path";
import type { KnowledgeSourceEntry, KnowledgeSourceRegistry } from "./types";

const REGISTRY_PATH = resolve(
  process.cwd(),
  "automation/config/ai-kb-sources.json",
);

/** Patterns that indicate sensitive content. Any source_path matching these is rejected. */
const SENSITIVE_PATTERNS = [/\.env/, /secret/i, /credential/i, /private\.key/i];

let cachedRegistry: KnowledgeSourceRegistry | null = null;

/**
 * Loads and validates the source registry from automation/config/ai-kb-sources.json.
 * Throws if schemaVersion is not "1" or if any entry has an empty sourcePath.
 * Throws if any source_path matches sensitive patterns.
 */
export function loadSourceRegistry(): KnowledgeSourceRegistry {
  if (cachedRegistry) return cachedRegistry;

  const raw = readFileSync(REGISTRY_PATH, "utf-8");
  const parsed = JSON.parse(raw) as KnowledgeSourceRegistry;

  if (parsed.schemaVersion !== "1") {
    throw new Error(
      `Unsupported source registry schemaVersion: "${parsed.schemaVersion}" (expected "1")`,
    );
  }

  if (!Array.isArray(parsed.sources)) {
    throw new Error("Source registry must have a 'sources' array");
  }

  for (const entry of parsed.sources) {
    if (!entry.sourcePath || entry.sourcePath.trim() === "") {
      throw new Error(
        `Source registry entry has an empty sourcePath: ${JSON.stringify(entry)}`,
      );
    }

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(entry.sourcePath)) {
        throw new Error(
          `Source registry entry matches sensitive pattern (${pattern}): "${entry.sourcePath}"`,
        );
      }
    }
  }

  cachedRegistry = parsed;
  return parsed;
}

/**
 * Looks up a single source by path from the loaded registry.
 */
export function getSourceEntry(
  sourcePath: string,
): KnowledgeSourceEntry | undefined {
  const registry = loadSourceRegistry();
  return registry.sources.find((s) => s.sourcePath === sourcePath);
}

/**
 * Clears the cached registry. Useful for testing.
 */
export function clearRegistryCache(): void {
  cachedRegistry = null;
}
