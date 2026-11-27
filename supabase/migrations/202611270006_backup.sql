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
