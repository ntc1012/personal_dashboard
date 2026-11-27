begin;
-- Hosted Supabase default privileges can grant anon EXECUTE independently of PUBLIC.
revoke execute on function public.is_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;
commit;
