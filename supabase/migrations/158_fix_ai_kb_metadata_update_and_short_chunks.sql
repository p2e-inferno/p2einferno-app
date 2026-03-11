-- Fix 1: upsert_kb_document_with_chunks fallback branch now updates metadata
-- even when content_hash is unchanged. Previously only ingestion_run_id and
-- last_reviewed_at were updated, silently losing title/audience/domain_tags/version changes.
--
-- Fix 2: count_short_chunks now only counts chunks belonging to active documents.

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
set search_path = 'public', 'extensions'
as $$
declare
  v_doc_id       uuid;
  v_was_updated  boolean := false;
  v_chunk_count  int := 0;
  v_chunk        jsonb;
begin
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

  -- Fallback: content_hash unchanged, but still update metadata + bookkeeping
  if not found then
    update public.ai_kb_documents
    set title            = p_title,
        audience         = p_audience,
        domain_tags      = p_domain_tags,
        version          = p_version,
        ingestion_run_id = p_ingestion_run_id,
        is_active        = true,
        last_reviewed_at = now()
    where source_path = p_source_path
    returning id into v_doc_id;
    v_was_updated := false;
  end if;

  if v_was_updated then
    delete from public.ai_kb_chunks
    where public.ai_kb_chunks.document_id = v_doc_id;

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

  return query select v_doc_id, v_chunk_count, v_was_updated;
end;
$$;

revoke execute on function public.upsert_kb_document_with_chunks(text,text,text,text,text[],text[],text,text,uuid,jsonb) from public;
grant execute on function public.upsert_kb_document_with_chunks(text,text,text,text,text[],text[],text,text,uuid,jsonb) to service_role;

-- Fix 2: count_short_chunks should only count chunks from active documents
create or replace function public.count_short_chunks(min_length int default 100)
returns bigint
language sql
security definer
set search_path = 'public'
as $$
  select count(*)
  from ai_kb_chunks c
  join ai_kb_documents d on d.id = c.document_id
  where d.is_active = true
    and length(c.chunk_text) < min_length;
$$;
