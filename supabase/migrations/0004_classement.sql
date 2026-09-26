-- 0004 — Classement public (participation volontaire).
-- À exécuter dans Supabase : SQL Editor → coller TOUT le fichier (Ctrl+A) → Run.
--
-- Principes :
--  - seuls les comptes qui cochent « Apparaître dans le classement » y figurent (profiles.leaderboard) ;
--  - seul le PSEUDO est affiché (jamais l'email ni l'identifiant du compte) ;
--  - les valeurs sont CALCULÉES PAR LE SERVEUR à partir des tentatives et parties déjà synchronisées
--    (pas de score saisi par le navigateur), avec des contrôles de vraisemblance ;
--  - résultat mis en cache 5 minutes (évite qu'un visiteur fasse recalculer en boucle).
-- Limite : les tentatives elles-mêmes viennent du navigateur ; les contrôles écartent l'invraisemblable,
-- pas toute triche.

-- 1) Participation (désactivée par défaut) et pseudo unique parmi les participants.
alter table public.profiles add column if not exists leaderboard boolean not null default false;
grant update (pseudo, leaderboard) on public.profiles to authenticated;
create unique index if not exists profiles_pseudo_public on public.profiles (lower(pseudo)) where leaderboard;

-- 2) Glicko-2, identique à src/core/glicko2.ts (Glickman, « Example of the Glicko-2 system »).
create or replace function private.glicko2_f(x float8, delta float8, phi float8, v float8, a float8, tau float8)
returns float8 language sql immutable set search_path = '' as $$
  select (exp(x) * (delta * delta - phi * phi - v - exp(x))) / (2 * (phi * phi + v + exp(x)) ^ 2) - (x - a) / (tau * tau)
$$;

create or replace function private.glicko2(
  r float8, rd float8, vol float8, opp_r float8, opp_rd float8, s float8, tau float8,
  out nr float8, out nrd float8, out nvol float8)
language plpgsql immutable set search_path = '' as $$
declare
  scale constant float8 := 173.7178;
  eps constant float8 := 0.000001;
  mu float8 := (r - 1500) / scale;
  phi float8 := rd / scale;
  muj float8 := (opp_r - 1500) / scale;
  phij float8 := opp_rd / scale;
  gj float8; e float8; v float8; delta float8; a float8;
  xa float8; xb float8; xc float8; fa float8; fb float8; fc float8; k int := 1;
  phistar float8; phinew float8;
begin
  gj := 1 / sqrt(1 + 3 * phij * phij / (pi() * pi()));
  e := 1 / (1 + exp(-gj * (mu - muj)));
  v := 1 / (gj * gj * e * (1 - e));
  delta := v * gj * (s - e);
  a := ln(vol * vol);
  xa := a;
  if delta * delta > phi * phi + v then
    xb := ln(delta * delta - phi * phi - v);
  else
    while private.glicko2_f(a - k * tau, delta, phi, v, a, tau) < 0 loop k := k + 1; end loop;
    xb := a - k * tau;
  end if;
  fa := private.glicko2_f(xa, delta, phi, v, a, tau);
  fb := private.glicko2_f(xb, delta, phi, v, a, tau);
  while abs(xb - xa) > eps loop
    xc := xa + (xa - xb) * fa / (fb - fa);
    fc := private.glicko2_f(xc, delta, phi, v, a, tau);
    if fc * fb <= 0 then xa := xb; fa := fb; else fa := fa / 2; end if;
    xb := xc; fb := fc;
  end loop;
  nvol := exp(xa / 2);
  phistar := sqrt(phi * phi + nvol * nvol);
  phinew := 1 / sqrt(1 / (phistar * phistar) + 1 / v);
  nr := scale * (mu + phinew * phinew * gj * (s - e)) + 1500;
  nrd := scale * phinew;
end $$;

-- 3) Elo global d'un joueur, mêmes règles que src/core/playerRating.ts : départ 1500 / 500 / 0,06,
--    tau 0,5, première tentative de chaque puzzle seulement, hors révision, entraînement et « Bases ».
create or replace function private.player_elo(uid uuid, out r float8, out rd float8, out games int)
language plpgsql stable set search_path = '' as $$
declare
  vol float8 := 0.06;
  x record;
  res record;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  r := 1500; rd := 500; games := 0;
  for x in
    select * from (
      select distinct on (a.p) a.p, a.r as pr, a.ok, a.t, a.id
      from public.attempts a
      where a.user_id = uid and a.m not in ('review', 'training') and a.p not like 'bases-%'
        and a.t <= now_ms + 600000
      order by a.p, a.t, a.id
    ) first_try
    order by first_try.t, first_try.id
  loop
    res := private.glicko2(r, rd, vol, x.pr, case when x.p like 'tb-%' then 200 else 75 end, case when x.ok then 1 else 0 end, 0.5);
    r := res.nr; rd := res.nrd; vol := res.nvol; games := games + 1;
  end loop;
end $$;

-- 4) Cache du classement (lu uniquement par la fonction ci-dessous).
create table if not exists private.leaderboard_cache (
  id smallint primary key check (id = 1),
  computed_at timestamptz not null,
  data jsonb not null
);
revoke all on private.leaderboard_cache from public, anon, authenticated;

create or replace function private.compute_leaderboard() returns jsonb
language sql stable set search_path = '' as $$
  with players as (
    select user_id, pseudo from public.profiles where leaderboard
  ),
  now_ms as (select (extract(epoch from now()) * 1000)::bigint as v),
  elo as (
    select p.user_id, p.pseudo, round(e.r)::int as value, e.games
    from players p cross join lateral private.player_elo(p.user_id) e
    where e.rd <= 110                              -- Elo stabilisé seulement (pas « provisoire »)
  ),
  storm as (
    select p.user_id, p.pseudo, max(x.score)::int as value, count(*)::int as games
    from players p join public.runs x on x.user_id = p.user_id
    where x.mode = 'storm' and x.theme = 'mix' and x.level <= 600  -- Mix, départ Automatique ou Débutant
      and x.played is not null and x.moves is not null and x.duration_ms is not null
      and x.score <= x.played and x.moves >= x.score
      and x.duration_ms >= x.played * 1000         -- au moins 1 s par puzzle
      and x.duration_ms <= 185000 + x.score * 3000 -- 3 min + bonus de temps possibles
      and x.t <= (select v from now_ms) + 600000
    group by p.user_id, p.pseudo
  ),
  week as (
    select p.user_id, p.pseudo, count(distinct a.p)::int as value, count(*)::int as games
    from players p join public.attempts a on a.user_id = p.user_id
    where a.ok and a.t between (select v from now_ms) - 7 * 86400000 and (select v from now_ms) + 600000
    group by p.user_id, p.pseudo
  ),
  ranked as (
    select 'elo' as kind, rank() over (order by value desc) as rank, * from elo
    union all select 'storm', rank() over (order by value desc), * from storm
    union all select 'week', rank() over (order by value desc), * from week
  )
  select coalesce(jsonb_object_agg(kind, rows), '{}'::jsonb)
  from (
    select kind, jsonb_agg(jsonb_build_object('rank', rank, 'pseudo', pseudo, 'value', value, 'games', games, 'uid', user_id)
                           order by rank, pseudo) as rows
    from ranked group by kind
  ) k
$$;

-- 5) Point d'entrée public : 100 premiers de chaque classement (+ la ligne du joueur connecté),
--    sans identifiant de compte. Accessible aux visiteurs (anon) comme aux joueurs connectés.
create or replace function public.leaderboard() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cached private.leaderboard_cache;
  d jsonb;
  me uuid := auth.uid();
begin
  select * into cached from private.leaderboard_cache where id = 1;
  if cached.id is null or cached.computed_at < now() - interval '5 minutes' then
    d := private.compute_leaderboard();
    insert into private.leaderboard_cache (id, computed_at, data) values (1, now(), d)
      on conflict (id) do update set computed_at = excluded.computed_at, data = excluded.data;
    cached.computed_at := now();
  else
    d := cached.data;
  end if;
  return jsonb_build_object(
    'computed_at', cached.computed_at,
    'lists', coalesce((
      select jsonb_object_agg(kind, (
        select coalesce(jsonb_agg((item - 'uid') || jsonb_build_object('me', (item ->> 'uid')::uuid is not distinct from me)
                                  order by (item ->> 'rank')::int), '[]'::jsonb)
        from jsonb_array_elements(rows) item
        where (item ->> 'rank')::int <= 100 or (item ->> 'uid')::uuid is not distinct from me
      ))
      from jsonb_each(d) as l(kind, rows)
    ), '{}'::jsonb)
  );
end $$;

revoke execute on function public.leaderboard() from public;
grant execute on function public.leaderboard() to anon, authenticated;
revoke execute on function private.compute_leaderboard(), private.player_elo(uuid),
  private.glicko2(float8, float8, float8, float8, float8, float8, float8),
  private.glicko2_f(float8, float8, float8, float8, float8, float8) from public, anon, authenticated;
