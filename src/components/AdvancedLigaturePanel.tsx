import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  drawInspectorCanvasText,
  LIGATURE_PRESET_PAIRS,
  measureInspectorCanvasText,
} from '../lib/customFontCalibration';
import {
  clampLigatureOverlap,
  ensureCustomFontFaceLoaded,
  normalizeLigaturePairKey,
} from '../lib/customFontStore';
import { Dictionary } from '../lib/i18n';
import { CustomFontAsset, GridBlockCount, WorksheetFontSize } from '../types/worksheet';

interface AdvancedLigaturePanelProps {
  font: CustomFontAsset;
  scale: number;
  baselineOffset: number;
  letterSpacing: number;
  ligatureOverlaps: Record<string, number>;
  fontSize: WorksheetFontSize;
  gridBlocks: GridBlockCount;
  copy: Dictionary;
  onChangeLigatureOverlaps: (next: Record<string, number>) => void;
}

interface LigatureMiniPreviewProps {
  pair: string;
  familyName: string;
  scale: number;
  baselineOffset: number;
  letterSpacing: number;
  ligatureOverlaps: Record<string, number>;
  fontSize: WorksheetFontSize;
  gridBlocks: GridBlockCount;
  fontReadyNonce: number;
}

function LigatureMiniPreview({
  pair,
  familyName,
  scale,
  baselineOffset,
  letterSpacing,
  ligatureOverlaps,
  fontSize,
  gridBlocks,
  fontReadyNonce,
}: LigatureMiniPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const widthPx = 72;
    const heightPx = 42;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(widthPx * dpr);
    canvas.height = Math.round(heightPx * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthPx, heightPx);

    const blocks = gridBlocks === 5 ? 5 : 4;
    const isNormal = fontSize === 'normal';
    const aboveRows = isNormal ? Math.max(blocks, 5) : blocks;
    const descRows = 2;
    const totalRows = aboveRows + descRows;
    const cellPx = Math.max(4, Math.floor((heightPx - 4) / totalRows));
    const gridH = cellPx * totalRows;
    const gridTopY = Math.round((heightPx - gridH) / 2);
    const baselineY = gridTopY + cellPx * aboveRows;
    const xHeightRow = aboveRows - (isNormal ? 2 : 1);
    const blockMajorRow = aboveRows - blocks;

    const colCount = Math.ceil(widthPx / cellPx) + 1;
    for (let c = 0; c <= colCount; c += 1) {
      const vx = c * cellPx + 0.5;
      const isMajor = c % blocks === 0;
      ctx.beginPath();
      ctx.moveTo(vx, gridTopY);
      ctx.lineTo(vx, gridTopY + gridH);
      ctx.strokeStyle = isMajor ? '#93C5FD' : '#E2EEFD';
      ctx.lineWidth = isMajor ? 0.7 : 0.4;
      ctx.stroke();
    }

    for (let r = 0; r <= totalRows; r += 1) {
      const hy = gridTopY + r * cellPx + 0.5;
      const isBase = r === aboveRows;
      const isMajor = r === blockMajorRow;
      const isX = r === xHeightRow;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(widthPx, hy);
      ctx.strokeStyle = isBase
        ? '#2563EB'
        : isMajor
          ? '#60A5FA'
          : isX
            ? '#93C5FD'
            : '#DCEBFC';
      ctx.lineWidth = isBase ? 1.1 : isMajor ? 0.7 : 0.45;
      ctx.stroke();
    }

    const textScale = isNormal ? 2 : 1;
    const baseFontPx = Math.max(11, Math.min(heightPx * 0.74, cellPx * 1.92 * textScale * scale));
    ctx.font = `${baseFontPx}px "${familyName}", sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';

    const maxW = widthPx - 10;
    let fittedPx = baseFontPx;
    let measuredW = measureInspectorCanvasText(ctx, pair, fittedPx, letterSpacing, ligatureOverlaps);
    if (measuredW > maxW && measuredW > 0) {
      fittedPx = Math.max(10, baseFontPx * (maxW / measuredW));
      ctx.font = `${fittedPx}px "${familyName}", sans-serif`;
      measuredW = measureInspectorCanvasText(ctx, pair, fittedPx, letterSpacing, ligatureOverlaps);
    }

    const textY = baselineY - baselineOffset * cellPx * textScale;
    const textX = Math.max(4, (widthPx - measuredW) / 2);
    drawInspectorCanvasText(ctx, pair, textX, textY, fittedPx, letterSpacing, ligatureOverlaps);

    ctx.restore();
  }, [
    pair,
    familyName,
    scale,
    baselineOffset,
    letterSpacing,
    ligatureOverlaps,
    fontSize,
    gridBlocks,
    fontReadyNonce,
  ]);

  return (
    <div className="w-[72px] h-[42px] shrink-0 rounded border border-slate-200 bg-white overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        aria-label={`Live join preview for ${pair}`}
      />
    </div>
  );
}

export function AdvancedLigaturePanel({
  font,
  scale,
  baselineOffset,
  letterSpacing,
  ligatureOverlaps,
  fontSize,
  gridBlocks,
  copy,
  onChangeLigatureOverlaps,
}: AdvancedLigaturePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [pairDraft, setPairDraft] = useState('');
  const [fontReadyNonce, setFontReadyNonce] = useState(0);

  useEffect(() => {
    let active = true;
    void ensureCustomFontFaceLoaded(font.id).then(() => {
      if (active) setFontReadyNonce((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [font.id, font.familyName]);

  const entries = useMemo(() => {
    return Object.entries(ligatureOverlaps).sort(([a], [b]) => a.localeCompare(b));
  }, [ligatureOverlaps]);

  const activeNonZeroCount = useMemo(
    () => entries.filter(([, val]) => Math.abs(val) >= 1).length,
    [entries]
  );

  const normalizedDraft = useMemo(() => normalizeLigaturePairKey(pairDraft), [pairDraft]);

  const handleAddPair = (rawPair: string, defaultOverlap = 8) => {
    const key = normalizeLigaturePairKey(rawPair);
    if (!key) return;
    if (key in ligatureOverlaps) {
      setPairDraft('');
      return;
    }
    onChangeLigatureOverlaps({
      ...ligatureOverlaps,
      [key]: clampLigatureOverlap(defaultOverlap),
    });
    setPairDraft('');
  };

  const handleUpdatePair = (key: string, nextValue: number) => {
    onChangeLigatureOverlaps({
      ...ligatureOverlaps,
      [key]: clampLigatureOverlap(nextValue),
    });
  };

  const handleRemovePair = (key: string) => {
    const next = { ...ligatureOverlaps };
    delete next[key];
    onChangeLigatureOverlaps(next);
  };

  return (
    <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          <Link2 className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
          <span>{copy.builder.customFontLigatureTitle}</span>
          {activeNonZeroCount > 0 && (
            <span className="text-[11px] font-mono font-normal text-slate-500 tabular-nums">
              · {activeNonZeroCount} {copy.builder.customFontLigatureActiveCount}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          )}
        </button>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => onChangeLigatureOverlaps({})}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-rose-700 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>{copy.builder.customFontLigatureClearAll}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {copy.builder.customFontLigatureHint}
          </p>

          {/* Add custom 2-character pair form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (normalizedDraft) handleAddPair(normalizedDraft, 8);
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor="ligature-pair-input" className="sr-only">
              {copy.builder.customFontLigaturePairPlaceholder}
            </label>
            <input
              id="ligature-pair-input"
              type="text"
              maxLength={4}
              value={pairDraft}
              onChange={(e) => setPairDraft(e.target.value)}
              placeholder={copy.builder.customFontLigaturePairPlaceholder}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white text-slate-900 border border-slate-300 rounded-md placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!normalizedDraft}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{copy.builder.customFontLigatureAddPair}</span>
            </button>
          </form>

          {/* Quick-add penmanship pair buttons */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
            <span className="text-slate-400 shrink-0">{copy.builder.customFontLigaturePresetsLabel}:</span>
            {LIGATURE_PRESET_PAIRS.map((preset) => {
              const added = preset in ligatureOverlaps;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleAddPair(preset, preset === 'ca' ? -6 : 8)}
                  disabled={added}
                  className={`font-mono transition-colors whitespace-nowrap ${
                    added
                      ? 'text-blue-700 font-semibold cursor-default'
                      : 'text-slate-600 hover:text-blue-700 underline underline-offset-2'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          {/* Configured Pair Join Overlap Rules */}
          {entries.length === 0 ? (
            <p className="text-[11px] text-slate-400 py-1">
              {copy.builder.customFontLigatureEmpty}
            </p>
          ) : (
            <div className="divide-y divide-slate-200/80 rounded-md border border-slate-200 bg-white">
              {entries.map(([pairKey, overlapPct]) => {
                const sign = overlapPct > 0 ? '+' : '';
                return (
                  <div key={pairKey} className="p-2.5 flex items-center gap-2.5">
                    <LigatureMiniPreview
                      pair={pairKey}
                      familyName={font.familyName}
                      scale={scale}
                      baselineOffset={baselineOffset}
                      letterSpacing={letterSpacing}
                      ligatureOverlaps={ligatureOverlaps}
                      fontSize={fontSize}
                      gridBlocks={gridBlocks}
                      fontReadyNonce={fontReadyNonce}
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <label
                            htmlFor={`ligature-slider-${pairKey}`}
                            className="text-xs font-mono font-semibold text-slate-900"
                          >
                            {pairKey}
                          </label>
                          <span className="text-[10px] text-slate-400 truncate">
                            {copy.builder.customFontLigatureJoinOverlap}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[11px] font-mono font-semibold tabular-nums ${
                              overlapPct > 0
                                ? 'text-blue-700'
                                : overlapPct < 0
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            {sign}
                            {overlapPct}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePair(pairKey)}
                            aria-label={`${copy.builder.customFontLigatureRemoveRule} ${pairKey}`}
                            title={copy.builder.customFontLigatureRemoveRule}
                            className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <input
                        id={`ligature-slider-${pairKey}`}
                        type="range"
                        min={-30}
                        max={40}
                        step={1}
                        value={overlapPct}
                        onChange={(e) => handleUpdatePair(pairKey, Number(e.target.value))}
                        className="w-full h-1.5 accent-blue-700 cursor-pointer"
                      />

                      <div className="flex justify-between text-[9px] font-mono text-slate-400 tabular-nums">
                        <span>-30%</span>
                        <span>0%</span>
                        <span>+40%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
