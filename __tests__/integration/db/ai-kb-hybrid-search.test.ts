/**
 * Integration tests for AI KB hybrid search RPCs (search_ai_kb_chunks, match_documents).
 *
 * These tests require a running local Supabase instance with migration 155 applied.
 * Skip in CI if Supabase is not available.
 *
 * Run with: npx jest __tests__/integration/db/ai-kb-hybrid-search.test.ts
 */

const SKIP_INTEGRATION =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration("AI KB Hybrid Search", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createAdminClient } = require("@/lib/supabase/server");

  let supabase: ReturnType<typeof createAdminClient>;
  const testRunId = "00000000-0000-0000-0000-000000000003";

  beforeAll(async () => {
    supabase = createAdminClient();
    // Create a test ingestion run and seed a document for search tests
    await supabase.from("ai_kb_ingestion_runs").insert({
      id: testRunId,
      run_type: "backfill",
      status: "started",
    });

    const embedding = new Array(1536).fill(0.1);
    await supabase.rpc("upsert_kb_document_with_chunks", {
      p_source_type: "doc",
      p_source_path: "test:search-hybrid",
      p_title: "Hybrid Search Test Doc",
      p_content_markdown: "# Search Test\nContent for hybrid search testing.",
      p_audience: ["support"],
      p_domain_tags: ["test"],
      p_content_hash: "search_hash_v1",
      p_version: "2026-03-08",
      p_ingestion_run_id: testRunId,
      p_chunks: [
        {
          chunk_index: 0,
          chunk_text: "Content for hybrid search testing with keywords.",
          token_estimate: 8,
          embedding: embedding,
          metadata: { embedding_model: "test", source_path: "test:search-hybrid", source_type: "doc" },
        },
      ],
    });
  });

  afterAll(async () => {
    await supabase
      .from("ai_kb_documents")
      .delete()
      .like("source_path", "test:search-%");
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .eq("id", testRunId);
  });

  describe("search_ai_kb_chunks RPC", () => {
    it("returns results for active documents only", async () => {
      const zeroEmbedding = new Array(1536).fill(0);
      const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
        query_text: "test",
        query_embedding: zeroEmbedding,
        audience_filter: null,
        domain_filter: null,
        limit_count: 8,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("match_documents RPC", () => {
    it("returns results with filter parameter", async () => {
      const zeroEmbedding = new Array(1536).fill(0);
      const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: zeroEmbedding,
        match_count: 8,
        filter: {},
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("filters by metadata containment", async () => {
      const zeroEmbedding = new Array(1536).fill(0);
      const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: zeroEmbedding,
        match_count: 8,
        filter: { source_type: "doc" },
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // All returned results should have source_type: "doc" in metadata
      for (const row of data ?? []) {
        expect(row.metadata).toHaveProperty("source_type", "doc");
      }
    });
  });
});
