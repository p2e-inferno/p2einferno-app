/**
 * AI Module — OpenRouter Integration
 *
 * Platform-wide AI client for text completion, vision, and chat.
 * Uses OpenRouter's unified API to support multiple models.
 *
 * @example
 *   import { chatCompletion } from "@/lib/ai";
 *   const result = await chatCompletion({ messages: [...] });
 */

export { chatCompletion } from "./client";
export type {
  AIConversationMessage,
  AIRequestOptions,
  AIResult,
  AIResponse,
  AIError,
  AIToolCall,
  AIToolCallsResponse,
  AIToolChoice,
  AIToolDefinition,
  AIToolResultMessage,
  AIAssistantToolCallMessage,
  ChatMessage,
  MessageContent,
  TextContent,
  ImageUrlContent,
  VideoUrlContent,
} from "./types";
