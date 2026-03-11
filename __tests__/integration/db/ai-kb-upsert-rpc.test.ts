export {};

/**
 * Integration tests for the upsert_kb_document_with_chunks RPC.
 *
 * These tests require a running local Supabase instance with migration 155 applied.
 * Skip in CI if Supabase is not available.
 *
 * Run with: npx jest __tests__/integration/db/ai-kb-upsert-rpc.test.ts
 */

const SKIP_INTEGRATION =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration("upsert_kb_document_with_chunks RPC", () => {
  const { createAdminClient } = require("@/lib/supabase/server");

  let supabase: ReturnType<typeof createAdminClient>;
  const testRunId = "00000000-0000-0000-0000-000000000002";

  beforeAll(async () => {
    supabase = createAdminClient();
    // Create a test ingestion run
    await supabase.from("ai_kb_ingestion_runs").insert({
      id: testRunId,
      run_type: "backfill",
      status: "started",
    });
  });

  const testRunId2 = "00000000-0000-0000-0000-000000000012";

  afterAll(async () => {
    await supabase
      .from("ai_kb_documents")
      .delete()
      .like("source_path", "test:upsert-%");
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .in("id", [testRunId, testRunId2]);
  });

  it("inserts a new document with chunks", async () => {
    const embedding = new Array(1536).fill(0.1);
    const { data, error } = await supabase.rpc(
      "upsert_kb_document_with_chunks",
      {
        p_source_type: "doc",
        p_source_path: "test:upsert-atomicity",
        p_title: "Upsert Atomicity Test",
        p_content_markdown: "# Test\nThis is test content.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "upsert_hash_v1",
        p_version: "2026-03-08",
        p_ingestion_run_id: testRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text: "This is test content chunk one.",
            token_estimate: 7,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-atomicity",
              source_type: "doc",
            },
          },
          {
            chunk_index: 1,
            chunk_text: "This is test content chunk two.",
            token_estimate: 7,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-atomicity",
              source_type: "doc",
            },
          },
          {
            chunk_index: 2,
            chunk_text: "This is test content chunk three.",
            token_estimate: 7,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-atomicity",
              source_type: "doc",
            },
          },
        ],
      },
    );

    expect(error).toBeNull();
    const result = data?.[0];
    expect(result).toBeDefined();
    expect(result.was_updated).toBe(true);
    expect(result.chunks_written).toBe(3);

    // Verify chunks exist
    const { data: chunks } = await supabase
      .from("ai_kb_chunks")
      .select("*")
      .eq("document_id", result.document_id);
    expect(chunks).toHaveLength(3);
  });

  it("supersedes document when content_hash changes", async () => {
    const embedding = new Array(1536).fill(0.2);
    const { data, error } = await supabase.rpc(
      "upsert_kb_document_with_chunks",
      {
        p_source_type: "doc",
        p_source_path: "test:upsert-atomicity",
        p_title: "Upsert Atomicity Test Updated",
        p_content_markdown: "# Updated\nNew content.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "upsert_hash_v2",
        p_version: "2026-03-08",
        p_ingestion_run_id: testRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text: "New content chunk one.",
            token_estimate: 5,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-atomicity",
              source_type: "doc",
            },
          },
          {
            chunk_index: 1,
            chunk_text: "New content chunk two.",
            token_estimate: 5,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-atomicity",
              source_type: "doc",
            },
          },
        ],
      },
    );

    expect(error).toBeNull();
    const result = data?.[0];
    expect(result.was_updated).toBe(true);
    expect(result.chunks_written).toBe(2);

    // Verify old chunks are gone and only new exist
    const { data: chunks } = await supabase
      .from("ai_kb_chunks")
      .select("*")
      .eq("document_id", result.document_id);
    expect(chunks).toHaveLength(2);
  });

  it("skips upsert when content_hash is unchanged", async () => {
    const { data, error } = await supabase.rpc(
      "upsert_kb_document_with_chunks",
      {
        p_source_type: "doc",
        p_source_path: "test:upsert-atomicity",
        p_title: "Upsert Atomicity Test Updated",
        p_content_markdown: "# Updated\nNew content.",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "upsert_hash_v2",
        p_version: "2026-03-08",
        p_ingestion_run_id: testRunId,
        p_chunks: [],
      },
    );

    expect(error).toBeNull();
    const result = data?.[0];
    expect(result.was_updated).toBe(false);
    expect(result.chunks_written).toBe(0);
  });

  it("tracks ingestion_run_id across two runs and cascade-deletes correctly", async () => {
    // Create a second ingestion run
    await supabase.from("ai_kb_ingestion_runs").insert({
      id: testRunId2,
      run_type: "incremental",
      status: "started",
    });

    const embedding = new Array(1536).fill(0.3);

    // Upsert doc A with run 1
    const { data: dataA } = await supabase.rpc(
      "upsert_kb_document_with_chunks",
      {
        p_source_type: "doc",
        p_source_path: "test:upsert-run-tracking-a",
        p_title: "Run Tracking A",
        p_content_markdown: "# Doc A",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "run_track_a_v1",
        p_version: "2026-03-08",
        p_ingestion_run_id: testRunId,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text: "Doc A content for run tracking test case.",
            token_estimate: 8,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-run-tracking-a",
              source_type: "doc",
            },
          },
        ],
      },
    );
    const docAId = dataA?.[0]?.document_id;

    // Upsert doc B with run 2
    const { data: dataB } = await supabase.rpc(
      "upsert_kb_document_with_chunks",
      {
        p_source_type: "doc",
        p_source_path: "test:upsert-run-tracking-b",
        p_title: "Run Tracking B",
        p_content_markdown: "# Doc B",
        p_audience: ["support"],
        p_domain_tags: ["test"],
        p_content_hash: "run_track_b_v1",
        p_version: "2026-03-08",
        p_ingestion_run_id: testRunId2,
        p_chunks: [
          {
            chunk_index: 0,
            chunk_text: "Doc B content for run tracking test case.",
            token_estimate: 8,
            embedding: embedding,
            metadata: {
              embedding_model: "test",
              source_path: "test:upsert-run-tracking-b",
              source_type: "doc",
            },
          },
        ],
      },
    );
    const docBId = dataB?.[0]?.document_id;

    // Verify each document has correct ingestion_run_id
    const { data: docA } = await supabase
      .from("ai_kb_documents")
      .select("ingestion_run_id")
      .eq("id", docAId)
      .single();
    expect(docA?.ingestion_run_id).toBe(testRunId);

    const { data: docB } = await supabase
      .from("ai_kb_documents")
      .select("ingestion_run_id")
      .eq("id", docBId)
      .single();
    expect(docB?.ingestion_run_id).toBe(testRunId2);

    // Delete documents for run 1 — verify only doc A removed, chunks cascade-deleted
    await supabase
      .from("ai_kb_documents")
      .delete()
      .eq("ingestion_run_id", testRunId)
      .like("source_path", "test:upsert-run-tracking-%");

    const { data: docAAfter } = await supabase
      .from("ai_kb_documents")
      .select("id")
      .eq("id", docAId)
      .maybeSingle();
    expect(docAAfter).toBeNull();

    // Doc A's chunks should be cascade-deleted
    const { data: chunksA } = await supabase
      .from("ai_kb_chunks")
      .select("id")
      .eq("document_id", docAId);
    expect(chunksA).toHaveLength(0);

    // Doc B should still exist
    const { data: docBAfter } = await supabase
      .from("ai_kb_documents")
      .select("id")
      .eq("id", docBId)
      .single();
    expect(docBAfter).toBeDefined();

    // Doc B's chunks should still exist
    const { data: chunksB } = await supabase
      .from("ai_kb_chunks")
      .select("id")
      .eq("document_id", docBId);
    expect(chunksB!.length).toBeGreaterThanOrEqual(1);
  });
});
