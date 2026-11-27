-- J.A.R.V.I.S. fresh installation. Run pending migrations only on an existing project.

-- SOURCE: 202611270001_core.sql
-- Run with the Supabase SQL editor (database owner). No service key needed by the app.
begin;
create schema if not exists private;
revoke all on schema private from public;
create table private.app_owner (user_id uuid primary key references auth.users(id));
revoke all on private.app_owner from public, anon, authenticated;

create function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.app_owner where user_id = auth.uid())
    and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(
      select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'
    ));
$$;
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

create table public.projects (
  id uuid primary key, user_id uuid not null references auth.users(id),
  name text not null check(length(trim(name)) between 1 and 120),
  category text not null check(category in ('personal','school','work')),
  prod_url text not null default '' check(prod_url='' or prod_url ~ '^https?://'),
  repo_url text not null default '' check(repo_url='' or repo_url ~ '^https?://'),
  stack text not null default '' check(length(stack)<=300),
  status text not null check(status in ('active','paused','done')),
  notes text not null default '' check(length(notes)<=5000),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(id,user_id)
);
create table public.tasks (
  id uuid primary key, user_id uuid not null references auth.users(id),
  title text not null check(length(trim(title)) between 1 and 240),
  project_id uuid, due_date date,
  priority text not null check(priority in ('low','medium','high')),
  status text not null check(status in ('todo','done')), done_at timestamptz,
  notes text not null default '' check(length(notes)<=5000),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key(project_id,user_id) references public.projects(id,user_id),
  check((status='done' and done_at is not null) or (status='todo' and done_at is null))
);
create table public.project_configs (
  id uuid primary key, user_id uuid not null references auth.users(id),
  project_id uuid not null,
  title text not null check(length(trim(title)) between 1 and 160),
  run_steps text not null default '' check(length(run_steps)<=10000),
  deploy_steps text not null default '' check(length(deploy_steps)<=10000),
  env_var_names text not null default '' check(length(env_var_names)<=2000 and env_var_names ~ '^[A-Z0-9_,\s]*$'),
  runtime text not null default '' check(length(runtime)<=200),
  troubleshooting text not null default '' check(length(troubleshooting)<=10000),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  foreign key(project_id,user_id) references public.projects(id,user_id)
);
create table public.changes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  entity text not null check(entity in ('projects','tasks','project_configs')),
  record_id uuid not null, action text not null check(action in ('create','update','archive')),
  before_data jsonb, after_version integer not null,
  created_at timestamptz not null default now(), undone_at timestamptz
);
create index on public.tasks(user_id,due_date) where archived_at is null and status='todo';
create index on public.tasks(user_id,project_id);
create index on public.project_configs(user_id,project_id);
create index on public.projects(user_id);
create index on public.changes(user_id,created_at desc);
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.project_configs enable row level security;
alter table public.changes enable row level security;
create policy owner_read on public.projects for select to authenticated using(user_id=(select auth.uid()) and (select public.is_app_owner()));
create policy owner_read on public.tasks for select to authenticated using(user_id=(select auth.uid()) and (select public.is_app_owner()));
create policy owner_read on public.project_configs for select to authenticated using(user_id=(select auth.uid()) and (select public.is_app_owner()));
create policy owner_read on public.changes for select to authenticated using(user_id=(select auth.uid()) and (select public.is_app_owner()));
-- All writes go through atomic, allowlisted functions, including from authenticated clients.
revoke all on public.projects,public.tasks,public.project_configs,public.changes from anon,authenticated;
grant select on public.projects,public.tasks,public.project_configs,public.changes to authenticated;

create function private.editable_columns(p_entity text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_entity
    when 'projects' then array['name','category','prod_url','repo_url','stack','status','notes']
    when 'tasks' then array['title','project_id','due_date','priority','status','notes']
    when 'project_configs' then array['project_id','title','run_steps','deploy_steps','env_var_names','runtime','troubleshooting']
    else null end;
$$;
create function private.assert_parent(p_entity text,p_data jsonb,p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if p_entity <> 'projects' and p_data->>'project_id' is not null then
    -- Serialize with parent archival to prevent live children under an archived project.
    perform 1 from public.projects where id=(p_data->>'project_id')::uuid and user_id=p_user and archived_at is null for update;
    if not found then raise exception 'invalid_project'; end if;
  end if;
end;
$$;
create function private.assert_no_children(p_id uuid,p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.tasks where project_id=p_id and user_id=p_user and archived_at is null)
    or exists(select 1 from public.project_configs where project_id=p_id and user_id=p_user and archived_at is null)
  then raise exception 'active_children'; end if;
end;
$$;

create function public.apply_change(p_entity text,p_action text,p_id uuid,p_data jsonb,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_before jsonb; v_after jsonb; v_event public.changes;
  v_cols text[]; v_assign text; v_fields text; v_select text; v_version integer; v_key text;
begin
  if v_user is null or not public.is_app_owner() then raise exception 'unauthorized'; end if;
  v_cols := private.editable_columns(p_entity);
  if v_cols is null or p_action not in ('create','update','archive') or p_id is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_operation'; end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if not v_key=any(v_cols) then raise exception 'invalid_field'; end if;
  end loop;
  -- Serialize changes to a record; assert_parent also locks its parent before writing.
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',p_entity) into v_before using p_id,v_user;
  if p_action='create' then
    if v_before is not null then raise exception 'already_exists'; end if;
    v_version:=1;
  else
    if v_before is null or v_before->>'archived_at' is not null then raise exception 'not_found'; end if;
    if p_expected_version is null or (v_before->>'version')::integer<>p_expected_version then raise exception 'version_conflict'; end if;
    v_version:=p_expected_version+1;
  end if;
  v_after:=coalesce(v_before,'{}'::jsonb)||p_data||jsonb_build_object('id',p_id,'user_id',v_user,'version',v_version,'created_at',coalesce(v_before->>'created_at',now()::text),'updated_at',now(),'archived_at',case when p_action='archive' then now() else null end);
  if p_entity='tasks' then
    v_after:=v_after||jsonb_build_object('done_at',case when v_after->>'status'='done' then coalesce(v_before->>'done_at',now()::text) else null end);
  end if;
  if p_action<>'archive' then perform private.assert_parent(p_entity,v_after,v_user); end if;
  if p_entity='projects' and p_action='archive' then perform private.assert_no_children(p_id,v_user); end if;
  v_cols:=v_cols||array['id','user_id','version','created_at','updated_at','archived_at'];
  if p_entity='tasks' then v_cols:=v_cols||array['done_at']; end if;
  select string_agg(format('%I',c),','), string_agg(format('r.%I',c),','), string_agg(format('%I=r.%I',c,c),',') into v_fields,v_select,v_assign from unnest(v_cols) c;
  if p_action='create' then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',p_entity,v_fields,v_select,p_entity) using v_after;
  else
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 and t.user_id=$3',p_entity,v_assign,p_entity) using v_after,p_id,v_user;
  end if;
  insert into public.changes(user_id,entity,record_id,action,before_data,after_version) values(v_user,p_entity,p_id,p_action,v_before,v_version) returning * into v_event;
  return to_jsonb(v_event)-'before_data'-'user_id';
end;
$$;

create function public.undo_change(p_change_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid(); v_event public.changes; v_current jsonb; v_restore jsonb; v_cols text[]; v_assign text;
begin
  if v_user is null or not public.is_app_owner() then raise exception 'unauthorized'; end if;
  select * into v_event from public.changes where id=p_change_id and user_id=v_user for update;
  if not found or v_event.undone_at is not null then raise exception 'invalid_undo'; end if;
  v_cols:=private.editable_columns(v_event.entity);
  if v_cols is null then raise exception 'invalid_entity'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',v_event.entity) into v_current using v_event.record_id,v_user;
  if v_current is null or (v_current->>'version')::integer<>v_event.after_version then raise exception 'version_conflict'; end if;
  if v_event.action='create' then
    if v_event.entity='projects' then perform private.assert_no_children(v_event.record_id,v_user); end if;
    v_restore:=v_current||jsonb_build_object('archived_at',now());
  else v_restore:=v_event.before_data;
  end if;
  if v_restore->>'archived_at' is null then perform private.assert_parent(v_event.entity,v_restore,v_user); end if;
  v_restore:=v_restore||jsonb_build_object('version',(v_current->>'version')::integer+1,'updated_at',now());
  v_cols:=v_cols||array['version','updated_at','archived_at'];
  if v_event.entity='tasks' then v_cols:=v_cols||array['done_at']; end if;
  select string_agg(format('%I=r.%I',c,c),',') into v_assign from unnest(v_cols) c;
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 and t.user_id=$3',v_event.entity,v_assign,v_event.entity) using v_restore,v_event.record_id,v_user;
  update public.changes set undone_at=now() where id=v_event.id returning * into v_event;
  return to_jsonb(v_event)-'before_data'-'user_id';
end;
$$;
revoke all on function public.apply_change(text,text,uuid,jsonb,integer) from public,anon;
revoke all on function public.undo_change(uuid) from public,anon;
grant execute on function public.apply_change(text,text,uuid,jsonb,integer) to authenticated;
grant execute on function public.undo_change(uuid) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
commit;


-- SOURCE: 202611270002_modules.sql
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


-- SOURCE: 202611270003_agent_cancel.sql
begin;
create function public.cancel_action(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  update public.pending_actions set consumed_at=now() where id=p_id and user_id=auth.uid() and consumed_at is null;
end $$;
revoke all on function public.cancel_action(uuid) from public,anon;
grant execute on function public.cancel_action(uuid) to authenticated;
commit;


-- SOURCE: 202611270004_atomic_agent.sql
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


-- SOURCE: 202611270005_system_ai.sql
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


-- SOURCE: 202611270006_backup.sql
begin;
create function public.restore_backup(p_operations jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare op jsonb; count integer:=0;
begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations) not between 1 and 2000 or octet_length(p_operations::text)>5000000 then raise exception 'invalid_backup'; end if;
  for op in select jsonb_array_elements(p_operations) loop
    if op->>'action'<>'create' then raise exception 'backup_creates_only'; end if;
    perform public.apply_change(op->>'entity','create',(op->>'id')::uuid,op->'data',null);count:=count+1;
  end loop;
  return count;
end $$;
revoke all on function public.restore_backup(jsonb) from public,anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
commit;


-- SOURCE: 202611270007_job_leases.sql
begin;
create or replace function public.claim_job(p_user uuid,p_name text,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from private.app_owner where user_id=p_user) then raise exception 'invalid_owner'; end if;
  update public.job_runs set status='failed',finished_at=now(),detail='Lượt chạy trước vượt thời hạn; kiểm tra kết quả trước khi chạy thủ công.' where user_id=p_user and name=p_name and status='running' and started_at<now()-interval '2 minutes';
  insert into public.job_runs(user_id,name,run_key,status) values(p_user,p_name,p_key,'running') on conflict(user_id,name,run_key) do nothing returning id into result;
  return result;
end $$;
revoke all on function public.claim_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_job(uuid,text,text) to service_role;
commit;


-- SOURCE: 202611270008_fulltext.sql
begin;
create function public.search_project_configs(p_query text) returns setof public.project_configs
language sql stable security invoker set search_path='' as $$
  select c.* from public.project_configs c
  where c.archived_at is null and length(p_query) between 1 and 200
    and to_tsvector('pg_catalog.simple',c.title||' '||c.run_steps||' '||c.troubleshooting) @@ websearch_to_tsquery('pg_catalog.simple',p_query)
  order by ts_rank(to_tsvector('pg_catalog.simple',c.title||' '||c.run_steps||' '||c.troubleshooting),websearch_to_tsquery('pg_catalog.simple',p_query)) desc limit 30;
$$;
revoke all on function public.search_project_configs(text) from public,anon;
grant execute on function public.search_project_configs(text) to authenticated;
create index on public.news_items using gin(to_tsvector('pg_catalog.simple',title||' '||summary));
create function public.search_news(p_query text) returns setof public.news_items
language sql stable security invoker set search_path='' as $$
  select n.* from public.news_items n where n.archived_at is null and length(p_query) between 1 and 200
    and to_tsvector('pg_catalog.simple',n.title||' '||n.summary) @@ websearch_to_tsquery('pg_catalog.simple',p_query)
  order by n.created_at desc limit 30;
$$;
revoke all on function public.search_news(text) from public,anon;
grant execute on function public.search_news(text) to authenticated;
commit;


-- SOURCE: 202611270009_connected_dashboard.sql
begin;
create table public.integration_connections(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 provider text not null check(provider in ('github','vercel','google_calendar','todoist')),
 project_id uuid references public.projects(id), source_key text not null check(length(source_key) between 1 and 300),
 enabled boolean not null default true, status text not null default 'pending' check(status in ('pending','syncing','ready','error')),
 last_success_at timestamptz,last_event_at timestamptz,next_sync_at timestamptz not null default now(),error text,
 unique nulls not distinct(user_id,provider,project_id), unique(id,user_id)
);
create table public.connected_items(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),connection_id uuid not null,
 external_id text not null check(length(external_id) between 1 and 300),kind text not null check(kind in ('issue','pull_request','workflow','deployment','event','task')),
 title text not null check(length(title) between 1 and 500),status text not null check(length(status)<=60),url text not null check(url='' or url ~ '^https://'),
 due_date date, starts_at text, ends_at text,all_day boolean not null default false,
 source_updated_at timestamptz not null,checked_at timestamptz not null default now(),
 foreign key(connection_id,user_id) references public.integration_connections(id,user_id) on delete cascade,
 unique(connection_id,external_id)
);
create index on public.connected_items(user_id,kind,due_date);
create table public.integration_activity(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),connection_id uuid not null,
 title text not null check(length(title) between 1 and 500),url text not null check(url='' or url ~ '^https://'),
 happened_at timestamptz not null,created_at timestamptz not null default now(),
 foreign key(connection_id,user_id) references public.integration_connections(id,user_id) on delete cascade
);
create index on public.integration_activity(user_id,created_at desc);
create table private.integration_deliveries(user_id uuid not null,connection_id uuid not null references public.integration_connections(id) on delete cascade,digest text not null,received_at timestamptz not null default now(),primary key(user_id,connection_id,digest));
create table private.integration_queue(
 connection_id uuid primary key references public.integration_connections(id) on delete cascade,
 requested_at timestamptz not null default now(),status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,claimed_request_at timestamptz
);
do $$ declare n text; begin
 foreach n in array array['integration_connections','connected_items','integration_activity'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('create policy owner_read on public.%I for select to authenticated using (user_id=(select auth.uid()) and (select public.is_app_owner()))',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select on public.%I to authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
revoke all on private.integration_queue,private.integration_deliveries from public,anon,authenticated;

create function public.enqueue_integration(p_user uuid,p_connection uuid,p_digest text default null,p_event jsonb default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; inserted integer;
begin
 select * into c from public.integration_connections where id=p_connection and user_id=p_user and enabled;
 if c.id is null or not exists(select 1 from private.app_owner where user_id=p_user) then return false; end if;
 if p_digest is not null then
  if length(p_digest)<>64 then raise exception 'invalid_digest'; end if;
  insert into private.integration_deliveries(user_id,connection_id,digest) values(p_user,c.id,p_digest) on conflict do nothing;
  get diagnostics inserted=row_count; if inserted=0 then return false; end if;
 end if;
 if p_event is not null then
  insert into public.integration_activity(user_id,connection_id,title,url,happened_at)
  values(p_user,c.id,left(p_event->>'title',500),coalesce(p_event->>'url',''),(p_event->>'happened_at')::timestamptz);
  update public.integration_connections set last_event_at=greatest(coalesce(last_event_at,'-infinity'),(p_event->>'happened_at')::timestamptz) where id=c.id;
 end if;
 insert into private.integration_queue(connection_id) values(c.id) on conflict(connection_id) do update
 set requested_at=clock_timestamp(),status=case when private.integration_queue.status='running' and private.integration_queue.lease_until>now() then 'running' else 'queued' end,
 available_at=case when private.integration_queue.status in ('running','queued') then private.integration_queue.available_at else now() end,
 attempts=case when private.integration_queue.status in ('done','failed') then 0 else private.integration_queue.attempts end;
 return true;
end $$;

create function public.claim_integration(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.integration_queue; token uuid=gen_random_uuid();
begin
 select iq.* into q from private.integration_queue iq join public.integration_connections c on c.id=iq.connection_id
 where c.user_id=p_user and c.enabled and exists(select 1 from private.app_owner where user_id=p_user)
 and ((iq.status='queued' and iq.available_at<=now()) or (iq.status='running' and iq.lease_until<now()))
 order by iq.available_at for update of iq skip locked limit 1;
 if q.connection_id is null then return null; end if;
 update private.integration_queue set status='running',attempts=attempts+1,lease_token=token,lease_until=now()+interval '2 minutes',claimed_request_at=requested_at where connection_id=q.connection_id;
 update public.integration_connections set status='syncing' where id=q.connection_id;
 return jsonb_build_object('connection_id',q.connection_id,'lease_token',token);
end $$;

create function public.finish_integration(p_user uuid,p_connection uuid,p_lease uuid,p_items jsonb default null,p_snapshot jsonb default null,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare q private.integration_queue;c public.integration_connections;
begin
 select * into q from private.integration_queue where connection_id=p_connection for update;
 select * into c from public.integration_connections where id=p_connection and user_id=p_user for update;
 if c.id is null or not c.enabled or q.connection_id is null or q.status<>'running' or q.lease_token is distinct from p_lease or q.lease_until is null or q.lease_until<now() then return false; end if;
 if p_error is null then
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>2000 then raise exception 'invalid_items'; end if;
  delete from public.connected_items where connection_id=c.id;
  insert into public.connected_items(user_id,connection_id,external_id,kind,title,status,url,due_date,starts_at,ends_at,all_day,source_updated_at)
  select p_user,c.id,x.external_id,x.kind,x.title,x.status,x.url,x.due_date,x.starts_at,x.ends_at,x.all_day,x.source_updated_at
  from jsonb_to_recordset(p_items) x(external_id text,kind text,title text,status text,url text,due_date date,starts_at text,ends_at text,all_day boolean,source_updated_at timestamptz);
  if p_snapshot is not null and c.project_id is not null and c.provider in ('github','vercel') then
   insert into public.integration_snapshots(user_id,project_id,provider,payload,checked_at) values(p_user,c.project_id,c.provider,p_snapshot,now())
   on conflict(user_id,project_id,provider) do update set payload=excluded.payload,checked_at=excluded.checked_at;
  end if;
  update public.integration_connections set status='ready',error=null,last_success_at=now(),next_sync_at=now()+interval '15 minutes' where id=c.id;
  update private.integration_queue set status=case when requested_at>claimed_request_at then 'queued' else 'done' end,attempts=0,available_at=now(),lease_until=null,lease_token=null where connection_id=c.id;
 else
  update public.integration_connections set status='error',error=left(p_error,300),next_sync_at=now()+interval '15 minutes' where id=c.id;
  update private.integration_queue set status=case when attempts>=5 then 'failed' else 'queued' end,available_at=now()+make_interval(secs=>least(900,30*power(2,attempts)::integer)),lease_until=null,lease_token=null where connection_id=c.id;
 end if;
 return true;
end $$;

create function public.set_integration_enabled(p_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_app_owner() then raise exception 'unauthorized'; end if;
 update public.integration_connections set enabled=p_enabled,next_sync_at=now() where id=p_id and user_id=auth.uid();
 if not found then raise exception 'not_found'; end if;
 if not p_enabled then delete from private.integration_queue where connection_id=p_id; end if;
end $$;
revoke all on function public.enqueue_integration(uuid,uuid,text,jsonb),public.claim_integration(uuid),public.finish_integration(uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_integration(uuid,uuid,text,jsonb),public.claim_integration(uuid),public.finish_integration(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;
revoke all on function public.set_integration_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_integration_enabled(uuid,boolean) to authenticated;

create function private.invalidate_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_key<>old.source_key or not new.enabled then
  delete from private.integration_queue where connection_id=new.id;
 end if;
 if new.source_key<>old.source_key then
  delete from public.connected_items where connection_id=new.id;
  delete from public.integration_activity where connection_id=new.id;
  delete from public.integration_snapshots where user_id=new.user_id and project_id=new.project_id and provider=new.provider;
 end if;
 return new;
end $$;
create trigger invalidate_connection after update of source_key,enabled on public.integration_connections for each row execute function private.invalidate_connection();

-- Only sanitized dashboard tables are published. Vault and credentials never enter this channel.
do $$ declare n text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach n in array array['integration_connections','connected_items','integration_activity','integration_snapshots','monitor_checks','incidents','tasks','projects','job_runs','news_items'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=n) then execute format('alter publication supabase_realtime add table public.%I',n); end if;
 end loop;
 end if;
end $$;
commit;


-- SOURCE: 20261127073952_revoke_anonymous_owner_probe.sql
begin;
-- Hosted Supabase default privileges can grant anon EXECUTE independently of PUBLIC.
revoke execute on function public.is_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;
commit;
