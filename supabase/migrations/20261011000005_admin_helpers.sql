-- =============================================================================
-- Admin helpers. SECURITY INVOKER: they run with the caller's rights, so RLS
-- (admin only) still applies; the explicit is_admin() check gives a clear error.
-- =============================================================================

-- Replace a master's services and weekly working hours in one transaction.
-- p_hours: [{"weekday": 1, "start": "09:00", "end": "13:00"}, ...]
create or replace function public.set_master_schedule(
  p_master_id   uuid,
  p_service_ids uuid[],
  p_hours       jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  delete from public.master_services ms where ms.master_id = p_master_id;
  insert into public.master_services (master_id, service_id)
  select p_master_id, s from unnest(coalesce(p_service_ids, '{}')) s;

  delete from public.working_hours wh where wh.master_id = p_master_id;
  insert into public.working_hours (master_id, weekday, start_time, end_time)
  select p_master_id, (h ->> 'weekday')::smallint, (h ->> 'start')::time, (h ->> 'end')::time
  from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) h;
end;
$$;

revoke all on function public.set_master_schedule(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.set_master_schedule(uuid, uuid[], jsonb) to authenticated, service_role;
