/**
 * OpenRouter AI Client
 *
 * Lightweight fetch-based client for OpenRouter's chat completion API.
 * Server-side only — do NOT import from client components.
 */

import { getLogger } from "@/lib/utils/logger";
import type { AIRequestOptions, AIResult } from "./types";

const log = getLogger("ai:client");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL_FALLBACK = "google/gemini-2.0-flash-001";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 15_000;

function summarizeMessageContent(content: unknown) {
  if (typeof content === "string") {
    return {
      kind: "text",
      length: content.length,
      preview: truncatePreview(content, 160),
    };
  }

  if (!Array.isArray(content)) {
    return {
      kind: typeof content,
      length: 0,
      preview: "",
    };
  }

  const textParts = content.filter(
    (part) =>
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text",
  ) as Array<{ text?: unknown }>;
  const multimediaCount = content.filter(
    (part) =>
      part &&
      typeof part === "object" &&
      ((part as { type?: unknown }).type === "image_url" || (part as { type?: unknown }).type === "video_url" || (part as { type?: unknown }).type === "media_url"),
  ).length;
  const text = textParts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return {
    kind: "multi_part",
    partCount: content.length,
    multimediaCount,
    textLength: text.length,
    preview: truncatePreview(text, 160),
  };
}

function extractTextFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string"
        ? candidate.text
        : "";
    })
    .join("")
    .trim();

  return text || null;
}

function truncatePreview(value: string, maxLen = 200): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function sanitizeProviderPayload(value: string): {
  kind: "json" | "text";
  preview: string;
} {
  try {
    const parsed = JSON.parse(value);
    const redactKeys = new Set([
      "messages",
      "prompt",
      "input",
      "image_url",
      "url",
      "content",
      "text",
    ]);
    const redact = (node: unknown): unknown => {
      if (!node || typeof node !== "object") return node;
      if (Array.isArray(node)) return node.map(redact);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (redactKeys.has(k)) {
          out[k] = "[redacted]";
        } else {
          out[k] = redact(v);
        }
      }
      return out;
    };

    const sanitized = redact(parsed);
    return { kind: "json", preview: truncatePreview(JSON.stringify(sanitized)) };
  } catch {
    return { kind: "text", preview: truncatePreview(value) };
  }
}

/**
 * Send a chat completion request to OpenRouter.
 *
 * Works for text, vision (images), and multi-turn chat —
 * the message format handles all three.
 *
 * @example Text completion
 * ```ts
 * const result = await chatCompletion({
 *   model: "anthropic/claude-sonnet-4",
 *   messages: [{ role: "user", content: "Summarize this text..." }],
 * });
 * ```
 *
 * @example Vision (screenshot verification)
 * ```ts
 * const result = await chatCompletion({
 *   model: "google/gemini-2.0-flash-001",
 *   messages: [{
 *     role: "user",
 *     content: [
 *       { type: "text", text: "Does this screenshot show...?" },
 *       { type: "image_url", image_url: { url: screenshotUrl } },
 *     ],
 *   }],
 * });
 * ```
 */
export async function chatCompletion(
  options: AIRequestOptions,
): Promise<AIResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model =
    options.model || process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_MODEL_FALLBACK;

  log.debug("AI request", {
    model,
    messageCount: options.messages.length,
    hasFallbacks: Boolean(options.fallbacks?.length),
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    responseFormat: options.responseFormat?.type ?? null,
    messages: options.messages.map((message, index) => ({
      index,
      role: message.role,
      content: summarizeMessageContent(message.content),
    })),
  });

  try {
    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
    };

    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }
    if (options.thinkingLevel) {
      body.thinking_level = options.thinkingLevel;
    }
    if (options.fallbacks?.length) {
      body.route = "fallback";
      body.models = [model, ...options.fallbacks];
    }

    const timeoutMs = (() => {
      const raw = process.env.OPENROUTER_TIMEOUT_MS;
      const parsed =
        typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : DEFAULT_OPENROUTER_TIMEOUT_MS;
    })();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const externalSignal = options.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "https://p2einferno.com",
        "X-Title": "P2E Inferno",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    });

    log.debug("AI response status", { status: response.status, model });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      const sanitized = sanitizeProviderPayload(errorBody);
      log.error("OpenRouter API error", {
        status: response.status,
        model,
        bodyKind: sanitized.kind,
        bodyPreview: sanitized.preview,
      });
      return {
        success: false,
        error: `OpenRouter API error: ${response.status}`,
        code: "AI_API_ERROR",
      };
    }

    const data = await response.json();

    const rawContent = data?.choices?.[0]?.message?.content;
    const content = extractTextFromContent(rawContent);
    if (!content) {
      log.warn("Empty AI response", {
        model,
        contentType: Array.isArray(rawContent) ? "array" : typeof rawContent,
        hasChoices: Array.isArray(data?.choices),
        rawContentPreview:
          typeof rawContent === "string"
            ? truncatePreview(rawContent, 160)
            : Array.isArray(rawContent)
              ? truncatePreview(JSON.stringify(rawContent), 160)
              : "",
      });
      if (options.fallbacks && options.fallbacks.length > 0) {
        const nextModel = options.fallbacks[0];
        const remainingFallbacks = options.fallbacks.slice(1);
        log.warn("Manual retry triggered due to empty response", {
          failedModel: model,
          nextModel,
        });
        return chatCompletion({
          ...options,
          model: nextModel,
          fallbacks: remainingFallbacks,
        });
      }

      return {
        success: false,
        error: "AI returned empty response",
        code: "AI_EMPTY_RESPONSE",
      };
    }

    const actualModel = data?.model || model;
    const usage = data?.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined;

    log.info("AI response received", {
      model: actualModel,
      contentLength: content.length,
      contentPreview: truncatePreview(content, 200),
      usage,
    });

    return {
      success: true,
      content,
      model: actualModel,
      usage,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Request was cancelled",
        code:
          typeof options.signal !== "undefined" && options.signal?.aborted
            ? "AI_CANCELLED"
            : "AI_TIMEOUT",
      };
    }

    const message = error instanceof Error ? error.message : "Unknown AI error";
    log.error("AI request failed", { message, model });
    return {
      success: false,
      error: message,
      code: "AI_REQUEST_FAILED",
    };
  }
}
