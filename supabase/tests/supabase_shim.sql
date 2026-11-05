-- Local testing only: recreates the parts of a Supabase database our
-- migrations rely on (API roles and Supabase's default privileges).
-- Never run this against a real Supabase project.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
    end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's defaults: API roles get full privileges on new objects.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Stand-in for Supabase's auth.uid(): the logged-in user's id from the JWT
-- claims PostgREST puts in request.jwt.claims (tests set it with set_config).
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(
        coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
        ),
        ''
    )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
