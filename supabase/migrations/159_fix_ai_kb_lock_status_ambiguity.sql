create or replace function public.acquire_ingestion_lock(
  p_run_type             text,
  p_stale_threshold_min  int default 60
)
returns table (
  status          text,
  run_id          uuid,
  blocking_run_id uuid,
  stale_cleared   boolean
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_active_id    uuid;
  v_started_at   timestamptz;
  v_stale        boolean := false;
  v_new_run_id   uuid;
begin
  select r.id, r.started_at
  into v_active_id, v_started_at
  from public.ai_kb_ingestion_runs r
  where r.status = 'started'
  order by r.started_at desc
  limit 1
  for update skip locked;

  if v_active_id is not null then
    if v_started_at > now() - (p_stale_threshold_min || ' minutes')::interval then
      return query select 'blocked'::text, null::uuid, v_active_id, false;
      return;
    end if;

    update public.ai_kb_ingestion_runs
    set status = 'failed',
        finished_at = now(),
        error_message = 'Timed out: no completion after ' || p_stale_threshold_min || ' minutes (likely crashed)'
    where id = v_active_id
      and public.ai_kb_ingestion_runs.status = 'started';
    v_stale := true;
  end if;

  insert into public.ai_kb_ingestion_runs (run_type, status)
  values (p_run_type, 'started')
  returning id into v_new_run_id;

  return query select 'acquired'::text, v_new_run_id, null::uuid, v_stale;
end;
$$;

revoke all on function public.acquire_ingestion_lock(text, int) from public, anon, authenticated;
grant execute on function public.acquire_ingestion_lock(text, int) to service_role;
