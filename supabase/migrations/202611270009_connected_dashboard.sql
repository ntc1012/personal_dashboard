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
