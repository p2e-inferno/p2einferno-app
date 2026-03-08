/**
 * Unit tests for AI Knowledge Base source registry module
 */

import { readFileSync } from "fs";

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

jest.mock("path", () => ({
  resolve: jest.fn((...args: string[]) => args.join("/")),
}));

import {
  loadSourceRegistry,
  getSourceEntry,
  clearRegistryCache,
} from "@/lib/ai/knowledge/sources";

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe("loadSourceRegistry", () => {
  beforeEach(() => {
    clearRegistryCache();
    jest.clearAllMocks();
  });

  it("parses valid JSON and returns typed registry", () => {
    const validRegistry = {
      schemaVersion: "1",
      sources: [
        {
          sourcePath: "docs/test.md",
          sourceType: "doc",
          title: "Test",
          audience: ["support"],
          domainTags: ["test"],
          staleDays: 30,
        },
      ],
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(validRegistry));

    const result = loadSourceRegistry();
    expect(result.schemaVersion).toBe("1");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sourcePath).toBe("docs/test.md");
  });

  it("throws on missing schemaVersion", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ sources: [] }));

    expect(() => loadSourceRegistry()).toThrow(
      'Unsupported source registry schemaVersion',
    );
  });

  it("throws on invalid schemaVersion", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: "2", sources: [] }),
    );

    expect(() => loadSourceRegistry()).toThrow(
      'Unsupported source registry schemaVersion: "2"',
    );
  });

  it("throws on empty sourcePath in any entry", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "",
            sourceType: "doc",
            title: "Bad",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    expect(() => loadSourceRegistry()).toThrow("empty sourcePath");
  });

  it("rejects .env sensitive paths", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: ".env.local",
            sourceType: "code",
            title: "Env",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    expect(() => loadSourceRegistry()).toThrow("sensitive pattern");
  });

  it("rejects paths containing 'secret'", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "config/secret-keys.json",
            sourceType: "code",
            title: "Secrets",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    expect(() => loadSourceRegistry()).toThrow("sensitive pattern");
  });

  it("rejects paths containing 'credential'", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "auth/credentials.json",
            sourceType: "code",
            title: "Creds",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    expect(() => loadSourceRegistry()).toThrow("sensitive pattern");
  });

  it("rejects paths containing 'private.key'", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "certs/private.key",
            sourceType: "code",
            title: "Key",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    expect(() => loadSourceRegistry()).toThrow("sensitive pattern");
  });
});

describe("getSourceEntry", () => {
  beforeEach(() => {
    clearRegistryCache();
    jest.clearAllMocks();
  });

  it("returns matching entry", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "docs/faq.md",
            sourceType: "faq",
            title: "FAQ",
            audience: ["support"],
            domainTags: ["general"],
            staleDays: 30,
          },
        ],
      }),
    );

    const entry = getSourceEntry("docs/faq.md");
    expect(entry).toBeDefined();
    expect(entry?.title).toBe("FAQ");
  });

  it("returns undefined for non-matching path", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        schemaVersion: "1",
        sources: [
          {
            sourcePath: "docs/faq.md",
            sourceType: "faq",
            title: "FAQ",
            audience: [],
            domainTags: [],
            staleDays: 30,
          },
        ],
      }),
    );

    const entry = getSourceEntry("docs/nonexistent.md");
    expect(entry).toBeUndefined();
  });
});
