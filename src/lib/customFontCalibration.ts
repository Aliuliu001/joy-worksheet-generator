import { clampLetterSpacing, hasActiveLigatureOverlaps } from './customFontStore';

export const LIGATURE_PRESET_PAIRS = ['br', 'st', 'ca', 'tr', 're', 'ee', 'oo', 'th'] as const;

export interface InspectorPairSpec {
  id: string;
  pair: string;
  context: string;
}

export const INSPECTOR_PAIRS: InspectorPairSpec[] = [
  { id: 'ca', pair: 'ca', context: 'cat' },
  { id: 'at', pair: 'at', context: 'cat' },
  { id: 'br', pair: 'br', context: 'umbrella' },
  { id: 're', pair: 're', context: 'umbrella' },
  { id: 'el', pair: 'el', context: 'umbrella' },
  { id: 'la', pair: 'la', context: 'umbrella' },
  { id: 'um', pair: 'um', context: 'umbrella' },
  { id: 'tr', pair: 'tr', context: 'tree' },
  { id: 'ee', pair: 'ee', context: 'tree' },
];

export const INSPECTOR_SAMPLE_WORDS = ['cat', 'umbrella', 'star', 'tree'] as const;

export type PairSpacingStatus = 'overlap' | 'tight' | 'clear';

export interface PairAnalysis {
  pair: string;
  gapEm: number;
  status: PairSpacingStatus;
}

export interface CaAutoFixResult {
  recommendedLetterSpacing: number;
  previousLetterSpacing: number;
  nativeGapEm: number;
  projectedGapEm: number;
  status: 'overlap-fixed' | 'tight-fixed' | 'wide-fixed' | 'already-balanced';
}

interface GlyphRasterProfile {
  advance: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  leftByRow: Int16Array;
  rightByRow: Int16Array;
  hasInk: boolean;
}

const ANALYSIS_FONT_PX = 120;
const ANALYSIS_CANVAS_W = 280;
const ANALYSIS_CANVAS_H = 220;
const ANALYSIS_ORIGIN_X = 72;
const ANALYSIS_BASELINE_Y = 152;
const ALPHA_THRESHOLD = 48;

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = ANALYSIS_CANVAS_W;
    sharedCanvas.height = ANALYSIS_CANVAS_H;
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  }
  return sharedCtx;
}

function rasterizeGlyph(
  ctx: CanvasRenderingContext2D,
  familyName: string,
  ch: string
): GlyphRasterProfile {
  const fontSpec = `${ANALYSIS_FONT_PX}px "${familyName}", sans-serif`;
  ctx.clearRect(0, 0, ANALYSIS_CANVAS_W, ANALYSIS_CANVAS_H);
  ctx.font = fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000';

  const advance = ctx.measureText(ch).width;
  ctx.fillText(ch, ANALYSIS_ORIGIN_X, ANALYSIS_BASELINE_Y);

  const img = ctx.getImageData(0, 0, ANALYSIS_CANVAS_W, ANALYSIS_CANVAS_H);
  const data = img.data;
  const leftByRow = new Int16Array(ANALYSIS_CANVAS_H).fill(32767);
  const rightByRow = new Int16Array(ANALYSIS_CANVAS_H).fill(-32768);

  let minX = 32767;
  let maxX = -32768;
  let minY = ANALYSIS_CANVAS_H;
  let maxY = -1;

  for (let y = 0; y < ANALYSIS_CANVAS_H; y += 1) {
    const rowOffset = y * ANALYSIS_CANVAS_W * 4;
    let rowMin = 32767;
    let rowMax = -32768;
    for (let x = 0; x < ANALYSIS_CANVAS_W; x += 1) {
      const alpha = data[rowOffset + x * 4 + 3];
      if (alpha >= ALPHA_THRESHOLD) {
        const relX = x - ANALYSIS_ORIGIN_X;
        if (relX < rowMin) rowMin = relX;
        if (relX > rowMax) rowMax = relX;
      }
    }
    if (rowMin <= rowMax) {
      leftByRow[y] = rowMin;
      rightByRow[y] = rowMax;
      if (rowMin < minX) minX = rowMin;
      if (rowMax > maxX) maxX = rowMax;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return {
    advance,
    minX,
    maxX,
    minY,
    maxY,
    leftByRow,
    rightByRow,
    hasInk: maxY >= minY && maxX >= minX,
  };
}

function computeHorizontalClearancePx(
  left: GlyphRasterProfile,
  right: GlyphRasterProfile,
  rightOriginX: number
): number {
  let minRowGap = Number.POSITIVE_INFINITY;
  const yStart = Math.max(left.minY, right.minY);
  const yEnd = Math.min(left.maxY, right.maxY);

  // Exclude 1px top/bottom anti-aliasing fringes when glyphs share enough height
  const inset = yEnd - yStart >= 8 ? 1 : 0;
  for (let y = yStart + inset; y <= yEnd - inset; y += 1) {
    const lRight = left.rightByRow[y];
    const rLeft = right.leftByRow[y];
    if (lRight > -32768 && rLeft < 32767) {
      const gap = rightOriginX + rLeft - lRight;
      if (gap < minRowGap) minRowGap = gap;
    }
  }

  if (Number.isFinite(minRowGap)) {
    return minRowGap;
  }
  return rightOriginX + right.minX - left.maxX;
}

function measureNativeKernPx(
  ctx: CanvasRenderingContext2D,
  familyName: string,
  leftCh: string,
  rightCh: string,
  leftAdv: number,
  rightAdv: number
): number {
  ctx.font = `${ANALYSIS_FONT_PX}px "${familyName}", sans-serif`;
  const combined = ctx.measureText(`${leftCh}${rightCh}`).width;
  return combined - (leftAdv + rightAdv);
}

export function analyzeCharPair(
  familyName: string,
  pair: string,
  letterSpacingEm: number,
  ligatureOverlaps?: Record<string, number>
): PairAnalysis {
  const chars = Array.from(pair);
  if (chars.length < 2) {
    return { pair, gapEm: 0.08, status: 'clear' };
  }
  const ctx = getScratchContext();
  if (!ctx) {
    return { pair, gapEm: 0.08, status: 'clear' };
  }

  const [leftCh, rightCh] = chars;
  const left = rasterizeGlyph(ctx, familyName, leftCh);
  const right = rasterizeGlyph(ctx, familyName, rightCh);

  if (!left.hasInk || !right.hasInk) {
    return { pair, gapEm: 0.08, status: 'clear' };
  }

  const nativeKernPx = measureNativeKernPx(
    ctx,
    familyName,
    leftCh,
    rightCh,
    left.advance,
    right.advance
  );

  const pairKey = `${leftCh}${rightCh}`.toLowerCase();
  const overlapPct = ligatureOverlaps?.[pairKey] ?? 0;
  const hasOverride = Math.abs(overlapPct) >= 0.5;

  // Match pdfEngine.ts: when neither letterSpacing nor pair overlap is active, use native kerning
  const rightOriginX =
    Math.abs(letterSpacingEm) < 0.001 && !hasOverride
      ? left.advance + nativeKernPx
      : left.advance + letterSpacingEm * ANALYSIS_FONT_PX - (overlapPct / 100) * left.advance;

  const gapPx = computeHorizontalClearancePx(left, right, rightOriginX);
  const gapEm = gapPx / ANALYSIS_FONT_PX;
  const refHeight = Math.max(
    ANALYSIS_FONT_PX * 0.32,
    Math.min(left.maxY - left.minY, right.maxY - right.minY)
  );
  const tightThresholdPx = Math.max(1.8, refHeight * 0.036);

  let status: PairSpacingStatus = 'clear';
  if (gapPx < -0.5) {
    status = 'overlap';
  } else if (gapPx < tightThresholdPx) {
    status = 'tight';
  }

  return {
    pair,
    gapEm,
    status,
  };
}

/**
 * Analyzes the standard 'ca' glyph pair for the active custom font using
 * per-scanline ink clearance heuristics to compute an initial balanced
 * Letter Spacing (em) baseline that prevents 'c'/'a' crowding or overlap.
 */
export function analyzeCaPairAutoFix(
  familyName: string,
  currentLetterSpacing = 0
): CaAutoFixResult {
  const ctx = getScratchContext();
  if (!ctx) {
    return {
      recommendedLetterSpacing: clampLetterSpacing(currentLetterSpacing),
      previousLetterSpacing: currentLetterSpacing,
      nativeGapEm: 0.05,
      projectedGapEm: 0.05,
      status: 'already-balanced',
    };
  }

  const left = rasterizeGlyph(ctx, familyName, 'c');
  const right = rasterizeGlyph(ctx, familyName, 'a');

  if (!left.hasInk || !right.hasInk) {
    return {
      recommendedLetterSpacing: 0,
      previousLetterSpacing: currentLetterSpacing,
      nativeGapEm: 0.05,
      projectedGapEm: 0.05,
      status: 'already-balanced',
    };
  }

  const nativeKernPx = measureNativeKernPx(
    ctx,
    familyName,
    'c',
    'a',
    left.advance,
    right.advance
  );

  const nativeGapPx = computeHorizontalClearancePx(left, right, left.advance + nativeKernPx);
  const unspacedGapPx = computeHorizontalClearancePx(left, right, left.advance);
  const nativeGapEm = nativeGapPx / ANALYSIS_FONT_PX;

  const xHeightPx = Math.max(ANALYSIS_FONT_PX * 0.34, right.maxY - right.minY);
  // Target a clean, legible ~8.5% of x-height clearance between 'c' and 'a'
  const targetGapPx = Math.max(
    ANALYSIS_FONT_PX * 0.038,
    Math.min(ANALYSIS_FONT_PX * 0.075, xHeightPx * 0.088)
  );

  // If native spacing (0.00 em) is already cleanly balanced, keep/restore 0.00 em
  if (nativeGapPx >= targetGapPx * 0.72 && nativeGapPx <= targetGapPx * 2.15) {
    return {
      recommendedLetterSpacing: 0,
      previousLetterSpacing: currentLetterSpacing,
      nativeGapEm,
      projectedGapEm: nativeGapEm,
      status: 'already-balanced',
    };
  }

  const rawNeededEm = (targetGapPx - unspacedGapPx) / ANALYSIS_FONT_PX;
  let recommended = clampLetterSpacing(rawNeededEm);

  // Avoid snapping back to 0 if native placement actually overlaps/crowds
  if (Math.abs(recommended) < 0.01 && nativeGapPx < targetGapPx * 0.72) {
    recommended = clampLetterSpacing(Math.max(0.02, (targetGapPx - nativeGapPx) / ANALYSIS_FONT_PX));
  }

  const projectedOriginX =
    Math.abs(recommended) < 0.001
      ? left.advance + nativeKernPx
      : left.advance + recommended * ANALYSIS_FONT_PX;
  const projectedGapEm =
    computeHorizontalClearancePx(left, right, projectedOriginX) / ANALYSIS_FONT_PX;

  let status: CaAutoFixResult['status'] = 'already-balanced';
  if (nativeGapPx < -0.5) {
    status = 'overlap-fixed';
  } else if (nativeGapPx < targetGapPx * 0.72) {
    status = 'tight-fixed';
  } else if (nativeGapPx > targetGapPx * 2.15) {
    status = 'wide-fixed';
  }

  return {
    recommendedLetterSpacing: recommended,
    previousLetterSpacing: currentLetterSpacing,
    nativeGapEm,
    projectedGapEm,
    status,
  };
}

type GraphemeSegmenter = { segment(input: string): Iterable<{ segment: string }> };
const graphemeSegmenter: GraphemeSegmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as {
        Segmenter: new (
          locale: string | undefined,
          opts: { granularity: 'grapheme' }
        ) => GraphemeSegmenter;
      }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function splitGraphemes(text: string): string[] {
  if (!text) return [];
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const seg of graphemeSegmenter.segment(text)) {
      out.push(seg.segment);
    }
    return out;
  }
  const chars = Array.from(text);
  const out: string[] = [];
  for (const ch of chars) {
    if (out.length > 0 && /[\u0300-\u036f]/.test(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

export function measureInspectorCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
  letterSpacingEm = 0,
  ligatureOverlaps?: Record<string, number>
): number {
  if (!text) return 0;
  const hasLig = hasActiveLigatureOverlaps(ligatureOverlaps);
  if ((Math.abs(letterSpacingEm) < 0.001 && !hasLig) || text.length <= 1) {
    return ctx.measureText(text).width;
  }
  const parts = splitGraphemes(text);
  if (parts.length <= 1) return ctx.measureText(text).width;
  const extra = letterSpacingEm * fontPx;
  let total = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const ch = parts[i];
    const w = ctx.measureText(ch).width;
    total += w;
    if (i < parts.length - 1) {
      total += extra;
      if (hasLig && ligatureOverlaps) {
        const pairKey = `${ch}${parts[i + 1]}`.toLowerCase();
        const overlapPct = ligatureOverlaps[pairKey] || 0;
        if (overlapPct !== 0) {
          total -= (overlapPct / 100) * w;
        }
      }
    }
  }
  return Math.max(0, total);
}

/**
 * Draws text identically to pdfEngine.ts's drawCanvasTextSpaced so the
 * Character Inspector matches live canvas previews and PDF exports pixel-for-pixel.
 */
export function drawInspectorCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontPx: number,
  letterSpacingEm = 0,
  ligatureOverlaps?: Record<string, number>
): number {
  if (!text) return 0;
  const hasLig = hasActiveLigatureOverlaps(ligatureOverlaps);
  if ((Math.abs(letterSpacingEm) < 0.001 && !hasLig) || text.length <= 1) {
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }
  const parts = splitGraphemes(text);
  if (parts.length <= 1) {
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }
  const extra = letterSpacingEm * fontPx;
  let cursorX = x;
  for (let i = 0; i < parts.length; i += 1) {
    const ch = parts[i];
    const w = ctx.measureText(ch).width;
    ctx.fillText(ch, cursorX, y);
    cursorX += w;
    if (i < parts.length - 1) {
      cursorX += extra;
      if (hasLig && ligatureOverlaps) {
        const pairKey = `${ch}${parts[i + 1]}`.toLowerCase();
        const overlapPct = ligatureOverlaps[pairKey] || 0;
        if (overlapPct !== 0) {
          cursorX -= (overlapPct / 100) * w;
        }
      }
    }
  }
  return Math.max(0, cursorX - x);
}
