# Supabase Vector Store Knowledge Base Plan

## Feature Summary
Build a production-grade Supabase vector knowledge base that stores non-sensitive app/domain knowledge and curated operational dataset snapshots (bootcamps, cohorts, milestones, quests) for hybrid retrieval (keyword + semantic). The system will support multiple AI use cases (support assistant, sales assistant, social/media assistant) through a shared retrieval layer, role-specific prompts, and repeatable refresh workflows so knowledge stays current as code and data evolve.

## Scope
In scope:
- Database schema for knowledge documents, chunks, and ingestion runs.
- Hybrid search SQL function using full-text ranking + vector similarity.
- Deterministic chunking + metadata strategy (source type, feature area, freshness, audience).
- Prompt templates and extraction specs for MCP-driven data harvesting.
- CLI/automation scripts for: extract -> transform -> chunk -> embed -> upsert -> verify.
- Role-oriented retrieval profiles (support/sales/social) on top of shared index.
- Incremental updates and stale content handling.
- Observability for ingestion failures and retrieval quality checks.

Out of scope:
- Building end-user chat UI.
- Training or fine-tuning custom models.
- Ingesting PII or sensitive security artifacts.
- Replacing existing business APIs.

## Goals and Non-Goals
Goals:
- Keep knowledge non-sensitive and auditable.
- Support low-latency hybrid retrieval for multiple agent roles.
- Ensure refresh process is operator-friendly and repeatable.
- Maintain correctness through provenance metadata and staleness controls.

Non-goals:
- Perfect recall in v1.
- Real-time CDC sync for all tables.
- Introducing external vector database vendors.

## Affected Files
Existing files to reuse:
- `/Users/applemac/Developer/projects/p2einferno-app/lib/supabase/server.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/utils/logger.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/supabase/types-gen.ts` (regenerate after migration)
- `/Users/applemac/Developer/projects/p2einferno-app/supabase/config.toml`
- `/Users/applemac/Developer/projects/p2einferno-app/automation/features.md`

New files (planned):
- `/Users/applemac/Developer/projects/p2einferno-app/supabase/migrations/155_create_ai_knowledge_base.sql`
- `/Users/applemac/Developer/projects/p2einferno-app/automation/config/ai-kb-sources.json` (declarative source registry)
- `/Users/applemac/Developer/projects/p2einferno-app/lib/ai/knowledge/types.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/ai/knowledge/chunking.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/ai/knowledge/embeddings.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/ai/knowledge/retrieval.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/lib/ai/knowledge/sources.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/scripts/ai-kb/extract.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/scripts/ai-kb/build.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/scripts/ai-kb/verify.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/automation/prompts/ai-kb/mcp_extract_instructions.md`
- `/Users/applemac/Developer/projects/p2einferno-app/docs/ai-knowledge-base-operations.md`
- `/Users/applemac/Developer/projects/p2einferno-app/pages/api/ai/kb/search.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/__tests__/lib/ai/knowledge/chunking.test.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/__tests__/lib/ai/knowledge/retrieval.test.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/__tests__/integration/db/ai-kb-hybrid-search.test.ts`
- `/Users/applemac/Developer/projects/p2einferno-app/__tests__/pages/api/ai/kb/search.test.ts`

> **Note**: Migration is numbered `155`. Migrations `153` and `154` already exist on disk (`153_add_daily_quest_key_claim_attestation_uid.sql`, `154_sync_daily_quest_run_tasks_if_safe.sql`) and must not be overwritten.

## Data Model Changes
Create three core tables and the required SQL functions/RPCs for search, upsert, concurrency control, and verification helpers.

1. `public.ai_kb_documents`
- `id uuid primary key default gen_random_uuid()`
- `ingestion_run_id uuid references public.ai_kb_ingestion_runs(id)` (nullable; links each document to the ingestion run that created or last updated it — enables clean rollback of bad runs via `DELETE FROM ai_kb_documents WHERE ingestion_run_id = '<bad-run-id>'` which cascades to chunks)
- `source_type text not null` (`code`, `doc`, `db_snapshot`, `faq`, `playbook`)
- `source_path text not null` (repo path or logical dataset path; e.g. `docs/bootcamp-faq.md` or `db:bootcamps`)
- `title text not null`
- `content_markdown text not null`
- `audience text[] not null default '{}'` (`support`, `sales`, `social`, `ops`)
- `domain_tags text[] not null default '{}'`
- `content_hash text not null` (SHA-256 hex of `content_markdown`; used for incremental skip)
- `version text not null` (run date as ISO date string for all source types, e.g. `2026-03-04`; the `content_hash` is the primary change-detection mechanism, `version` is a human-readable audit label)
- `is_active boolean not null default true`
- `last_reviewed_at timestamptz` (set to `now()` by the `upsert_kb_document_with_chunks` RPC on every successful upsert; used by `verify.ts` for staleness checks)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- UNIQUE constraint on `(source_path)` — enforces exactly one active document per logical source; the `upsert_kb_document_with_chunks` RPC uses `ON CONFLICT (source_path) DO UPDATE` to atomically replace content when `content_hash` changes

2. `public.ai_kb_chunks`
- `id uuid primary key default gen_random_uuid()`
- `document_id uuid not null references public.ai_kb_documents(id) on delete cascade`
- `chunk_index int not null`
- `chunk_text text not null`
- `token_estimate int not null`
- `embedding vector(1536) not null`
- `fts tsvector generated always as (to_tsvector('english', coalesce(chunk_text,''))) stored`
- `metadata jsonb not null default '{}'::jsonb` — **must** include `"embedding_model"` key (e.g. `"openai/text-embedding-3-small"`) set by `build.ts` at embed time; `verify.ts` checks all active chunks use the same model
- `created_at timestamptz not null default now()`
- UNIQUE constraint on `(document_id, chunk_index)` — enables deterministic chunk upserts; orphan chunks beyond the new chunk count are deleted inside the `upsert_kb_document_with_chunks` RPC transaction

3. `public.ai_kb_ingestion_runs`
- `id uuid primary key default gen_random_uuid()`
- `run_type text not null` (`full`, `incremental`, `backfill`)
- `status text not null` (`started`, `completed`, `failed`)
- `started_at timestamptz not null default now()`
- `finished_at timestamptz`
- `stats jsonb not null default '{}'::jsonb`
- `error_message text`

4. `public.search_ai_kb_chunks(...)` RPC
- Input: `query_text text`, `query_embedding vector(1536)`, `audience_filter text[] default null`, `domain_filter text[] default null`, `limit_count int default 8`
- Output: `chunk_id uuid`, `document_id uuid`, `title text`, `chunk_text text`, `metadata jsonb`, `rank numeric`, `keyword_rank numeric`, `semantic_rank numeric`
- Ranking: `0.35 * keyword_rank + 0.65 * semantic_rank`. Note: `ts_rank_cd` and cosine similarity operate on different natural scales. In practice the 0.65 semantic weight dominates for typical query lengths. Tune weights against real queries before GA.
- **Scaling note (P3)**: The current CTE computes cosine distance as a scalar expression for every row that passes `WHERE` filters, which does not leverage the HNSW index (HNSW is only used when `ORDER BY embedding <=> vector LIMIT N` appears at the top level of a query). For a curated KB with < 50K chunks this is acceptable (sub-100ms on Supabase Postgres). When chunk count exceeds 50K, refactor to a two-stage approach: (1) ANN top-K via `ORDER BY embedding <=> query_embedding LIMIT K`, (2) FTS top-K via `ORDER BY ts_rank_cd(fts, query) LIMIT K`, (3) union candidates, (4) compute blended rank on the union only.

5. `public.upsert_kb_document_with_chunks(...)` RPC
- **Purpose**: Atomic upsert of one document and all its chunks in a single transaction. This is the **only** write path for knowledge base content. `build.ts` must call this RPC for every document — never insert documents or chunks via direct table inserts.
- Input: `p_source_type text`, `p_source_path text`, `p_title text`, `p_content_markdown text`, `p_audience text[]`, `p_domain_tags text[]`, `p_content_hash text`, `p_version text`, `p_ingestion_run_id uuid`, `p_chunks jsonb` (JSON array of `{chunk_index, chunk_text, token_estimate, embedding, metadata}`)
- Output: `document_id uuid`, `chunks_written int`, `was_updated boolean`
- Behavior (all within a single transaction):
  1. `INSERT INTO ai_kb_documents ... ON CONFLICT (source_path) DO UPDATE SET` all mutable columns (`title`, `content_markdown`, `audience`, `domain_tags`, `content_hash`, `version`, `ingestion_run_id`, `is_active = true`, `last_reviewed_at = now()`). The `DO UPDATE` only fires when `content_hash` differs from the existing row (skip no-op updates). Sets `was_updated = true` if the row was inserted or updated, `false` if skipped.
  2. If `was_updated` is true: delete all existing chunks for the document (`DELETE FROM ai_kb_chunks WHERE document_id = doc_id`), then insert all new chunks from `p_chunks`. This avoids orphan chunks from prior chunk counts.
  3. If `was_updated` is false (content unchanged): still update `ingestion_run_id` and `last_reviewed_at` on the document row to record that this run confirmed the document is current. Do not touch chunks.
  4. Return `document_id`, `chunks_written` (0 if skipped), `was_updated`.
- Security: `SECURITY DEFINER`, `SET search_path = 'public'`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT EXECUTE TO service_role`.

**Concurrency guard (table-based locking via `ai_kb_ingestion_runs`)**:
- **Why not advisory locks**: PostgreSQL advisory locks are session-scoped. The Supabase JS client communicates via PostgREST (stateless HTTP). Each `.rpc()` call gets a fresh DB session, so an advisory lock acquired in one call is immediately released when the HTTP response completes. Advisory locks are fundamentally incompatible with the Supabase JS client.
- **Table-based approach**: `build.ts` calls a dedicated `acquire_ingestion_lock` PL/pgSQL RPC at startup. The RPC performs the concurrency check and new-run creation atomically against `ai_kb_ingestion_runs`.
- **Concurrency check logic in `build.ts` Step 0 / Step 1 (merged through RPC)**:
  1. Call `public.acquire_ingestion_lock(p_run_type, p_stale_threshold_min default 60)`.
  2. Inside one transaction, the RPC checks the most recent `status = 'started'` run, row-locks it with `FOR UPDATE SKIP LOCKED`, marks it `failed` if stale, and inserts a new `started` run only when acquisition succeeds.
  3. If the RPC returns `status = 'blocked'`: another run is active. Log `"Another ingestion run is in progress (run <id>), exiting"` at warn level and exit with code 0 (not an error).
  4. If the RPC returns `status = 'acquired'`: continue using the returned `run_id`. If `stale_cleared = true`, log that a stale run was marked failed before acquisition.
- **Crash safety**: Unlike advisory locks (which auto-release on disconnect), table-based locks require explicit timeout handling. The 60-minute threshold ensures a crashed process cannot permanently block future runs. The threshold is generous because a full build with many sources and embedding API calls can legitimately take 30+ minutes.

Full migration SQL for `155_create_ai_knowledge_base.sql`:
```sql
-- 155_create_ai_knowledge_base.sql
-- Supabase vector knowledge base: documents, chunks, hybrid search RPC,
-- atomic upsert RPC.
-- Requires pgvector (vector extension). Additive migration only.

-- Enable pgvector. Supabase cloud has it pre-installed; this is a no-op if already active.
create extension if not exists vector with schema extensions;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- ingestion_runs must be created first because ai_kb_documents references it via FK.
create table if not exists public.ai_kb_ingestion_runs (
  id            uuid        primary key default gen_random_uuid(),
  run_type      text        not null check (run_type in ('full','incremental','backfill')),
  status        text        not null check (status in ('started','completed','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb       not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.ai_kb_documents (
  id               uuid        primary key default gen_random_uuid(),
  ingestion_run_id uuid        references public.ai_kb_ingestion_runs(id),
  source_type      text        not null check (source_type in ('code','doc','db_snapshot','faq','playbook')),
  source_path      text        not null,
  title            text        not null,
  content_markdown text        not null,
  audience         text[]      not null default '{}',
  domain_tags      text[]      not null default '{}',
  content_hash     text        not null,
  version          text        not null,
  is_active        boolean     not null default true,
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_ai_kb_documents_source_path unique (source_path)
);

create table if not exists public.ai_kb_chunks (
  id             uuid        primary key default gen_random_uuid(),
  document_id    uuid        not null references public.ai_kb_documents(id) on delete cascade,
  chunk_index    int         not null,
  chunk_text     text        not null,
  token_estimate int         not null,
  embedding      vector(1536) not null,
  fts            tsvector    generated always as (to_tsvector('english', coalesce(chunk_text,''))) stored,
  metadata       jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint uq_ai_kb_chunks_doc_idx unique (document_id, chunk_index)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- HNSW vector index (pgvector 0.5+). Does not require pre-populated rows unlike ivfflat.
-- m=16 and ef_construction=64 are the defaults; increase ef_construction for higher recall at build cost.
create index if not exists ai_kb_chunks_embedding_hnsw_idx
  on public.ai_kb_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- GIN index for full-text search on the generated fts column.
create index if not exists ai_kb_chunks_fts_gin_idx
  on public.ai_kb_chunks using gin(fts);

-- B-tree index for document_id FK lookups and cascade deletes.
create index if not exists ai_kb_chunks_document_id_idx
  on public.ai_kb_chunks(document_id);

-- B-tree index for filtering active documents.
create index if not exists ai_kb_documents_is_active_idx
  on public.ai_kb_documents(is_active);

-- B-tree index for ingestion_run_id FK lookups and rollback queries.
create index if not exists ai_kb_documents_ingestion_run_id_idx
  on public.ai_kb_documents(ingestion_run_id);

-- GIN indexes for array overlap filters on audience and domain_tags.
create index if not exists ai_kb_documents_audience_gin_idx
  on public.ai_kb_documents using gin(audience);
create index if not exists ai_kb_documents_domain_tags_gin_idx
  on public.ai_kb_documents using gin(domain_tags);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Reuses update_updated_at_column() defined in an earlier migration. Do not redefine.
drop trigger if exists update_ai_kb_documents_updated_at on public.ai_kb_documents;
create trigger update_ai_kb_documents_updated_at
  before update on public.ai_kb_documents
  for each row execute function public.update_updated_at_column();

-- ─── Hybrid search RPC ────────────────────────────────────────────────────────

create or replace function public.search_ai_kb_chunks(
  query_text      text,
  query_embedding vector(1536),
  audience_filter text[] default null,
  domain_filter   text[] default null,
  limit_count     int    default 8
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  title        text,
  chunk_text   text,
  metadata     jsonb,
  rank         numeric,
  keyword_rank numeric,
  semantic_rank numeric
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      c.id as chunk_id,
      c.document_id,
      d.title,
      c.chunk_text,
      c.metadata,
      ts_rank_cd(c.fts, plainto_tsquery('english', query_text)) as keyword_rank,
      (1 - (c.embedding <=> query_embedding))::numeric          as semantic_rank
    from public.ai_kb_chunks c
    join public.ai_kb_documents d on d.id = c.document_id
    where d.is_active = true
      and (audience_filter is null or cardinality(audience_filter) = 0 or d.audience && audience_filter)
      and (domain_filter   is null or cardinality(domain_filter)   = 0 or d.domain_tags && domain_filter)
  )
  select
    chunk_id,
    document_id,
    title,
    chunk_text,
    metadata,
    (0.35 * keyword_rank + 0.65 * semantic_rank) as rank,
    keyword_rank,
    semantic_rank
  from base
  order by rank desc
  limit greatest(1, least(limit_count, 20));
$$;

grant execute on function public.search_ai_kb_chunks(text, vector, text[], text[], int) to service_role;

-- ─── match_documents wrapper ──────────────────────────────────────────────────
-- Standard LangChain/n8n/LlamaIndex convention. External vector store integrations
-- (n8n Supabase Vector Store node, LangChain SupabaseVectorStore, LlamaIndex)
-- expect this exact function name and signature. Returns pure semantic similarity
-- without the hybrid blend — suitable for external tools that supply their own
-- reranking or use only vector retrieval.
--
-- The `filter` parameter supports metadata-based filtering using the LangChain
-- convention: each top-level key in the JSONB object is matched against the
-- chunk's `metadata` JSONB column using the containment operator (`@>`).
-- Examples:
--   '{"source_type": "faq"}'::jsonb         → chunks whose metadata contains source_type = "faq"
--   '{"domain": "bootcamp"}'::jsonb         → chunks whose metadata contains domain = "bootcamp"
--   '{}'::jsonb or NULL                     → no metadata filter (return all active chunks)
-- Only top-level key/value equality is supported. Nested object matching, array
-- element matching, and range queries are not supported in v1.

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count     int  default 8,
  filter          jsonb default '{}'
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.chunk_text  as content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.ai_kb_chunks c
  join public.ai_kb_documents d on d.id = c.document_id
  where d.is_active = true
    and (filter is null or filter = '{}'::jsonb or c.metadata @> filter)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function public.match_documents(vector, int, jsonb) to service_role;

-- ─── Atomic document + chunks upsert RPC ────────────────────────────────────
-- This is the ONLY write path for knowledge base content. build.ts must call
-- this RPC for every document. Never insert documents or chunks via direct
-- table inserts from the application layer.
--
-- Behavior (all within a single implicit PL/pgSQL transaction):
-- 1. INSERT document ON CONFLICT (source_path) DO UPDATE when content_hash differs.
-- 2. If content changed (inserted or updated): delete ALL existing chunks for
--    the document, then insert all new chunks from p_chunks. This eliminates
--    orphan chunks from prior chunk counts.
-- 3. If content unchanged (same content_hash): update only ingestion_run_id and
--    last_reviewed_at to record that this run confirmed the document is current.
--    Chunks are not touched.
-- 4. Return document_id, chunks_written count, and was_updated flag.

create or replace function public.upsert_kb_document_with_chunks(
  p_source_type      text,
  p_source_path      text,
  p_title            text,
  p_content_markdown text,
  p_audience         text[],
  p_domain_tags      text[],
  p_content_hash     text,
  p_version          text,
  p_ingestion_run_id uuid,
  p_chunks           jsonb
)
returns table (
  document_id   uuid,
  chunks_written int,
  was_updated    boolean
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_doc_id       uuid;
  v_old_hash     text;
  v_was_updated  boolean := false;
  v_chunk_count  int := 0;
  v_chunk        jsonb;
begin
  -- Step 1: Check if document already exists for this source_path.
  select id, content_hash into v_doc_id, v_old_hash
    from public.ai_kb_documents
    where source_path = p_source_path
    for update;  -- row-level lock to prevent concurrent upserts on same source_path

  if v_doc_id is null then
    -- New document: insert it.
    insert into public.ai_kb_documents (
      source_type, source_path, title, content_markdown,
      audience, domain_tags, content_hash, version,
      ingestion_run_id, is_active, last_reviewed_at
    ) values (
      p_source_type, p_source_path, p_title, p_content_markdown,
      p_audience, p_domain_tags, p_content_hash, p_version,
      p_ingestion_run_id, true, now()
    )
    returning id into v_doc_id;
    v_was_updated := true;

  elsif v_old_hash is distinct from p_content_hash then
    -- Existing document with changed content: update all mutable columns.
    update public.ai_kb_documents set
      source_type      = p_source_type,
      title            = p_title,
      content_markdown = p_content_markdown,
      audience         = p_audience,
      domain_tags      = p_domain_tags,
      content_hash     = p_content_hash,
      version          = p_version,
      ingestion_run_id = p_ingestion_run_id,
      is_active        = true,
      last_reviewed_at = now()
    where id = v_doc_id;
    v_was_updated := true;

  else
    -- Content unchanged: just stamp the run and freshness.
    update public.ai_kb_documents set
      ingestion_run_id = p_ingestion_run_id,
      last_reviewed_at = now()
    where id = v_doc_id;
    v_was_updated := false;
  end if;

  -- Step 2: If content changed, replace all chunks atomically.
  if v_was_updated then
    -- Delete all existing chunks (cascade from document not needed here;
    -- explicit delete is clearer and works within the same transaction).
    delete from public.ai_kb_chunks where document_id = v_doc_id;

    -- Insert new chunks from the JSONB array.
    for v_chunk in select * from jsonb_array_elements(p_chunks)
    loop
      insert into public.ai_kb_chunks (
        document_id, chunk_index, chunk_text, token_estimate, embedding, metadata
      ) values (
        v_doc_id,
        (v_chunk->>'chunk_index')::int,
        v_chunk->>'chunk_text',
        (v_chunk->>'token_estimate')::int,
        (v_chunk->>'embedding')::vector(1536),
        coalesce(v_chunk->'metadata', '{}'::jsonb)
      );
      v_chunk_count := v_chunk_count + 1;
    end loop;
  end if;

  -- Step 3: Return results.
  return query select v_doc_id, v_chunk_count, v_was_updated;
end;
$$;

revoke execute on function public.upsert_kb_document_with_chunks(text,text,text,text,text[],text[],text,text,uuid,jsonb) from public;
grant execute on function public.upsert_kb_document_with_chunks(text,text,text,text,text[],text[],text,text,uuid,jsonb) to service_role;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.ai_kb_documents     enable row level security;
alter table public.ai_kb_documents     force row level security;
alter table public.ai_kb_chunks        enable row level security;
alter table public.ai_kb_chunks        force row level security;
alter table public.ai_kb_ingestion_runs enable row level security;
alter table public.ai_kb_ingestion_runs force row level security;

revoke all on table public.ai_kb_documents      from anon, authenticated;
revoke all on table public.ai_kb_chunks         from anon, authenticated;
revoke all on table public.ai_kb_ingestion_runs from anon, authenticated;

create policy ai_kb_documents_deny_anon
  on public.ai_kb_documents for all to anon using (false) with check (false);
create policy ai_kb_documents_deny_authenticated
  on public.ai_kb_documents for all to authenticated using (false) with check (false);
create policy ai_kb_documents_allow_service_role
  on public.ai_kb_documents for all to service_role using (true) with check (true);

create policy ai_kb_chunks_deny_anon
  on public.ai_kb_chunks for all to anon using (false) with check (false);
create policy ai_kb_chunks_deny_authenticated
  on public.ai_kb_chunks for all to authenticated using (false) with check (false);
create policy ai_kb_chunks_allow_service_role
  on public.ai_kb_chunks for all to service_role using (true) with check (true);

create policy ai_kb_ingestion_runs_deny_anon
  on public.ai_kb_ingestion_runs for all to anon using (false) with check (false);
create policy ai_kb_ingestion_runs_deny_authenticated
  on public.ai_kb_ingestion_runs for all to authenticated using (false) with check (false);
create policy ai_kb_ingestion_runs_allow_service_role
  on public.ai_kb_ingestion_runs for all to service_role using (true) with check (true);
```

## Types Changes or Creation
Add strong types for ingestion, retrieval, and source registry contracts.

Full file for `/lib/ai/knowledge/types.ts`:
```ts
// /lib/ai/knowledge/types.ts

// ─── Domain enums ───────────────────────────────────────────────────────────

export type KnowledgeAudience = "support" | "sales" | "social" | "ops";
export type KnowledgeSourceType = "code" | "doc" | "db_snapshot" | "faq" | "playbook";

// ─── Source registry types ──────────────────────────────────────────────────
// Matches the shape of automation/config/ai-kb-sources.json entries.

export interface KnowledgeSourceEntry {
  /** Unique logical path. For repo files: relative path from repo root (e.g. "docs/bootcamp-faq.md").
   *  For DB snapshots: "db:<table_name>" (e.g. "db:bootcamps"). */
  sourcePath: string;
  sourceType: KnowledgeSourceType;
  title: string;
  audience: KnowledgeAudience[];
  domainTags: string[];
  /** Maximum number of days since last ingestion before verify.ts flags as stale.
   *  Recommended: 7 for db_snapshot, 30 for doc/code, 14 for faq/playbook. */
  staleDays: number;
}

export interface KnowledgeSourceRegistry {
  /** Schema version for forward-compatible parsing. Must be "1". */
  schemaVersion: "1";
  sources: KnowledgeSourceEntry[];
}

// ─── Document input (passed to upsert RPC) ──────────────────────────────────

export interface KnowledgeDocumentInput {
  sourceType: KnowledgeSourceType;
  sourcePath: string;
  title: string;
  contentMarkdown: string;
  audience: KnowledgeAudience[];
  domainTags: string[];
  /** Run date as ISO date string (e.g. "2026-03-04"). Used as human-readable
   *  audit label. The content_hash is the primary change-detection mechanism. */
  version: string;
}

// ─── Chunk types ────────────────────────────────────────────────────────────

/** Metadata stored in ai_kb_chunks.metadata JSONB column.
 *  build.ts must populate all required fields before calling the upsert RPC. */
export interface ChunkMetadata {
  /** The embedding model used to generate this chunk's vector.
   *  e.g. "openai/text-embedding-3-small". Stored so verify.ts can detect
   *  model drift across chunks. */
  embedding_model: string;
  /** Section heading from the source document, if applicable. */
  section_heading?: string;
  /** Original source_path of the parent document (denormalized for retrieval convenience). */
  source_path: string;
  /** Source type of the parent document (denormalized). */
  source_type: KnowledgeSourceType;
  /** For db_snapshot sources: the record ID from the source table, if applicable. */
  record_id?: string;
  /** Additional key/value pairs as needed. */
  [key: string]: unknown;
}

export interface KnowledgeChunk {
  chunkIndex: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: ChunkMetadata;
}

// ─── Upsert RPC response ───────────────────────────────────────────────────

export interface UpsertDocumentResult {
  document_id: string;
  chunks_written: number;
  was_updated: boolean;
}

// ─── Search result types ────────────────────────────────────────────────────

export interface HybridSearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  chunkText: string;
  metadata: ChunkMetadata;
  rank: number;
  keywordRank: number;
  semanticRank: number;
}

// ─── Ingestion run stats ────────────────────────────────────────────────────
// Stored in ai_kb_ingestion_runs.stats JSONB column.

export interface IngestionRunStats {
  total_sources: number;
  documents_inserted: number;
  documents_updated: number;
  documents_unchanged: number;
  documents_deactivated: number;
  chunks_written: number;
  embedding_model: string;
  /** source_paths that failed during this run, with error messages. */
  failed_sources: Array<{ sourcePath: string; error: string }>;
  /** source_path of the last successfully processed document
   *  (for resumability context on failed runs). */
  last_processed_source: string | null;
}
```

### Source registry file: `automation/config/ai-kb-sources.json`

This file is the **single source of truth** for what gets ingested. `extract.ts` reads it to validate MCP output. `build.ts` reads it to know what to process. `verify.ts` reads it to check coverage gaps and staleness.

Example structure:
```json
{
  "schemaVersion": "1",
  "sources": [
    {
      "sourcePath": "docs/bootcamp-faq.md",
      "sourceType": "faq",
      "title": "Bootcamp FAQ",
      "audience": ["support", "sales"],
      "domainTags": ["bootcamp"],
      "staleDays": 30
    },
    {
      "sourcePath": "db:bootcamps",
      "sourceType": "db_snapshot",
      "title": "Bootcamp Programs",
      "audience": ["support", "sales", "social"],
      "domainTags": ["bootcamp"],
      "staleDays": 7
    },
    {
      "sourcePath": "db:cohorts",
      "sourceType": "db_snapshot",
      "title": "Cohort Schedules",
      "audience": ["support", "sales"],
      "domainTags": ["bootcamp", "cohort"],
      "staleDays": 7
    },
    {
      "sourcePath": "db:milestones",
      "sourceType": "db_snapshot",
      "title": "Milestone Definitions",
      "audience": ["support"],
      "domainTags": ["milestone"],
      "staleDays": 7
    },
    {
      "sourcePath": "db:quest_templates",
      "sourceType": "db_snapshot",
      "title": "Quest Templates",
      "audience": ["support", "social"],
      "domainTags": ["quest"],
      "staleDays": 7
    }
  ]
}
```

**Rules for maintaining this file**:
- When a new feature is added to the app (e.g., a new DB table, a new doc), add a corresponding entry here.
- `extract.ts` will warn if MCP-exported JSONL files exist in `automation/data/ai-kb/raw/` that have no matching `sourcePath` entry (unexpected source).
- `verify.ts` will warn if a registry entry has no corresponding active document in the DB (missing source).
- Never add entries for sensitive content (`.env*`, auth secrets, private keys, user PII tables).
- **`db_snapshot` sources are contextual reference, not canonical truth**: DB snapshot data is a point-in-time extract of selected columns from operational tables. It is intended to give AI agents conversational context (e.g., "what bootcamps exist?"), not to serve as the source of truth for transactional operations. Agents must never use KB snapshot data to make business decisions that depend on real-time accuracy (e.g., current enrollment counts, payment status). For real-time data, agents should call the appropriate API endpoints directly.

Regenerate Supabase DB types after migration with `npm run db:types` and consume new RPC response types where possible.

## API/Service Layer Changes
Implement a small knowledge service in `lib/ai/knowledge/*`. All modules are server-only — never import from client components.

1. `sources.ts`
- Loads and validates `automation/config/ai-kb-sources.json` against the `KnowledgeSourceRegistry` type.
- Exports `loadSourceRegistry(): KnowledgeSourceRegistry` — reads and parses the JSON file, throws if `schemaVersion` is not `"1"` or if any entry has an empty `sourcePath`.
- Exports `getSourceEntry(sourcePath: string): KnowledgeSourceEntry | undefined` — looks up a single source by path from the loaded registry.
- Reads allowed sources only:
  - Curated repo docs listed in the registry with `sourceType` of `code`, `doc`, `faq`, or `playbook`.
  - Sanitized DB snapshots listed in the registry with `sourceType` of `db_snapshot` (bootcamps/cohorts/milestones/quests with allowlisted columns per MCP extraction instructions).
- Rejects sensitive paths (`.env*`, auth secrets, security configs flagged as sensitive). Throws with a descriptive error if any source_path matches these patterns: `/\.env/`, `/secret/i`, `/credential/i`, `/private.key/i`.
- `extract.ts` calls `loadSourceRegistry()` to validate that every MCP-exported JSONL file corresponds to a registered source, and warns on unregistered files.
- `build.ts` calls `loadSourceRegistry()` to iterate over all registered sources and process each one.

2. `chunking.ts`
- Deterministic chunking by headings + max character budget (e.g. 1500 chars soft cap, 2000 hard cap).
- Minimum chunk size: 100 characters — reject shorter chunks before embedding.
- Preserve references (`source_path`, section heading, record id) in chunk `metadata`.

3. `embeddings.ts`
- Uses OpenRouter's embeddings endpoint (`https://openrouter.ai/api/v1/embeddings`) with the same `OPENROUTER_API_KEY` already in `.env.example`. No new API key required.
- Model: `openai/text-embedding-3-small` (1536 dimensions, compatible with `vector(1536)`). Configurable via `OPENROUTER_EMBEDDING_MODEL` env var.
- Add `OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small` to `.env.example` under the OpenRouter section.
- Follows the same fetch + AbortController + timeout pattern as `lib/ai/client.ts`.
- Batches texts in groups of 20 (OpenRouter limit per request). Retries once on 429/5xx with 1s backoff. Throws on second failure.
- Exports `getEmbeddingModel(): string` — returns the resolved model name (`process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL`). `build.ts` must call this and include the returned value as `embedding_model` in every chunk's `metadata` JSONB before calling the upsert RPC. This is the mechanism for embedding model drift detection — `verify.ts` queries `SELECT DISTINCT metadata->>'embedding_model' FROM ai_kb_chunks c JOIN ai_kb_documents d ON d.id = c.document_id WHERE d.is_active = true` and fails if more than one distinct model is found.

Code pattern for `embeddings.ts`:
```ts
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ai:kb:embeddings");
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_TIMEOUT_MS = 30_000;

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
```

4. `retrieval.ts`
- Calls `search_ai_kb_chunks` via Supabase RPC using `createAdminClient()`.
- Applies optional post-filter by freshness (`last_reviewed_at` threshold).

Code pattern for `retrieval.ts`:
```ts
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ai:kb:retrieval");

export async function searchKnowledgeBase(params: {
  queryText: string;
  queryEmbedding: number[];
  audience?: string[];
  domainTags?: string[];
  limit?: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
    query_text: params.queryText,
    query_embedding: params.queryEmbedding,
    audience_filter: params.audience ?? null,
    domain_filter: params.domainTags ?? null,
    limit_count: params.limit ?? 8,
  });

  if (error) {
    log.error("search rpc failed", { err: error.message });
    throw error;
  }

  return data ?? [];
}
```

5. `pages/api/ai/kb/search.ts` — External Search API
- Accepts `POST` only. All other methods return 405.
- Authenticates via `Authorization: Bearer <secret>` header checked against `AI_KB_API_SECRET` env var using `crypto.timingSafeEqual` to prevent timing attacks. Returns 401 if missing or wrong.
- Request body: `{ query: string, audience?: string[], domainTags?: string[], limit?: number }`.
  - `query` required, non-empty, max 500 characters. Returns 400 if invalid.
  - `limit` capped at 20 server-side regardless of caller input.
- Flow: validate secret → validate body → call `embedTexts([query])` → call `searchKnowledgeBase` → return JSON.
- Response shape:
  ```json
  {
    "results": [...HybridSearchResult],
    "query": "original query text",
    "count": 5,
    "tookMs": 312
  }
  ```
- On embedding or DB failure: returns 500 with `{ error: "internal_error" }`. No internal detail leaked to caller.
- This route is the single integration point for all external consumers (n8n HTTP Request node, other backends, future agents). Callers never handle embeddings — they send plain text and receive ranked results.

Code pattern for `pages/api/ai/kb/search.ts`:
```ts
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  if (!checkSecret(req.headers.authorization as string | undefined)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { query, audience, domainTags, limit } = req.body ?? {};

  if (typeof query !== "string" || !query.trim() || query.length > 500) {
    return res.status(400).json({ error: "query must be a non-empty string under 500 characters" });
  }

  const start = Date.now();

  try {
    const [embedding] = await embedTexts([query.trim()]);
    const results = await searchKnowledgeBase({
      queryText: query.trim(),
      queryEmbedding: embedding,
      audience: Array.isArray(audience) ? audience : undefined,
      domainTags: Array.isArray(domainTags) ? domainTags : undefined,
      limit: typeof limit === "number" ? Math.min(limit, 20) : 8,
    });

    log.info("kb search served", { resultCount: results.length, tookMs: Date.now() - start });

    return res.status(200).json({
      results,
      query: query.trim(),
      count: results.length,
      tookMs: Date.now() - start,
    });
  } catch (err) {
    log.error("kb search failed", { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal_error" });
  }
}
```

## UI Changes (if applicable)
No production UI required for v1.
Optional admin-only diagnostic page can be deferred; keep scope to scripts and ops docs.

## Step-by-Step Implementation Tasks

1. Create the declarative source registry.
- Create `automation/config/ai-kb-sources.json` following the exact structure shown in the Types section.
- Populate with the initial set of sources (repo docs + DB snapshot tables).
- Each entry must have `sourcePath`, `sourceType`, `title`, `audience`, `domainTags`, and `staleDays`.
- Validate that no entry's `sourcePath` matches sensitive patterns (`.env*`, `secret`, `credential`, `private.key`).

2. Create Supabase migration `155_create_ai_knowledge_base.sql`.
- Copy the full SQL from the Data Model Changes section above verbatim. The SQL includes:
  - Three tables (`ai_kb_ingestion_runs` first due to FK dependency, then `ai_kb_documents` with `ingestion_run_id` FK and `UNIQUE (source_path)`, then `ai_kb_chunks`).
  - All indexes including `ai_kb_documents_ingestion_run_id_idx`.
  - `search_ai_kb_chunks` hybrid search RPC.
  - `match_documents` wrapper with `filter` JSONB containment (`c.metadata @> filter`).
  - `upsert_kb_document_with_chunks` PL/pgSQL RPC (SECURITY DEFINER, SET search_path).
  - `acquire_ingestion_lock` PL/pgSQL RPC for atomic concurrency guard + run creation.
  - Verify helper functions (`get_distinct_embedding_models`, `count_short_chunks`) used by `verify.ts`.
  - RLS policies (deny anon/authenticated, allow service_role).
- Verify: no prior migration defines `vector` extension; the `CREATE EXTENSION IF NOT EXISTS vector` in the migration is safe as a no-op when already enabled on remote.
- Apply locally: `supabase migration up --local` (never `supabase db reset`).

3. Add env vars to `.env.example`.
- Under the OpenRouter section, add: `OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small`
- Add a new AI Knowledge Base section:
  ```
  # AI Knowledge Base Search API
  # Shared secret for 3rd-party callers (n8n, external agents, etc.) — generate with: openssl rand -hex 32
  AI_KB_API_SECRET=
  ```

4. Add npm scripts to `package.json`.
```json
"ai-kb:extract:validate": "ts-node scripts/ai-kb/extract.ts",
"ai-kb:build": "ts-node scripts/ai-kb/build.ts --mode full",
"ai-kb:build:incremental": "ts-node scripts/ai-kb/build.ts --mode incremental",
"ai-kb:verify": "ts-node scripts/ai-kb/verify.ts"
```

5. Implement extraction specs for MCP.
- Create `automation/prompts/ai-kb/mcp_extract_instructions.md` containing:
  - What MCP fetches (tables/columns/docs), referencing the source registry entries.
  - Output schema JSONL.
  - Destination path under `automation/data/ai-kb/raw/`.

6. Implement local build pipeline scripts.

- `extract.ts`:
  - Loads the source registry via `loadSourceRegistry()`.
  - Scans `automation/data/ai-kb/raw/` for JSONL files.
  - For each JSONL file: validates format, checks that every record has required fields (`sourcePath`, `title`, `content`), rejects files with missing fields.
  - Counts records per JSONL file. For `db_snapshot` sources (identified by matching the registry entry's `sourceType`): warns if the record count is 0 (empty snapshot suggests an extraction problem — the source table may be empty or the MCP query may have failed silently).
  - Warns on any JSONL file whose `sourcePath` does not match a registry entry (unexpected source).
  - Warns on any registry entry that has no corresponding JSONL file (missing source).

- `build.ts`:
  - Accepts `--mode full` or `--mode incremental` via CLI arg.
  - **Step 0 / Step 1 — Atomic concurrency check + run creation**: Calls `acquire_ingestion_lock`. If the RPC returns `blocked`, logs `"Another ingestion run is in progress (run <id>), exiting"` at warn level and exits with code 0. If the RPC clears a stale run, it marks that prior run as `'failed'` with `error_message = 'Timed out: no completion after 60 minutes (likely crashed)'` before returning a new `runId`. Otherwise it simply returns the acquired `runId`.
  - **Step 2 — Load registry**: Calls `loadSourceRegistry()` to get the list of sources.
  - **Step 3 — Process each source**: For each registry entry:
    1. Read the corresponding JSONL file from `automation/data/ai-kb/raw/`.
    2. Compute `content_hash` as SHA-256 hex of the content markdown.
    3. In `--mode incremental`: query the existing document by `source_path` and compare `content_hash`. If identical, skip (increment `documents_unchanged` stat), but still the upsert RPC will stamp `last_reviewed_at` and `ingestion_run_id`.
    4. Chunk the content via `chunking.ts`.
    5. Reject any chunk under 100 characters (log warning, do not embed).
    6. Embed all chunk texts via `embedTexts()`. Validate every returned embedding has exactly 1536 dimensions; throw if not.
    7. Get the current embedding model name via `getEmbeddingModel()`.
    8. Build the `p_chunks` JSONB array: for each chunk, include `chunk_index`, `chunk_text`, `token_estimate`, `embedding` (as JSON array of numbers), and `metadata` (must include `embedding_model`, `source_path`, `source_type`, `section_heading`).
    9. Call `supabase.rpc("upsert_kb_document_with_chunks", { ... })` with all document fields + `p_ingestion_run_id = runId` + `p_chunks`.
    10. Record result in run stats: increment `documents_inserted`, `documents_updated`, or `documents_unchanged` based on `was_updated` flag. Accumulate `chunks_written`.
    11. On per-document failure: catch the error, add to `failed_sources` array in stats, log the error, continue to next source. Do NOT abort the entire run for a single source failure.
  - **Step 4 — Deactivate missing sources**: After processing all registry entries, query for active documents whose `source_path` is not in the registry's `sourcePath` list. Set `is_active = false` for those documents. Record count in `documents_deactivated` stat.
  - **Step 5 — Finalize run**: Update the `ai_kb_ingestion_runs` row: set `finished_at = now()`, `stats` = the accumulated `IngestionRunStats` JSON. Determine final status: if `failed_sources.length > total_sources * 0.5` (more than 50% of registry sources failed), set `status = 'failed'` and `error_message = 'Run failed: <N>/<total> sources failed (>50% threshold)'`. Otherwise set `status = 'completed'` (with `error_message` summarizing any individual failures if `failed_sources.length > 0`).
  - **Step 6 — (No lock release needed)**: Table-based concurrency uses `ai_kb_ingestion_runs.status`. Step 5 already sets `status = 'completed'` or `'failed'`, which clears the lock. If the process crashes before Step 5, the 60-minute stale-run timeout in Step 0 handles cleanup on the next run.

- `verify.ts`:
  - **Check 1 — Embedding model consistency**: Query `SELECT DISTINCT metadata->>'embedding_model' FROM ai_kb_chunks c JOIN ai_kb_documents d ON d.id = c.document_id WHERE d.is_active = true`. If more than one distinct model is returned, report FAIL with the list of models found. This indicates a model was changed between runs without a full re-embed.
  - **Check 2 — Staleness**: Load the source registry. For each entry, query the corresponding active document's `last_reviewed_at`. If `now() - last_reviewed_at > staleDays` (from the registry entry), report WARN with the source path and days since last review.
  - **Check 3 — Coverage gaps**: Load the source registry. Query all active document `source_path` values. Report WARN for any registry entry that has no active document (missing ingestion). Report WARN for any active document whose `source_path` is not in the registry (orphaned document — should have been deactivated by build.ts step 4).
  - **Check 4 — Empty chunks**: Query `SELECT count(*) FROM ai_kb_chunks WHERE length(chunk_text) < 100`. If > 0, report WARN with count.
  - **Check 5 — Canary search quality (source-aware)**: Run 3-5 hardcoded test queries (defined in verify.ts) through `searchKnowledgeBase`. Each canary query must specify an expected `source_type` or `domain_tag` that should appear in the results. For each query, verify: (a) at least 1 result returned, (b) top result's `rank` > 0.1, (c) response time < 2000ms, (d) at least one of the top 3 results has the expected `source_type` (from `metadata.source_type`) or `domain_tag` (from the parent document's `domain_tags`). Report FAIL on any violation. Example canary queries:
    - `{ query: "how do bootcamps work", expectedSourceType: "faq", expectedDomainTag: "bootcamp" }`
    - `{ query: "active cohort schedules", expectedSourceType: "db_snapshot", expectedDomainTag: "cohort" }`
    - `{ query: "milestone completion requirements", expectedSourceType: "db_snapshot", expectedDomainTag: "milestone" }`
  - **Check 6 — Latest run health**: Query the most recent `ai_kb_ingestion_runs` row. Report FAIL if `status = 'failed'`. Report WARN if `finished_at` is more than 24 hours ago (no recent run).
  - **Output**: Print a summary table of all checks with PASS/WARN/FAIL status. Exit with code 1 if any check is FAIL, code 0 otherwise.

7. Add retrieval service.
- Provide one server-side function for AI agents and internal tooling.
- Add audience/domain filter knobs.

8. Add external search API route.
- Create `pages/api/ai/kb/search.ts` using the code pattern in the API/Service Layer Changes section.
- Generate `AI_KB_API_SECRET` with `openssl rand -hex 32` and add to `.env.local`.
- The route must never be imported from client-side code.

9. Add operational documentation.
- Define exact run order and ownership:
  - Human: triggers MCP collection and approves final source scope.
  - MCP: fetches allowlisted DB/content and outputs normalized files.
  - Codex/Claude: runs build + verification scripts and reviews metrics.

10. Add tests.
- Unit tests for chunking/normalization/ranking blending.
- Integration tests for migration + RPC behavior (including upsert atomicity and the RPC-based concurrency guard).
- Unit tests for source registry loading and validation.
- Unit tests for verify.ts checks (mocked DB responses).

11. Regenerate types.
- Run `npm run db:types` after migration is applied locally to sync `lib/supabase/types-gen.ts`.

12. Rollout.
- Run `supabase migration up --local`.
- Run full ingest in staging-like environment.
- Run `npm run ai-kb:verify` and confirm all checks pass.
- Validate query quality against scenario checklist.

## Ordered Execution Model (Human vs MCP vs Codex/Claude)
1. Human (one-time setup)
- Approves source registry (`automation/config/ai-kb-sources.json`) entries and target use-case priority.
- Provides any required MCP project/database access.

2. MCP (data acquisition)
- Executes prompt instructions and exports:
  - `automation/data/ai-kb/raw/docs/*.jsonl`
  - `automation/data/ai-kb/raw/db/*.jsonl`
- Never exports disallowed fields.
- Output must have a JSONL file for every entry in the source registry.

3. Codex/Claude (build)
- Run `npm run ai-kb:build` (or `ai-kb:build:incremental`).
- `build.ts` checks for concurrent runs via `ai_kb_ingestion_runs` table, creates ingestion run, processes each registry source, deactivates orphaned documents, finalizes run stats.
- All document+chunk writes go through the `upsert_kb_document_with_chunks` RPC — never direct table inserts.

4. Codex/Claude (verification)
- Run `npm run ai-kb:verify`.
- Produces retrieval quality report with pass/fail/warn checks (embedding model consistency, staleness, coverage gaps, source-aware canary queries, run health).
- Exit code 1 if any check is FAIL; exit code 0 otherwise.

5. Human (release gate)
- Reviews quality report.
- Approves enabling downstream agent prompts to use KB endpoint.

6. Ongoing updates
- MCP incremental extraction on a defined cadence (recommended: DB snapshots weekly, code/docs on significant changes).
- Codex/Claude incremental build (`npm run ai-kb:build:incremental`) skips documents whose `content_hash` is unchanged but still stamps `last_reviewed_at` to confirm currency.
- When a new feature is added to the app: human adds an entry to `ai-kb-sources.json`, MCP exports the new source, build ingests it. `verify.ts` will warn on coverage gaps if this step is missed.
- Table-based concurrency check via `ai_kb_ingestion_runs` prevents concurrent builds from racing. If a build is already in progress (a `started` run within the last 60 minutes), the second invocation exits cleanly with code 0. Stale runs (older than 60 minutes) are auto-marked as `failed`.
- If the embedding model is changed (via `OPENROUTER_EMBEDDING_MODEL`), run `npm run ai-kb:build` (full mode) to re-embed all chunks. `verify.ts` will FAIL if chunks from mixed models exist.

## Edge Cases
- **Superseded document versions**: When a document's content changes (different `content_hash`), the `upsert_kb_document_with_chunks` RPC atomically updates the existing row via `ON CONFLICT (source_path) DO UPDATE` and deletes+replaces all chunks in the same transaction. There is only ever one row per `source_path`. Old content is overwritten, not left active alongside new content.
- **Duplicate semantic content from different sources**: Each source has a unique `source_path` in the registry. If two sources produce semantically similar content, both are ingested as separate documents. The hybrid search ranking will surface the most relevant chunks regardless.
- **Very short docs generating low-value chunks**: Reject chunks under 100 characters before calling embedding API; log as warning. The chunk is excluded from the `p_chunks` array passed to the upsert RPC.
- **Extremely large docs**: Split by heading hierarchy first; hard cap at 2000 characters per chunk; overflow continues into next chunk preserving heading context in `metadata.section_heading`.
- **Empty query text**: Validate upstream before calling `searchKnowledgeBase`; return `[]` immediately if blank.
- **Missing embedding provider response**: The upsert RPC is never called for that document (embedding happens before RPC call). The document is added to `failed_sources` in the run stats. Other documents continue processing. No partial chunk state is possible because the RPC is the only write path and it's transactional.
- **Source drift (deleted docs/tables)**: `build.ts` step 4 queries for active documents whose `source_path` is not in the current source registry. Those documents are set to `is_active = false`. This runs after all sources are processed, ensuring removal only happens when the registry is the authority.
- **Invalid vector dimension**: `build.ts` validates `embedding.length === 1536` for every embedding before including it in the `p_chunks` array. If validation fails, the entire document is skipped and added to `failed_sources`.
- **Concurrent build runs**: `build.ts` checks `ai_kb_ingestion_runs` for any row with `status = 'started'` and `started_at` within the last 60 minutes. If found, the script logs a warning and exits with code 0 (not an error). If a stale `started` row is found (older than 60 minutes), it is marked as `'failed'` with a timeout message, and the new run proceeds. This table-based approach is used instead of PostgreSQL advisory locks because the Supabase JS client uses stateless HTTP via PostgREST — advisory locks acquired in one `.rpc()` call are immediately released when the HTTP response completes.
- **Embedding model change**: If `OPENROUTER_EMBEDDING_MODEL` is changed between runs, new chunks will have a different `embedding_model` in their metadata. `verify.ts` detects this by checking for distinct `embedding_model` values across active chunks and reports FAIL. Resolution: run `npm run ai-kb:build` (full mode) which re-embeds all chunks with the new model, overwriting old embeddings via the delete+reinsert in the upsert RPC.
- **Bad run rollback**: Every document upserted during a run has its `ingestion_run_id` set to the current run's ID. To rollback a bad run: `DELETE FROM ai_kb_documents WHERE ingestion_run_id = '<bad-run-id>'` — cascade deletes handle chunks automatically. Then re-run `npm run ai-kb:build` to re-ingest from clean source data.
- **Partial run failure**: If `build.ts` crashes mid-run (e.g., process killed), the ingestion run row remains in `started` status. Documents already upserted in that run are valid (each was written atomically). The next invocation of `build.ts` will detect the stale `started` row (if older than 60 minutes), mark it as `'failed'`, and create a new run. Documents whose `content_hash` is unchanged will be skipped (only `last_reviewed_at` is stamped). Documents that were missed will be processed normally.

## Security Considerations
- Enforce strict allowlist to avoid leaking secrets/PII.
- Service role keys used only in server scripts and server-side modules, never in client components.
- All three KB tables are write-restricted to service_role via RLS (deny-all for anon and authenticated).
- `search_ai_kb_chunks` and `match_documents` GRANT EXECUTE is limited to service_role.
- Add payload-size limits for ingestion JSONL files to reduce abuse risk.
- Log high-level diagnostics only; no raw chunk text or embedding vectors in logs.
- Maintain source provenance metadata (`source_path`, `version`, `content_hash`) for auditability.
- **External search API (`/api/ai/kb/search`)**:
  - `AI_KB_API_SECRET` must be a cryptographically random string (minimum 32 bytes hex). Generate with `openssl rand -hex 32`. Never commit to source control.
  - Secret comparison uses `crypto.timingSafeEqual` (via SHA-256 normalisation) to prevent timing-based enumeration.
  - Query length is capped at 500 characters server-side to prevent embedding API abuse.
  - `limit` is capped at 20 server-side regardless of caller input.
  - Error responses never leak internal details — only `{ error: "internal_error" }` on 500.
  - Route is Next.js pages API (server-side only). It must never be imported from client components.
  - Rate limiting is out of scope for v1 given the caller is trusted infrastructure. Add if the endpoint is ever exposed beyond a closed set of services.

## Performance Considerations
- Indexes:
  - HNSW index on `embedding` using `vector_cosine_ops` (pgvector 0.5+, supported in Supabase). Parameters: `m=16, ef_construction=64`. HNSW is chosen over IVFFlat because it can index an empty table; IVFFlat cannot and would fail at migration time.
  - At query time, consider `SET hnsw.ef_search = 80;` in a transaction for higher recall if needed (default is 40).
  - GIN index on `fts` for full-text search.
  - B-tree index on `document_id` for FK lookups and cascade performance.
  - B-tree index on `ingestion_run_id` for rollback queries (`DELETE FROM ai_kb_documents WHERE ingestion_run_id = X`).
  - GIN indexes on `audience` and `domain_tags` for array overlap (`&&`) filter efficiency.
- Batch embeddings (20 texts per embedding API call). Document+chunk writes are per-document via the atomic upsert RPC.
- Incremental mode uses `content_hash` comparison to skip unchanged documents. The `source_path` UNIQUE constraint ensures exactly one row per logical source.
- Hybrid ranking executed in DB to avoid heavy app-layer merging.
- **Known scaling limitation (P3)**: The `search_ai_kb_chunks` CTE computes cosine distance as a scalar expression for every row passing the `WHERE` filters. This means the HNSW index is not leveraged (it only accelerates `ORDER BY embedding <=> vector LIMIT N` at the top level of a query). For a curated KB with < 50K chunks, this is acceptable (sub-100ms on Supabase Postgres). When chunk count exceeds 50K, refactor to a two-stage retrieval: (1) ANN top-K via `ORDER BY embedding <=> query_embedding LIMIT K`, (2) FTS top-K via `ORDER BY ts_rank_cd(fts, query) LIMIT K`, (3) union the two candidate sets, (4) compute blended rank on the union only. This change is backwards-compatible (same function signature, different internal implementation).

## Migration Impact
- Additive migration only; no destructive changes to existing tables or functions.
- Enables `vector` extension via `CREATE EXTENSION IF NOT EXISTS vector`. This is a no-op on Supabase cloud (pgvector is pre-installed). On local, Supabase CLI bundles pgvector — no manual install needed.
- Migration number: `155` (153 and 154 are taken by existing migrations).
- Backfill strategy:
  - Initial full ingest after migration.
  - No blocking impact on existing product flows.

## Full Test Plan
### Unit tests
- `chunking.test.ts`
  - Splits markdown by heading boundaries predictably.
  - Preserves metadata references per chunk (including `section_heading`, `source_path`, `source_type`).
  - Enforces min (100 chars) and max (2000 chars) chunk thresholds.
  - Heading context is carried into overflow chunks' metadata.
- `retrieval.test.ts`
  - Correct RPC argument mapping (audience/domain/limit).
  - Handles RPC errors and logging path.
  - Normalizes nullable fields safely.
- `embeddings.test.ts`
  - Retries once on transient 429/5xx before throwing.
  - Aborts with descriptive error on timeout.
  - Validates returned array length matches input texts length.
  - `getEmbeddingModel()` returns env var value when set, default when not set.
- `sources.test.ts`
  - `loadSourceRegistry()` parses valid JSON and returns typed registry.
  - Throws on missing `schemaVersion` or invalid value.
  - Throws on empty `sourcePath` in any entry.
  - `getSourceEntry()` returns matching entry or undefined.
  - Rejects sensitive paths matching `.env*`, `secret`, `credential`, `private.key` patterns.

### Integration tests
- `ai-kb-hybrid-search.test.ts`
  - Applies migration fixture and inserts seed docs/chunks with known vectors.
  - Verifies hybrid search ordering changes with keyword-heavy vs semantic-heavy queries.
  - Verifies audience/domain filters reduce result set correctly.
  - Verifies inactive documents (`is_active = false`) are never returned.
  - Verifies `match_documents` `filter` parameter: passing `'{"source_type": "faq"}'::jsonb` returns only chunks whose metadata contains that key/value; passing `'{}'` or `NULL` returns all active chunks.
- `ai-kb-upsert-rpc.test.ts` (new)
  - **Atomicity**: Insert a document with 3 chunks via the RPC. Verify document row exists with correct fields and 3 chunk rows exist.
  - **Supersession**: Call the RPC again for the same `source_path` with different `content_hash` and 2 chunks. Verify: document row is updated (not duplicated), old 3 chunks are deleted, new 2 chunks exist, `was_updated = true`, `chunks_written = 2`.
  - **Idempotent skip**: Call the RPC again for the same `source_path` with the same `content_hash`. Verify: `was_updated = false`, `chunks_written = 0`, `last_reviewed_at` is updated, chunks are untouched.
  - **ingestion_run_id tracking**: Create two ingestion runs. Upsert doc A with run 1, doc B with run 2. Verify each document has the correct `ingestion_run_id`. Delete all documents for run 1; verify only doc A is removed and its chunks are cascade-deleted.
- `ai-kb-concurrency-guard.test.ts` (new)
  - Calls `acquire_ingestion_lock` when no blocking run exists and verifies `status = 'acquired'` with a new `run_id`.
  - Inserts an `ai_kb_ingestion_runs` row with `status = 'started'` and recent `started_at`. Verifies `acquire_ingestion_lock` returns `status = 'blocked'` with `blocking_run_id`.
  - Inserts an `ai_kb_ingestion_runs` row with `status = 'started'` and `started_at = now() - interval '2 hours'`. Verifies `acquire_ingestion_lock` marks it as `'failed'`, returns `status = 'acquired'`, and reports `stale_cleared = true`.
  - Inserts an `ai_kb_ingestion_runs` row with `status = 'completed'`. Verifies it does not block acquisition.
  - Exercises two concurrent `acquire_ingestion_lock` calls and verifies they do not both return `status = 'acquired'`.

### Unit tests — `search.test.ts`
- Returns 405 for GET/PUT/DELETE.
- Returns 401 when `Authorization` header is missing.
- Returns 401 when secret is wrong (including near-miss strings that differ by one character — confirms timing-safe comparison doesn't short-circuit).
- Returns 400 for empty query, query over 500 chars, and missing body.
- Returns 200 with correct shape `{ results, query, count, tookMs }` on valid request.
- `limit` exceeding 20 is silently capped at 20 in the call to `searchKnowledgeBase`.
- 500 response body is `{ error: "internal_error" }` when `embedTexts` throws — no internal message leaked.
- 500 response body is `{ error: "internal_error" }` when `searchKnowledgeBase` throws — no internal message leaked.

### Unit tests — `verify.test.ts` (new)
- **Model consistency check**: Mock DB returning 2 distinct `embedding_model` values → FAIL. Mock DB returning 1 value → PASS.
- **Staleness check**: Mock registry with `staleDays: 7` and document `last_reviewed_at` 10 days ago → WARN. 3 days ago → PASS.
- **Coverage gap check**: Mock registry with 3 sources, DB has 2 active documents → WARN for missing source. DB has 4 active documents (one not in registry) → WARN for orphaned document.
- **Empty chunks check**: Mock DB returning count > 0 → WARN. Count = 0 → PASS.
- **Run health check**: Mock latest run with `status = 'failed'` → FAIL. `status = 'completed'` and `finished_at` 2 hours ago → PASS. `finished_at` 30 hours ago → WARN.

### Edge case tests
- Empty content ingestion rejected with descriptive error before DB insert.
- Same `source_path` upsert with identical `content_hash` is idempotent (no chunk re-creation, only `last_reviewed_at` stamped).
- Same `source_path` upsert with different `content_hash` replaces document and all chunks atomically.
- Chunk under 100 chars is rejected before embedding API call.
- Invalid vector dimension (not 1536) triggers controlled failure with descriptive error.
- RPC-based concurrency guard prevents concurrent `build.ts` execution (second invocation exits with code 0, not error). Stale runs (> 60 minutes) are auto-marked as failed.

## Regression Risk Tests
- Ensure existing Supabase migrations still apply end-to-end with `153` appended.
- Smoke-check key API routes to verify no side-effects from new tables/functions.
- Verify logger behavior remains within existing env-level controls.
- Confirm no client bundle imports from server-only knowledge modules (enforce with ESLint or import boundary check).

## Plan Validation Checklist
- [x] No new dependencies introduced unless justified — uses existing `OPENROUTER_API_KEY`; two new env vars (`OPENROUTER_EMBEDDING_MODEL`, `AI_KB_API_SECRET`); `crypto.timingSafeEqual` is Node built-in; no new npm packages; one new config file (`ai-kb-sources.json`)
- [x] Reuses existing utilities, hooks, services, and patterns — `createAdminClient`, `getLogger`, `update_updated_at_column()`, fetch+AbortController pattern from `lib/ai/client.ts`
- [x] No duplication of existing logic — embedding client follows existing AI client pattern without copying it; RLS follows 152 pattern
- [x] Avoids needless abstraction or premature generalization — three files for three concerns; no base classes or plugin registries
- [x] Edge cases documented — all cases have concrete resolution strategy including supersession, concurrency, model drift, rollback, partial failure
- [x] Failure states handled — ingestion runs marked failed; batch retry specified; partial chunk commit prevented by transactional upsert RPC; per-document failure doesn't abort entire run
- [x] Security implications evaluated — RLS deny-all for non-service_role; GRANT EXECUTE limited to service_role; SECURITY DEFINER + SET search_path on all PL/pgSQL RPCs; no PII ingestion; external API uses timing-safe secret check; query length capped; errors never leak internals
- [x] Migration safety reviewed — additive only; `CREATE EXTENSION` is idempotent; HNSW index works on empty table; migration numbered 153 to avoid conflict with existing 152; `ai_kb_ingestion_runs` created before `ai_kb_documents` for FK dependency
- [x] Test cases fully defined — unit, integration, and edge case tests specified with concrete assertions including upsert atomicity, RPC-based concurrency guard, verify.ts checks, and `match_documents` filter
- [x] Regression risks identified — migration stack, API routes, client bundle boundary, logger controls
- [x] Ingestion pipeline robustness — transactional atomicity via PL/pgSQL RPC; concurrency guard via `acquire_ingestion_lock` over `ai_kb_ingestion_runs` (advisory locks are incompatible with PostgREST's stateless HTTP sessions); supersession handling via `ON CONFLICT (source_path) DO UPDATE`; run-to-document traceability via `ingestion_run_id` FK; embedding model drift detection via chunk metadata; staleness detection via `last_reviewed_at` + registry `staleDays`; source coverage gaps detected by declarative registry comparison
- [x] Known limitations documented — hybrid search CTE does not leverage HNSW index at scale (P3, acceptable for < 50K chunks); `match_documents` filter supports top-level key/value containment only (no nested/range queries)
