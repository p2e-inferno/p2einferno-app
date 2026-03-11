// /lib/ai/knowledge/chunking.ts
// Server-only — never import from client components.
// Deterministic chunking by headings + max character budget.

import { getLogger } from "@/lib/utils/logger";
import type { KnowledgeChunk, ChunkMetadata, KnowledgeSourceType } from "./types";

const log = getLogger("ai:kb:chunking");

const SOFT_CAP = 1500;
const HARD_CAP = 2000;
const MIN_CHUNK_LENGTH = 100;

/** Rough token estimate: ~4 characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface ChunkInput {
  contentMarkdown: string;
  sourcePath: string;
  sourceType: KnowledgeSourceType;
  /** Additional metadata fields to merge into each chunk's metadata. */
  extraMetadata?: Record<string, unknown>;
}

/**
 * Splits markdown content into chunks by heading boundaries with a character budget.
 *
 * - Splits on heading lines (lines starting with #).
 * - Soft cap: 1500 chars. Hard cap: 2000 chars.
 * - Overflow continues into next chunk, preserving heading context in metadata.
 * - Chunks under 100 characters are rejected (logged as warning, excluded from output).
 * - Preserves source_path, source_type, and section_heading in chunk metadata.
 */
export function chunkMarkdown(input: ChunkInput): KnowledgeChunk[] {
  const { contentMarkdown, sourcePath, sourceType, extraMetadata } = input;

  if (!contentMarkdown || contentMarkdown.trim().length === 0) {
    log.warn("empty content, no chunks produced", { sourcePath });
    return [];
  }

  // Split content into sections by headings
  const lines = contentMarkdown.split("\n");
  const sections: Array<{ heading: string | undefined; text: string }> = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      // Save previous section
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, text: currentLines.join("\n") });
      }
      currentHeading = line.replace(/^#{1,6}\s+/, "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  // Push final section
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, text: currentLines.join("\n") });
  }

  // Build chunks from sections, respecting character budget
  const rawChunks: Array<{ text: string; heading: string | undefined }> = [];

  for (const section of sections) {
    const sectionText = section.text.trim();
    if (sectionText.length === 0) continue;

    if (sectionText.length <= SOFT_CAP) {
      // Section fits within soft cap — try to merge with previous chunk
      const last = rawChunks[rawChunks.length - 1];
      if (last && last.text.length + sectionText.length + 1 <= SOFT_CAP) {
        last.text += "\n" + sectionText;
        // Only backfill heading when the existing chunk has none
        if (section.heading && !last.heading) last.heading = section.heading;
      } else {
        rawChunks.push({ text: sectionText, heading: section.heading });
      }
    } else {
      // Section exceeds soft cap — split by hard cap with overflow
      let remaining = sectionText;
      while (remaining.length > 0) {
        let splitAt = HARD_CAP;
        if (remaining.length > HARD_CAP) {
          // Try to split at a paragraph boundary within the hard cap
          const lastNewline = remaining.lastIndexOf("\n\n", HARD_CAP);
          if (lastNewline > SOFT_CAP / 2) {
            splitAt = lastNewline;
          } else {
            // Try splitting at a single newline
            const lastSingleNewline = remaining.lastIndexOf("\n", HARD_CAP);
            if (lastSingleNewline > SOFT_CAP / 2) {
              splitAt = lastSingleNewline;
            }
          }
        }

        const chunkText = remaining.slice(0, splitAt).trim();
        remaining = remaining.slice(splitAt).trim();

        if (chunkText.length > 0) {
          rawChunks.push({
            text: chunkText,
            heading: section.heading,
          });
        }
      }
    }
  }

  // Convert to KnowledgeChunk, filtering out short chunks
  const chunks: KnowledgeChunk[] = [];
  let chunkIndex = 0;

  for (const raw of rawChunks) {
    if (raw.text.length < MIN_CHUNK_LENGTH) {
      log.warn("chunk below minimum length, skipping", {
        sourcePath,
        length: raw.text.length,
        heading: raw.heading,
      });
      continue;
    }

    const metadata: ChunkMetadata = {
      embedding_model: "", // Set by build.ts before upsert
      source_path: sourcePath,
      source_type: sourceType,
      ...(raw.heading ? { section_heading: raw.heading } : {}),
      ...extraMetadata,
    };

    chunks.push({
      chunkIndex,
      chunkText: raw.text,
      tokenEstimate: estimateTokens(raw.text),
      metadata,
    });

    chunkIndex++;
  }

  return chunks;
}
