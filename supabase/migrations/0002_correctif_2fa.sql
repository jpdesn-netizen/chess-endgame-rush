-- Chess Endgame Rush — correctif 0002 (25/09/2026)
-- Problème : la règle « 2FA exigée si activée » lisait auth.mfa_factors, table que
-- les utilisateurs connectés n'ont pas le droit de lire → erreur 42501 à chaque accès.
-- Correctif : la vérification passe par une fonction à droits élevés, rangée dans un
-- schéma « private » NON exposé par l'API (on ne peut pas l'appeler depuis le site).
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller TOUT → Run.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Vrai si la session a le niveau exigé : aal2 quand l'utilisateur a un facteur 2FA vérifié.
create or replace function private.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke execute on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;

drop policy if exists "2FA exigée si activée" on public.profiles;
drop policy if exists "2FA exigée si activée" on public.attempts;
drop policy if exists "2FA exigée si activée" on public.runs;

create policy "2FA exigée si activée" on public.profiles as restrictive to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "2FA exigée si activée" on public.attempts as restrictive to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "2FA exigée si activée" on public.runs as restrictive to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
