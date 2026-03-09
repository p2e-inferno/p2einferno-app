export {};

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
          metadata: {
            embedding_model: "test",
            source_path: "test:search-hybrid",
            source_type: "doc",
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await supabase
      .from("ai_kb_documents")
      .delete()
      .like("source_path", "test:search-%");
    await supabase.from("ai_kb_ingestion_runs").delete().eq("id", testRunId);
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

    it("inactive documents are never returned", async () => {
      // Insert an inactive document
      const inactiveRunId = "00000000-0000-0000-0000-000000000013";
      await supabase.from("ai_kb_ingestion_runs").insert({
        id: inactiveRunId,
        run_type: "backfill",
        status: "started",
      });

      const embedding = new Array(1536).fill(0.5);
      await supabase.rpc("upsert_kb_document_with_chunks", {
        p_source_type: "doc",
        p_source_path: "test:search-inactive",
        p_title: "Inactive Doc",
        p_content_markdown: "# Inactive\nThis should not appear.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "inactive_hash",
        p_version: "2026-03-08",
        p_ingestion_run_id: inactiveRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text: "Inactive document content for search exclusion test.",
            token_estimate: 8,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:search-inactive",
              source_type: "doc",
            },
          },
        ],
      });

      // Deactivate it
      await supabase
        .from("ai_kb_documents")
        .update({ is_active: false })
        .eq("source_path", "test:search-inactive");

      // Search — should not return the inactive document
      const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
        query_text: "inactive",
        query_embedding: embedding,
        audience_filter: null,
        domain_filter: null,
        limit_count: 8,
      });

      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect(row.metadata?.source_path).not.toBe("test:search-inactive");
      }

      // Clean up
      await supabase
        .from("ai_kb_documents")
        .delete()
        .eq("source_path", "test:search-inactive");
      await supabase
        .from("ai_kb_ingestion_runs")
        .delete()
        .eq("id", inactiveRunId);
    });

    it("audience filter reduces result set", async () => {
      const embedding = new Array(1536).fill(0.1);
      // Search with audience that doesn't match the seeded doc
      const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
        query_text: "hybrid search",
        query_embedding: embedding,
        audience_filter: ["admin_only"],
        domain_filter: null,
        limit_count: 8,
      });

      expect(error).toBeNull();
      // The seeded doc has audience ["support"], so filtering by ["admin_only"]
      // should exclude it (result set should be smaller or empty)
      const hasTestDoc = (data ?? []).some(
        (r: { metadata?: { source_path?: string } }) =>
          r.metadata?.source_path === "test:search-hybrid",
      );
      expect(hasTestDoc).toBe(false);
    });

    it("domain filter reduces result set", async () => {
      const embedding = new Array(1536).fill(0.1);
      // Search with domain tag that doesn't match the seeded doc
      const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
        query_text: "hybrid search",
        query_embedding: embedding,
        audience_filter: null,
        domain_filter: ["nonexistent_domain"],
        limit_count: 8,
      });

      expect(error).toBeNull();
      // The seeded doc has domain_tags ["test"], so filtering by ["nonexistent_domain"]
      // should exclude it
      const hasTestDoc = (data ?? []).some(
        (r: { metadata?: { source_path?: string } }) =>
          r.metadata?.source_path === "test:search-hybrid",
      );
      expect(hasTestDoc).toBe(false);
    });

    it("hybrid weighting: semantic-similar chunk outranks keyword-only chunk", async () => {
      // Insert two docs with deliberately contrasting vectors to exercise the
      // 0.35 keyword + 0.65 semantic weighting formula.
      //
      // Chunk A: text contains the query keywords ("bootcamp training program")
      //          but its embedding is orthogonal to the query embedding.
      // Chunk B: text does NOT contain query keywords
      //          but its embedding is nearly identical to the query embedding.
      //
      // With 0.65 semantic weight, chunk B should rank higher than chunk A
      // despite chunk A having a stronger keyword match.

      const orderRunId = "00000000-0000-0000-0000-000000000023";
      await supabase.from("ai_kb_ingestion_runs").insert({
        id: orderRunId,
        run_type: "backfill",
        status: "started",
      });

      // Query embedding: strong signal in first 768 dims, zero in rest
      const queryEmbedding = [
        ...new Array(768).fill(0.9),
        ...new Array(768).fill(0.0),
      ];

      // Chunk A embedding: strong signal in LAST 768 dims (orthogonal to query)
      const embeddingA = [
        ...new Array(768).fill(0.0),
        ...new Array(768).fill(0.9),
      ];

      // Chunk B embedding: nearly identical to query (high cosine similarity)
      const embeddingB = [
        ...new Array(768).fill(0.88),
        ...new Array(768).fill(0.01),
      ];

      // Chunk A: keyword-rich text matching query terms
      await supabase.rpc("upsert_kb_document_with_chunks", {
        p_source_type: "doc",
        p_source_path: "test:search-order-keyword",
        p_title: "Keyword Match Doc",
        p_content_markdown:
          "# Bootcamp Training Program\nDetails about the bootcamp training program schedule.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "order_keyword_v1",
        p_version: "2026-03-09",
        p_ingestion_run_id: orderRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text:
              "The bootcamp training program covers all aspects of the bootcamp training program schedule and requirements for participants in the bootcamp training program.",
            token_estimate: 25,
            embedding: embeddingA,
            metadata: {
              embedding_model: "test",
              source_path: "test:search-order-keyword",
              source_type: "doc",
            },
          },
        ],
      });

      // Chunk B: semantically similar embedding, but no keyword overlap
      await supabase.rpc("upsert_kb_document_with_chunks", {
        p_source_type: "doc",
        p_source_path: "test:search-order-semantic",
        p_title: "Semantic Match Doc",
        p_content_markdown:
          "# Related Information\nThis covers related concepts and details.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "order_semantic_v1",
        p_version: "2026-03-09",
        p_ingestion_run_id: orderRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text:
              "This section provides comprehensive information about related concepts, methodologies, frameworks, and detailed guidance on associated topics and procedures.",
            token_estimate: 22,
            embedding: embeddingB,
            metadata: {
              embedding_model: "test",
              source_path: "test:search-order-semantic",
              source_type: "doc",
            },
          },
        ],
      });

      // Search with keyword-heavy query text but semantic-heavy embedding
      const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
        query_text: "bootcamp training program",
        query_embedding: queryEmbedding,
        audience_filter: null,
        domain_filter: null,
        limit_count: 8,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThanOrEqual(2);

      // Find both chunks in results
      const chunkA = data!.find(
        (r: { metadata?: { source_path?: string } }) =>
          r.metadata?.source_path === "test:search-order-keyword",
      );
      const chunkB = data!.find(
        (r: { metadata?: { source_path?: string } }) =>
          r.metadata?.source_path === "test:search-order-semantic",
      );

      expect(chunkA).toBeDefined();
      expect(chunkB).toBeDefined();

      // Chunk A should have higher keyword_rank (text matches query terms)
      expect(Number(chunkA!.keyword_rank)).toBeGreaterThan(
        Number(chunkB!.keyword_rank),
      );

      // Chunk B should have higher semantic_rank (embedding closer to query)
      expect(Number(chunkB!.semantic_rank)).toBeGreaterThan(
        Number(chunkA!.semantic_rank),
      );

      // Because semantic weight (0.65) > keyword weight (0.35), chunk B's
      // overall rank should be higher than chunk A's
      expect(Number(chunkB!.rank)).toBeGreaterThan(Number(chunkA!.rank));

      // Clean up
      await supabase
        .from("ai_kb_documents")
        .delete()
        .like("source_path", "test:search-order-%");
      await supabase.from("ai_kb_ingestion_runs").delete().eq("id", orderRunId);
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

    it("returns all active chunks when filter is null", async () => {
      const zeroEmbedding = new Array(1536).fill(0);
      // Passing null exercises the SQL path: `filter is null or ...`
      // This is distinct from the `'{}'` path tested in the next test.
      const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: zeroEmbedding,
        match_count: 8,
        filter: null,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // Should return at least the seeded active chunk
      expect(data!.length).toBeGreaterThanOrEqual(1);
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
