// Échiquier : chessground (@lichess-org/chessground), la bibliothèque d'échiquier de Lichess
// (glisser-déposer, clic-clic, animations et pièces identiques à Lichess).
// Composant d'AFFICHAGE : il ne juge pas les coups, il transmet les coups
// légaux au parent via `onMove`.

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isInCheck, isPromotionMove, legalDestsMap } from '../../core/chessRules';
import { sideToMove } from '../../core/fen';
import type { Color, PromotionPiece } from '../../core/types';
import { PromotionPicker } from './PromotionPicker';

export type MarkTone = 'good' | 'bad' | 'hint';

export interface BoardProps {
  fen: string;
  orientation: Color;
  interactive: boolean;
  lastMove: { from: string; to: string } | null;
  marks?: { square: string; tone: MarkTone }[];
  /** Flèche conseillée (ex. meilleur coup après une erreur). */
  arrow?: { from: string; to: string } | null;
  onMove: (from: string, to: string, promotion?: PromotionPiece) => void;
}

const BRUSH: Record<MarkTone, string> = { good: 'green', bad: 'red', hint: 'blue' };
const cgColor = (c: Color) => (c === 'w' ? 'white' : 'black');

export function Board({ fen, orientation, interactive, lastMove, marks = [], arrow = null, onMove }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  const turn = sideToMove(fen);
  const dests = useMemo(() => (interactive ? legalDestsMap(fen) : new Map<string, string[]>()), [fen, interactive]);

  const config: Config = {
    fen: fen.split(' ')[0],
    orientation: cgColor(orientation),
    turnColor: cgColor(turn),
    lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined,
    check: isInCheck(fen) ? cgColor(turn) : false,
    coordinates: true,
    // Mode développement uniquement : accepte les événements simulés (tests automatisés).
    trustAllEvents: import.meta.env.DEV,
    animation: { enabled: true, duration: 180 },
    highlight: { lastMove: true, check: true },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    selectable: { enabled: true },
    movable: {
      free: false,
      color: interactive ? cgColor(turn) : undefined,
      dests: dests as Map<Key, Key[]>,
      showDests: true,
      events: {
        after: (orig: Key, dest: Key) => {
          // Promotion : on demande la pièce avant de valider le coup.
          if (isPromotionMove(fenRef.current, orig, dest)) setPendingPromotion({ from: orig, to: dest });
          else onMoveRef.current(orig, dest);
        },
      },
    },
    drawable: { enabled: false, visible: true },
  };

  // Création / destruction de l'échiquier.
  useEffect(() => {
    if (!el.current) return;
    // chessground suit lui-même les changements de taille (ResizeObserver interne).
    api.current = Chessground(el.current, config);
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  // Mise à jour à chaque changement de position / d'état.
  useEffect(() => {
    api.current?.set(config);
    const shapes: DrawShape[] = marks.map((m) => ({ orig: m.square as Key, brush: BRUSH[m.tone] }));
    if (arrow) shapes.push({ orig: arrow.from as Key, dest: arrow.to as Key, brush: 'green' });
    api.current?.setAutoShapes(shapes);
  });

  return (
    <div className="relative w-full aspect-square select-none">
      <div ref={el} className="cg-host h-full w-full" data-board />
      {pendingPromotion && (
        <PromotionPicker
          color={turn}
          onPick={(piece) => {
            const { from, to } = pendingPromotion;
            setPendingPromotion(null);
            onMoveRef.current(from, to, piece);
          }}
          onCancel={() => {
            setPendingPromotion(null);
            api.current?.set({ fen: fenRef.current.split(' ')[0] }); // remet la pièce en place
          }}
        />
      )}
    </div>
  );
}
