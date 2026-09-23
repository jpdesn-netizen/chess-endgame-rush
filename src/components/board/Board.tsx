// Échiquier interactif en SVG : clic-clic ou glisser-déposer, souris et tactile.
// Composant d'AFFICHAGE : il ne décide pas si un coup est bon, il transmet
// seulement les coups légaux au parent via `onMove`.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isPromotionMove, legalDestinations } from '../../core/chessRules';
import { coordsToSquare, fenToPieces, sideToMove, squareToCoords } from '../../core/fen';
import type { Color, PromotionPiece } from '../../core/types';
import { PIECE_GLYPH, pieceStyle } from './pieces';
import { PromotionPicker } from './PromotionPicker';

export type MarkTone = 'good' | 'bad' | 'hint';

export interface BoardProps {
  fen: string;
  orientation: Color;
  interactive: boolean;
  lastMove: { from: string; to: string } | null;
  marks?: { square: string; tone: MarkTone }[];
  onMove: (from: string, to: string, promotion?: PromotionPiece) => void;
}

const LIGHT = '#f0d9b5';
const DARK = '#b58863';
const MARK_FILL: Record<MarkTone, string> = {
  good: 'rgba(34,197,94,0.45)',
  bad: 'rgba(220,38,38,0.55)',
  hint: 'rgba(59,130,246,0.45)',
};

interface Drag {
  from: string;
  x: number;
  y: number;
  moved: boolean;
  pointerId: number;
}

export function Board({ fen, orientation, interactive, lastMove, marks = [], onMove }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  const pieces = useMemo(() => fenToPieces(fen), [fen]);
  const pieceAt = useMemo(() => new Map(pieces.map((p) => [p.square, p])), [pieces]);
  const turn = sideToMove(fen);
  const destinations = useMemo(
    () => (selected && interactive ? legalDestinations(fen, selected) : []),
    [fen, selected, interactive],
  );

  // Position en unités d'échiquier (0..8) → case, selon l'orientation.
  const toSquare = (x: number, y: number): string | null => {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = orientation === 'w' ? col : 7 - col;
    const rank = orientation === 'w' ? 7 - row : row;
    return coordsToSquare(file, rank);
  };
  const toXY = (square: string) => {
    const { file, rank } = squareToCoords(square);
    return orientation === 'w' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
  };
  const pointerToBoard = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 8, y: ((e.clientY - rect.top) / rect.height) * 8 };
  };
  const isOwnPiece = (square: string) => interactive && pieceAt.get(square)?.color === turn;

  const attempt = (from: string, to: string) => {
    if (!legalDestinations(fen, from).includes(to)) return;
    setSelected(null);
    if (isPromotionMove(fen, from, to)) {
      setPendingPromotion({ from, to });
      return;
    }
    onMove(from, to);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || pendingPromotion) return;
    const { x, y } = pointerToBoard(e);
    const square = toSquare(x, y);
    if (!square) return;
    if (selected && destinations.includes(square)) {
      attempt(selected, square);
      return;
    }
    if (isOwnPiece(square)) {
      setSelected(square);
      try {
        svgRef.current?.setPointerCapture(e.pointerId); // suivre le glisser même hors de l'échiquier
      } catch {
        /* pointeur déjà relâché : sans conséquence */
      }
      setDrag({ from: square, x, y, moved: false, pointerId: e.pointerId });
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = pointerToBoard(e);
    const moved = drag.moved || Math.hypot(x - drag.x, y - drag.y) > 0.2;
    setDrag({ ...drag, x, y, moved });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = pointerToBoard(e);
    const target = toSquare(x, y);
    const { from, moved } = drag;
    setDrag(null);
    if (moved && target && target !== from) attempt(from, target);
    // Sinon : simple clic, la pièce reste sélectionnée (mode clic-clic).
  };

  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = toSquare(col + 0.5, row + 0.5)!;
      const { file, rank } = squareToCoords(square);
      const isLight = (file + rank) % 2 === 1;
      squares.push(
        <rect key={square} x={col} y={row} width={1} height={1} fill={isLight ? LIGHT : DARK} data-square={square} />,
      );
    }
  }

  const highlight = (square: string, fill: string, key: string) => {
    const { x, y } = toXY(square);
    return <rect key={key} x={x} y={y} width={1} height={1} fill={fill} pointerEvents="none" />;
  };

  return (
    <div className="relative w-full aspect-square select-none" style={{ touchAction: 'none' }}>
      <svg
        ref={svgRef}
        viewBox="0 0 8 8"
        className="w-full h-full block rounded-md shadow-2xl"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        role="img"
        aria-label="Échiquier"
      >
        {squares}
        {lastMove && [
          highlight(lastMove.from, 'rgba(205,210,106,0.75)', 'lm-from'),
          highlight(lastMove.to, 'rgba(170,162,58,0.75)', 'lm-to'),
        ]}
        {selected && highlight(selected, 'rgba(20,85,30,0.5)', 'sel')}
        {marks.map((m, i) => highlight(m.square, MARK_FILL[m.tone], `mark-${i}`))}

        {/* Coordonnées */}
        {Array.from({ length: 8 }, (_, i) => {
          const fileSq = toSquare(i + 0.5, 7.5)!;
          const rankSq = toSquare(0.5, i + 0.5)!;
          const fileLight = (squareToCoords(fileSq).file + squareToCoords(fileSq).rank) % 2 === 1;
          const rankLight = (squareToCoords(rankSq).file + squareToCoords(rankSq).rank) % 2 === 1;
          return (
            <g key={`coord-${i}`} pointerEvents="none" fontSize={0.2} fontWeight={700} fontFamily="system-ui, sans-serif">
              <text x={i + 0.95} y={7.95} textAnchor="end" fill={fileLight ? DARK : LIGHT}>
                {fileSq[0]}
              </text>
              <text x={0.05} y={i + 0.22} fill={rankLight ? DARK : LIGHT}>
                {rankSq[1]}
              </text>
            </g>
          );
        })}

        {/* Pièces */}
        {pieces.map((p) => {
          if (drag?.moved && drag.from === p.square) return null;
          const { x, y } = toXY(p.square);
          return (
            <text key={p.square} x={x + 0.5} y={y + 0.54} {...pieceStyle(p.color)} pointerEvents="none">
              {PIECE_GLYPH[p.type]}
            </text>
          );
        })}

        {/* Coups légaux */}
        {destinations.map((sq) => {
          const { x, y } = toXY(sq);
          return pieceAt.has(sq) ? (
            <circle key={`d-${sq}`} cx={x + 0.5} cy={y + 0.5} r={0.46} fill="none" stroke="rgba(20,85,30,0.55)" strokeWidth={0.08} pointerEvents="none" />
          ) : (
            <circle key={`d-${sq}`} cx={x + 0.5} cy={y + 0.5} r={0.15} fill="rgba(20,85,30,0.55)" pointerEvents="none" />
          );
        })}

        {/* Pièce en cours de glisser-déposer */}
        {drag?.moved && pieceAt.get(drag.from) && (
          <text x={drag.x} y={drag.y + 0.04} {...pieceStyle(pieceAt.get(drag.from)!.color)} pointerEvents="none">
            {PIECE_GLYPH[pieceAt.get(drag.from)!.type]}
          </text>
        )}
      </svg>

      {pendingPromotion && (
        <PromotionPicker
          color={turn}
          onPick={(piece) => {
            const { from, to } = pendingPromotion;
            setPendingPromotion(null);
            onMove(from, to, piece);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}
