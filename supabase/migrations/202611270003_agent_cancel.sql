begin;
create function public.cancel_action(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
  if not public.is_app_owner() then raise exception 'unauthorized'; end if;
  update public.pending_actions set consumed_at=now() where id=p_id and user_id=auth.uid() and consumed_at is null;
end $$;
revoke all on function public.cancel_action(uuid) from public,anon;
grant execute on function public.cancel_action(uuid) to authenticated;
commit;
