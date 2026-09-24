-- Chess Endgame Rush — comptes en ligne (Supabase / Postgres)
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Principes de sécurité :
--  * RLS activée sur chaque table : un utilisateur ne voit et n'écrit QUE ses lignes.
--  * Aucun droit pour le rôle « anon » (visiteur non connecté).
--  * Pas de UPDATE sur l'historique : on ajoute ou on supprime, on ne réécrit pas.
--  * Contraintes CHECK : valeurs bornées, textes courts (pas de stockage abusif).
--  * Double authentification (TOTP) : si l'utilisateur l'a activée, ses données
--    ne sont accessibles qu'avec une session vérifiée en 2 facteurs (aal2).

-- ---------------------------------------------------------------- Tables

create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pseudo     text not null check (pseudo ~ '^[[:alnum:] _.-]{2,30}$'),
  created_at timestamptz not null default now()
);

create table public.attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t       bigint not null check (t between 1700000000000 and 4102444800000), -- horodatage ms (2023 → 2100)
  m       text not null check (m in ('storm', 'streak', 'training')),
  p       text not null check (char_length(p) between 1 and 40),
  r       smallint not null check (r between 0 and 4000),
  c       text not null check (char_length(c) between 1 and 40),
  f       text not null check (char_length(f) between 1 and 20),
  ok      boolean not null,
  unique (user_id, t, p) -- rend la synchronisation idempotente (pas de doublons)
);

create table public.runs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t           bigint not null check (t between 1700000000000 and 4102444800000),
  mode        text not null check (mode in ('storm', 'streak')),
  theme       text not null check (char_length(theme) between 1 and 60),
  level       smallint not null check (level between 0 and 4000),
  score       smallint not null check (score between 0 and 1000),
  errors      smallint not null check (errors between 0 and 1000),
  best_combo  smallint not null check (best_combo between 0 and 1000),
  highest     smallint check (highest between 0 and 4000),
  played      smallint check (played between 0 and 2000),
  moves       smallint check (moves between 0 and 10000),
  duration_ms integer check (duration_ms between 0 and 86400000),
  unique (user_id, t, mode)
);

create index attempts_user_t on public.attempts (user_id, t);
create index runs_user_t on public.runs (user_id, t);

-- ------------------------------------------------------ Droits (GRANT)

revoke all on public.profiles, public.attempts, public.runs from anon, authenticated;
grant select, insert, update (pseudo) on public.profiles to authenticated;
grant select, insert, delete on public.attempts, public.runs to authenticated;

-- ----------------------------------------------- Row Level Security (RLS)

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.runs     enable row level security;

create policy "profil : lecture du sien"      on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profil : création du sien"     on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profil : modification du sien" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "tentatives : lecture des siennes"     on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "tentatives : ajout des siennes"       on public.attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tentatives : suppression des siennes" on public.attempts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "parties : lecture des siennes"     on public.runs for select to authenticated using ((select auth.uid()) = user_id);
create policy "parties : ajout des siennes"       on public.runs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "parties : suppression des siennes" on public.runs for delete to authenticated using ((select auth.uid()) = user_id);

-- Double authentification : politique RESTRICTIVE (s'ajoute aux précédentes).
-- Si l'utilisateur a un facteur TOTP vérifié, la session doit être en aal2.
-- Modèle « opt-in » de la documentation Supabase (Multi-Factor Authentication).
create policy "2FA exigée si activée" on public.profiles as restrictive to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
    from auth.mfa_factors where (select auth.uid()) = user_id and status = 'verified'));
create policy "2FA exigée si activée" on public.attempts as restrictive to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
    from auth.mfa_factors where (select auth.uid()) = user_id and status = 'verified'));
create policy "2FA exigée si activée" on public.runs as restrictive to authenticated
  using (array[(select auth.jwt() ->> 'aal')] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
    from auth.mfa_factors where (select auth.uid()) = user_id and status = 'verified'));

-- ------------------------------------------ Quota anti-abus par utilisateur
-- Empêche un compte de remplir la base (offre gratuite : 500 Mo).

-- Un seul comptage par requête (déclencheur « par instruction »), même
-- pour un envoi groupé de milliers de lignes.
create function public.enforce_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  max_rows constant bigint := case tg_table_name when 'attempts' then 100000 else 20000 end;
  over_quota boolean;
begin
  execute format(
    'select exists (select 1 from public.%I t where t.user_id in (select distinct user_id from inserted)
                    group by t.user_id having count(*) > $1)', tg_table_name)
    into over_quota using max_rows;
  if over_quota then
    raise exception 'Quota atteint (% lignes)', max_rows using errcode = 'P0001';
  end if;
  return null;
end $$;
revoke execute on function public.enforce_quota() from public, anon, authenticated;

create trigger attempts_quota after insert on public.attempts
  referencing new table as inserted for each statement execute function public.enforce_quota();
create trigger runs_quota after insert on public.runs
  referencing new table as inserted for each statement execute function public.enforce_quota();

-- ------------------------------------------- Suppression de son compte (RGPD)
-- L'utilisateur supprime SON compte ; les tables liées suivent (on delete cascade).

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
