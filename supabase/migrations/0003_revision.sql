-- Chess Endgame Rush — 0003 (25/09/2026) : modes « review » (révision des erreurs) et « daily » (puzzle du jour).
-- Peut être relancé sans risque.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller TOUT → Run.
alter table public.attempts drop constraint if exists attempts_m_check;
alter table public.attempts add constraint attempts_m_check check (m in ('storm', 'streak', 'training', 'review', 'daily'));
