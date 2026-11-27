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
