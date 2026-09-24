// Radar à une seule série (le titre la nomme, pas de légende).
// Trait 2 px, repères ≥ 8 px avec anneau couleur du fond, grille discrète,
// infobulle au survol et au clavier. Un axe sans données n'a pas de point.

import { useState } from 'react';

export interface RadarAxis {
  id: string;
  label: string;
  /** Valeur normalisée 0..1, ou null si pas assez de données. */
  value: number | null;
  /** Valeur affichée (ex. « 72 % », « 1 450 »). */
  display: string;
  /** Détail pour l'infobulle. */
  detail: string;
}

const SERIES = '#d97706'; // même ambre que les autres graphiques (validé sur fond sombre)
const GRID = '#44403c';
const INK = '#e7e5e4';
const INK_MUTED = '#a8a29e';
const SURFACE = '#292524';

export function RadarChart({
  title,
  axes,
  rings,
}: {
  title: string;
  axes: RadarAxis[];
  rings: { r: number; label: string }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 400;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 112;
  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => [cx + Math.cos(angle(i)) * R * v, cy + Math.sin(angle(i)) * R * v] as const;
  const withData = axes.map((a, i) => ({ a, i })).filter(({ a }) => a.value !== null);
  const poly = withData.map(({ a, i }) => pt(i, Math.max(0.02, a.value!)).join(',')).join(' ');
  const h = hover !== null ? axes[hover] : null;

  return (
    <figure className="flex flex-col gap-1 rounded-xl bg-stone-800 p-3">
      <figcaption className="text-sm font-semibold text-stone-200">{title}</figcaption>
      {n < 3 ? (
        <p className="p-6 text-center text-sm text-stone-400">Il faut au moins 3 types pour un radar.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
            {/* anneaux */}
            {rings.map((ring) => (
              <g key={ring.r}>
                <polygon
                  points={axes.map((_, i) => pt(i, ring.r).join(',')).join(' ')}
                  fill="none"
                  stroke={GRID}
                  strokeWidth={1}
                />
                {/* graduation posée entre les deux premiers axes, jamais sur une donnée */}
                <text
                  x={cx + Math.cos(angle(0.5)) * R * ring.r + 3}
                  y={cy + Math.sin(angle(0.5)) * R * ring.r + 3}
                  fontSize={10}
                  fill={INK_MUTED}
                >
                  {ring.label}
                </text>
              </g>
            ))}
            {/* rayons + libellés */}
            {axes.map((a, i) => {
              const [x, y] = pt(i, 1);
              const [lx, ly] = pt(i, 1.2);
              const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
              return (
                <g key={a.id}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={1} />
                  <text
                    x={lx}
                    y={ly + 4}
                    fontSize={12}
                    textAnchor={anchor}
                    fill={a.value === null ? INK_MUTED : INK}
                    fontWeight={hover === i ? 700 : 500}
                  >
                    {a.label}
                  </text>
                </g>
              );
            })}
            {/* série */}
            {withData.length >= 2 && (
              <polygon points={poly} fill={SERIES} fillOpacity={0.18} stroke={SERIES} strokeWidth={2} strokeLinejoin="round" />
            )}
            {withData.map(({ a, i }) => {
              const [x, y] = pt(i, Math.max(0.02, a.value!));
              return (
                <circle key={a.id} cx={x} cy={y} r={hover === i ? 6 : 4.5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
              );
            })}
            {/* zones de survol, plus grandes que les repères */}
            {axes.map((a, i) => {
              const [x, y] = pt(i, a.value ?? 1.1);
              return (
                <circle
                  key={a.id}
                  cx={x}
                  cy={y}
                  r={16}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${a.label} : ${a.display}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              );
            })}
          </svg>
          {h && (
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-lg bg-stone-950/95 px-3 py-2 text-xs text-stone-200 shadow-lg ring-1 ring-stone-700">
              <div className="font-semibold text-stone-50">
                {h.label} · <span className="tabular-nums">{h.display}</span>
              </div>
              <div className="text-stone-400">{h.detail}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
