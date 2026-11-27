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
