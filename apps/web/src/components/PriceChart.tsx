import { useMemo, useState } from 'react';
import type { PricePoint } from '../lib/api';
import { dateTime, money } from '../lib/format';

/**
 * Gráfico de linha em SVG puro (sem dependência): evolução do preço, linha tracejada do alvo
 * e marcação dos pontos de queda.
 */
export function PriceChart({ history, target, currency }: { history: PricePoint[]; target: number; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, P = { t: 16, r: 16, b: 28, l: 64 };

  const data = useMemo(() => {
    if (!history.length) return null;
    const prices = history.map((h) => h.price);
    let min = Math.min(...prices, target), max = Math.max(...prices, target);
    const pad = (max - min) * 0.12 || max * 0.05 || 1;
    min = Math.max(0, min - pad);
    max += pad;
    const t0 = new Date(history[0].captured_at).getTime();
    const t1 = new Date(history[history.length - 1].captured_at).getTime();
    const span = t1 - t0 || 1;
    const x = (t: string) => (history.length === 1 ? (P.l + W - P.r) / 2 : P.l + ((new Date(t).getTime() - t0) / span) * (W - P.l - P.r));
    const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
    const pts = history.map((h, i) => ({ x: x(h.captured_at), y: y(h.price), h, drop: i > 0 && h.price < history[i - 1].price }));
    const ticks = [0, 0.5, 1].map((f) => min + (max - min) * f);
    return { pts, y, ticks };
  }, [history, target]);

  if (!data) {
    return <div className="muted flex h-40 items-center justify-center rounded-md border border-dashed border-gray-100 text-sm dark:border-gray-800">Sem histórico ainda. A primeira verificação aparece aqui.</div>;
  }

  const line = data.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const active = hover != null ? data.pts[hover] : null;
  const drops = data.pts.filter((p) => p.drop).length;

  return (
    <figure>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Histórico de ${history.length} preços, ${drops} quedas. Alvo ${money(target, currency)}.`}
          onPointerMove={(e) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            let best = 0;
            data.pts.forEach((p, i) => Math.abs(p.x - px) < Math.abs(data.pts[best].x - px) && (best = i));
            setHover(best);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {data.ticks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={data.y(v)} y2={data.y(v)} className="stroke-gray-100 dark:stroke-gray-800" />
              <text x={P.l - 8} y={data.y(v) + 4} textAnchor="end" className="fill-gray-700 text-[11px] dark:fill-gray-400">
                {money(v, currency)}
              </text>
            </g>
          ))}
          <line x1={P.l} x2={W - P.r} y1={data.y(target)} y2={data.y(target)} strokeDasharray="4 4" className="stroke-accent dark:stroke-accent-dark" strokeWidth={1.25} />
          <text x={W - P.r} y={data.y(target) - 6} textAnchor="end" className="fill-accent text-[11px] font-medium dark:fill-accent-dark">
            alvo
          </text>
          <path d={line} fill="none" className="stroke-gray-900 dark:stroke-gray-50" strokeWidth={1.75} strokeLinejoin="round" />
          {data.pts.map((p, i) =>
            p.drop ? (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} className="fill-white stroke-gray-900 dark:fill-gray-900 dark:stroke-gray-50" strokeWidth={1.5} />
            ) : null,
          )}
          {active && (
            <>
              <line x1={active.x} x2={active.x} y1={P.t} y2={H - P.b} className="stroke-gray-400" strokeWidth={1} />
              <circle cx={active.x} cy={active.y} r={4.5} className="fill-gray-900 dark:fill-gray-50" />
            </>
          )}
          <text x={P.l} y={H - 8} className="fill-gray-700 text-[11px] dark:fill-gray-400">{dateTime(history[0].captured_at)}</text>
          <text x={W - P.r} y={H - 8} textAnchor="end" className="fill-gray-700 text-[11px] dark:fill-gray-400">
            {dateTime(history[history.length - 1].captured_at)}
          </text>
        </svg>
        {active && (
          <div className="card pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 px-3 py-1.5 text-xs" aria-hidden>
            <span className="font-semibold">{money(active.h.price, currency)}</span>
            <span className="muted"> · {dateTime(active.h.captured_at)}</span>
          </div>
        )}
      </div>
      <figcaption className="muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="h-px w-4 bg-gray-900 dark:bg-gray-50" />preço</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-gray-900 dark:border-gray-50" />queda</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-accent dark:border-accent-dark" />preço-alvo</span>
      </figcaption>
    </figure>
  );
}
