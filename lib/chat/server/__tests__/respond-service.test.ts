jest.mock("@/lib/ai/knowledge/embeddings", () => ({
  embedTexts: jest.fn(),
}));

jest.mock("@/lib/ai/knowledge/retrieval", () => ({
  searchKnowledgeBase: jest.fn(),
}));

jest.mock("@/lib/ai/client", () => ({
  chatCompletion: jest.fn(),
}));

jest.mock("@/lib/chat/server/attachment-content", () => ({
  resolveChatAttachmentsForModel: jest.fn(async (attachments?: unknown[]) => attachments ?? []),
}));

jest.mock("@/lib/chat/server/chat-agent-loop", () => ({
  runChatAgentLoop: jest.fn(),
}));

var warnLog: jest.Mock;

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => {
    warnLog = warnLog || jest.fn();

    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: warnLog,
      error: jest.fn(),
    };
  },
}));

import { chatCompletion } from "@/lib/ai/client";
import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import {
  generateChatResponse,
  validateChatRespondBody,
} from "@/lib/chat/server/respond-service";
import { resolveChatAttachmentsForModel } from "@/lib/chat/server/attachment-content";
import { runChatAgentLoop } from "@/lib/chat/server/chat-agent-loop";

const embedTextsMock = embedTexts as jest.MockedFunction<typeof embedTexts>;
const searchKnowledgeBaseMock = searchKnowledgeBase as jest.MockedFunction<
  typeof searchKnowledgeBase
>;
const chatCompletionMock = chatCompletion as jest.MockedFunction<
  typeof chatCompletion
>;
const resolveChatAttachmentsForModelMock =
  resolveChatAttachmentsForModel as jest.MockedFunction<
    typeof resolveChatAttachmentsForModel
  >;
const runChatAgentLoopMock = runChatAgentLoop as jest.MockedFunction<
  typeof runChatAgentLoop
>;

describe("generateChatResponse", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://test.p2einferno.com";
    delete process.env.CHAT_TOOL_AGENT_ENABLED;
    embedTextsMock.mockResolvedValue([new Array(1536).fill(0.1)]);
    runChatAgentLoopMock.mockResolvedValue({
      content: "Agent reply",
      sources: [],
      usedToolCalls: false,
      iterations: 1,
      stopReason: "final_answer",
    });
    chatCompletionMock.mockImplementation(async (options) => {
      const systemMessage = options.messages[0]?.content;
      if (
        typeof systemMessage === "string" &&
        systemMessage.includes("You route chat requests")
      ) {
        return {
          success: true,
          content: JSON.stringify({
            route: "grounded_kb",
            retrievalQuery: "default retrieval query",
            rationale: "Default test router decision.",
          }),
          model: "router-model",
        };
      }

      return {
        success: true,
        content: "Default assistant reply",
        model: "test-model",
      };
    });
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  });

  it("uses the sales profile for homepage requests", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        title: "Business Summary",
        chunk_text: "P2E Inferno is a gamified educational platform.",
        metadata: {
          source_path: "docs/strategy/BUSINESS_SUMMARY.md",
          source_type: "doc",
        },
        rank: 0.8,
        keyword_rank: 0.6,
        semantic_rank: 0.9,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content:
          JSON.stringify({
            route: "grounded_kb",
            retrievalQuery: "What is P2E Inferno?",
            rationale: "Needs grounded product information.",
          }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "P2E Inferno helps people learn frontier tech through quests and bootcamps.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_1",
        message: "What is P2E Inferno?",
        messages: [
          { role: "assistant", content: "Welcome" },
          { role: "user", content: "What is P2E Inferno?" },
        ],
        route: {
          pathname: "/",
          routeKey: "home",
          behaviorKey: "general",
          segment: null,
        },
      },
      isAuthenticated: false,
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: ["sales"],
        domainTags: expect.arrayContaining(["business", "marketing"]),
      }),
    );
    expect(chatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("You route chat requests"),
          }),
        ]),
      }),
    );
    expect(chatCompletionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Current pathname: /"),
          }),
        ]),
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "home_sales",
        resultCount: 1,
      }),
    );
    expect(response.sources).toEqual([
      {
        id: "docs/strategy/BUSINESS_SUMMARY.md",
        title: "Business Summary",
        href: undefined,
      },
    ]);
  });

  it("uses the tool-agent path behind the feature flag for homepage onboarding", async () => {
    process.env.CHAT_TOOL_AGENT_ENABLED = "true";
    runChatAgentLoopMock.mockResolvedValue({
      content:
        "Start by connecting to the app, then check whether you're using an embedded or external wallet.",
      sources: [
        {
          id: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          title: "Getting Started",
          href: undefined,
        },
      ],
      usedToolCalls: true,
      iterations: 2,
      stopReason: "final_answer",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_agent_home",
        message: "I just landed here. What should I do first?",
        messages: [{ role: "user", content: "I just landed here. What should I do first?" }],
        route: {
          pathname: "/",
          routeKey: "home",
          behaviorKey: "general",
          segment: null,
        },
      },
      isAuthenticated: true,
    });

    expect(runChatAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routeProfile: expect.objectContaining({
          id: "home_onboarding",
          domainTags: expect.arrayContaining(["onboarding", "wallet"]),
        }),
      }),
    );
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "home_onboarding",
        resultCount: 1,
      }),
    );
    expect(response.message.content).toContain("connecting to the app");
  });

  it("keeps homepage wallet-type questions on the onboarding profile in the agent path", async () => {
    process.env.CHAT_TOOL_AGENT_ENABLED = "true";
    runChatAgentLoopMock.mockResolvedValue({
      content:
        "To check your wallet type, look at whether you connected with email/social first or linked an external wallet.",
      sources: [
        {
          id: "docs/playbooks/WALLETS_MEMBERSHIP_AND_ACCESS_PLAYBOOK.md",
          title: "Wallets, Membership, and Access Playbook",
          href: undefined,
        },
      ],
      usedToolCalls: true,
      iterations: 2,
      stopReason: "final_answer",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_agent_wallet_type",
        message:
          "how do i check my wallet or determine if im using embedded or external wallet and whats the difference",
        messages: [
          {
            role: "assistant",
            content:
              "To get started with P2E Inferno, follow these steps: connect to the app first...",
          },
          {
            role: "user",
            content:
              "how do i check my wallet or determine if im using embedded or external wallet and whats the difference",
          },
        ],
        route: {
          pathname: "/",
          routeKey: "home",
          behaviorKey: "general",
          segment: null,
        },
      },
      isAuthenticated: true,
    });

    expect(runChatAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routeProfile: expect.objectContaining({
          id: "home_onboarding",
          domainTags: expect.arrayContaining(["wallet", "onboarding"]),
          audience: ["support", "sales"],
        }),
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "home_onboarding",
        resultCount: 1,
      }),
    );
    expect(response.message.content).toContain("wallet type");
  });

  it("falls back to the legacy router path when tool-agent returns no tool calls for a grounding-preferred request", async () => {
    process.env.CHAT_TOOL_AGENT_ENABLED = "true";
    runChatAgentLoopMock.mockResolvedValue({
      content: "Generic answer",
      sources: [],
      usedToolCalls: false,
      iterations: 1,
      stopReason: "final_answer",
    });
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        title: "Getting Started",
        chunk_text: "Connect first, then review your wallet setup.",
        metadata: {
          source_path: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.86,
        keyword_rank: 0.63,
        semantic_rank: 0.88,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "I just landed here. What should I do first?",
          rationale: "Needs grounded onboarding guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Connect first, then review your wallet setup.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_agent_fallback",
        message: "I just landed here. What should I do first?",
        messages: [{ role: "user", content: "I just landed here. What should I do first?" }],
        route: {
          pathname: "/",
          routeKey: "home",
          behaviorKey: "general",
          segment: null,
        },
      },
      isAuthenticated: true,
    });

    expect(runChatAgentLoopMock).toHaveBeenCalled();
    expect(chatCompletionMock).toHaveBeenCalled();
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "home_sales",
        resultCount: 1,
      }),
    );
  });

  it("preserves attachment-only requests through the agent path", async () => {
    process.env.CHAT_TOOL_AGENT_ENABLED = "true";
    runChatAgentLoopMock.mockResolvedValue({
      content: "I can see the screenshot and help you from here.",
      sources: [],
      usedToolCalls: false,
      iterations: 1,
      stopReason: "final_answer",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_agent_attachment_only",
        message: "",
        attachments: [
          {
            type: "image",
            name: "screenshot.png",
            size: 128,
            data: "data:image/png;base64,AAAA",
          },
        ],
        messages: [
          {
            role: "user",
            content: "",
            attachments: [
              {
                type: "image",
                name: "screenshot.png",
                size: 128,
                data: "data:image/png;base64,AAAA",
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(runChatAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.any(Array),
          }),
        ]),
      }),
    );
    expect(response.message.content).toContain("see the screenshot");
  });

  it("falls back to the legacy router path when the agent loop throws", async () => {
    process.env.CHAT_TOOL_AGENT_ENABLED = "true";
    runChatAgentLoopMock.mockRejectedValue(new Error("tool loop failed"));
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        title: "Getting Started",
        chunk_text: "Connect first, then review your wallet setup.",
        metadata: {
          source_path: "docs/playbooks/GETTING_STARTED_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.86,
        keyword_rank: 0.63,
        semantic_rank: 0.88,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "I just landed here. What should I do first?",
          rationale: "Needs grounded onboarding guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Connect first, then review your wallet setup.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_agent_throw",
        message: "I just landed here. What should I do first?",
        messages: [{ role: "user", content: "I just landed here. What should I do first?" }],
        route: {
          pathname: "/",
          routeKey: "home",
          behaviorKey: "general",
          segment: null,
        },
      },
      isAuthenticated: true,
    });

    expect(runChatAgentLoopMock).toHaveBeenCalled();
    expect(chatCompletionMock).toHaveBeenCalled();
    expect(response.message.content).toContain("Connect first");
  });

  it("returns a natural greeting reply without forcing weak retrieval fallback", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "chat_only",
          retrievalQuery: "",
          rationale: "Greeting only.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "Hey 👋 I can help you get oriented in the lobby, find quests or bootcamps, or figure out the next useful step.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_greeting",
        message: "hello",
        messages: [{ role: "user", content: "hello" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(searchKnowledgeBaseMock).not.toHaveBeenCalled();
    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toContain("Hey");
    expect(response.message.content).toContain("quests or bootcamps");
    expect(response.message.content).not.toContain("I can't confirm that operational detail");
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "lobby_support",
        resultCount: 0,
      }),
    );
  });

  it("returns a natural thanks reply without retrieval", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "chat_only",
          retrievalQuery: "",
          rationale: "Acknowledgement only.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "You’re welcome. Tell me what you want to do next and I’ll help.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_thanks",
        message: "thanks",
        messages: [{ role: "user", content: "thanks" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toContain("You’re welcome");
  });

  it("expands app-relative routes into absolute markdown links for direct chat replies", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "chat_only",
          retrievalQuery: "",
          rationale: "Direct route-aware reply.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "Open `/lobby/profile`, then visit [Verify Identity](/gooddollar-verification), and if needed continue in /lobby/vendor.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_route_links_direct",
        message: "Where do I go?",
        messages: [{ role: "user", content: "Where do I go?" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(response.message.content).toContain(
      "[`/lobby/profile`](https://test.p2einferno.com/lobby/profile)",
    );
    expect(response.message.content).toContain(
      "[Verify Identity](https://test.p2einferno.com/gooddollar-verification)",
    );
    expect(response.message.content).toContain(
      "[/lobby/vendor](https://test.p2einferno.com/lobby/vendor)",
    );
  });

  it("falls back to grounded retrieval when the router fails on an operational question", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: false,
        error: "AI returned empty response",
        code: "AI_EMPTY_RESPONSE",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "Start with the main lobby checklist, then choose a quest or bootcamp based on your goal.",
        model: "test-model",
      });
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-lobby",
        document_id: "doc-lobby",
        title: "Lobby onboarding",
        chunk_text: "Start with the main lobby checklist, then choose a quest or bootcamp based on your goal.",
        metadata: {
          source_path: "docs/categories/LOBBY_ONBOARDING.md",
          source_type: "doc",
        },
        rank: 0.83,
        keyword_rank: 0.62,
        semantic_rank: 0.85,
      },
    ] as any);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_router_empty",
        message: "I just landed here. What should I do first?",
        messages: [
          { role: "user", content: "I just landed here. What should I do first?" },
        ],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(embedTextsMock).toHaveBeenCalledWith([
      "I just landed here. What should I do first?",
    ]);
    expect(searchKnowledgeBaseMock).toHaveBeenCalled();
    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toContain("main lobby checklist");
    expect(warnLog).toHaveBeenCalledWith(
      "Chat intent routing failed; using fallback route",
      expect.objectContaining({
        pathname: "/lobby",
        profile: "lobby_support",
        code: "AI_EMPTY_RESPONSE",
      }),
    );
  });

  it("falls back to direct chat when the router returns fenced JSON", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content:
          "```json\n{\"route\":\"chat_only\",\"retrievalQuery\":\"\",\"rationale\":\"Greeting\"}\n```",
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Hey there. What are you trying to get done in the lobby?",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_router_fenced",
        message: "hello",
        messages: [{ role: "user", content: "hello" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(searchKnowledgeBaseMock).not.toHaveBeenCalled();
    expect(response.message.content).toContain("Hey there");
  });

  it("uses the safe catch-all support profile for authenticated non-lobby app routes", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-general",
        document_id: "doc-general",
        title: "Navigation Map",
        chunk_text: "General app navigation guidance.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.82,
        keyword_rank: 0.6,
        semantic_rank: 0.84,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "What should I do on this page?",
          rationale: "Needs grounded navigation guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
      success: true,
      content: "General support guidance",
      model: "test-model",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_general",
        message: "What should I do on this page?",
        messages: [{ role: "user", content: "What should I do on this page?" }],
        route: {
          pathname: "/profile/settings?tab=wallet",
          routeKey: "profile:settings",
          segment: "profile",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: ["support"],
        domainTags: expect.arrayContaining(["navigation", "platform"]),
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "general_support" }),
    );
  });

  it("ignores contradictory client hints and resolves vendor support from pathname", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-vendor",
        document_id: "doc-vendor",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "How does vendor renewal work?",
          rationale: "Vendor operational question.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
      success: true,
      content: "Vendor guidance",
      model: "test-model",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_vendor",
        message: "How does vendor renewal work?",
        messages: [{ role: "user", content: "How does vendor renewal work?" }],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: null,
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: ["support"],
        domainTags: expect.arrayContaining(["vendor", "renewal"]),
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "vendor_support" }),
    );
  });

  it("ignores contradictory support hints and keeps homepage requests on the sales profile", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-home",
        document_id: "doc-home",
        title: "Business Summary",
        chunk_text: "High-level product overview.",
        metadata: {
          source_path: "docs/strategy/BUSINESS_SUMMARY.md",
          source_type: "doc",
        },
        rank: 0.84,
        keyword_rank: 0.6,
        semantic_rank: 0.86,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "What can I do here?",
          rationale: "Needs grounded homepage/product guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
      success: true,
      content: "Homepage guidance",
      model: "test-model",
    });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_home_hint",
        message: "What can I do here?",
        messages: [{ role: "user", content: "What can I do here?" }],
        route: {
          pathname: "/",
          routeKey: "home",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: false,
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: ["sales"],
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "home_sales" }),
    );
  });

  it("uses the bootcamp support profile through the full respond path", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-bootcamp",
        document_id: "doc-bootcamp",
        title: "Bootcamp Registration Playbook",
        chunk_text: "Bootcamp payment and enrollment guidance.",
        metadata: {
          source_path:
            "docs/playbooks/BOOTCAMP_AND_COHORT_REGISTRATION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.87,
        keyword_rank: 0.66,
        semantic_rank: 0.89,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "I paid but my cohort isn't showing up.",
          rationale: "Bootcamp enrollment issue needs grounded support.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Bootcamp support guidance",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_bootcamp",
        message: "I paid but my cohort isn't showing up.",
        messages: [
          { role: "user", content: "I paid but my cohort isn't showing up." },
        ],
        route: {
          pathname: "/lobby/bootcamps/123",
          routeKey: "lobby:bootcamps:123",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domainTags: expect.arrayContaining([
          "bootcamp",
          "payments",
          "enrollment",
        ]),
      }),
    );
    expect(chatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 550,
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "bootcamp_support" }),
    );
  });

  it("normalizes malformed pathname variants before profile resolution", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-normalized",
        document_id: "doc-normalized",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Vendor guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_normalized",
        message: "How does vendor renewal work?",
        messages: [{ role: "user", content: "How does vendor renewal work?" }],
        route: {
          pathname: "///lobby//vendor/?foo=bar#section",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Current pathname: /lobby/vendor"),
          }),
        ]),
      }),
    );
  });

  it("returns a model-generated reply even on zero-result weak retrieval", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([]);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_2",
        message: "Why can't I access this quest?",
        messages: [{ role: "user", content: "Why can't I access this quest?" }],
        route: {
          pathname: "/lobby/quests/quest-1",
          routeKey: "lobby:quests:quest-1",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(chatCompletionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("For weak support evidence, give safe next steps"),
          }),
        ]),
      }),
    );
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "quest_support",
        resultCount: 0,
      }),
    );
    expect(response.message.content).toBe("Default assistant reply");
    expect(warnLog).toHaveBeenCalledWith(
      "Using zero-result retrieval fallback for chat response",
      expect.objectContaining({
        profile: "quest_support",
        pathname: "/lobby/quests/quest-1",
      }),
    );
  });

  it("uses a model-generated reply for non-zero but low-confidence retrieval", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-low",
        document_id: "doc-low",
        title: "Navigation Map",
        chunk_text: "Some broad navigation context.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.51,
        keyword_rank: 0.42,
        semantic_rank: 0.58,
      },
    ] as any);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_low",
        message: "Why is my application pending?",
        messages: [{ role: "user", content: "Why is my application pending?" }],
        route: {
          pathname: "/lobby/apply",
          routeKey: "lobby:apply",
          segment: "lobby",
          behaviorKey: "application",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({
        profile: "bootcamp_support",
        resultCount: 1,
      }),
    );
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("treats a top result just below the strong threshold as weak but still calls the model", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-boundary-low",
        document_id: "doc-boundary-low",
        title: "Navigation Map",
        chunk_text: "General guidance.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.699,
        keyword_rank: 0.6,
        semantic_rank: 0.8,
      },
    ] as any);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_boundary_low",
        message: "Where do I go next?",
        messages: [{ role: "user", content: "Where do I go next?" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("treats a top result at the strong threshold as eligible", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-boundary-strong",
        document_id: "doc-boundary-strong",
        title: "Navigation Map",
        chunk_text: "General guidance.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.7,
        keyword_rank: 0.6,
        semantic_rank: 0.7,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Strong enough guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_boundary_strong",
        message: "Where do I go next?",
        messages: [{ role: "user", content: "Where do I go next?" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalled();
  });

  it("does not falsely treat clearly strong complementary top sources as conflicting", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-strong-a",
        document_id: "doc-strong-a",
        title: "Vendor Playbook",
        chunk_text: "Vendor renewal requires following the vendor flow.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.87,
        keyword_rank: 0.61,
        semantic_rank: 0.88,
      },
      {
        chunk_id: "chunk-strong-b",
        document_id: "doc-strong-b",
        title: "Navigation Map",
        chunk_text: "The vendor page is under /lobby/vendor.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.85,
        keyword_rank: 0.58,
        semantic_rank: 0.84,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "How does vendor renewal work and where do I find it?",
          rationale: "Needs grounded vendor guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Strong multi-source answer",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_multi_source",
        message: "How does vendor renewal work and where do I find it?",
        messages: [
          {
            role: "user",
            content: "How does vendor renewal work and where do I find it?",
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalled();
    expect(response.sources).toHaveLength(2);
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "vendor_support" }),
    );
  });

  it("does not falsely fall back on realistic complementary support evidence near the strong threshold", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-support-a",
        document_id: "doc-support-a",
        title: "Quest Troubleshooting Playbook",
        chunk_text: "Quest access can depend on progression status.",
        metadata: {
          source_path: "docs/playbooks/SUPPORT_TROUBLESHOOTING_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.77,
        keyword_rank: 0.59,
        semantic_rank: 0.8,
      },
      {
        chunk_id: "chunk-support-b",
        document_id: "doc-support-b",
        title: "Navigation Map",
        chunk_text: "Users can review quest progress in /lobby/quests.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.75,
        keyword_rank: 0.57,
        semantic_rank: 0.79,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "Why can't I access this quest and where do I check it?",
          rationale: "Needs grounded quest troubleshooting.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Use both progression and navigation guidance",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_support_pair",
        message: "Why can't I access this quest and where do I check it?",
        messages: [
          {
            role: "user",
            content: "Why can't I access this quest and where do I check it?",
          },
        ],
        route: {
          pathname: "/lobby/quests/quest-1",
          routeKey: "lobby:quests:quest-1",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalled();
    expect(response.sources).toHaveLength(2);
    expect(response.retrievalMeta).toEqual(
      expect.objectContaining({ profile: "quest_support" }),
    );
  });

  it("uses a safe fallback for meaningfully conflicting retrieval", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        title: "Vendor Progression Playbook",
        chunk_text: "Renewal is tied to the active wallet context.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.8,
        keyword_rank: 0.61,
        semantic_rank: 0.82,
      },
      {
        chunk_id: "chunk-2",
        document_id: "doc-2",
        title: "Rewards, Renewal, and Pullout Playbook",
        chunk_text: "Pullout and renewal should be explained separately.",
        metadata: {
          source_path: "docs/playbooks/REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.79,
        keyword_rank: 0.6,
        semantic_rank: 0.81,
      },
    ] as any);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_conflict",
        message: "Can I renew from any linked wallet?",
        messages: [
          { role: "user", content: "Can I renew from any linked wallet?" },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("does not fire the conflict gate when both results are at exactly the very-strong threshold (0.82)", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-vs-a",
        document_id: "doc-vs-a",
        title: "Doc A",
        chunk_text: "Guidance from source A.",
        metadata: { source_path: "docs/a.md", source_type: "doc" },
        rank: 0.82,
        keyword_rank: 0.6,
        semantic_rank: 0.82,
      },
      {
        chunk_id: "chunk-vs-b",
        document_id: "doc-vs-b",
        title: "Doc B",
        chunk_text: "Guidance from source B.",
        metadata: { source_path: "docs/b.md", source_type: "doc" },
        rank: 0.82,
        keyword_rank: 0.6,
        semantic_rank: 0.82,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Combined answer from both",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_vs_boundary",
        message: "Tell me about this feature",
        messages: [{ role: "user", content: "Tell me about this feature" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalled();
  });

  it("fires the conflict gate when one result drops just below the very-strong threshold (0.81)", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-below-a",
        document_id: "doc-below-a",
        title: "Doc A",
        chunk_text: "Guidance from source A.",
        metadata: { source_path: "docs/a.md", source_type: "doc" },
        rank: 0.82,
        keyword_rank: 0.6,
        semantic_rank: 0.82,
      },
      {
        chunk_id: "chunk-below-b",
        document_id: "doc-below-b",
        title: "Doc B",
        chunk_text: "Guidance from source B.",
        metadata: { source_path: "docs/b.md", source_type: "doc" },
        rank: 0.81,
        keyword_rank: 0.6,
        semantic_rank: 0.81,
      },
    ] as any);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_below_vs_boundary",
        message: "Tell me about this feature",
        messages: [{ role: "user", content: "Tell me about this feature" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("does not treat results as conflicting when the rank gap exceeds the configured threshold", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-a",
        document_id: "doc-a",
        title: "Vendor Progression Playbook",
        chunk_text: "Renewal is tied to the active wallet context.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.84,
        keyword_rank: 0.61,
        semantic_rank: 0.86,
      },
      {
        chunk_id: "chunk-b",
        document_id: "doc-b",
        title: "Rewards, Renewal, and Pullout Playbook",
        chunk_text: "Pullout and renewal should be explained separately.",
        metadata: {
          source_path: "docs/playbooks/REWARDS_RENEWAL_AND_PULLOUT_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.79,
        keyword_rank: 0.6,
        semantic_rank: 0.82,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Resolved vendor guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_non_conflict",
        message: "Can I renew from any linked wallet?",
        messages: [
          { role: "user", content: "Can I renew from any linked wallet?" },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "dashboard",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalled();
  });

  it("filters weak lower-ranked evidence out of the prompt and sources", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-top",
        document_id: "doc-top",
        title: "Vendor Progression Playbook",
        chunk_text: "Strong vendor guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.86,
        keyword_rank: 0.64,
        semantic_rank: 0.9,
      },
      {
        chunk_id: "chunk-weak-tail",
        document_id: "doc-weak-tail",
        title: "Weak Tail",
        chunk_text: "Weak unrelated evidence.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.54,
        keyword_rank: 0.4,
        semantic_rank: 0.56,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "How does vendor renewal work?",
          rationale: "Needs grounded vendor guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Filtered vendor guidance",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_filtered_tail",
        message: "How does vendor renewal work?",
        messages: [{ role: "user", content: "How does vendor renewal work?" }],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    const request = chatCompletionMock.mock.calls[1]?.[0];
    expect(JSON.stringify(request)).toContain("Strong vendor guidance.");
    expect(JSON.stringify(request)).not.toContain("Weak unrelated evidence.");
    expect(response.sources).toEqual([
      {
        id: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
        title: "Vendor Progression Playbook",
        href: undefined,
      },
    ]);
  });

  it("expands app-relative routes into absolute markdown links for grounded replies", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-grounded-routes",
        document_id: "doc-grounded-routes",
        title: "Navigation Map",
        chunk_text: "Users can continue in /lobby/quests and /lobby/vendor.",
        metadata: {
          source_path: "docs/categories/NAVIGATION_MAP.md",
          source_type: "doc",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.9,
      },
    ] as any);
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "grounded_kb",
          retrievalQuery: "Where should I go next?",
          rationale: "Needs grounded navigation guidance.",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content:
          "Start in /lobby/quests. If the issue is vendor-related, go to `/lobby/vendor`.",
        model: "test-model",
      });

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_route_links_grounded",
        message: "Where should I go next?",
        messages: [{ role: "user", content: "Where should I go next?" }],
        route: {
          pathname: "/lobby",
          routeKey: "lobby",
          behaviorKey: "dashboard",
          segment: "lobby",
        },
      },
      isAuthenticated: true,
    });

    expect(response.message.content).toContain(
      "[/lobby/quests](https://test.p2einferno.com/lobby/quests)",
    );
    expect(response.message.content).toContain(
      "[`/lobby/vendor`](https://test.p2einferno.com/lobby/vendor)",
    );
  });

  it("returns a sales-safe weak retrieval fallback for homepage requests", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([]);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_3",
        message: "How does wallet troubleshooting work?",
        messages: [
          { role: "user", content: "How does wallet troubleshooting work?" },
        ],
        route: {
          pathname: "/",
          routeKey: "home",
          segment: null,
          behaviorKey: "general",
        },
      },
      isAuthenticated: false,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("keeps weak fallback wording owned by the resolved route profile", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([]);

    const response = await generateChatResponse({
      body: {
        conversationId: "chat_vendor_zero",
        message: "What does pullout mean here?",
        messages: [{ role: "user", content: "What does pullout mean here?" }],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledTimes(2);
    expect(chatCompletionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Current pathname: /lobby/vendor"),
          }),
        ]),
      }),
    );
    expect(response.message.content).toBe("Default assistant reply");
  });

  it("accepts attachment-only requests at validation time", () => {
    expect(
      validateChatRespondBody({
        conversationId: "chat_attachment_only",
        message: "",
        attachments: [
          {
            type: "image",
            data: "data:image/png;base64,Zm9v",
            name: "context.png",
            size: 3,
          },
        ],
        messages: [
          {
            role: "user",
            content: "",
            attachments: [
              {
                type: "image",
                data: "data:image/png;base64,Zm9v",
                name: "context.png",
                size: 3,
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      }),
    ).toBeNull();
  });

  it("does not reject long assistant history turns during validation", () => {
    expect(
      validateChatRespondBody({
        conversationId: "chat_long_history",
        message: "follow up",
        messages: [
          {
            role: "assistant",
            content: "A".repeat(2_100),
          },
          {
            role: "user",
            content: "follow up",
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      }),
    ).toBeNull();
  });

  it("rejects oversized attachment payloads on the server", () => {
    const oversizedPayload = "A".repeat(6 * 1024 * 1024);

    expect(
      validateChatRespondBody({
        conversationId: "chat_oversized_attachment",
        message: "",
        attachments: [
          {
            type: "image",
            data: `data:image/png;base64,${oversizedPayload}`,
            name: "large.png",
            size: 6 * 1024 * 1024,
          },
        ],
        messages: [],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      }),
    ).toContain("Image size exceeds");
  });

  it("forwards attachments to the model as image content parts", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-vision",
        document_id: "doc-vision",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "That screenshot looks like the vendor renewal flow.",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_with_attachment",
        message: "What does this screen mean?",
        attachments: [
          {
            type: "image",
            data: "data:image/png;base64,Zm9v",
            name: "vendor.png",
            size: 3,
          },
        ],
        messages: [
          {
            role: "user",
            content: "What does this screen mean?",
            attachments: [
              {
                type: "image",
                data: "data:image/png;base64,Zm9v",
                name: "vendor.png",
                size: 3,
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(chatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "text",
              }),
              expect.objectContaining({
                type: "image_url",
                image_url: { url: "data:image/png;base64,Zm9v" },
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("deduplicates the latest attachment-bearing user turn from history", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-vision-dedupe",
        document_id: "doc-vision-dedupe",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Deduped vendor guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_attachment_dedupe",
        message: "What does this screen mean?",
        attachments: [
          {
            type: "image",
            data: "data:image/png;base64,Zm9v",
            name: "vendor.png",
            size: 3,
          },
        ],
        messages: [
          {
            role: "assistant",
            content: "Welcome",
          },
          {
            role: "user",
            content: "What does this screen mean?",
            attachments: [
              {
                type: "image",
                data: "data:image/png;base64,Zm9v",
                name: "vendor.png",
                size: 3,
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    const request = chatCompletionMock.mock.calls.at(-1)?.[0];
    const userMessages = request?.messages.filter(
      (message) => message.role === "user",
    );

    expect(userMessages).toHaveLength(1);
  });

  it("resolves only the most recent attachment-bearing history turn", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-history-vision",
        document_id: "doc-history-vision",
        title: "History Vision Playbook",
        chunk_text: "Use the latest attachment-bearing turn for follow-ups.",
        metadata: {
          source_path: "docs/playbooks/HISTORY_VISION.md",
          source_type: "playbook",
        },
        rank: 0.81,
        keyword_rank: 0.6,
        semantic_rank: 0.84,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Follow-up guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_history_attachment_followup",
        message: "What should I do next?",
        messages: [
          {
            role: "user",
            content: "First screenshot",
            attachments: [
              {
                type: "image",
                data: "data:image/png;base64,Zmlyc3Q=",
                name: "first.png",
                size: 5,
              },
            ],
          },
          {
            role: "assistant",
            content: "Thanks",
          },
          {
            role: "user",
            content: "Second screenshot",
            attachments: [
              {
                type: "image",
                data: "data:image/png;base64,c2Vjb25k",
                name: "second.png",
                size: 6,
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    expect(resolveChatAttachmentsForModelMock).toHaveBeenCalledWith(
      [
        {
          type: "image",
          data: "data:image/png;base64,c2Vjb25k",
          name: "second.png",
          size: 6,
        },
      ],
      undefined,
    );
    expect(resolveChatAttachmentsForModelMock).not.toHaveBeenCalledWith(
      [
        {
          type: "image",
          data: "data:image/png;base64,Zmlyc3Q=",
          name: "first.png",
          size: 5,
        },
      ],
      undefined,
    );
  });

  it("threads the attachment owner identity into router history resolution", async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          route: "chat_only",
          retrievalQuery: "",
          rationale: "Direct chat",
        }),
        model: "router-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Router follow-up answer",
        model: "test-model",
      });

    await generateChatResponse({
      body: {
        conversationId: "chat_router_history_attachment",
        message: "What next?",
        messages: [
          {
            role: "user",
            content: "See this screenshot",
            attachments: [
              {
                type: "image",
                data: "https://app.example.com/api/chat/attachments/upload/file?pathname=chat-attachments%2Ftest.png",
                name: "test.png",
                size: 10,
              },
            ],
          },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
      attachmentOwnerIdentityKey: "anon-session:test",
    });

    expect(resolveChatAttachmentsForModelMock).toHaveBeenCalledWith(
      [
        {
          type: "image",
          data: "https://app.example.com/api/chat/attachments/upload/file?pathname=chat-attachments%2Ftest.png",
          name: "test.png",
          size: 10,
        },
      ],
      "anon-session:test",
    );
  });

  it("drops the oldest history first when the recent context exceeds the budget", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-budget",
        document_id: "doc-budget",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Budgeted vendor guidance",
      model: "test-model",
    });

    await generateChatResponse({
      body: {
        conversationId: "chat_history_budget",
        message: "latest question",
        messages: [
          { role: "assistant", content: `OLDEST_MARKER_${"a".repeat(4000)}` },
          { role: "user", content: `OLDER_MARKER_${"b".repeat(4000)}` },
          { role: "assistant", content: `${"c".repeat(4000)}_RECENT_MARKER` },
          { role: "user", content: `${"d".repeat(4000)}_NEWER_MARKER` },
          { role: "assistant", content: "right before latest" },
          { role: "user", content: "latest question" },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    const request = chatCompletionMock.mock.calls.at(-1)?.[0];
    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain("OLDEST_MARKER");
    expect(serialized).not.toContain("OLDER_MARKER");
    expect(serialized).toContain("RECENT_MARKER");
    expect(serialized).toContain("NEWER_MARKER");
    expect(serialized).toContain("right before latest");
  });

  it("keeps the tail of oversized history messages", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        chunk_id: "chunk-tail",
        document_id: "doc-tail",
        title: "Vendor Progression Playbook",
        chunk_text: "Vendor progression and renewal guidance.",
        metadata: {
          source_path: "docs/playbooks/VENDOR_PROGRESSION_PLAYBOOK.md",
          source_type: "playbook",
        },
        rank: 0.88,
        keyword_rank: 0.64,
        semantic_rank: 0.91,
      },
    ] as any);
    chatCompletionMock.mockResolvedValue({
      success: true,
      content: "Tail-preserved guidance",
      model: "test-model",
    });

    const longAssistantMessage = `UNIQUE_HEAD_START_${"x".repeat(4200)}_IMPORTANT_TAIL`;

    await generateChatResponse({
      body: {
        conversationId: "chat_tail_history",
        message: "latest question",
        messages: [
          { role: "assistant", content: longAssistantMessage },
          { role: "user", content: "latest question" },
        ],
        route: {
          pathname: "/lobby/vendor",
          routeKey: "lobby:vendor",
          segment: "lobby",
          behaviorKey: "general",
        },
      },
      isAuthenticated: true,
    });

    const request = chatCompletionMock.mock.calls.at(-1)?.[0];
    const serialized = JSON.stringify(request);

    expect(serialized).toContain("IMPORTANT_TAIL");
    expect(serialized).not.toContain("UNIQUE_HEAD_START");
  });
});
