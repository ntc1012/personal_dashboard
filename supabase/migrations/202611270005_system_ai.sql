begin;
create function public.reserve_system_ai(p_user uuid,p_id uuid,p_tokens integer,p_cost numeric,p_day date,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare settings public.settings; spent numeric; tokens_used bigint;
begin
  if not exists(select 1 from private.app_owner where user_id=p_user) then raise exception 'invalid_owner'; end if;
  if p_tokens not between 1 and 1000000 or p_cost<=0 or p_cost>1000 or p_day<>(now() at time zone 'Asia/Bangkok')::date or p_month<>date_trunc('month',p_day)::date then raise exception 'invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into settings from public.settings where user_id=p_user and archived_at is null;
  if not found or settings.ai_input_per_million<=0 or settings.ai_output_per_million<=0 then raise exception 'pricing_not_configured'; end if;
  select coalesce(sum(cost),0) into spent from private.ai_reservations where user_id=p_user and month=p_month;
  select coalesce(sum(tokens),0) into tokens_used from private.ai_reservations where user_id=p_user and day=p_day;
  if spent+p_cost>settings.ai_monthly_budget or tokens_used+p_tokens>settings.ai_daily_tokens then raise exception 'ai_budget_exceeded'; end if;
  insert into private.ai_reservations(id,user_id,day,month,tokens,cost) values(p_id,p_user,p_day,p_month,p_tokens,p_cost);
end $$;
create function public.settle_system_ai(p_user uuid,p_id uuid,p_model text,p_input integer,p_output integer,p_cost numeric,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.ai_reservations;
begin
  if not exists(select 1 from private.app_owner where user_id=p_user) then raise exception 'invalid_owner'; end if;
  select * into r from private.ai_reservations where id=p_id and user_id=p_user for update;
  if not found or r.status<>'pending' then raise exception 'invalid_reservation'; end if;
  if p_input<0 or p_output<0 or p_cost<0 or p_input+p_output>r.tokens or p_cost>r.cost then raise exception 'usage_exceeded_reservation'; end if;
  update private.ai_reservations set tokens=case when p_status='done' then p_input+p_output else tokens end,cost=case when p_status='done' then p_cost else cost end,status=case when p_status='done' then 'done' else 'unknown' end where id=p_id;
  insert into public.ai_usage(id,user_id,date,tool,model,project_id,input_tokens,output_tokens,cost_usd,source,notes,request_key)
    values(gen_random_uuid(),p_user,r.day,'J.A.R.V.I.S. scheduled',left(p_model,150),null,p_input,p_output,case when p_status='done' then p_cost else r.cost end,'api',case when p_status='done' then '' else 'Chi phí dự phòng: kết quả API chưa xác định.' end,p_id::text);
end $$;
revoke all on function public.reserve_system_ai(uuid,uuid,integer,numeric,date,date),public.settle_system_ai(uuid,uuid,text,integer,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.reserve_system_ai(uuid,uuid,integer,numeric,date,date),public.settle_system_ai(uuid,uuid,text,integer,integer,numeric,text) to service_role;
commit;
