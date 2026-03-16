jest.mock("@/lib/ai/knowledge/embeddings", () => ({
  embedTexts: jest.fn(),
}));

jest.mock("@/lib/ai/knowledge/retrieval", () => ({
  searchKnowledgeBase: jest.fn(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import type { KnowledgeAudience } from "@/lib/ai/knowledge/types";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import { executeChatTool } from "@/lib/chat/server/tools/execute-chat-tool";

const embedTextsMock = embedTexts as jest.MockedFunction<typeof embedTexts>;
const searchKnowledgeBaseMock = searchKnowledgeBase as jest.MockedFunction<
  typeof searchKnowledgeBase
>;

const routeProfile = {
  id: "lobby_support" as const,
  audience: ["support"] as KnowledgeAudience[],
  domainTags: ["onboarding", "wallet", "quests"],
  retrievalLimit: 6,
  freshnessDays: 14,
  maxTokens: 500,
  assistantObjective: "Help users get started.",
  responseStyle: "Operational.",
  weakRetrievalMode: "support" as const,
  weakRetrievalReply: "Fallback",
};

describe("executeChatTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    embedTextsMock.mockResolvedValue([new Array(1536).fill(0.1)]);
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        title: "Getting Started",
        chunk_text: "Connect first, then set up your wallet.",
        metadata: {
          source_path: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          section_heading: "Connect to the app first",
          source_type: "playbook",
        },
        rank: 0.9,
        keyword_rank: 0.7,
        semantic_rank: 0.92,
      },
    ] as any);
  });

  it("returns a structured error for unknown tool names", async () => {
    const result = await executeChatTool({
      toolName: "unknown_tool",
      rawArguments: "{}",
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      code: "unknown_tool",
      error: "Unknown tool: unknown_tool",
    });
  });

  it("clamps and executes the knowledge-base tool with server-side route defaults", async () => {
    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: JSON.stringify({
        query: "   how do i get started   ",
        limit: 99,
        audience: ["ops"],
      }),
      routeProfile,
    });

    expect(embedTextsMock).toHaveBeenCalledWith(["how do i get started"]);
    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: "how do i get started",
        audience: routeProfile.audience,
        domainTags: routeProfile.domainTags,
        freshnessDays: routeProfile.freshnessDays,
        limit: 5,
      }),
    );

    expect(JSON.parse(result.content)).toEqual(
      expect.objectContaining({
        ok: true,
        normalizedQuery: "how do i get started",
        profileId: "lobby_support",
        appliedAudience: ["support"],
        appliedDomainTags: ["onboarding", "wallet", "quests"],
        results: [
          expect.objectContaining({
            title: "Getting Started",
            sourcePath: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          }),
        ],
      }),
    );
  });

  it("returns a structured error for malformed JSON arguments", async () => {
    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: "{bad json",
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      code: "malformed_arguments",
      error: "Tool arguments are not valid JSON.",
    });
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it("returns a structured error for empty queries without calling embeddings", async () => {
    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: JSON.stringify({ query: "   " }),
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      code: "empty_query",
      error: "A non-empty query is required.",
    });
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it("returns a structured error when the query exceeds the length cap", async () => {
    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: JSON.stringify({ query: "a".repeat(501) }),
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      code: "query_too_long",
      error: "Query must be at most 500 characters.",
    });
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it("returns embedding_failed when embeddings return no vectors", async () => {
    embedTextsMock.mockResolvedValue([]);

    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: JSON.stringify({ query: "how do i get started" }),
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      code: "embedding_failed",
      error: "Embedding generation returned no vectors.",
    });
  });

  it("marks weak results when retrieval evidence is weak", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "weak-1",
        document_id: "doc-weak",
        title: "Weak result",
        chunk_text: "Thin match.",
        metadata: {
          source_path: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.1,
        keyword_rank: 0.08,
        semantic_rank: 0.09,
      },
    ] as any);

    const result = await executeChatTool({
      toolName: "search_knowledge_base",
      rawArguments: JSON.stringify({ query: "help me start" }),
      routeProfile,
    });

    expect(JSON.parse(result.content)).toEqual(
      expect.objectContaining({
        ok: true,
        weak: true,
      }),
    );
  });
});
