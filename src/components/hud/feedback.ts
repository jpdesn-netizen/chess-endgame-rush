// Textes affichés au joueur selon l'état du puzzle (fonction pure).

import { CONFIG } from '../../core/config';
import type { SessionState } from '../../core/session/puzzleSession';

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'success';

export interface Feedback {
  tone: Tone;
  title: string;
  detail?: string;
}

export function feedbackFor(state: SessionState): Feedback {
  const { phase, verdict, endReason, puzzle } = state;
  const lastOpponent = [...state.moves].reverse().find((m) => m.by === 'opponent');

  if (phase === 'error') return { tone: 'warn', title: '⚠️ Problème technique', detail: state.error ?? undefined };
  if (phase === 'judging') return { tone: 'neutral', title: 'Analyse du coup…' };

  if (phase === 'solved') {
    const titles = {
      checkmate: '🏆 Échec et mat !',
      'held-draw': '🏆 Nulle tenue !',
      'draw-reached': '🏆 Nulle obtenue !',
      'still-winning': '🏆 Gain conservé !',
    } as Record<string, string>;
    return { tone: 'success', title: titles[endReason ?? ''] ?? '🏆 Réussi !' };
  }

  if (phase === 'failed') {
    if (verdict?.kind === 'bad') {
      const mate = verdict.bestMateIn ? ` (mat en ${verdict.bestMateIn})` : '';
      const justs = verdict.bestMoves.length
        ? `${verdict.bestMoves.length > 1 ? 'Coups justes' : 'Coup juste'} : ${verdict.bestMoves[0]}${mate}${verdict.bestMoves.length > 1 ? `, ${verdict.bestMoves.slice(1).join(', ')}` : ''}`
        : '';
      const punish = verdict.refutation ? `Après ${verdict.san}, l’adversaire répond ${verdict.refutation}.` : '';
      const best = [justs && `${justs}.`, punish].filter(Boolean).join(' ') || undefined;
      if (verdict.reason === 'too-slow') {
        return {
          tone: 'bad',
          title: `⚠️ ${verdict.san} garde le gain, mais le rallonge d'environ ${verdict.extraMoves} coups`,
          detail: `Tolérance : ${CONFIG.judge.slowMoveToleranceMoves} coups. ${best ?? ''}`.trim(),
        };
      }
      if (verdict.reason === 'throws-win') {
        return { tone: 'bad', title: `❌ ${verdict.san} laisse échapper le gain (la position devient nulle)`, detail: best };
      }
      return {
        tone: 'bad',
        title:
          puzzle.objective === 'draw'
            ? `❌ ${verdict.san} perd : la position devient gagnante pour l'adversaire`
            : `❌ ${verdict.san} perd la partie`,
        detail: best,
      };
    }
    if (endReason === 'drawn-instead')
      return { tone: 'bad', title: '❌ Partie nulle', detail: 'Pat, triple répétition ou matériel insuffisant.' };
    if (endReason === 'too-long')
      return { tone: 'bad', title: `⌛ Limite de ${state.rules.hardCapMoves} coups atteinte sans conclure` };
    return { tone: 'bad', title: '❌ Échec' };
  }

  if (phase === 'opponentThinking') {
    if (verdict?.kind === 'good' && !verdict.verified) return { tone: 'good', title: `✔️ ${verdict.san} accepté (position hors table)` };
    if (verdict?.kind === 'good')
      return { tone: 'good', title: verdict.isBest ? `✅ ${verdict.san} : excellent !` : `✅ ${verdict.san} : bon coup` };
    return { tone: 'neutral', title: 'L’adversaire réfléchit…' };
  }

  // awaitingPlayer
  if (lastOpponent) {
    const good = verdict?.kind === 'good' ? `✅ ${verdict.san} · ` : '';
    return { tone: 'neutral', title: `${good}L’adversaire a joué ${lastOpponent.san}. À toi !` };
  }
  return {
    tone: 'neutral',
    title: puzzle.objective === 'win' ? 'Trouve le plan gagnant' : 'Trouve comment tenir la nulle',
  };
}
