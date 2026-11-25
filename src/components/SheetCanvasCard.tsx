import { useEffect, useRef, useState } from 'react';
import { PreviewPageDescriptor } from '../lib/pdfEngine';

interface SheetCanvasCardProps {
  descriptor: PreviewPageDescriptor;
  targetWidth: number;
  renderKey: string;
  allowOverflow?: boolean;
}

export function SheetCanvasCard({
  descriptor,
  targetWidth,
  renderKey,
  allowOverflow = false,
}: SheetCanvasCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);

    descriptor
      .draw(canvas, targetWidth)
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Preview render failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [descriptor, targetWidth, renderKey]);

  return (
    <figure className={`flex flex-col items-center gap-2.5 ${allowOverflow ? 'shrink-0' : 'max-w-full'}`}>
      <figcaption className="w-full flex items-center justify-between gap-4 text-xs text-slate-600 px-0.5">
        <span className="font-semibold text-slate-800 truncate">{descriptor.title}</span>
        <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0 tabular-nums">
          {descriptor.paperLabel}
        </span>
      </figcaption>
      <div
        className={`bg-white border border-slate-200 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.18)] overflow-hidden ${
          allowOverflow ? '' : 'max-w-full'
        }`}
      >
        {error ? (
          <div className="p-8 text-sm text-rose-700 bg-rose-50">{error}</div>
        ) : (
          <canvas
            ref={canvasRef}
            className={allowOverflow ? 'block h-auto' : 'block max-w-full h-auto'}
          />
        )}
      </div>
    </figure>
  );
}
