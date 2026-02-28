/**
 * OpenRouter AI Types
 *
 * Typed interfaces for the OpenRouter chat completion API.
 * Supports text, vision (images), and multi-turn chat via one message format.
 */

// --- Message content types (OpenAI-compatible) ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageUrlContent {
  type: "image_url";
  image_url: {
    /** HTTPS URL or data:image/...;base64,... */
    url: string;
  };
}

/** Plain string for text-only, or array for vision/multi-part messages. */
export type MessageContent = string | Array<TextContent | ImageUrlContent>;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
}

// --- Request options ---

export interface AIRequestOptions {
  /** OpenRouter model ID, e.g. "google/gemini-2.0-flash-001". Falls back to env/default. */
  model?: string;
  /** Chat messages (required). */
  messages: ChatMessage[];
  /** Max tokens in response. Omit to use model default. */
  maxTokens?: number;
  /** Temperature 0-2. Omit to use model default. */
  temperature?: number;
  /** Fallback model IDs if primary is unavailable. Uses OpenRouter native fallback routing. */
  fallbacks?: string[];
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

// --- Response types ---

export interface AIResponse {
  success: true;
  /** The text content of the AI response. */
  content: string;
  /** The model that actually responded (may differ from requested if fallback triggered). */
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIError {
  success: false;
  error: string;
  code: string;
}

export type AIResult = AIResponse | AIError;
