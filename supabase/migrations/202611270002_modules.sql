begin;
alter table public.projects add column vercel_project_id text not null default '' check(length(vercel_project_id)<=150);
alter table public.changes drop constraint changes_entity_check;
alter table public.changes add constraint changes_entity_check check(entity in ('projects','tasks','project_configs','study_logs','vocab_cards','workouts','body_metrics','ai_usage','vault_meta','vault_items','monitors','news_sources','news_items','weekly_reviews','settings'));

do $migration$
declare t record;
begin
  for t in select * from (values
    ('study_logs',$fields$language text not null check(language in ('en','zh')), date date not null, minutes integer not null check(minutes between 1 and 1440), notes text not null check(length(notes)<=5000)$fields$),
    ('vocab_cards',$fields$language text not null check(language in ('en','zh')), front text not null check(length(trim(front)) between 1 and 300), back text not null check(length(trim(back)) between 1 and 2000), phonetic text not null check(length(phonetic)<=300), example text not null check(length(example)<=2000), due_date date not null, interval_days integer not null check(interval_days between 0 and 36500), repetitions integer not null check(repetitions between 0 and 10000), ease numeric not null check(ease between 1.3 and 5), last_reviewed timestamptz$fields$),
    ('workouts',$fields$date date not null, title text not null check(length(trim(title)) between 1 and 160), duration_min integer not null check(duration_min between 0 and 1440), sets jsonb not null check(jsonb_typeof(sets)='array' and jsonb_array_length(sets) between 1 and 100), notes text not null check(length(notes)<=5000)$fields$),
    ('body_metrics',$fields$date date not null, weight_kg numeric check(weight_kg>0 and weight_kg<=500), notes text not null check(length(notes)<=5000)$fields$),
    ('ai_usage',$fields$date date not null, tool text not null check(length(trim(tool)) between 1 and 100), model text not null check(length(model)<=150), project_id uuid, input_tokens bigint not null check(input_tokens between 0 and 100000000), output_tokens bigint not null check(output_tokens between 0 and 100000000), cost_usd numeric not null check(cost_usd between 0 and 100000), source text not null check(source in ('manual','api')), notes text not null check(length(notes)<=5000), request_key text, foreign key(project_id,user_id) references public.projects(id,user_id)$fields$),
    ('vault_meta',$fields$salt text not null check(salt ~ '^[A-Za-z0-9+/]{22}==$'), iterations integer not null check(iterations=600000), verifier text not null check(length(verifier) between 20 and 500), verifier_iv text not null check(verifier_iv ~ '^[A-Za-z0-9+/]{16}$'), cipher_version integer not null check(cipher_version=1), unique(user_id)$fields$),
    ('vault_items',$fields$label text not null check(length(trim(label)) between 1 and 160), category text not null check(length(trim(category)) between 1 and 60), location text not null check(location in ('vault','bitwarden')), ciphertext text not null check(length(ciphertext) between 1 and 150000), iv text not null check(iv ~ '^[A-Za-z0-9+/]{16}$'), cipher_version integer not null check(cipher_version=1)$fields$),
    ('monitors',$fields$name text not null check(length(trim(name)) between 1 and 160), url text not null check(url ~ '^https?://' and length(url)<=2000), project_id uuid, expected_status integer not null check(expected_status between 100 and 599), interval_minutes integer not null check(interval_minutes between 5 and 1440), failure_threshold integer not null check(failure_threshold between 2 and 10), timeout_ms integer not null check(timeout_ms between 1000 and 10000), enabled boolean not null, foreign key(project_id,user_id) references public.projects(id,user_id)$fields$),
    ('news_sources',$fields$name text not null check(length(trim(name)) between 1 and 160), url text not null check(url ~ '^https?://' and length(url)<=2000), enabled boolean not null, keywords jsonb not null check(jsonb_typeof(keywords)='array' and jsonb_array_length(keywords)<=30)$fields$),
    ('news_items',$fields$source_id uuid, title text not null check(length(trim(title)) between 1 and 500), url text not null check(url ~ '^https?://'), summary text not null check(length(summary)<=10000), published_at timestamptz, tags jsonb not null check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=30), read boolean not null, external_id text not null check(length(external_id)<=200), unique(user_id,external_id)$fields$),
    ('weekly_reviews',$fields$week_start date not null, metrics jsonb not null check(jsonb_typeof(metrics)='object'), summary text not null check(length(summary)<=10000), suggestions jsonb not null check(jsonb_typeof(suggestions)='array' and jsonb_array_length(suggestions)=3), source text not null check(source in ('deterministic','llm')), unique(user_id,week_start)$fields$),
    ('settings',$fields$theme text not null check(theme in ('auto','dark','light')), sound boolean not null, keywords jsonb not null check(jsonb_typeof(keywords)='array' and jsonb_array_length(keywords)<=30), ai_monthly_budget numeric not null check(ai_monthly_budget between 0 and 100000), ai_daily_tokens integer not null check(ai_daily_tokens between 0 and 10000000), ai_input_per_million numeric not null check(ai_input_per_million between 0 and 1000), ai_output_per_million numeric not null check(ai_output_per_million between 0 and 1000), greeting boolean not null, notifications boolean not null, unique(user_id)$fields$)
  ) as definitions(name,fields) loop
    execute format('create table public.%I (id uuid primary key,user_id uuid not null references auth.users(id),version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,%s)',t.name,t.fields);
    execute format('alter table public.%I enable row level security',t.name);
    execute format('create policy owner_read on public.%I for select to authenticated using (user_id=(select auth.uid()) and (select public.is_app_owner()))',t.name);
    execute format('revoke all on public.%I from public,anon,authenticated',t.name);
    execute format('grant select on public.%I to authenticated',t.name);
    execute format('create index on public.%I(user_id) where archived_at is null',t.name);
  end loop;
end;
$migration$;
create unique index on public.ai_usage(user_id,request_key) where request_key is not null;
create index on public.vocab_cards(user_id,due_date) where archived_at is null;
create index on public.study_logs(user_id,date);
create index on public.workouts(user_id,date);
create index on public.ai_usage(user_id,date);
create index on public.project_configs using gin(to_tsvector('simple',title||' '||run_steps||' '||troubleshooting));
create view public.workout_sets with(security_invoker=true) as
  select w.id as workout_id,w.user_id,(s.value->>'exercise') as exercise,(s.value->>'reps')::integer as reps,(s.value->>'weight_kg')::numeric as weight_kg,s.ordinality as set_number
  from public.workouts w cross join lateral jsonb_array_elements(w.sets) with ordinality s(value,ordinality) where w.archived_at is null;
grant select on public.workout_sets to authenticated;

create or replace function private.editable_columns(p_entity text) returns text[]
language plpgsql stable set search_path='' as $$
declare cols text[];
begin
  if p_entity not in ('projects','tasks','project_configs','study_logs','vocab_cards','workouts','body_metrics','ai_usage','vault_meta','vault_items','monitors','news_sources','news_items','weekly_reviews','settings') then return null; end if;
  select array_agg(a.attname::text order by a.attnum) into cols from pg_catalog.pg_attribute a
    where a.attrelid=to_regclass('public.'||p_entity) and a.attnum>0 and not a.attisdropped
      and a.attname not in ('id','user_id','version','created_at','updated_at','archived_at','done_at');
  return cols;
end;
$$;
create or replace function private.assert_no_children(p_id uuid,p_user uuid) returns void
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.tasks where project_id=p_id and user_id=p_user and archived_at is null)
    or exists(select 1 from public.project_configs where project_id=p_id and user_id=p_user and archived_at is null)
    or exists(select 1 from public.monitors where project_id=p_id and user_id=p_user and archived_at is null)
    or exists(select 1 from public.ai_usage where project_id=p_id and user_id=p_user and archived_at is null)
  then raise exception 'active_children'; end if;
end;
$$;
alter function public.apply_change(text,text,uuid,jsonb,integer) set schema private;
alter function private.apply_change(text,text,uuid,jsonb,integer) rename to apply_change_internal;
create function public.apply_change(p_entity text,p_action text,p_id uuid,p_data jsonb,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item jsonb;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if p_entity='vault_meta' and p_action<>'create' then raise exception 'vault_meta_immutable'; end if;
  if p_entity='ai_usage' then
    if p_data->>'source'='api' or exists(select 1 from public.ai_usage where id=p_id and user_id=auth.uid() and source='api') then raise exception 'automatic_usage_immutable'; end if;
  end if;
  if p_action='create' and p_entity='monitors' and (select count(*) from public.monitors where user_id=auth.uid() and archived_at is null)>=20 then raise exception 'monitor_limit'; end if;
  if p_action='create' and p_entity='news_sources' and (select count(*) from public.news_sources where user_id=auth.uid() and archived_at is null)>=8 then raise exception 'source_limit'; end if;
  if p_entity='workouts' and p_action<>'archive' and p_data ? 'sets' then
    for v_item in select jsonb_array_elements(p_data->'sets') loop
      if jsonb_typeof(v_item)<>'object' or coalesce(length(trim(v_item->>'exercise')),0) not between 1 and 100
        or coalesce((v_item->>'reps')::numeric,0) not between 1 and 1000 or (v_item->>'reps')::numeric<>trunc((v_item->>'reps')::numeric)
        or v_item->>'weight_kg' is null or (v_item->>'weight_kg')::numeric not between 0 and 1000 then raise exception 'invalid_set'; end if;
    end loop;
  end if;
  return private.apply_change_internal(p_entity,p_action,p_id,p_data,p_expected_version);
end;
$$;
alter function public.undo_change(uuid) set schema private;
alter function private.undo_change(uuid) rename to undo_change_internal;
create function public.undo_change(p_change_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.changes;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  select * into e from public.changes where id=p_change_id and user_id=auth.uid();
  if e.entity='vault_meta' then raise exception 'vault_meta_immutable'; end if;
  return private.undo_change_internal(p_change_id);
end;
$$;
create function public.apply_batch(p_operations jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op jsonb; events jsonb:='[]';
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations) not between 1 and 5000 or octet_length(p_operations::text)>5000000 then raise exception 'invalid_batch'; end if;
  for op in select jsonb_array_elements(p_operations) loop
    events:=events||jsonb_build_array(public.apply_change(op->>'entity',op->>'action',(op->>'id')::uuid,op->'data',(op->>'expectedVersion')::integer));
  end loop;
  return events;
end;
$$;

create table public.monitor_checks(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),monitor_id uuid not null references public.monitors(id),checked_at timestamptz not null default now(),ok boolean not null,status_code integer,latency_ms integer not null,error text,ssl_expires_at timestamptz,domain_expires_at timestamptz);
create index on public.monitor_checks(user_id,monitor_id,checked_at desc);
create table public.incidents(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),monitor_id uuid not null references public.monitors(id),opened_at timestamptz not null default now(),resolved_at timestamptz,reason text not null);
create unique index on public.incidents(monitor_id) where resolved_at is null;
create table public.agent_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),tool text not null check(length(tool)<=100),tier integer not null check(tier between 1 and 4),status text not null check(length(status)<=60),created_at timestamptz not null default now());
create table public.pending_actions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),tool text not null,payload jsonb not null,preview text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',consumed_at timestamptz);
create table public.integration_snapshots(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),project_id uuid not null references public.projects(id),provider text not null check(provider in ('github','vercel')),payload jsonb not null,checked_at timestamptz not null default now(),unique(user_id,project_id,provider));
create table public.job_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),name text not null,run_key text not null,status text not null check(status in ('running','done','failed')),started_at timestamptz not null default now(),finished_at timestamptz,detail text,unique(user_id,name,run_key));
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),dedupe_key text not null,status text not null default 'reserved',created_at timestamptz not null default now(),unique(user_id,dedupe_key));
do $$ declare n text; begin
  foreach n in array array['monitor_checks','incidents','agent_logs','pending_actions','integration_snapshots','job_runs','notification_outbox'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select auth.uid()) and (select public.is_app_owner()))',n);
    execute format('revoke all on public.%I from public,anon,authenticated',n);
    execute format('grant select on public.%I to authenticated',n);
  end loop;
end $$;

create function public.propose_action(p_tool text,p_payload jsonb,p_preview text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row public.pending_actions;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if p_tool not in ('bulk_update','bulk_archive','disable_monitor','update_config','send_notification') or length(p_preview)>4000 or octet_length(p_payload::text)>100000 then raise exception 'invalid_proposal'; end if;
  insert into public.pending_actions(user_id,tool,payload,preview) values(auth.uid(),p_tool,p_payload,p_preview) returning * into row;
  return to_jsonb(row)-'user_id';
end;
$$;
create function public.confirm_action(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row public.pending_actions; op jsonb; events jsonb:='[]';
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  select * into row from public.pending_actions where id=p_id and user_id=auth.uid() for update;
  if not found or row.consumed_at is not null or row.expires_at<now() then raise exception 'expired_or_consumed'; end if;
  if row.tool<>'send_notification' then
    for op in select jsonb_array_elements(row.payload->'operations') loop
      if op->>'entity' not in ('tasks','projects','project_configs','monitors') then raise exception 'agent_entity_forbidden'; end if;
      if op->>'action' not in ('update','archive') then raise exception 'agent_action_forbidden'; end if;
    end loop;
    events:=public.apply_batch(row.payload->'operations');
  end if;
  update public.pending_actions set consumed_at=now() where id=p_id;
  insert into public.agent_logs(user_id,tool,tier,status) values(auth.uid(),row.tool,3,'confirmed');
  return jsonb_build_object('tool',row.tool,'payload',case when row.tool='send_notification' then row.payload else '{}'::jsonb end,'changes',events);
end;
$$;
create function public.log_agent_event(p_tool text,p_tier integer,p_status text) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  insert into public.agent_logs(user_id,tool,tier,status) values(auth.uid(),left(p_tool,100),p_tier,left(p_status,60));
end $$;

create table private.rate_buckets(user_key text not null,bucket text not null,window_start bigint not null,count integer not null,primary key(user_key,bucket,window_start));
create function public.take_rate(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; w bigint;
begin
  if not public.is_app_owner() or p_seconds not between 1 and 86400 or p_limit not between 1 and 10000 then raise exception 'unauthorized'; end if;
  w:=floor(extract(epoch from now())/p_seconds);
  insert into private.rate_buckets values(auth.uid()::text,left(p_bucket,100),w,1) on conflict(user_key,bucket,window_start) do update set count=private.rate_buckets.count+1 returning count into n;
  return n<=p_limit;
end $$;

create table private.ai_reservations(id uuid primary key,user_id uuid not null,day date not null,month date not null,tokens integer not null,cost numeric not null,status text not null default 'pending',created_at timestamptz not null default now());
create function public.reserve_ai(p_id uuid,p_tokens integer,p_cost numeric,p_day date,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare settings public.settings; spent numeric; tokens_used bigint;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if p_tokens not between 1 and 1000000 or p_cost<=0 or p_cost>1000 or p_day<>(now() at time zone 'Asia/Bangkok')::date or p_month<>date_trunc('month',p_day)::date then raise exception 'invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select * into settings from public.settings where user_id=auth.uid() and archived_at is null;
  if not found or settings.ai_input_per_million<=0 or settings.ai_output_per_million<=0 then raise exception 'pricing_not_configured'; end if;
  select coalesce(sum(cost),0) into spent from private.ai_reservations where user_id=auth.uid() and month=p_month;
  select coalesce(sum(tokens),0) into tokens_used from private.ai_reservations where user_id=auth.uid() and day=p_day;
  if spent+p_cost>settings.ai_monthly_budget or tokens_used+p_tokens>settings.ai_daily_tokens then raise exception 'ai_budget_exceeded'; end if;
  insert into private.ai_reservations(id,user_id,day,month,tokens,cost) values(p_id,auth.uid(),p_day,p_month,p_tokens,p_cost);
end $$;
create function public.settle_ai(p_id uuid,p_model text,p_input integer,p_output integer,p_cost numeric,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.ai_reservations;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  select * into r from private.ai_reservations where id=p_id and user_id=auth.uid() for update;
  if not found or r.status<>'pending' then raise exception 'invalid_reservation'; end if;
  if p_input<0 or p_output<0 or p_cost<0 or p_input+p_output>r.tokens or p_cost>r.cost then raise exception 'usage_exceeded_reservation'; end if;
  update private.ai_reservations set tokens=case when p_status='done' then p_input+p_output else tokens end,cost=case when p_status='done' then p_cost else cost end,status=case when p_status='done' then 'done' else 'unknown' end where id=p_id;
  insert into public.ai_usage(id,user_id,date,tool,model,project_id,input_tokens,output_tokens,cost_usd,source,notes,request_key)
    values(gen_random_uuid(),auth.uid(),r.day,'J.A.R.V.I.S.',left(p_model,150),null,p_input,p_output,case when p_status='done' then p_cost else r.cost end,'api',case when p_status='done' then '' else 'Chi phí dự phòng: kết quả API chưa xác định.' end,p_id::text);
end $$;

create function public.claim_job(p_user uuid,p_name text,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from private.app_owner where user_id=p_user) then raise exception 'invalid_owner'; end if;
  insert into public.job_runs(user_id,name,run_key,status) values(p_user,p_name,p_key,'running') on conflict(user_id,name,run_key) do nothing returning id into result;
  return result;
end $$;

create function public.record_monitor_result(p_user uuid,p_monitor uuid,p_ok boolean,p_status integer,p_latency integer,p_error text,p_ssl timestamptz default null,p_domain timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.monitors; failed integer; incident public.incidents; outcome text:='none';
begin
  select * into m from public.monitors where id=p_monitor and user_id=p_user and archived_at is null and enabled for update;
  if not found then raise exception 'invalid_monitor'; end if;
  insert into public.monitor_checks(user_id,monitor_id,ok,status_code,latency_ms,error,ssl_expires_at,domain_expires_at) values(p_user,p_monitor,p_ok,p_status,p_latency,left(p_error,200),p_ssl,p_domain);
  select * into incident from public.incidents where monitor_id=p_monitor and resolved_at is null for update;
  if p_ok and incident.id is not null then
    update public.incidents set resolved_at=now() where id=incident.id;outcome:='recovered';
  elsif not p_ok and incident.id is null then
    select count(*) into failed from (select ok from public.monitor_checks where monitor_id=p_monitor and checked_at>=m.updated_at order by checked_at desc limit m.failure_threshold) q where not ok;
    if failed>=m.failure_threshold then
      insert into public.incidents(user_id,monitor_id,reason) values(p_user,p_monitor,coalesce(left(p_error,200),'HTTP status không khớp')) returning * into incident;outcome:='opened';
    end if;
  end if;
  return jsonb_build_object('outcome',outcome,'incident_id',incident.id);
end $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure::text as sig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('apply_change','undo_change','apply_batch','propose_action','confirm_action','log_agent_event','take_rate','reserve_ai','settle_ai') loop
    execute 'revoke all on function '||fn.sig||' from public,anon';execute 'grant execute on function '||fn.sig||' to authenticated';
  end loop;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.claim_job(uuid,text,text),public.record_monitor_result(uuid,uuid,boolean,integer,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_job(uuid,text,text),public.record_monitor_result(uuid,uuid,boolean,integer,integer,text,timestamptz,timestamptz) to service_role;
grant all on all tables in schema public to service_role;
commit;
