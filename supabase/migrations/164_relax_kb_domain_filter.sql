-- ─── Relax KB domain filter ───────────────────────────────────────────────────
--
-- Previously search_ai_kb_chunks hard-filtered on both audience AND domain_tags.
-- domain_tags are now treated as relevance metadata only, not a retrieval gate.
-- audience_filter remains a hard filter (persona/access boundary).
--
-- domain_filter parameter is retained in the signature for backward compatibility
-- and potential future use as a ranking boost, but is no longer applied in WHERE.

create or replace function public.search_ai_kb_chunks(
  query_text      text,
  query_embedding vector(1536),
  audience_filter text[] default null,
  domain_filter   text[] default null,
  limit_count     int    default 8
)
returns table (
  chunk_id      uuid,
  document_id   uuid,
  title         text,
  chunk_text    text,
  metadata      jsonb,
  rank          numeric,
  keyword_rank  numeric,
  semantic_rank numeric
)
language sql
stable
set search_path = 'public', 'extensions'
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
