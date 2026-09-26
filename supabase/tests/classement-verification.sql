-- Banc d'essai LOCAL du classement (NE PAS exécuter dans Supabase).
-- Usage : psql -f mock-supabase.sql -f ../migrations/0001_comptes.sql -f ../migrations/0002_correctif_2fa.sql -f ../migrations/0003_revision.sql -f ../migrations/0004_classement.sql -f classement-verification.sql
-- Attendu : Elo Bob 1884 / Alice 1561 (identiques à src/core/playerRating.ts sur les mêmes données),
-- Storm : Alice 25 seule (le 80 en 20 s de Bob est écarté), pseudo en double refusé à la fin.
\i classement-donnees.sql
insert into public.profiles (user_id, pseudo, leaderboard) values ('11111111-1111-1111-1111-111111111111','Alice',true),('22222222-2222-2222-2222-222222222222','Bob',true);
-- runs : 1 plausible, 1 invraisemblable (80 en 20 s), 1 autre thème
insert into public.runs (user_id,t,mode,theme,level,score,errors,best_combo,highest,played,moves,duration_ms) values
 ('11111111-1111-1111-1111-111111111111',(extract(epoch from now())*1000)::bigint-5000,'storm','mix',400,25,3,10,1500,28,60,190000),
 ('22222222-2222-2222-2222-222222222222',(extract(epoch from now())*1000)::bigint-4000,'storm','mix',400,80,0,80,2500,80,160,20000),
 ('22222222-2222-2222-2222-222222222222',(extract(epoch from now())*1000)::bigint-3000,'storm','pions',400,40,0,40,2000,40,90,170000);
select r, rd, games from private.player_elo('11111111-1111-1111-1111-111111111111');
select r, rd, games from private.player_elo('22222222-2222-2222-2222-222222222222');
set role anon;
select jsonb_pretty(public.leaderboard());
select * from public.profiles; -- doit échouer ou être vide pour anon
