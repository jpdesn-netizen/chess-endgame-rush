-- Banc d'essai LOCAL (Postgres 16) qui imite Supabase : rôles anon/authenticated, auth.uid(), auth.jwt().
-- Comme dans Supabase, « authenticated » n'a PAS le droit de lire auth.mfa_factors.
-- NE PAS exécuter dans Supabase. Usage : psql -f mock-supabase.sql -f ../migrations/0001_comptes.sql -f ../migrations/0002_correctif_2fa.sql -f rls-verification.sql
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade, status text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x.fr'),('22222222-2222-2222-2222-222222222222','b@x.fr');
