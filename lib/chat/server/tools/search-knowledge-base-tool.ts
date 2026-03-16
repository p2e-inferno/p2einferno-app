import type { AIToolDefinition } from "@/lib/ai";

export const SEARCH_KNOWLEDGE_BASE_TOOL_NAME = "search_knowledge_base";

export const searchKnowledgeBaseToolDefinition: AIToolDefinition = {
  type: "function",
  function: {
    name: SEARCH_KNOWLEDGE_BASE_TOOL_NAME,
    description:
      "Search the internal P2E Inferno knowledge base for grounded product guidance, onboarding steps, navigation help, wallet guidance, quest guidance, bootcamp guidance, vendor guidance, eligibility details, and other app-specific procedures. Use this before giving app-specific factual or procedural answers. Do not use it for plain greetings, thanks, acknowledgements, or lightweight social turns.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "A short search query describing the product question, user goal, or issue that needs grounded guidance.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description:
            "Optional number of results to retrieve. Keep it small. Defaults to 4.",
        },
      },
      required: ["query"],
    },
  },
};
