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
