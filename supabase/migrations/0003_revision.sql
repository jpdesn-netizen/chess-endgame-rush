-- Chess Endgame Rush — 0003 (25/09/2026) : mode « review » (révision des erreurs).
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller TOUT → Run.
alter table public.attempts drop constraint if exists attempts_m_check;
alter table public.attempts add constraint attempts_m_check check (m in ('storm', 'streak', 'training', 'review'));
