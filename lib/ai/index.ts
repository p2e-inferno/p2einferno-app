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
  AIRequestOptions,
  AIResult,
  AIResponse,
  AIError,
  ChatMessage,
  MessageContent,
  TextContent,
  ImageUrlContent,
} from "./types";
