begin;
alter table private.rate_buckets add column created_at timestamptz not null default now();
create function public.apply_agent_change(p_tool text,p_operations jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op jsonb; events jsonb;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations)<>1 then raise exception 'invalid_agent_operations'; end if;
  op:=p_operations->0;
  if not (
    (p_tool='add_task' and op->>'entity'='tasks' and op->>'action'='create') or
    (p_tool='log_workout' and op->>'entity'='workouts' and op->>'action'='create') or
    (p_tool='log_study' and op->>'entity'='study_logs' and op->>'action'='create') or
    (p_tool='add_project_note' and op->>'entity'='projects' and op->>'action'='update' and op->'data'-'notes'='{}'::jsonb) or
    (p_tool='mark_news_read' and op->>'entity'='news_items' and op->>'action'='update' and op->'data'='{"read":true}'::jsonb)
  ) then raise exception 'agent_operation_forbidden'; end if;
  events:=public.apply_batch(p_operations);
  insert into public.agent_logs(user_id,tool,tier,status) values(auth.uid(),p_tool,2,'applied');
  return events;
end $$;
revoke all on function public.apply_agent_change(text,jsonb) from public,anon;
grant execute on function public.apply_agent_change(text,jsonb) to authenticated;
-- Bounded maintenance for private accounting and confirmation records.
create function public.prune_system_history(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
  delete from private.rate_buckets where created_at<now()-interval '3 days';
  delete from public.pending_actions where user_id=p_user and expires_at<now()-interval '7 days';
end $$;
revoke all on function public.prune_system_history(uuid) from public,anon,authenticated;
grant execute on function public.prune_system_history(uuid) to service_role;
create function public.take_login_rate(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; w bigint:=floor(extract(epoch from now())/60);
begin
  if p_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid_key'; end if;
  insert into private.rate_buckets(user_key,bucket,window_start,count) values('login:'||p_key,'login',w,1)
    on conflict(user_key,bucket,window_start) do update set count=private.rate_buckets.count+1 returning count into n;
  return n<=10;
end $$;
revoke all on function public.take_login_rate(text) from public,anon,authenticated;
grant execute on function public.take_login_rate(text) to service_role;
commit;
