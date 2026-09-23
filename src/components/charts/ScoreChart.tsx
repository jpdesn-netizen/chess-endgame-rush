// Courbe d'évolution des scores (une seule série : le titre la nomme).
// Ligne 2 px, repères ≥ 8 px avec anneau couleur du fond, grille discrète,
// réticule + infobulle au survol, tableau des valeurs en repli.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface Point {
  t: number;
  score: number;
}

const SERIES = '#d97706'; // ambre validé sur fond sombre (luminosité + contraste)
const GRID = '#44403c';
const INK_MUTED = '#a8a29e';
const SURFACE = '#1c1917';

const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const fmtFull = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const step = v <= 20 ? 5 : v <= 50 ? 10 : 20;
  return Math.ceil(v / step) * step;
}

export function ScoreChart({ points, title }: { points: Point[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = 640;
  const H = 240;
  const M = { l: 36, r: 16, t: 12, b: 28 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const { xs, ys, yMax, ticks } = useMemo(() => {
    const max = niceMax(Math.max(1, ...points.map((p) => p.score)));
    const n = points.length;
    const x = (i: number) => M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v: number) => M.t + ih - (v / max) * ih;
    const step = max / 5;
    return {
      xs: points.map((_, i) => x(i)),
      ys: points.map((p) => y(p.score)),
      yMax: max,
      ticks: Array.from({ length: 6 }, (_, i) => ({ v: Math.round(i * step), y: y(i * step) })),
    };
  }, [points, iw, ih, M.l, M.t]);

  if (points.length === 0) {
    return <p className="rounded-xl bg-stone-800 p-6 text-center text-sm text-stone-400">Aucune partie enregistrée pour ce choix.</p>;
  }

  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const best = points.reduce((b, p, i) => (p.score > points[b].score ? i : b), 0);
  const last = points.length - 1;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    xs.forEach((x, i) => {
      if (Math.abs(x - px) < Math.abs(xs[nearest] - px)) nearest = i;
    });
    setHover(nearest);
  };

  return (
    <figure className="rounded-xl bg-stone-800/60 p-3">
      <figcaption className="mb-1 text-sm font-semibold text-stone-200">{title}</figcaption>
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${title} : ${points.length} parties, meilleur score ${points[best].score}, dernier ${points[last].score}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={M.l} x2={W - M.r} y1={t.y} y2={t.y} stroke={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={t.y + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
                {t.v}
              </text>
            </g>
          ))}
          <text x={M.l} y={H - 8} fontSize={11} fill={INK_MUTED}>
            {fmtDate(points[0].t)}
          </text>
          <text x={W - M.r} y={H - 8} fontSize={11} fill={INK_MUTED} textAnchor="end">
            {fmtDate(points[last].t)}
          </text>
          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={M.t} y2={M.t + ih} stroke={INK_MUTED} strokeWidth={1} />}
          {[best, last].concat(hover !== null ? [hover] : []).map((i, k) => (
            <circle key={`${i}-${k}`} cx={xs[i]} cy={ys[i]} r={5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          ))}
          {/* Étiquettes sélectives : meilleur score et dernier score */}
          <text
            x={xs[best]}
            y={ys[best] - 10}
            // Près des bords, l'étiquette s'aligne vers l'intérieur pour ne pas être coupée.
            textAnchor={xs[best] > W - 80 ? 'end' : xs[best] < M.l + 40 ? 'start' : 'middle'}
            fontSize={11}
            fill="#e7e5e4"
          >
            record {points[best].score}
          </text>
          {last !== best && (
            <text x={xs[last]} y={ys[last] - 10} textAnchor="end" fontSize={11} fill="#e7e5e4">
              {points[last].score}
            </text>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute rounded-md bg-stone-950 px-2 py-1 text-xs text-stone-100 shadow"
            style={{ left: `${(xs[hover] / W) * 100}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            {fmtFull(points[hover].t)} · score <strong>{points[hover].score}</strong>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-stone-400">
        <summary className="cursor-pointer">Voir le tableau ({points.length} parties, échelle 0–{yMax})</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1">Date</th>
              <th className="py-1 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.t} className="border-t border-stone-700">
                <td className="py-1">{fmtFull(p.t)}</td>
                <td className="py-1 text-right tabular-nums">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
