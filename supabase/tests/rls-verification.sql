-- Vérification des règles d'accès (à lancer sur le banc local après mock-supabase.sql + migration).
\set ON_ERROR_STOP 0
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
-- 1. anon : aucun accès
set role anon;
select 'T1 anon select attempts' as test; select count(*) from public.attempts;
select 'T1b anon insert' as test; insert into public.runs (user_id,t,mode,theme,level,score,errors,best_combo) values (:'A',1790000000000,'storm','mix',1200,10,1,5);
reset role;
-- 2. A insère chez lui ; tente d'insérer chez B
set role authenticated; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}', false);
select 'T2 A insert own (ok attendu)' as test; insert into public.attempts (t,m,p,r,c,f,ok) values (1790000000000,'storm','abc',1200,'rp-r','tours',true);
insert into public.runs (t,mode,theme,level,score,errors,best_combo) values (1790000000000,'storm','mix',1200,16,2,14);
select 'T2b A insert pour B (refus attendu)' as test; insert into public.attempts (user_id,t,m,p,r,c,f,ok) values (:'B',1790000000001,'storm','abc',1200,'rp-r','tours',true);
select 'T2c doublon (refus attendu, ignoré par upsert côté appli)' as test; insert into public.attempts (t,m,p,r,c,f,ok) values (1790000000000,'storm','abc',1200,'rp-r','tours',true);
select 'T2d valeur hors bornes (refus attendu)' as test; insert into public.runs (t,mode,theme,level,score,errors,best_combo) values (1790000000001,'storm','mix',1200,5000,0,0);
select 'T2e UPDATE historique (refus attendu)' as test; update public.runs set score = 99;
select 'T2f pseudo invalide (refus attendu)' as test; insert into public.profiles (pseudo) values ('<script>');
select 'T2g pseudo ok' as test; insert into public.profiles (pseudo) values ('JP Desn');
-- 3. B ne voit rien de A
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal1"}', false);
select 'T3 B voit lignes de A ? (0 attendu)' as test, (select count(*) from public.attempts) a, (select count(*) from public.runs) r, (select count(*) from public.profiles) p;
select 'T3b B supprime chez A (0 ligne attendue)' as test; delete from public.runs;
reset role;
select 'T3c runs de A intacts (1 attendu)' as test, count(*) from public.runs;
-- 4. 2FA : A active TOTP -> session aal1 bloquée, aal2 ok
insert into auth.mfa_factors (user_id,status) values (:'A','verified');
set role authenticated; select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}', false);
select 'T4 A en aal1 après 2FA (0 attendu)' as test, count(*) from public.runs;
select 'T4b A insert en aal1 (refus attendu)' as test; insert into public.runs (t,mode,theme,level,score,errors,best_combo) values (1790000000005,'storm','mix',1200,3,0,1);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal2"}', false);
select 'T4c A en aal2 (1 attendu)' as test, count(*) from public.runs;
-- 5. appel direct des fonctions internes
select 'T5 enforce_quota direct (refus attendu)' as test; select public.enforce_quota();
reset role;
-- 6. quota : 20 000 parties max pour B, envoi groupé
set role authenticated; select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal1"}', false);
\timing on
select 'T6 B 20000 parties (ok attendu)' as test; insert into public.runs (t,mode,theme,level,score,errors,best_combo) select 1790000000000+g,'storm','mix',1200,1,0,1 from generate_series(1,20000) g;
select 'T6b B 1 de plus (refus attendu)' as test; insert into public.runs (t,mode,theme,level,score,errors,best_combo) values (1799000000000,'storm','mix',1200,1,0,1);
\timing off
-- 7. suppression de compte
select 'T7 B supprime son compte' as test; select public.delete_my_account();
reset role;
select 'T7b B et ses données supprimés, A intact' as test, (select count(*) from auth.users) users, (select count(*) from public.runs) runs;
set role anon; select 'T7c anon appelle delete_my_account (refus attendu)' as test; select public.delete_my_account();
