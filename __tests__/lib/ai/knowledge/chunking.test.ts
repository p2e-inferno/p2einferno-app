/**
 * Unit tests for AI Knowledge Base chunking module
 */

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { chunkMarkdown } from "@/lib/ai/knowledge/chunking";

describe("chunkMarkdown", () => {
  const baseInput = {
    sourcePath: "docs/test.md",
    sourceType: "doc" as const,
  };

  it("splits markdown by heading boundaries", () => {
    const content = [
      "# Introduction",
      "This is the introduction section with enough text to be a valid chunk that exceeds one hundred characters easily when we add more words here.",
      "",
      "# Getting Started",
      "This is the getting started section with enough text to be a valid chunk that exceeds one hundred characters easily when we add more words here.",
    ].join("\n");

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All chunks should have source_path metadata
    for (const chunk of chunks) {
      expect(chunk.metadata.source_path).toBe("docs/test.md");
      expect(chunk.metadata.source_type).toBe("doc");
    }
  });

  it("preserves section_heading in chunk metadata", () => {
    const content = [
      "# My Heading",
      "A".repeat(800),
      "",
      "# Another Heading",
      "B".repeat(800),
    ].join("\n");

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const headings = chunks
      .map((c) => c.metadata.section_heading)
      .filter(Boolean);
    expect(headings).toContain("My Heading");
    expect(headings).toContain("Another Heading");
  });

  it("enforces minimum chunk size of 100 characters", () => {
    const content = [
      "# Short",
      "Too short.",
      "",
      "# Long Enough",
      "A".repeat(200),
    ].join("\n");

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    for (const chunk of chunks) {
      expect(chunk.chunkText.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("enforces maximum chunk size of 2000 characters", () => {
    const content = "# Big Section\n" + "A".repeat(5000);

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    for (const chunk of chunks) {
      expect(chunk.chunkText.length).toBeLessThanOrEqual(2000);
    }
  });

  it("returns empty array for empty content", () => {
    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: "" });
    expect(chunks).toEqual([]);
  });

  it("returns empty array for whitespace-only content", () => {
    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: "   \n\n  " });
    expect(chunks).toEqual([]);
  });

  it("carries heading context into overflow chunks", () => {
    const content =
      "# Very Long Section\n" + "Word ".repeat(600); // >2000 chars

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    expect(chunks.length).toBeGreaterThan(1);

    // All chunks from the same section should reference the heading
    for (const chunk of chunks) {
      expect(chunk.metadata.section_heading).toBe("Very Long Section");
    }
  });

  it("includes extraMetadata in chunk metadata", () => {
    const content = "# Test\n" + "A".repeat(200);

    const chunks = chunkMarkdown({
      ...baseInput,
      contentMarkdown: content,
      extraMetadata: { record_id: "abc-123" },
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.record_id).toBe("abc-123");
  });

  it("assigns sequential chunk indices", () => {
    const content = [
      "# Section 1",
      "A".repeat(200),
      "# Section 2",
      "B".repeat(200),
      "# Section 3",
      "C".repeat(200),
    ].join("\n");

    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  it("estimates tokens at roughly 4 chars per token", () => {
    const content = "# Test\n" + "A".repeat(400);
    const chunks = chunkMarkdown({ ...baseInput, contentMarkdown: content });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Token estimate for 400+ chars should be ~100+
    expect(chunks[0].tokenEstimate).toBeGreaterThan(50);
  });
});
