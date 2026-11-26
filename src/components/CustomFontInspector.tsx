import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Undo2,
} from 'lucide-react';
import {
  analyzeCaPairAutoFix,
  analyzeCharPair,
  CaAutoFixResult,
  drawInspectorCanvasText,
  INSPECTOR_PAIRS,
  INSPECTOR_SAMPLE_WORDS,
  measureInspectorCanvasText,
  PairAnalysis,
} from '../lib/customFontCalibration';
import { ensureCustomFontFaceLoaded } from '../lib/customFontStore';
import { Dictionary } from '../lib/i18n';
import { CustomFontAsset, GridBlockCount, WorksheetFontSize } from '../types/worksheet';

interface CustomFontInspectorProps {
  font: CustomFontAsset;
  scale: number;
  baselineOffset: number;
  letterSpacing: number;
  ligatureOverlaps: Record<string, number>;
  fontSize: WorksheetFontSize;
  gridBlocks: GridBlockCount;
  copy: Dictionary;
  onApplyLetterSpacing: (nextLetterSpacing: number) => void;
}

interface PairCanvasProps {
  text: string;
  familyName: string;
  scale: number;
  baselineOffset: number;
  letterSpacing: number;
  ligatureOverlaps: Record<string, number>;
  fontSize: WorksheetFontSize;
  gridBlocks: GridBlockCount;
  heightPx: number;
  heightClass: string;
  fontReadyNonce: number;
  align?: 'center' | 'left';
}

function InspectorOlyCanvas({
  text,
  familyName,
  scale,
  baselineOffset,
  letterSpacing,
  ligatureOverlaps,
  fontSize,
  gridBlocks,
  heightPx,
  heightClass,
  fontReadyNonce,
  align = 'center',
}: PairCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(110);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const next = Math.max(76, Math.floor(el.clientWidth));
      setBoxWidth((prev) => (prev === next ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(boxWidth * dpr));
    canvas.height = Math.max(1, Math.round(heightPx * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, boxWidth, heightPx);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, boxWidth, heightPx);

    const blocks = gridBlocks === 5 ? 5 : 4;
    const isNormal = fontSize === 'normal';
    const aboveRows = isNormal ? Math.max(blocks, 5) : blocks;
    const descRows = 2;
    const totalRows = aboveRows + descRows;
    const cellPx = Math.max(5, Math.floor((heightPx - 6) / totalRows));
    const gridH = cellPx * totalRows;
    const gridTopY = Math.round((heightPx - gridH) / 2);
    const baselineY = gridTopY + cellPx * aboveRows;
    const xHeightRow = aboveRows - (isNormal ? 2 : 1);
    const blockMajorRow = aboveRows - blocks;

    // Vertical ô ly lines
    const colCount = Math.ceil(boxWidth / cellPx) + 1;
    for (let c = 0; c <= colCount; c += 1) {
      const vx = c * cellPx + 0.5;
      const isMajor = c % blocks === 0;
      ctx.beginPath();
      ctx.moveTo(vx, gridTopY);
      ctx.lineTo(vx, gridTopY + gridH);
      ctx.strokeStyle = isMajor ? '#93C5FD' : '#E2EEFD';
      ctx.lineWidth = isMajor ? 0.75 : 0.45;
      ctx.stroke();
    }

    // Horizontal ô ly lines
    for (let r = 0; r <= totalRows; r += 1) {
      const hy = gridTopY + r * cellPx + 0.5;
      const isBase = r === aboveRows;
      const isMajor = r === blockMajorRow;
      const isX = r === xHeightRow;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(boxWidth, hy);
      ctx.strokeStyle = isBase
        ? '#2563EB'
        : isMajor
          ? '#60A5FA'
          : isX
            ? '#93C5FD'
            : '#DCEBFC';
      ctx.lineWidth = isBase ? 1.15 : isMajor ? 0.75 : 0.5;
      ctx.stroke();
    }

    // Draw live custom font glyph pair / word with exact calibration math
    const textScale = isNormal ? 2 : 1;
    const baseFontPx = Math.max(11, Math.min(heightPx * 0.72, cellPx * 1.92 * textScale * scale));
    const drawText = text.trim() || 'ca';
    ctx.font = `${baseFontPx}px "${familyName}", sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';

    const maxW = Math.max(24, boxWidth - 14);
    let fittedFontPx = baseFontPx;
    let measuredW = measureInspectorCanvasText(
      ctx,
      drawText,
      fittedFontPx,
      letterSpacing,
      ligatureOverlaps
    );
    if (measuredW > maxW && measuredW > 0) {
      fittedFontPx = Math.max(10, baseFontPx * (maxW / measuredW));
      ctx.font = `${fittedFontPx}px "${familyName}", sans-serif`;
      measuredW = measureInspectorCanvasText(
        ctx,
        drawText,
        fittedFontPx,
        letterSpacing,
        ligatureOverlaps
      );
    }

    const textY = baselineY - baselineOffset * cellPx * textScale;
    const textX = align === 'left' ? 10 : Math.max(6, (boxWidth - measuredW) / 2);
    drawInspectorCanvasText(
      ctx,
      drawText,
      textX,
      textY,
      fittedFontPx,
      letterSpacing,
      ligatureOverlaps
    );

    ctx.restore();
  }, [
    text,
    familyName,
    scale,
    baselineOffset,
    letterSpacing,
    ligatureOverlaps,
    fontSize,
    gridBlocks,
    heightPx,
    boxWidth,
    fontReadyNonce,
    align,
  ]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${heightClass}`}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        aria-label={`Preview of ${text}`}
      />
    </div>
  );
}

export function CustomFontInspector({
  font,
  scale,
  baselineOffset,
  letterSpacing,
  ligatureOverlaps,
  fontSize,
  gridBlocks,
  copy,
  onApplyLetterSpacing,
}: CustomFontInspectorProps) {
  const [expanded, setExpanded] = useState(true);
  const [fontReadyNonce, setFontReadyNonce] = useState(0);
  const [focusWord, setFocusWord] = useState('umbrella');
  const [runningAutoFix, setRunningAutoFix] = useState(false);
  const [autoFixResult, setAutoFixResult] = useState<CaAutoFixResult | null>(null);

  // Confirm font face is loaded in document.fonts before rasterizing inspector canvases
  useEffect(() => {
    let active = true;
    void ensureCustomFontFaceLoaded(font.id).then(() => {
      if (active) setFontReadyNonce((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [font.id, font.familyName]);

  // Reset stale Auto-Fix message when switching to a different custom font
  useEffect(() => {
    setAutoFixResult(null);
  }, [font.id]);

  // Run live per-pair kerning diagnostics across all 9 problematic pairs
  const pairDiagnostics = useMemo<Map<string, PairAnalysis>>(() => {
    const map = new Map<string, PairAnalysis>();
    if (!expanded) return map;
    for (const item of INSPECTOR_PAIRS) {
      map.set(
        item.id,
        analyzeCharPair(font.familyName, item.pair, letterSpacing, ligatureOverlaps)
      );
    }
    return map;
    // fontReadyNonce ensures re-evaluation once FontFace finishes loading
  }, [expanded, font.familyName, letterSpacing, ligatureOverlaps, fontReadyNonce]);

  const flaggedCount = useMemo(() => {
    let count = 0;
    for (const diag of pairDiagnostics.values()) {
      if (diag.status !== 'clear') count += 1;
    }
    return count;
  }, [pairDiagnostics]);

  const handleRunAutoFix = async () => {
    setRunningAutoFix(true);
    try {
      await ensureCustomFontFaceLoaded(font.id);
      const result = analyzeCaPairAutoFix(font.familyName, letterSpacing);
      setAutoFixResult(result);
      onApplyLetterSpacing(result.recommendedLetterSpacing);
      setFocusWord('cat');
      setFontReadyNonce((n) => n + 1);
    } finally {
      setRunningAutoFix(false);
    }
  };

  const formatEm = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(2)} em`;

  const autoFixSummary = useMemo(() => {
    if (!autoFixResult) return null;
    const applied = formatEm(autoFixResult.recommendedLetterSpacing);
    if (autoFixResult.status === 'overlap-fixed') {
      return copy.builder.customFontAutoFixOverlap.replace('{value}', applied);
    }
    if (autoFixResult.status === 'tight-fixed') {
      return copy.builder.customFontAutoFixTight.replace('{value}', applied);
    }
    if (autoFixResult.status === 'wide-fixed') {
      return copy.builder.customFontAutoFixWide.replace('{value}', applied);
    }
    return copy.builder.customFontAutoFixBalanced.replace('{value}', applied);
  }, [autoFixResult, copy.builder]);

  return (
    <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
      {/* Header row: Inspector Toggle + Run Calibration Auto-Fix action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          <Eye className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
          <span>{copy.builder.customFontInspectorTitle}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            void handleRunAutoFix();
          }}
          disabled={runningAutoFix}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
        >
          <Crosshair className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {runningAutoFix
              ? copy.builder.customFontAutoFixRunning
              : copy.builder.customFontAutoFixBtn}
          </span>
        </button>
      </div>

      {/* Auto-Fix feedback message */}
      {autoFixResult && autoFixSummary && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-2 text-[11px] text-slate-800"
        >
          <div className="flex items-start gap-1.5 min-w-0">
            <Check className="w-3.5 h-3.5 mt-0.5 text-blue-700 shrink-0" aria-hidden="true" />
            <span className="leading-snug">{autoFixSummary}</span>
          </div>
          {Math.abs(autoFixResult.previousLetterSpacing - autoFixResult.recommendedLetterSpacing) >
            0.004 && (
            <button
              type="button"
              onClick={() => {
                onApplyLetterSpacing(autoFixResult.previousLetterSpacing);
                setAutoFixResult(null);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0"
            >
              <Undo2 className="w-3 h-3" aria-hidden="true" />
              <span>{copy.builder.customFontAutoFixUndo}</span>
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="space-y-2.5">
          {/* Quiet unboxed summary line */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{copy.builder.customFontInspectorHint}</span>
            <span className="font-mono tabular-nums text-slate-600 shrink-0">
              {flaggedCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>
                    {flaggedCount} {copy.builder.customFontInspectorNeedsCheck}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{copy.builder.customFontInspectorAllClear}</span>
                </span>
              )}
            </span>
          </div>

          {/* 3 × 3 Problematic Character Pairs Grid */}
          <div
            className="grid grid-cols-3 gap-1.5"
            role="group"
            aria-label={copy.builder.customFontInspectorTitle}
          >
            {INSPECTOR_PAIRS.map((item) => {
              const diag = pairDiagnostics.get(item.id);
              const isOverlap = diag?.status === 'overlap';
              const isTight = diag?.status === 'tight';
              const isFocused = focusWord.toLowerCase() === item.context;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFocusWord(item.context)}
                  className={`text-left rounded-md border bg-white overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isFocused
                      ? 'border-blue-600'
                      : isOverlap
                        ? 'border-rose-300 hover:border-rose-400'
                        : isTight
                          ? 'border-amber-300 hover:border-amber-400'
                          : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-slate-100 bg-slate-50/70">
                    <span className="text-[11px] font-mono font-semibold text-slate-800">
                      {item.pair}
                    </span>
                    {isOverlap ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700 whitespace-nowrap">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span>{copy.builder.customFontStatusOverlap}</span>
                      </span>
                    ) : isTight ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 whitespace-nowrap">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span>{copy.builder.customFontStatusTight}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 truncate">{item.context}</span>
                    )}
                  </div>

                  <InspectorOlyCanvas
                    text={item.pair}
                    familyName={font.familyName}
                    scale={scale}
                    baselineOffset={baselineOffset}
                    letterSpacing={letterSpacing}
                    ligatureOverlaps={ligatureOverlaps}
                    fontSize={fontSize}
                    gridBlocks={gridBlocks}
                    heightPx={48}
                    heightClass="h-12"
                    fontReadyNonce={fontReadyNonce}
                    align="center"
                  />
                </button>
              );
            })}
          </div>

          {/* Focused Word Live Strip */}
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <label htmlFor="inspector-test-word" className="sr-only">
                  {copy.builder.customFontInspectorWordLabel}
                </label>
                <input
                  id="inspector-test-word"
                  type="text"
                  maxLength={28}
                  value={focusWord}
                  onChange={(e) => setFocusWord(e.target.value)}
                  placeholder={copy.builder.customFontInspectorWordPlaceholder}
                  className="w-full min-w-[90px] bg-white px-2 py-0.5 text-xs text-slate-900 border border-slate-200 rounded focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-[11px] shrink-0">
                {INSPECTOR_SAMPLE_WORDS.map((word) => {
                  const active = focusWord.toLowerCase() === word;
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => setFocusWord(word)}
                      className={`transition-colors whitespace-nowrap ${
                        active
                          ? 'font-semibold text-blue-700 underline underline-offset-4'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
            </div>

            <InspectorOlyCanvas
              text={focusWord}
              familyName={font.familyName}
              scale={scale}
              baselineOffset={baselineOffset}
              letterSpacing={letterSpacing}
              ligatureOverlaps={ligatureOverlaps}
              fontSize={fontSize}
              gridBlocks={gridBlocks}
              heightPx={64}
              heightClass="h-16"
              fontReadyNonce={fontReadyNonce}
              align="left"
            />
          </div>
        </div>
      )}
    </div>
  );
}
