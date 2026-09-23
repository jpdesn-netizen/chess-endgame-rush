import type { Color, PromotionPiece } from '../../core/types';
import { PIECE_FONT, PIECE_GLYPH } from './pieces';

const CHOICES: { piece: PromotionPiece; label: string }[] = [
  { piece: 'q', label: 'Dame' },
  { piece: 'r', label: 'Tour' },
  { piece: 'b', label: 'Fou' },
  { piece: 'n', label: 'Cavalier' },
];

export function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: Color;
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-md" onClick={onCancel}>
      <div className="flex gap-2 rounded-xl bg-stone-800 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {CHOICES.map(({ piece, label }) => (
          <button
            key={piece}
            type="button"
            title={label}
            aria-label={`Promouvoir en ${label}`}
            onClick={() => onPick(piece)}
            className="h-16 w-16 rounded-lg bg-stone-200 text-5xl leading-none hover:bg-amber-200"
            style={{
              fontFamily: PIECE_FONT,
              color: color === 'w' ? '#fff' : '#1c1917',
              WebkitTextStroke: color === 'w' ? '1.5px #1c1917' : undefined,
            }}
          >
            {PIECE_GLYPH[piece]}
          </button>
        ))}
      </div>
    </div>
  );
}
