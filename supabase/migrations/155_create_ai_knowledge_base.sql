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
  v_was_updated  boolean := false;
  v_chunk_count  int := 0;
  v_chunk        jsonb;
begin
  -- Step 1: Atomic document insert/update. Only update mutable fields when the
  -- content hash changed; unchanged documents are stamped separately below.
  with upserted as (
    insert into public.ai_kb_documents (
      source_type,
      source_path,
      title,
      content_markdown,
      audience,
      domain_tags,
      content_hash,
      version,
      ingestion_run_id,
      is_active,
      last_reviewed_at
    ) values (
      p_source_type,
      p_source_path,
      p_title,
      p_content_markdown,
      p_audience,
      p_domain_tags,
      p_content_hash,
      p_version,
      p_ingestion_run_id,
      true,
      now()
    )
    on conflict (source_path) do update
      set source_type      = excluded.source_type,
          title            = excluded.title,
          content_markdown = excluded.content_markdown,
          audience         = excluded.audience,
          domain_tags      = excluded.domain_tags,
          content_hash     = excluded.content_hash,
          version          = excluded.version,
          ingestion_run_id = excluded.ingestion_run_id,
          is_active        = true,
          last_reviewed_at = now()
      where public.ai_kb_documents.content_hash is distinct from excluded.content_hash
    returning id
  )
  select id, true
  into v_doc_id, v_was_updated
  from upserted;

  if not found then
    update public.ai_kb_documents
    set ingestion_run_id = p_ingestion_run_id,
        last_reviewed_at = now()
    where source_path = p_source_path
    returning id into v_doc_id;
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
