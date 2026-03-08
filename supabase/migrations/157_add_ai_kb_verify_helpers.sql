-- Helper SQL functions for verify.ts health checks.
-- These enable server-side DISTINCT and COUNT operations that PostgREST
-- cannot express, matching the spec's SQL approach for Check 1 and Check 4.

-- Check 1: Returns distinct embedding models from active chunks
CREATE OR REPLACE FUNCTION public.get_distinct_embedding_models()
RETURNS TABLE(embedding_model text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT DISTINCT c.metadata->>'embedding_model'
  FROM ai_kb_chunks c
  JOIN ai_kb_documents d ON d.id = c.document_id
  WHERE d.is_active = true
    AND c.metadata->>'embedding_model' IS NOT NULL;
$$;

-- Check 4: Returns count of chunks with text shorter than min_length
CREATE OR REPLACE FUNCTION public.count_short_chunks(min_length int DEFAULT 100)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT count(*)
  FROM ai_kb_chunks
  WHERE length(chunk_text) < min_length;
$$;

REVOKE ALL ON FUNCTION public.get_distinct_embedding_models() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_embedding_models() TO service_role;

REVOKE ALL ON FUNCTION public.count_short_chunks(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_short_chunks(int) TO service_role;
