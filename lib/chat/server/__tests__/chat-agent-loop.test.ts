jest.mock("@/lib/ai/client", () => ({
  chatCompletion: jest.fn(),
}));

jest.mock("@/lib/chat/server/tools/execute-chat-tool", () => ({
  executeChatTool: jest.fn(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { chatCompletion } from "@/lib/ai/client";
import type { KnowledgeAudience } from "@/lib/ai/knowledge/types";
import { runChatAgentLoop } from "@/lib/chat/server/chat-agent-loop";
import { executeChatTool } from "@/lib/chat/server/tools/execute-chat-tool";

const chatCompletionMock = chatCompletion as jest.MockedFunction<
  typeof chatCompletion
>;
const executeChatToolMock = executeChatTool as jest.MockedFunction<
  typeof executeChatTool
>;

const routeProfile = {
  id: "home_onboarding" as const,
  audience: ["support", "sales"] as KnowledgeAudience[],
  domainTags: ["onboarding", "wallet", "quests"],
  retrievalLimit: 6,
  freshnessDays: 21,
  maxTokens: 525,
  assistantObjective: "Help users begin.",
  responseStyle: "Operational.",
  weakRetrievalMode: "support" as const,
  weakRetrievalReply: "Fallback",
};

describe("runChatAgentLoop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a direct final answer when no tool call is needed", async () => {
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Hey, I can help you get oriented.",
      model: "test-model",
    });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "hello" }],
      routeProfile,
    });

    expect(result.content).toContain("help you get oriented");
    expect(result.usedToolCalls).toBe(false);
    expect(result.sources).toEqual([]);
  });

  it("executes tool calls and returns the final grounded answer", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        model: "test-model",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: "how do i get started" }),
            },
          },
        ],
        assistantMessage: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "search_knowledge_base",
                arguments: JSON.stringify({ query: "how do i get started" }),
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content:
          "Start by connecting to the app, then check whether you're using an embedded or external wallet.",
        model: "test-model",
      });
    executeChatToolMock.mockResolvedValue({
      toolName: "search_knowledge_base",
      normalizedQuery: "how do i get started",
      sourceCount: 1,
      content: JSON.stringify({
        ok: true,
        results: [
          {
            title: "Getting Started",
            sourcePath: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
            sectionHeading: "Connect to the app first",
            chunkText: "Connect to the app first, then check your wallet setup.",
            rank: 0.9,
            semanticRank: 0.92,
            keywordRank: 0.7,
          },
        ],
      }),
    });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "I just landed here. What should I do first?" }],
      routeProfile,
    });

    expect(executeChatToolMock).toHaveBeenCalled();
    expect(result.usedToolCalls).toBe(true);
    expect(result.sources).toEqual([
      {
        id: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
        title: "Getting Started",
        href: undefined,
      },
    ]);
    expect(result.content).toContain("connecting to the app");
  });

  it("suppresses duplicate normalized queries inside one request", async () => {
    chatCompletionMock.mockResolvedValue({
      success: true,
      model: "test-model",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "search_knowledge_base",
            arguments: JSON.stringify({ query: "how do i get started" }),
          },
        },
      ],
      assistantMessage: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: "how do i get started" }),
            },
          },
        ],
      },
    } as any);
    executeChatToolMock.mockResolvedValue({
      toolName: "search_knowledge_base",
      normalizedQuery: "how do i get started",
      sourceCount: 0,
      content: JSON.stringify({ ok: true, results: [] }),
    });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "How do I get started?" }],
      routeProfile,
    });

    expect(result.stopReason).toBe("duplicate_query");
    expect(result.usedToolCalls).toBe(true);
  });

  it("supports a second retrieval step before the final answer", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        model: "test-model",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: "wallet setup" }),
            },
          },
        ],
        assistantMessage: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "search_knowledge_base",
                arguments: JSON.stringify({ query: "wallet setup" }),
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        model: "test-model",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_2",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: "mobile wallet in-app browser" }),
            },
          },
        ],
        assistantMessage: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_2",
              type: "function",
              function: {
                name: "search_knowledge_base",
                arguments: JSON.stringify({ query: "mobile wallet in-app browser" }),
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content:
          "On mobile, open P2E Inferno from your wallet's in-app browser so the external wallet can be detected correctly.",
        model: "test-model",
      });
    executeChatToolMock
      .mockResolvedValueOnce({
        toolName: "search_knowledge_base",
        normalizedQuery: "wallet setup",
        sourceCount: 0,
        content: JSON.stringify({ ok: true, weak: true, results: [] }),
      })
      .mockResolvedValueOnce({
        toolName: "search_knowledge_base",
        normalizedQuery: "mobile wallet in-app browser",
        sourceCount: 1,
        content: JSON.stringify({
          ok: true,
          results: [
            {
              title: "Wallets and Access",
              sourcePath:
                "docs/playbooks/WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md",
              sectionHeading: "Mobile rule",
              chunkText: "Use the wallet app's in-app browser on mobile.",
              rank: 0.91,
              semanticRank: 0.93,
              keywordRank: 0.72,
            },
          ],
        }),
      });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "How should I use my wallet on mobile?" }],
      routeProfile,
    });

    expect(executeChatToolMock).toHaveBeenCalledTimes(2);
    expect(result.content).toContain("wallet's in-app browser");
    expect(result.sources).toEqual([
      {
        id: "docs/playbooks/WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md",
        title: "Wallets and Access",
        href: undefined,
      },
    ]);
  });

  it("returns the safe max-iterations fallback when the model keeps calling tools", async () => {
    chatCompletionMock.mockResolvedValue({
      success: true,
      model: "test-model",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_loop",
          type: "function",
          function: {
            name: "search_knowledge_base",
            arguments: JSON.stringify({ query: `query-${Math.random()}` }),
          },
        },
      ],
      assistantMessage: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_loop",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: `query-${Math.random()}` }),
            },
          },
        ],
      },
    } as any);
    executeChatToolMock
      .mockResolvedValueOnce({
        toolName: "search_knowledge_base",
        normalizedQuery: "query-1",
        sourceCount: 0,
        content: JSON.stringify({ ok: true, results: [] }),
      })
      .mockResolvedValueOnce({
        toolName: "search_knowledge_base",
        normalizedQuery: "query-2",
        sourceCount: 0,
        content: JSON.stringify({ ok: true, results: [] }),
      })
      .mockResolvedValueOnce({
        toolName: "search_knowledge_base",
        normalizedQuery: "query-3",
        sourceCount: 0,
        content: JSON.stringify({ ok: true, results: [] }),
      });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "Keep searching" }],
      routeProfile,
    });

    expect(result.stopReason).toBe("max_iterations");
    expect(result.content).toContain("limit of what I could confirm");
  });

  it("marks malformed arguments without losing the stop reason at loop end", async () => {
    chatCompletionMock.mockResolvedValue({
      success: true,
      model: "test-model",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_bad",
          type: "function",
          function: {
            name: "search_knowledge_base",
            arguments: "{bad json",
          },
        },
      ],
      assistantMessage: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_bad",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: "{bad json",
            },
          },
        ],
      },
    } as any);
    executeChatToolMock.mockResolvedValue({
      toolName: "search_knowledge_base",
      sourceCount: 0,
      content: JSON.stringify({
        ok: false,
        code: "malformed_arguments",
        error: "Tool arguments are not valid JSON.",
      }),
    });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "Help" }],
      routeProfile,
    });

    expect(result.stopReason).toBe("malformed_arguments");
  });

  it("continues after a tool execution error and returns the final answer", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        model: "test-model",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "call_err",
            type: "function",
            function: {
              name: "search_knowledge_base",
              arguments: JSON.stringify({ query: "wallet mobile browser" }),
            },
          },
        ],
        assistantMessage: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_err",
              type: "function",
              function: {
                name: "search_knowledge_base",
                arguments: JSON.stringify({ query: "wallet mobile browser" }),
              },
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        content: "I couldn't confirm the exact detail, but on mobile you should use the wallet app's in-app browser.",
        model: "test-model",
      });
    executeChatToolMock.mockResolvedValue({
      toolName: "search_knowledge_base",
      normalizedQuery: "wallet mobile browser",
      sourceCount: 0,
      content: JSON.stringify({
        ok: false,
        code: "tool_execution_failed",
        error: "rpc timeout",
      }),
    });

    const result = await runChatAgentLoop({
      messages: [{ role: "user", content: "How do I use my wallet on mobile?" }],
      routeProfile,
    });

    expect(result.stopReason).toBe("tool_execution_error");
    expect(result.content).toContain("wallet app's in-app browser");
  });

  it("aborts the loop when the overall timeout elapses", async () => {
    jest.useFakeTimers();

    chatCompletionMock.mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              resolve({
                success: false,
                error: "Request was cancelled",
                code: "AI_CANCELLED",
              });
            },
            { once: true },
          );
        }) as any,
    );

    const pending = runChatAgentLoop({
      messages: [{ role: "user", content: "hello" }],
      routeProfile,
      timeoutMs: 5,
    });

    jest.advanceTimersByTime(5);

    await expect(pending).rejects.toThrow(/cancelled/i);
  });
});
