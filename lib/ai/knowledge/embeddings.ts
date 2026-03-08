// /lib/ai/knowledge/embeddings.ts
// Server-only — never import from client components.

import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ai:kb:embeddings");
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_TIMEOUT_MS = 30_000;

/**
 * Returns the resolved embedding model name.
 * build.ts must call this and include the returned value as `embedding_model`
 * in every chunk's metadata JSONB before calling the upsert RPC.
 */
export function getEmbeddingModel(): string {
  return process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export async function getEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const model = process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://p2einferno.com",
        "X-Title": "P2E Inferno",
      },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      log.error("embeddings request failed", { status: response.status, body: body.slice(0, 200) });
      throw new Error(`Embeddings API error: ${response.status}`);
    }

    const data = await response.json();
    // OpenRouter returns data sorted by index
    return (data.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Embeddings request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Embeds texts in batches of EMBEDDING_BATCH_SIZE with single retry on failure. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    try {
      const embeddings = await getEmbeddingBatch(batch);
      results.push(...embeddings);
    } catch (err) {
      log.warn("embeddings batch failed, retrying once", { batchStart: i });
      await new Promise((r) => setTimeout(r, 1_000));
      const embeddings = await getEmbeddingBatch(batch); // throws on second failure
      results.push(...embeddings);
    }
  }
  return results;
}
