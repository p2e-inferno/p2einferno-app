import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual, createHash } from "crypto";
import { getLogger } from "@/lib/utils/logger";
import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";

const log = getLogger("api:ai:kb:search");

function checkSecret(authHeader: string | undefined): boolean {
  const secret = process.env.AI_KB_API_SECRET;
  if (!secret || !authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7);
  // timingSafeEqual requires equal-length buffers; hash both to normalize length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return res.status(405).end();

  if (!checkSecret(req.headers.authorization as string | undefined)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { query, audience, domainTags, limit } = req.body ?? {};

  if (typeof query !== "string" || !query.trim() || query.length > 500) {
    return res
      .status(400)
      .json({ error: "query must be a non-empty string under 500 characters" });
  }

  const start = Date.now();

  try {
    const [embedding] = await embedTexts([query.trim()]);
    if (!embedding) {
      throw new Error("No embedding returned for query");
    }

    const results = await searchKnowledgeBase({
      queryText: query.trim(),
      queryEmbedding: embedding,
      audience: Array.isArray(audience) ? audience : undefined,
      domainTags: Array.isArray(domainTags) ? domainTags : undefined,
      limit: typeof limit === "number" ? Math.min(limit, 20) : 8,
    });

    log.info("kb search served", {
      resultCount: results.length,
      tookMs: Date.now() - start,
    });

    return res.status(200).json({
      results,
      query: query.trim(),
      count: results.length,
      tookMs: Date.now() - start,
    });
  } catch (err) {
    log.error("kb search failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: "internal_error" });
  }
}
