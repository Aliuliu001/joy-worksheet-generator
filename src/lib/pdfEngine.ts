import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  DifficultyLevel,
  GridBlockCount,
  GridCellSize,
  ImageAsset,
  Matching2Group,
  Matching3Plan,
  MixPageBlock,
  MixPlan,
  TypingDirection,
  VersionPlan,
  VocabRow,
  WorksheetConfig,
  WorksheetFontSize,
  WorksheetFontStyle,
  WorksheetType,
} from '../types/worksheet';
import {
  MATCHING2_LAYOUT,
  MATCHING2_LEFT,
  MATCHING2_RIGHT,
  MIX_ANAGRAM_ROW_HEIGHT,
  MIX_MATCHING2,
  MIX_MATCHING3_ROW_HEIGHT,
  MIX_TYPING_ROW_HEIGHT,
  PAGE_A4_LANDSCAPE,
  PAGE_A4_PORTRAIT,
  PAGE_A5,
  TEXT_TYPES,
  WORKSHEET_HEADER_H,
  WORKSHEET_TOP,
  buildVersionPlan,
  getDifficultyProfile,
  mm,
  numericId,
} from './worksheetSupport';
import {
  drawVietTextCanvas,
  drawVietTextPdf,
  measureVietTextUnits,
} from './vietPrimaryFont';
import {
  clampBaselineOffset,
  clampCustomScale,
  ensureCustomFontFaceLoaded,
  getCustomFontById,
  getCustomFontFamily,
} from './customFontStore';

const WORKSHEET_LEFT = mm(10);
const WORKSHEET_RIGHT = mm(5);
const WORKSHEET_BOTTOM = mm(5);

const FLASHCARD_MARGIN = mm(3);
const FLASHCARD_COLS = 6;
const FLASHCARD_ROWS = 7;

const ANAGRAM_PER_PAGE = 10;
const WORD_SCRAMBLE_PER_PAGE = 14;
const TYPING1_PER_PAGE = 28;
const TYPING1_GRID_PER_PAGE = 10;
const TYPING1_GRID_UNIT = mm(3.4);
const VOCAB_ROWS_PER_PAGE = 40;
const VOCAB_MARGIN = mm(5);
const VOCAB_HEADER_H = mm(11);
const VOCAB_PANEL_GAP = mm(6);

const DASH = { on: 3, off: 2.5, thickness: 0.65 };

// Cached font bytes fetched once from /public/fonts
let fontCachePromise: Promise<{ kgPen: Uint8Array; kgDots: Uint8Array; dejavu: Uint8Array }> | null = null;

async function loadFontBytes(): Promise<{ kgPen: Uint8Array; kgDots: Uint8Array; dejavu: Uint8Array }> {
  if (!fontCachePromise) {
    fontCachePromise = (async () => {
      const [penRes, dotsRes, dvRes] = await Promise.all([
        fetch('/fonts/KGPrimaryPenmanshipAlt.ttf'),
        fetch('/fonts/KGPrimaryDots.ttf'),
        fetch('/fonts/DejaVuSans.ttf'),
      ]);
      if (!penRes.ok || !dotsRes.ok || !dvRes.ok) {
        throw new Error('Could not load embedded worksheet fonts.');
      }
      const [penBuf, dotsBuf, dvBuf] = await Promise.all([
        penRes.arrayBuffer(),
        dotsRes.arrayBuffer(),
        dvRes.arrayBuffer(),
      ]);
      return {
        kgPen: new Uint8Array(penBuf),
        kgDots: new Uint8Array(dotsBuf),
        dejavu: new Uint8Array(dvBuf),
      };
    })();
  }
  return fontCachePromise;
}

function canvasFontStack(style: WorksheetFontStyle, customFontId?: string | null): string {
  switch (style) {
    case 'custom': {
      const family = getCustomFontFamily(customFontId);
      if (family) return `"${family}", DejaVuWorksheet, sans-serif`;
      return 'KGPen, DejaVuWorksheet, sans-serif';
    }
    case 'handwritten':
      return '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';
    case 'dotted':
      return 'KGDots, DejaVuWorksheet, sans-serif';
    case 'clean':
      return 'DejaVuWorksheet, "Plus Jakarta Sans", sans-serif';
    case 'viet-primary':
    case 'penmanship':
    default:
      return 'KGPen, DejaVuWorksheet, sans-serif';
  }
}

async function createDocumentWithFonts(
  fontStyle: WorksheetFontStyle = 'penmanship',
  customFontId?: string | null
): Promise<{
  doc: PDFDocument;
  penFont: PDFFont;
  unicodeFont: PDFFont;
  boldFont: PDFFont;
}> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const { kgPen, kgDots, dejavu } = await loadFontBytes();
  const [unicodeFont, boldFont] = await Promise.all([
    doc.embedFont(dejavu),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  let penFont: PDFFont;
  if (fontStyle === 'custom') {
    const customAsset = getCustomFontById(customFontId);
    if (customAsset) {
      try {
        penFont = await doc.embedFont(customAsset.bytes, { subset: true });
      } catch {
        try {
          penFont = await doc.embedFont(customAsset.bytes);
        } catch {
          penFont = await doc.embedFont(kgPen);
        }
      }
    } else {
      penFont = await doc.embedFont(kgPen);
    }
  } else if (fontStyle === 'clean') {
    penFont = unicodeFont;
  } else if (fontStyle === 'dotted') {
    penFont = await doc.embedFont(kgDots);
  } else if (fontStyle === 'handwritten') {
    penFont = await doc.embedFont(StandardFonts.TimesRomanItalic);
  } else {
    penFont = await doc.embedFont(kgPen);
  }

  return { doc, penFont, unicodeFont, boldFont };
}

function safeFontForText(text: string, preferred: PDFFont, fallback: PDFFont): PDFFont {
  try {
    preferred.encodeText(text);
    return preferred;
  } catch {
    return fallback;
  }
}

async function assetToPngBytes(asset: ImageAsset): Promise<Uint8Array> {
  if (asset.mime === 'image/png') return asset.bytes;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Unable to decode image ${asset.name}`));
    img.src = asset.objectUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 320;
  canvas.height = img.naturalHeight || 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function embedCachedImage(
  doc: PDFDocument,
  cache: Map<string, PDFImage>,
  images: Map<string, ImageAsset>,
  imageId: string
): Promise<PDFImage | null> {
  const key = numericId(imageId);
  if (!key) return null;
  const existing = cache.get(key);
  if (existing) return existing;
  const asset = images.get(key);
  if (!asset) return null;

  let embedded: PDFImage;
  if (asset.mime === 'image/jpeg') {
    try {
      embedded = await doc.embedJpg(asset.bytes);
    } catch {
      const pngBytes = await assetToPngBytes(asset);
      embedded = await doc.embedPng(pngBytes);
    }
  } else if (asset.mime === 'image/png') {
    embedded = await doc.embedPng(asset.bytes);
  } else {
    const pngBytes = await assetToPngBytes(asset);
    embedded = await doc.embedPng(pngBytes);
  }
  cache.set(key, embedded);
  return embedded;
}

function fitRect(
  imgW: number,
  imgH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): { x: number; y: number; width: number; height: number } {
  const ratio = Math.min(boxW / Math.max(1, imgW), boxH / Math.max(1, imgH));
  const width = imgW * ratio;
  const height = imgH * ratio;
  return {
    x: boxX + (boxW - width) / 2,
    y: boxY + (boxH - height) / 2,
    width,
    height,
  };
}

function fitTextWidth(
  measure: (t: string, size: number) => number,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number
): { text: string; size: number } {
  let size = startSize;
  while (size > minSize && measure(text, size) > maxWidth) {
    size -= 0.35;
  }
  if (measure(text, size) <= maxWidth) return { text, size };
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}…`, size) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}…`, size };
}

function drawDashedLinePdf(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = rgb(0.25, 0.25, 0.25),
  thickness = DASH.thickness
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0) return;
  for (let at = 0; at < dist; at += DASH.on + DASH.off) {
    const until = Math.min(at + DASH.on, dist);
    page.drawLine({
      start: { x: x1 + (dx * at) / dist, y: y1 + (dy * at) / dist },
      end: { x: x1 + (dx * until) / dist, y: y1 + (dy * until) / dist },
      thickness,
      color,
    });
  }
}

function drawDashedBoxPdf(page: PDFPage, x: number, y: number, w: number, h: number, r = mm(2)) {
  const rad = Math.min(r, w / 2, h / 2);
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
  const pts = [
    [x + rad, y],
    [x + w - rad, y],
    [x + w, y + rad],
    [x + w, y + h - rad],
    [x + w - rad, y + h],
    [x + rad, y + h],
    [x, y + h - rad],
    [x, y + rad],
  ];
  for (let i = 0; i < pts.length; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    drawDashedLinePdf(page, ax, ay, bx, by, rgb(0.15, 0.15, 0.15));
  }
}

function drawWorksheetHeadingPdf(
  page: PDFPage,
  title: string,
  pageNo: number,
  version: number,
  totalVersions: number,
  leftX: number,
  rightX: number,
  pageH: number,
  font: PDFFont,
  unicodeFont: PDFFont
) {
  const titleFont = safeFontForText(title, font, unicodeFont);
  page.drawText(title, {
    x: leftX,
    y: pageH - WORKSHEET_TOP - 14,
    size: 14,
    font: titleFont,
    color: rgb(0.12, 0.16, 0.24),
  });
  const meta = totalVersions > 1 ? `Code ${version} · Page ${pageNo}` : `Page ${pageNo}`;
  const metaW = unicodeFont.widthOfTextAtSize(meta, 8);
  page.drawText(meta, {
    x: rightX - metaW,
    y: pageH - WORKSHEET_TOP - 12,
    size: 8,
    font: unicodeFont,
    color: rgb(0.4, 0.45, 0.52),
  });
}

export interface GuidelineOverlayOptions {
  enabled: boolean;
  blocks: GridBlockCount;
  fontSize?: WorksheetFontSize;
  customFontId?: string | null;
  customFontScale?: number;
  customFontBaselineOffset?: number;
}

const DEFAULT_OVERLAY: GuidelineOverlayOptions = {
  enabled: false,
  blocks: 4,
  fontSize: 'small',
  customFontId: null,
  customFontScale: 1,
  customFontBaselineOffset: 0,
};

interface CustomCalibration {
  isCustom: boolean;
  scaleMult: number;
  offsetCells: number;
  nonGridShiftPt: number;
}

function resolveCustomCalibration(
  fontStyle: WorksheetFontStyle,
  scale?: number,
  baselineOffset?: number
): CustomCalibration {
  if (fontStyle !== 'custom') {
    return { isCustom: false, scaleMult: 1, offsetCells: 0, nonGridShiftPt: 0 };
  }
  const scaleMult = clampCustomScale(scale ?? 1);
  const offsetCells = clampBaselineOffset(baselineOffset ?? 0);
  return {
    isCustom: true,
    scaleMult,
    offsetCells,
    nonGridShiftPt: offsetCells * mm(2.2),
  };
}

function fontSizeScale(size?: WorksheetFontSize): 1 | 2 {
  return size === 'normal' ? 2 : 1;
}

function standardTextMultiplier(size?: WorksheetFontSize): number {
  return size === 'normal' ? 1.28 : 1;
}

function vietNonGridMultiplier(size?: WorksheetFontSize): number {
  return size === 'normal' ? 1.5 : 1;
}

function vietStrokeUnitsForScale(scale: 1 | 2): number {
  return scale === 2 ? 0.058 : 0.070;
}

function computeOverlayUnit(
  bandHeightPt: number,
  aboveRows: number,
  preferredUnitPt: number,
  descenderCells = 1.5
): number {
  const maxUnit = (bandHeightPt * 0.9) / (aboveRows + descenderCells);
  return Math.max(mm(0.55), Math.min(preferredUnitPt, maxUnit));
}

function fitVietUnit(
  text: string,
  maxWidthPt: number,
  targetUnitPt: number,
  minUnitPt = mm(0.7)
): number {
  const units = Math.max(0.5, measureVietTextUnits(text));
  if (units * targetUnitPt <= maxWidthPt) return targetUnitPt;
  return Math.max(minUnitPt, maxWidthPt / units);
}

function drawGuidelineOverlayPdf(
  page: PDFPage,
  x: number,
  bandBottomY: number,
  bandHeight: number,
  width: number,
  preferredUnit: number,
  blocks: GridBlockCount = 4,
  descenderCells = 1.5,
  fontSize: WorksheetFontSize = 'small'
): { baselineY: number; unit: number; gridUnit: number } {
  const textScale = fontSizeScale(fontSize);
  const aboveRows = textScale === 2 ? Math.max(blocks, 5) : blocks;
  const effectiveDesc = textScale === 2 ? Math.max(descenderCells, 3) : descenderCells;
  const gridUnit = computeOverlayUnit(bandHeight, aboveRows, preferredUnit, effectiveDesc);
  const totalH = (aboveRows + effectiveDesc) * gridUnit;
  const bottomY = bandBottomY + (bandHeight - totalH) / 2;
  const baselineY = bottomY + effectiveDesc * gridUnit;
  const topY = baselineY + aboveRows * gridUnit;
  const endX = x + width;

  // Vertical square ô ly grid lines (major border every `blocks` cells)
  for (let c = 0; c * gridUnit <= width + 0.05; c += 1) {
    const vx = Math.min(endX, x + c * gridUnit);
    const isMajor = c % blocks === 0;
    page.drawLine({
      start: { x: vx, y: bottomY },
      end: { x: vx, y: topY },
      thickness: isMajor ? 0.42 : 0.2,
      color: isMajor ? rgb(0.45, 0.66, 0.9) : rgb(0.81, 0.89, 0.97),
    });
  }
  page.drawLine({
    start: { x: endX, y: bottomY },
    end: { x: endX, y: topY },
    thickness: 0.36,
    color: rgb(0.56, 0.74, 0.93),
  });

  // Bottom descender boundary
  page.drawLine({
    start: { x, y: bottomY },
    end: { x: endX, y: bottomY },
    thickness: 0.28,
    color: rgb(0.68, 0.81, 0.95),
  });

  // Horizontal auxiliary lines: baseline (0), x-height (textScale), major block border (blocks), and top edge
  const minIntRow = -Math.floor(effectiveDesc);
  for (let r = minIntRow; r <= aboveRows; r += 1) {
    const hy = baselineY + r * gridUnit;
    if (hy <= bottomY + 0.05) continue;
    if (r === 0) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: endX, y: hy },
        thickness: 0.72,
        color: rgb(0.2, 0.44, 0.8),
      });
    } else if (r === blocks) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: endX, y: hy },
        thickness: 0.5,
        color: rgb(0.34, 0.58, 0.87),
      });
    } else if (r === textScale) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: endX, y: hy },
        thickness: 0.32,
        color: rgb(0.58, 0.76, 0.94),
      });
    } else {
      page.drawLine({
        start: { x, y: hy },
        end: { x: endX, y: hy },
        thickness: 0.22,
        color: rgb(0.78, 0.88, 0.97),
      });
    }
  }

  return { baselineY, unit: gridUnit * textScale, gridUnit };
}

// ============================================================
// 1. FLASHCARDS (A5 Portrait, 6 cols × 7 rows = 42 / page)
// ============================================================
export async function makeFlashcardsPdf(
  items: VocabRow[],
  images: Map<string, ImageAsset>,
  fontStyle: WorksheetFontStyle = 'penmanship',
  difficulty: DifficultyLevel = 'intermediate',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const profile = getDifficultyProfile(difficulty);
  const cache = new Map<string, PDFImage>();
  const perPage = FLASHCARD_COLS * FLASHCARD_ROWS;
  const cellW = (PAGE_A5[0] - FLASHCARD_MARGIN * 2) / FLASHCARD_COLS;
  const cellH = (PAGE_A5[1] - FLASHCARD_MARGIN * 2) / FLASHCARD_ROWS;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let start = 0; start < items.length; start += perPage) {
    const page = doc.addPage(PAGE_A5);
    const slice = items.slice(start, start + perPage);

    // Draw cut grid
    for (let c = 0; c <= FLASHCARD_COLS; c += 1) {
      const x = FLASHCARD_MARGIN + c * cellW;
      page.drawLine({
        start: { x, y: FLASHCARD_MARGIN },
        end: { x, y: PAGE_A5[1] - FLASHCARD_MARGIN },
        thickness: 0.45,
        color: rgb(0.75, 0.78, 0.82),
      });
    }
    for (let r = 0; r <= FLASHCARD_ROWS; r += 1) {
      const y = FLASHCARD_MARGIN + r * cellH;
      page.drawLine({
        start: { x: FLASHCARD_MARGIN, y },
        end: { x: PAGE_A5[0] - FLASHCARD_MARGIN, y },
        thickness: 0.45,
        color: rgb(0.75, 0.78, 0.82),
      });
    }

    for (let i = 0; i < slice.length; i += 1) {
      const item = slice[i];
      const col = i % FLASHCARD_COLS;
      const row = Math.floor(i / FLASHCARD_COLS);
      const x = FLASHCARD_MARGIN + col * cellW;
      const topY = PAGE_A5[1] - FLASHCARD_MARGIN - row * cellH;
      const bottomY = topY - cellH;

      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      const labelBandH = useOverlay ? mm(7.8) : mm(6.8);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          x + mm(1.4),
          bottomY + labelBandH + mm(0.8),
          cellW - mm(2.8),
          cellH - labelBandH - mm(2.2)
        );
        page.drawImage(embedded, box);
      }

      if (useViet) {
        const padX = mm(1.1);
        const maxW = cellW - padX * 2;
        const sizeScale = fontSizeScale(overlay.fontSize);
        const preferredUnit = mm(1.35) * profile.fontScale;
        let baselineY = bottomY + mm(2.2);
        let drawUnit = preferredUnit * vietNonGridMultiplier(overlay.fontSize);
        if (useOverlay) {
          const g = drawGuidelineOverlayPdf(
            page,
            x + padX,
            bottomY + mm(0.4),
            labelBandH - mm(0.6),
            maxW,
            preferredUnit,
            overlay.blocks,
            1.2,
            overlay.fontSize
          );
          baselineY = g.baselineY;
          drawUnit = g.unit;
        }
        const fittedUnit = fitVietUnit(item.en, maxW - mm(0.8), drawUnit, mm(0.65));
        const textW = measureVietTextUnits(item.en) * fittedUnit;
        drawVietTextPdf(page, item.en, x + (cellW - textW) / 2, baselineY, fittedUnit, {
          pdfColor: rgb(0.08, 0.1, 0.15),
          strokeWidthUnits: vietStrokeUnitsForScale(sizeScale),
        });
      } else {
        const f = safeFontForText(item.en, penFont, unicodeFont);
        if (useOverlay) {
          const padX = mm(1.1);
          const maxW = cellW - padX * 2;
          const preferredUnit = mm(1.35) * profile.fontScale;
          const g = drawGuidelineOverlayPdf(
            page,
            x + padX,
            bottomY + mm(0.4),
            labelBandH - mm(0.6),
            maxW,
            preferredUnit,
            overlay.blocks,
            1.2,
            overlay.fontSize
          );
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            item.en,
            maxW - mm(0.8),
            g.unit * 1.92 * customCal.scaleMult,
            5.5
          );
          const textW = f.widthOfTextAtSize(fitted.text, fitted.size);
          page.drawText(fitted.text, {
            x: x + (cellW - textW) / 2,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: rgb(0.08, 0.1, 0.15),
          });
        } else {
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            item.en,
            cellW - mm(2.2),
            11.5 * profile.fontScale * standardTextMultiplier(overlay.fontSize) * customCal.scaleMult,
            6.5
          );
          const textW = f.widthOfTextAtSize(fitted.text, fitted.size);
          page.drawText(fitted.text, {
            x: x + (cellW - textW) / 2,
            y: bottomY + mm(2.1) + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.08, 0.1, 0.15),
          });
        }
      }
    }
  }
  return doc.save();
}

// ============================================================
// 2. ANAGRAM (A5 Portrait, 8 / 10 / 12 items / page by difficulty)
// ============================================================
export async function makeAnagramPdf(
  entries: VersionPlan['anagramEntries'],
  images: Map<string, ImageAsset>,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  difficulty: DifficultyLevel = 'intermediate',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const profile = getDifficultyProfile(difficulty);
  const perPage = profile.anagramPerPage || ANAGRAM_PER_PAGE;
  const cache = new Map<string, PDFImage>();
  const left = mm(6);
  const right = PAGE_A5[0] - mm(6);
  const usableTop = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H;
  const rowH = (usableTop - mm(6)) / perPage;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let start = 0, pageNo = 1; start < entries.length; start += perPage, pageNo += 1) {
    const page = doc.addPage(PAGE_A5);
    drawWorksheetHeadingPdf(
      page,
      answer ? 'Answer Key — Picture Anagram' : 'Unscramble the letters and write.',
      pageNo,
      version,
      totalVersions,
      left,
      right,
      PAGE_A5[1],
      penFont,
      unicodeFont
    );
    const slice = entries.slice(start, start + perPage);

    for (let i = 0; i < slice.length; i += 1) {
      const entry = slice[i];
      const top = usableTop - i * rowH;
      const rowBottom = top - rowH;
      const centerY = top - rowH / 2;
      const baseline = centerY - 3.5;

      page.drawText(`${start + i + 1}.`, {
        x: left,
        y: baseline,
        size: 13 * profile.fontScale,
        font: penFont,
        color: rgb(0.15, 0.18, 0.25),
      });

      const embedded = await embedCachedImage(doc, cache, images, entry.item.imageId);
      const imgX = left + mm(9);
      const imgW = mm(16);
      if (embedded) {
        const box = fitRect(embedded.width, embedded.height, imgX, rowBottom + mm(1.2), imgW, rowH - mm(2.4));
        page.drawImage(embedded, box);
      }

      const clueX = imgX + imgW + mm(4);
      const clueMaxW = mm(48);
      const sizeScale = fontSizeScale(overlay.fontSize);
      const vietMult = vietNonGridMultiplier(overlay.fontSize);
      const stdMult = standardTextMultiplier(overlay.fontSize);
      const vietStroke = vietStrokeUnitsForScale(sizeScale);
      if (useViet) {
        const clueUnit = fitVietUnit(entry.scrambled, clueMaxW, mm(2.0) * profile.fontScale * vietMult, mm(1.0));
        drawVietTextPdf(page, entry.scrambled, clueX, baseline, clueUnit, {
          pdfColor: rgb(0.22, 0.27, 0.35),
          strokeWidthUnits: vietStroke,
        });
      } else {
        const clueFont = safeFontForText(entry.scrambled, penFont, unicodeFont);
        const fittedClue = fitTextWidth(
          (t, s) => clueFont.widthOfTextAtSize(t, s),
          entry.scrambled,
          clueMaxW,
          13.5 * profile.fontScale * stdMult * customCal.scaleMult,
          8.5
        );
        page.drawText(fittedClue.text, {
          x: clueX,
          y: baseline + customCal.nonGridShiftPt,
          size: fittedClue.size,
          font: clueFont,
          color: rgb(0.22, 0.27, 0.35),
        });
      }

      const lineX = clueX + clueMaxW + mm(4);
      const ansW = right - lineX;
      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          lineX,
          rowBottom + mm(1.0),
          rowH - mm(2.0),
          ansW,
          mm(2.1) * profile.fontScale,
          overlay.blocks,
          1.5,
          overlay.fontSize
        );
        if (useViet) {
          if (answer) {
            const ansUnit = fitVietUnit(entry.item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.9));
            drawVietTextPdf(page, entry.item.en, lineX + g.gridUnit * 0.4, g.baselineY, ansUnit, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
            drawVietTextPdf(page, entry.item.en.trim()[0], lineX + g.gridUnit * 0.4, g.baselineY, g.unit, {
              pdfColor: rgb(0.45, 0.52, 0.62),
              strokeWidthUnits: vietStroke,
            });
          }
        } else {
          if (answer) {
            const ansFont = safeFontForText(entry.item.en, penFont, unicodeFont);
            const fittedAns = fitTextWidth(
              (t, s) => ansFont.widthOfTextAtSize(t, s),
              entry.item.en,
              ansW - g.gridUnit * 0.8,
              g.unit * 1.92 * customCal.scaleMult,
              7.5
            );
            page.drawText(fittedAns.text, {
              x: lineX + g.gridUnit * 0.4,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: fittedAns.size,
              font: ansFont,
              color: rgb(0.11, 0.31, 0.78),
            });
          } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
            const firstChar = entry.item.en.trim()[0];
            const hintFont = safeFontForText(firstChar, penFont, unicodeFont);
            page.drawText(firstChar, {
              x: lineX + g.gridUnit * 0.4,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: g.unit * 1.92 * customCal.scaleMult,
              font: hintFont,
              color: rgb(0.45, 0.52, 0.62),
            });
          }
        }
      } else if (answer) {
        if (useViet) {
          const ansUnit = fitVietUnit(entry.item.en, ansW, mm(2.0) * profile.fontScale * vietMult, mm(1.0));
          drawVietTextPdf(page, entry.item.en, lineX, baseline, ansUnit, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const ansFont = safeFontForText(entry.item.en, penFont, unicodeFont);
          const fittedAns = fitTextWidth(
            (t, s) => ansFont.widthOfTextAtSize(t, s),
            entry.item.en,
            ansW,
            13.5 * profile.fontScale * stdMult * customCal.scaleMult,
            8.5
          );
          page.drawText(fittedAns.text, {
            x: lineX,
            y: baseline + customCal.nonGridShiftPt,
            size: fittedAns.size,
            font: ansFont,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      } else {
        let drawLineStart = lineX;
        if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
          const firstChar = entry.item.en.trim()[0];
          if (useViet) {
            const cueW = drawVietTextPdf(page, firstChar, lineX, baseline, mm(1.9) * profile.fontScale * vietMult, {
              pdfColor: rgb(0.45, 0.52, 0.62),
              strokeWidthUnits: vietStroke,
            });
            drawLineStart = lineX + cueW + mm(1.2);
          } else {
            const hintFont = safeFontForText(firstChar, penFont, unicodeFont);
            const hintSize = 13 * profile.fontScale * stdMult * customCal.scaleMult;
            page.drawText(firstChar, {
              x: lineX,
              y: baseline + customCal.nonGridShiftPt,
              size: hintSize,
              font: hintFont,
              color: rgb(0.45, 0.52, 0.62),
            });
            drawLineStart = lineX + hintFont.widthOfTextAtSize(firstChar, hintSize) + mm(1.2);
          }
        }
        page.drawLine({
          start: { x: drawLineStart, y: baseline - mm(1) },
          end: { x: right, y: baseline - mm(1) },
          thickness: 0.65,
          color: rgb(0.3, 0.35, 0.42),
        });
      }
    }
  }
  return doc.save();
}

// ============================================================
// 2B. WORD SCRAMBLE (A4 Portrait, 14 items / page, letter tiles)
// ============================================================
function splitScrambleTokens(scrambled: string): string[][] {
  return scrambled
    .split(/\s*\/\s*/)
    .map((part) => [...part.trim()].filter((ch) => ch !== ' '))
    .filter((chars) => chars.length > 0);
}

function splitAnswerTokens(word: string): string[][] {
  return word
    .trim()
    .split(/\s+/)
    .map((part) => [...part])
    .filter((chars) => chars.length > 0);
}

export async function makeWordScramblePdf(
  entries: VersionPlan['wordScrambleEntries'],
  studentHeader: string,
  showHint: boolean,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  difficulty: DifficultyLevel = 'intermediate',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const profile = getDifficultyProfile(difficulty);
  const perPage = profile.wordScramblePerPage || WORD_SCRAMBLE_PER_PAGE;
  const left = mm(10);
  const right = PAGE_A4_PORTRAIT[0] - mm(10);
  const contentW = right - left;
  const pageH = PAGE_A4_PORTRAIT[1];
  const headerBottomY = pageH - mm(22);
  const usableH = headerBottomY - mm(10);
  const rowH = usableH / perPage;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  const tilesStartX = left + mm(9);
  const tilesMaxW = mm(95);
  const ansX = left + mm(109);
  const ansMaxW = right - ansX;

  for (
    let start = 0, pageNo = 1;
    start < entries.length;
    start += perPage, pageNo += 1
  ) {
    const page = doc.addPage(PAGE_A4_PORTRAIT);
    const slice = entries.slice(start, start + perPage);

    const topLine = answer
      ? 'Answer Key — Word Scramble'
      : studentHeader || 'Full name: ________________________   Class: __________';
    page.drawText(topLine, {
      x: left,
      y: pageH - mm(11),
      size: 10.5,
      font: safeFontForText(topLine, unicodeFont, unicodeFont),
      color: rgb(0.08, 0.12, 0.2),
    });

    const meta = totalVersions > 1 ? `Code ${version} · Page ${pageNo}` : `Page ${pageNo}`;
    const metaW = unicodeFont.widthOfTextAtSize(meta, 8.5);
    page.drawText(meta, {
      x: right - metaW,
      y: pageH - mm(11),
      size: 8.5,
      font: unicodeFont,
      color: rgb(0.42, 0.48, 0.55),
    });

    const subtitle = answer
      ? 'Unscrambled vocabulary answers (matches letter tile order).'
      : 'Unscramble the letter tiles and write the correct English word.';
    const subFont = safeFontForText(subtitle, penFont, unicodeFont);
    page.drawText(subtitle, {
      x: left,
      y: pageH - mm(17.5),
      size: 11.5 * profile.fontScale,
      font: subFont,
      color: rgb(0.24, 0.3, 0.38),
    });

    page.drawLine({
      start: { x: left, y: pageH - mm(20.5) },
      end: { x: right, y: pageH - mm(20.5) },
      thickness: 0.6,
      color: rgb(0.78, 0.82, 0.87),
    });

    for (let i = 0; i < slice.length; i += 1) {
      const entry = slice[i];
      const rowTopY = headerBottomY - i * rowH;
      const rowBottomY = rowTopY - rowH;
      const hasHint = showHint && entry.item.vi.trim().length > 0;
      const centerY = hasHint ? rowTopY - rowH * 0.42 : rowTopY - rowH * 0.5;

      if (i > 0) {
        drawDashedLinePdf(page, left, rowTopY, left + contentW, rowTopY, rgb(0.86, 0.89, 0.93), 0.4);
      }

      // Row index
      page.drawText(`${start + i + 1}.`, {
        x: left,
        y: centerY - 3.5,
        size: 10.5 * profile.fontScale,
        font: boldFont,
        color: rgb(0.22, 0.27, 0.35),
      });

      // Scrambled letter tiles
      const tokenGroups = splitScrambleTokens(entry.scrambled);
      const totalChars = tokenGroups.reduce((sum, g) => sum + g.length, 0);
      const wordGaps = Math.max(0, tokenGroups.length - 1);
      const charGaps = Math.max(0, totalChars - tokenGroups.length);

      let tileSize = mm(6.2 * Math.min(1.14, Math.max(0.88, profile.fontScale)));
      let tileGap = mm(1.1);
      let wordGap = mm(3.8);
      const rawW = totalChars * tileSize + charGaps * tileGap + wordGaps * wordGap;
      if (rawW > tilesMaxW && rawW > 0) {
        const shrink = tilesMaxW / rawW;
        tileSize = Math.max(mm(3.6), tileSize * shrink);
        tileGap = Math.max(mm(0.55), tileGap * shrink);
        wordGap = Math.max(mm(2.1), wordGap * shrink);
      }

      const tileBottom = centerY - tileSize / 2;
      let cursorX = tilesStartX;
      tokenGroups.forEach((group, gIdx) => {
        if (gIdx > 0) cursorX += wordGap;
        group.forEach((ch, cIdx) => {
          if (cIdx > 0) cursorX += tileGap;
          page.drawRectangle({
            x: cursorX,
            y: tileBottom,
            width: tileSize,
            height: tileSize,
            color: rgb(0.97, 0.98, 0.995),
            borderColor: rgb(0.48, 0.55, 0.65),
            borderWidth: 0.55,
          });
          if (useViet) {
            const tileUnit = Math.min(tileSize * 0.28, fitVietUnit(ch, tileSize * 0.78, tileSize * 0.28, mm(0.9)));
            const chW = measureVietTextUnits(ch) * tileUnit;
            drawVietTextPdf(
              page,
              ch,
              cursorX + (tileSize - chW) / 2,
              tileBottom + tileSize * 0.34,
              tileUnit,
              { pdfColor: rgb(0.1, 0.14, 0.22) }
            );
          } else {
            const f = safeFontForText(ch, penFont, unicodeFont);
            const fontSize = Math.min(14, Math.max(7.5, tileSize * 0.68));
            const chW = f.widthOfTextAtSize(ch, fontSize);
            page.drawText(ch, {
              x: cursorX + (tileSize - chW) / 2,
              y: tileBottom + (tileSize - fontSize * 0.72) / 2,
              size: fontSize,
              font: f,
              color: rgb(0.1, 0.14, 0.22),
            });
          }
          cursorX += tileSize;
        });
      });

      // Optional Vietnamese meaning hint
      if (hasHint) {
        const hintText = `(${entry.item.vi.trim()})`;
        const fittedHint = fitTextWidth(
          (t, s) => unicodeFont.widthOfTextAtSize(t, s),
          hintText,
          tilesMaxW,
          8.4 * profile.fontScale,
          6.5
        );
        page.drawText(fittedHint.text, {
          x: tilesStartX,
          y: Math.max(rowBottomY + mm(1.4), tileBottom - mm(3.8)),
          size: fittedHint.size,
          font: unicodeFont,
          color: rgb(0.42, 0.48, 0.56),
        });
      }

      // Right side: Guideline Overlay (when Primary Littlepen + overlay enabled), answer key, letter-count slots, or blank line
      const wsScale = fontSizeScale(overlay.fontSize);
      const wsStroke = vietStrokeUnitsForScale(wsScale);
      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          ansX,
          rowBottomY + mm(1.4),
          rowH - mm(2.8),
          ansMaxW,
          mm(2.2) * profile.fontScale,
          overlay.blocks,
          1.5,
          overlay.fontSize
        );
        if (useViet) {
          if (answer) {
            const ansUnit = fitVietUnit(entry.item.en, ansMaxW - g.gridUnit * 0.8, g.unit, mm(1.0));
            drawVietTextPdf(page, entry.item.en, ansX + g.gridUnit * 0.4, g.baselineY, ansUnit, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: wsStroke,
            });
          } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
            drawVietTextPdf(page, entry.item.en.trim()[0], ansX + g.gridUnit * 0.4, g.baselineY, g.unit, {
              pdfColor: rgb(0.42, 0.5, 0.62),
              strokeWidthUnits: wsStroke,
            });
          }
        } else {
          if (answer) {
            const f = safeFontForText(entry.item.en, penFont, unicodeFont);
            const fitted = fitTextWidth(
              (t, s) => f.widthOfTextAtSize(t, s),
              entry.item.en,
              ansMaxW - g.gridUnit * 0.8,
              g.unit * 1.92 * customCal.scaleMult,
              7.5
            );
            page.drawText(fitted.text, {
              x: ansX + g.gridUnit * 0.4,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: fitted.size,
              font: f,
              color: rgb(0.11, 0.31, 0.78),
            });
          } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
            const firstChar = entry.item.en.trim()[0];
            const f = safeFontForText(firstChar, penFont, unicodeFont);
            page.drawText(firstChar, {
              x: ansX + g.gridUnit * 0.4,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: g.unit * 1.92 * customCal.scaleMult,
              font: f,
              color: rgb(0.42, 0.5, 0.62),
            });
          }
        }
      } else if (answer) {
        if (useViet) {
          const ansUnit = fitVietUnit(
            entry.item.en,
            ansMaxW,
            mm(2.1) * profile.fontScale * vietNonGridMultiplier(overlay.fontSize),
            mm(1.0)
          );
          drawVietTextPdf(page, entry.item.en, ansX, centerY - mm(2.2), ansUnit, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: wsStroke,
          });
        } else {
          const f = safeFontForText(entry.item.en, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            entry.item.en,
            ansMaxW,
            13 * profile.fontScale * standardTextMultiplier(overlay.fontSize) * customCal.scaleMult,
            8
          );
          page.drawText(fitted.text, {
            x: ansX,
            y: centerY - 3.5 + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
        page.drawLine({
          start: { x: ansX, y: centerY - mm(2.6) },
          end: { x: right, y: centerY - mm(2.6) },
          thickness: 0.45,
          color: rgb(0.75, 0.82, 0.94),
        });
      } else if (!profile.wordScrambleLetterSlots) {
        // Advanced: plain writing line without letter-count hints
        page.drawLine({
          start: { x: ansX, y: centerY - mm(2.6) },
          end: { x: right, y: centerY - mm(2.6) },
          thickness: 0.75,
          color: rgb(0.28, 0.34, 0.42),
        });
      } else {
        const ansGroups = splitAnswerTokens(entry.item.en);
        const ansChars = ansGroups.reduce((sum, g) => sum + g.length, 0);
        const ansWordGaps = Math.max(0, ansGroups.length - 1);
        const ansCharGaps = Math.max(0, ansChars - ansGroups.length);

        let slotW = mm(5.0 * Math.min(1.12, profile.fontScale));
        let slotGap = mm(1.2);
        let slotWordGap = mm(4.2);
        const rawAnsW = ansChars * slotW + ansCharGaps * slotGap + ansWordGaps * slotWordGap;
        if (rawAnsW > ansMaxW && rawAnsW > 0) {
          const shrink = ansMaxW / rawAnsW;
          slotW = Math.max(mm(2.6), slotW * shrink);
          slotGap = Math.max(mm(0.55), slotGap * shrink);
          slotWordGap = Math.max(mm(2.0), slotWordGap * shrink);
        }

        const slotLineY = centerY - mm(2.6);
        let ax = ansX;
        ansGroups.forEach((group, gIdx) => {
          if (gIdx > 0) ax += slotWordGap;
          group.forEach((ch, cIdx) => {
            if (cIdx > 0) ax += slotGap;
            page.drawLine({
              start: { x: ax, y: slotLineY },
              end: { x: ax + slotW, y: slotLineY },
              thickness: 0.75,
              color: rgb(0.28, 0.34, 0.42),
            });
            // Beginner difficulty: gently pre-fill the starting letter of each word
            if (profile.revealFirstLetter && cIdx === 0) {
              if (useViet) {
                const cueUnit = fitVietUnit(ch, slotW * 0.9, mm(2.0), mm(1.0));
                const cw = measureVietTextUnits(ch) * cueUnit;
                drawVietTextPdf(page, ch, ax + (slotW - cw) / 2, slotLineY + mm(0.8), cueUnit, {
                  pdfColor: rgb(0.42, 0.5, 0.62),
                });
              } else {
                const f = safeFontForText(ch, penFont, unicodeFont);
                const cueSize = Math.min(13.5, Math.max(8, slotW * 0.78));
                const cw = f.widthOfTextAtSize(ch, cueSize);
                page.drawText(ch, {
                  x: ax + (slotW - cw) / 2,
                  y: slotLineY + mm(1.0),
                  size: cueSize,
                  font: f,
                  color: rgb(0.42, 0.5, 0.62),
                });
              }
            }
            ax += slotW;
          });
        });
      }
    }
  }
  return doc.save();
}

// ============================================================
// 3. MATCHING 1: Look and Match (6-item sets on A5 Portrait)
// ============================================================
export async function makeMatching1Pdf(
  items: VocabRow[],
  orders: VersionPlan['matchingOrders'],
  images: Map<string, ImageAsset>,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const cache = new Map<string, PDFImage>();
  const left = WORKSHEET_LEFT;
  const right = PAGE_A5[0] - WORKSHEET_RIGHT;
  const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - WORKSHEET_BOTTOM;
  const rowH = usableH / 6;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let groupIdx = 0; groupIdx < orders.length; groupIdx += 1) {
    const page = doc.addPage(PAGE_A5);
    const slice = items.slice(groupIdx * 6, groupIdx * 6 + 6);
    const terms = orders[groupIdx];

    drawWorksheetHeadingPdf(
      page,
      answer ? 'Answer Key — Look and Match' : 'Task 1. Look and Match.',
      groupIdx + 1,
      version,
      totalVersions,
      left,
      right,
      PAGE_A5[1],
      penFont,
      unicodeFont
    );

    const leftDotX = left + mm(42);
    const rightDotX = left + mm(78);
    const termX = rightDotX + mm(5);

    for (let i = 0; i < slice.length; i += 1) {
      const item = slice[i];
      const top = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - i * rowH;
      const centerY = top - rowH / 2;

      page.drawText(`${i + 1}.`, {
        x: left,
        y: centerY - 4,
        size: 13,
        font: boldFont,
        color: rgb(0.18, 0.22, 0.28),
      });

      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          left + mm(9),
          top - rowH + mm(2.5),
          mm(28),
          rowH - mm(5)
        );
        page.drawImage(embedded, box);
      }

      page.drawCircle({ x: leftDotX, y: centerY, size: 2.3, color: rgb(0.1, 0.14, 0.22) });
      page.drawCircle({ x: rightDotX, y: centerY, size: 2.3, color: rgb(0.1, 0.14, 0.22) });

      const term = terms[i];
      if (term) {
        if (useViet) {
          const prefix = `${term.letter}. `;
          const prefixW = boldFont.widthOfTextAtSize(prefix, 11);
          const wordX = termX + prefixW;
          const wordMaxW = Math.max(mm(12), right - wordX);
          const sizeScale = fontSizeScale(overlay.fontSize);
          let wordBaseY = centerY - 3;
          let drawUnit = mm(2.1) * vietNonGridMultiplier(overlay.fontSize);
          let padX = 0;
          if (useOverlay) {
            const g = drawGuidelineOverlayPdf(
              page,
              wordX,
              top - rowH + mm(3.0),
              rowH - mm(6.0),
              wordMaxW,
              mm(2.2),
              overlay.blocks,
              1.5,
              overlay.fontSize
            );
            wordBaseY = g.baselineY;
            drawUnit = g.unit;
            padX = g.gridUnit * 0.35;
          }
          page.drawText(prefix, {
            x: termX,
            y: wordBaseY,
            size: 11,
            font: boldFont,
            color: rgb(0.18, 0.22, 0.28),
          });
          const fittedUnit = fitVietUnit(term.item.en, wordMaxW - mm(1), drawUnit, mm(0.95));
          drawVietTextPdf(page, term.item.en, wordX + padX, wordBaseY, fittedUnit, {
            pdfColor: rgb(0.1, 0.12, 0.18),
            strokeWidthUnits: vietStrokeUnitsForScale(sizeScale),
          });
        } else if (useOverlay) {
          const prefix = `${term.letter}. `;
          const prefixW = boldFont.widthOfTextAtSize(prefix, 11);
          const wordX = termX + prefixW;
          const wordMaxW = Math.max(mm(12), right - wordX);
          const g = drawGuidelineOverlayPdf(
            page,
            wordX,
            top - rowH + mm(3.0),
            rowH - mm(6.0),
            wordMaxW,
            mm(2.2),
            overlay.blocks,
            1.5,
            overlay.fontSize
          );
          page.drawText(prefix, {
            x: termX,
            y: g.baselineY,
            size: 11,
            font: boldFont,
            color: rgb(0.18, 0.22, 0.28),
          });
          const f = safeFontForText(term.item.en, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            term.item.en,
            wordMaxW - mm(1),
            g.unit * 1.92 * customCal.scaleMult,
            7.5
          );
          page.drawText(fitted.text, {
            x: wordX + g.gridUnit * 0.35,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        } else {
          const label = `${term.letter}. ${term.item.en}`;
          const f = safeFontForText(label, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            label,
            right - termX,
            14 * standardTextMultiplier(overlay.fontSize) * customCal.scaleMult,
            8.5
          );
          page.drawText(fitted.text, {
            x: termX,
            y: centerY - 4 + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        }
      }

      if (answer) {
        const targetIdx = terms.findIndex((t) => t.item.uid === item.uid);
        if (targetIdx >= 0) {
          const targetCenterY = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - targetIdx * rowH - rowH / 2;
          page.drawLine({
            start: { x: leftDotX, y: centerY },
            end: { x: rightDotX, y: targetCenterY },
            thickness: 1.1,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      }
    }
  }
  return doc.save();
}

// ============================================================
// 4. MATCHING 2: Picture Letter Match (A5 Portrait, 30/33/37% cols)
// ============================================================
function matching2Width(): number {
  return PAGE_A5[0] - MATCHING2_LEFT - MATCHING2_RIGHT;
}

function matching2Columns(): Array<{ start: number; width: number }> {
  const gap = mm(2);
  const usable = matching2Width() - gap * 2;
  const widths = [0.3, 0.33, 0.37].map((ratio) => usable * ratio);
  let start = MATCHING2_LEFT;
  return widths.map((width) => {
    const col = { start, width };
    start += width + gap;
    return col;
  });
}

export async function makeMatching2Pdf(
  pages: Matching2Group[][],
  images: Map<string, ImageAsset>,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const cache = new Map<string, PDFImage>();
  const cardW = (matching2Width() - MATCHING2_LAYOUT.cardGap * 4) / 5;
  const cols = matching2Columns();
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const page = doc.addPage(PAGE_A5);
    const groups = pages[pageIdx];

    drawWorksheetHeadingPdf(
      page,
      answer ? 'Answer Key — Picture Letter Match' : 'Task 2. Write the picture letter.',
      pageIdx + 1,
      version,
      totalVersions,
      MATCHING2_LEFT,
      PAGE_A5[0] - MATCHING2_RIGHT,
      PAGE_A5[1],
      penFont,
      unicodeFont
    );

    for (let gIdx = 0; gIdx < groups.length; gIdx += 1) {
      const group = groups[gIdx];
      for (let i = 0; i < group.pictures.length; i += 1) {
        const item = group.pictures[i];
        const col = i % 5;
        const row = Math.floor(i / 5);
        const cardX = MATCHING2_LEFT + col * (cardW + MATCHING2_LAYOUT.cardGap);
        const cardTop = group.geometry.top + row * (MATCHING2_LAYOUT.cardHeight + MATCHING2_LAYOUT.cardGap);
        const cardY = PAGE_A5[1] - cardTop - MATCHING2_LAYOUT.cardHeight;

        drawDashedBoxPdf(page, cardX, cardY, cardW, MATCHING2_LAYOUT.cardHeight, mm(2));

        const embedded = await embedCachedImage(doc, cache, images, item.imageId);
        if (embedded) {
          const box = fitRect(
            embedded.width,
            embedded.height,
            cardX + MATCHING2_LAYOUT.cardPadding,
            cardY + MATCHING2_LAYOUT.labelHeight + MATCHING2_LAYOUT.cardPadding,
            cardW - MATCHING2_LAYOUT.cardPadding * 2,
            MATCHING2_LAYOUT.imageHeight
          );
          page.drawImage(embedded, box);
        }

        const letter = String.fromCharCode(65 + i);
        const lw = boldFont.widthOfTextAtSize(letter, MATCHING2_LAYOUT.letterSize);
        page.drawText(letter, {
          x: cardX + (cardW - lw) / 2,
          y: cardY + mm(1.1),
          size: MATCHING2_LAYOUT.letterSize,
          font: boldFont,
          color: rgb(0.08, 0.1, 0.14),
        });
      }

      // Dashed column dividers
      const populatedCols = Math.min(3, group.prompts.length);
      const yTop = PAGE_A5[1] - group.geometry.promptTop;
      const yBottom = PAGE_A5[1] - (group.geometry.promptTop + group.geometry.promptRows * MATCHING2_LAYOUT.promptRowHeight);
      for (let d = 0; d < populatedCols - 1; d += 1) {
        const divX = cols[d].start + cols[d].width + mm(1);
        drawDashedLinePdf(page, divX, yTop, divX, yBottom, rgb(0.45, 0.5, 0.58));
      }

      // Prompt list
      for (let pIdx = 0; pIdx < group.prompts.length; pIdx += 1) {
        const item = group.prompts[pIdx];
        const colIdx = pIdx % 3;
        const rowIdx = Math.floor(pIdx / 3);
        const col = cols[colIdx];
        const picIdx = group.pictures.findIndex((p) => p.uid === item.uid);
        const letter = picIdx >= 0 ? String.fromCharCode(65 + picIdx) : '?';
        const rowBottomY = PAGE_A5[1] - (group.geometry.promptTop + (rowIdx + 1) * MATCHING2_LAYOUT.promptRowHeight);
        const baselineY = PAGE_A5[1] - (group.geometry.promptTop + rowIdx * MATCHING2_LAYOUT.promptRowHeight + mm(4.8));

        if (useViet) {
          const prefix = answer ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
          const prefixSize = 8.5;
          const prefixW = unicodeFont.widthOfTextAtSize(prefix, prefixSize);
          const wordX = col.start + prefixW;
          const wordW = Math.max(mm(8), col.width - prefixW - mm(1.2));
          const sizeScale = fontSizeScale(overlay.fontSize);
          let drawBaseY = baselineY;
          let drawUnit = mm(1.35) * vietNonGridMultiplier(overlay.fontSize);
          let padX = 0;
          if (useOverlay) {
            const g = drawGuidelineOverlayPdf(
              page,
              wordX,
              rowBottomY + mm(0.3),
              MATCHING2_LAYOUT.promptRowHeight - mm(0.6),
              wordW,
              mm(1.35),
              overlay.blocks,
              1.2,
              overlay.fontSize
            );
            drawBaseY = g.baselineY;
            drawUnit = g.unit;
            padX = g.gridUnit * 0.25;
          }
          page.drawText(prefix, {
            x: col.start,
            y: drawBaseY,
            size: prefixSize,
            font: unicodeFont,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.18, 0.22, 0.28),
          });
          const fittedUnit = fitVietUnit(item.en, wordW - mm(0.6), drawUnit, mm(0.65));
          drawVietTextPdf(page, item.en, wordX + padX, drawBaseY, fittedUnit, {
            pdfColor: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
            strokeWidthUnits: vietStrokeUnitsForScale(sizeScale),
          });
        } else if (useOverlay) {
          const prefix = answer ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
          const prefixSize = 8.5;
          const prefixW = unicodeFont.widthOfTextAtSize(prefix, prefixSize);
          const wordX = col.start + prefixW;
          const wordW = Math.max(mm(8), col.width - prefixW - mm(1.2));
          const g = drawGuidelineOverlayPdf(
            page,
            wordX,
            rowBottomY + mm(0.3),
            MATCHING2_LAYOUT.promptRowHeight - mm(0.6),
            wordW,
            mm(1.35),
            overlay.blocks,
            1.2,
            overlay.fontSize
          );
          page.drawText(prefix, {
            x: col.start,
            y: g.baselineY,
            size: prefixSize,
            font: unicodeFont,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.18, 0.22, 0.28),
          });
          const f = safeFontForText(item.en, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            item.en,
            wordW - mm(0.6),
            g.unit * 1.92 * customCal.scaleMult,
            5.5
          );
          page.drawText(fitted.text, {
            x: wordX + g.gridUnit * 0.25,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
          });
        } else {
          const prompt = answer ? `${pIdx + 1}. [${letter}] ${item.en}` : `${pIdx + 1}. ____ ${item.en}`;
          const f = safeFontForText(prompt, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            prompt,
            col.width - mm(1.5),
            MATCHING2_LAYOUT.promptSize * standardTextMultiplier(overlay.fontSize) * customCal.scaleMult,
            MATCHING2_LAYOUT.promptMinSize
          );
          page.drawText(fitted.text, {
            x: col.start,
            y: baselineY + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
          });
        }
      }

      // Dashed separator between group 0 and group 1
      if (gIdx === 0 && groups.length > 1) {
        const sepY = PAGE_A5[1] - (group.geometry.top + group.geometry.height + mm(2));
        drawDashedLinePdf(page, MATCHING2_LEFT, sepY, PAGE_A5[0] - MATCHING2_RIGHT, sepY, rgb(0.55, 0.6, 0.68));
      }
    }
  }
  return doc.save();
}

// ============================================================
// 5. MATCHING 3: Flexible Look & Match (2-12 items, A5 or 2-Up A4 Landscape)
// ============================================================
export async function makeMatching3Pdf(
  plan: Matching3Plan,
  images: Map<string, ImageAsset>,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const cache = new Map<string, PDFImage>();
  const pageSize = plan.twoUp ? PAGE_A4_LANDSCAPE : PAGE_A5;
  const page = doc.addPage(pageSize);
  const panelW = PAGE_A5[0];
  const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - WORKSHEET_BOTTOM;
  const rowH = usableH / Math.max(plan.items.length, 6);
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  if (plan.twoUp) {
    drawDashedLinePdf(page, panelW, mm(4), panelW, PAGE_A4_LANDSCAPE[1] - mm(4), rgb(0.55, 0.6, 0.68), 0.75);
  }

  for (let pIdx = 0; pIdx < plan.panels.length; pIdx += 1) {
    const originX = pIdx * panelW;
    const left = originX + WORKSHEET_LEFT;
    const right = originX + panelW - WORKSHEET_RIGHT;
    const terms = plan.panels[pIdx];

    drawWorksheetHeadingPdf(
      page,
      answer
        ? `Answer Key — Match${plan.twoUp ? (pIdx === 0 ? ' (Left)' : ' (Right)') : ''}`
        : 'Look and Match.',
      1,
      version,
      totalVersions,
      left,
      right,
      pageSize[1],
      penFont,
      unicodeFont
    );

    const leftDotX = left + mm(40);
    const rightDotX = left + mm(74);
    const termX = rightDotX + mm(4.5);

    for (let i = 0; i < plan.items.length; i += 1) {
      const item = plan.items[i];
      const top = pageSize[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - i * rowH;
      const centerY = top - rowH / 2;

      page.drawText(`${i + 1}.`, {
        x: left,
        y: centerY - 3.5,
        size: 11.5,
        font: boldFont,
        color: rgb(0.18, 0.22, 0.28),
      });

      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          left + mm(8),
          top - rowH + mm(1.5),
          mm(27),
          rowH - mm(3)
        );
        page.drawImage(embedded, box);
      }

      page.drawCircle({ x: leftDotX, y: centerY, size: 2.1, color: rgb(0.1, 0.14, 0.22) });
      page.drawCircle({ x: rightDotX, y: centerY, size: 2.1, color: rgb(0.1, 0.14, 0.22) });

      const term = terms[i];
      if (term) {
        if (useViet) {
          const prefix = `${term.letter}. `;
          const prefixW = boldFont.widthOfTextAtSize(prefix, 10);
          const wordX = termX + prefixW;
          const wordMaxW = Math.max(mm(12), right - wordX);
          const sizeScale = fontSizeScale(overlay.fontSize);
          let wordBaseY = centerY - 2.8;
          let drawUnit = mm(1.9) * vietNonGridMultiplier(overlay.fontSize);
          let padX = 0;
          if (useOverlay) {
            const g = drawGuidelineOverlayPdf(
              page,
              wordX,
              top - rowH + mm(1.4),
              rowH - mm(2.8),
              wordMaxW,
              mm(2.0),
              overlay.blocks,
              1.5,
              overlay.fontSize
            );
            wordBaseY = g.baselineY;
            drawUnit = g.unit;
            padX = g.gridUnit * 0.3;
          }
          page.drawText(prefix, {
            x: termX,
            y: wordBaseY,
            size: 10,
            font: boldFont,
            color: rgb(0.18, 0.22, 0.28),
          });
          const fittedUnit = fitVietUnit(term.item.en, wordMaxW - mm(0.8), drawUnit, mm(0.85));
          drawVietTextPdf(page, term.item.en, wordX + padX, wordBaseY, fittedUnit, {
            pdfColor: rgb(0.1, 0.12, 0.18),
            strokeWidthUnits: vietStrokeUnitsForScale(sizeScale),
          });
        } else if (useOverlay) {
          const prefix = `${term.letter}. `;
          const prefixW = boldFont.widthOfTextAtSize(prefix, 10);
          const wordX = termX + prefixW;
          const wordMaxW = Math.max(mm(12), right - wordX);
          const g = drawGuidelineOverlayPdf(
            page,
            wordX,
            top - rowH + mm(1.4),
            rowH - mm(2.8),
            wordMaxW,
            mm(2.0),
            overlay.blocks,
            1.5,
            overlay.fontSize
          );
          page.drawText(prefix, {
            x: termX,
            y: g.baselineY,
            size: 10,
            font: boldFont,
            color: rgb(0.18, 0.22, 0.28),
          });
          const f = safeFontForText(term.item.en, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            term.item.en,
            wordMaxW - mm(0.8),
            g.unit * 1.92 * customCal.scaleMult,
            7.2
          );
          page.drawText(fitted.text, {
            x: wordX + g.gridUnit * 0.3,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        } else {
          const label = `${term.letter}. ${term.item.en}`;
          const f = safeFontForText(label, penFont, unicodeFont);
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            label,
            right - termX,
            12.5 * standardTextMultiplier(overlay.fontSize) * customCal.scaleMult,
            8
          );
          page.drawText(fitted.text, {
            x: termX,
            y: centerY - 3.5 + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        }
      }

      if (answer) {
        const targetIdx = terms.findIndex((t) => t.item.uid === item.uid);
        if (targetIdx >= 0) {
          const targetCenterY = pageSize[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - targetIdx * rowH - rowH / 2;
          page.drawLine({
            start: { x: leftDotX, y: centerY },
            end: { x: rightDotX, y: targetCenterY },
            thickness: 1.0,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      }
    }
  }
  return doc.save();
}

// ============================================================
// 6. TYPING 1: Picture to Word (A5 Portrait — 2×14 standard OR 1×10 Primary 4-Line Handwriting Grid)
// ============================================================
function drawPrimaryGridPdf(
  page: PDFPage,
  x: number,
  bottomY: number,
  maxWidth: number,
  unit: number,
  blocks: GridBlockCount = 4,
  textScale: 1 | 2 = 1
): { baselineY: number; gridHeight: number; gridWidth: number } {
  // Authentic Vietnamese primary notebook strip (vở 4 ô ly or 5 ô ly):
  // Small (1×): x-height = 1 ô ly, ascender = 2.5 ô ly (fits in 4 or 5 rows), descender = 1.5 ô ly (2 rows below).
  // Normal (2×): x-height = 2 ô ly, ascender = 5 ô ly (needs ≥ 5 rows above baseline; on 4 ô ly the major blue
  //              line stays at r = 4 with 1 thin extra top row at r = 5), descender = 3 ô ly (3 rows below).
  const descenderCells = textScale === 2 ? 3 : 2;
  const aboveRows = textScale === 2 ? Math.max(blocks, 5) : blocks;
  const totalRows = aboveRows + descenderCells;
  const cols = Math.max(blocks, Math.floor(maxWidth / unit));
  const gridWidth = cols * unit;
  const gridHeight = totalRows * unit;
  const baselineY = bottomY + descenderCells * unit;

  // Vertical square grid lines (major darker border every `blocks` cells -> 4×4 or 5×5 squares)
  for (let c = 0; c <= cols; c += 1) {
    const vx = x + c * unit;
    const isMajor = c % blocks === 0 || c === cols;
    page.drawLine({
      start: { x: vx, y: bottomY },
      end: { x: vx, y: bottomY + gridHeight },
      thickness: isMajor ? 0.58 : 0.24,
      color: isMajor ? rgb(0.28, 0.52, 0.84) : rgb(0.76, 0.86, 0.96),
    });
  }

  // Horizontal grid lines from bottom descender edge (r=0) to top row (r=totalRows)
  for (let r = 0; r <= totalRows; r += 1) {
    const hy = bottomY + r * unit;
    const isBaseline = r === descenderCells;
    const isBlockMajor = r === descenderCells + blocks;
    const isBottomEdge = r === 0;
    const isTopEdge = r === totalRows && !isBlockMajor;
    const isXHeight = r === descenderCells + textScale;

    if (isBaseline) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: x + gridWidth, y: hy },
        thickness: 0.85,
        color: rgb(0.18, 0.41, 0.78),
      });
    } else if (isBlockMajor) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: x + gridWidth, y: hy },
        thickness: 0.62,
        color: rgb(0.28, 0.52, 0.84),
      });
    } else if (isBottomEdge || isTopEdge) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: x + gridWidth, y: hy },
        thickness: 0.36,
        color: rgb(0.62, 0.77, 0.94),
      });
    } else if (isXHeight) {
      page.drawLine({
        start: { x, y: hy },
        end: { x: x + gridWidth, y: hy },
        thickness: 0.34,
        color: rgb(0.55, 0.74, 0.94),
      });
    } else {
      page.drawLine({
        start: { x, y: hy },
        end: { x: x + gridWidth, y: hy },
        thickness: 0.24,
        color: rgb(0.76, 0.86, 0.96),
      });
    }
  }

  return { baselineY, gridHeight, gridWidth };
}

export interface Typing1Options {
  gridlines: boolean;
  gridSizeMm?: GridCellSize;
  gridBlocks?: GridBlockCount;
  showSample: boolean;
  guidelineOverlay?: boolean;
  fontSize?: WorksheetFontSize;
  customFontId?: string | null;
  customFontScale?: number;
  customFontBaselineOffset?: number;
}

export async function makeTyping1Pdf(
  items: VocabRow[],
  images: Map<string, ImageAsset>,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  options: Typing1Options = {
    gridlines: false,
    gridSizeMm: 2,
    gridBlocks: 4,
    showSample: false,
    guidelineOverlay: false,
    fontSize: 'small',
    customFontId: null,
    customFontScale: 1,
    customFontBaselineOffset: 0,
  },
  difficulty: DifficultyLevel = 'intermediate'
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont } = await createDocumentWithFonts(fontStyle, options.customFontId);
  const profile = getDifficultyProfile(difficulty);
  const cache = new Map<string, PDFImage>();
  const left = WORKSHEET_LEFT;
  const right = PAGE_A5[0] - WORKSHEET_RIGHT;
  const usableTop = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H;
  const textScale = fontSizeScale(options.fontSize);
  const vietStroke = vietStrokeUnitsForScale(textScale);
  const customCal = resolveCustomCalibration(
    fontStyle,
    options.customFontScale,
    options.customFontBaselineOffset
  );

  if (options.gridlines) {
    const cellMm: GridCellSize = options.gridSizeMm === 2.5 ? 2.5 : 2;
    const blocks: GridBlockCount = options.gridBlocks === 5 ? 5 : 4;
    const aboveRows = textScale === 2 ? Math.max(blocks, 5) : blocks;
    const descenderCells = textScale === 2 ? 3 : 2;
    const gridUnit = mm(cellMm);
    const vietBaseUnit = gridUnit * textScale;
    const gridH = gridUnit * (aboveRows + descenderCells);
    const usableH = usableTop - mm(6);
    const maxFitPerPage = Math.max(3, Math.floor(usableH / (gridH + mm(2.8))));
    const perPage = Math.min(profile.typing1GridPerPage || TYPING1_GRID_PER_PAGE, maxFitPerPage);
    const rowH = usableH / perPage;
    // Small (1×): lowercase x-height = 1 cell; Normal (2×): lowercase x-height = 2 cells (exact double)
    const gridFontSize = gridUnit * 1.92 * textScale * customCal.scaleMult;
    const gridBaselineShift = customCal.isCustom
      ? customCal.offsetCells * gridUnit * textScale
      : 0.4;
    const sizeTag = textScale === 2 ? ' · Normal 2×' : '';

    for (
      let start = 0, pageNo = 1;
      start < items.length;
      start += perPage, pageNo += 1
    ) {
      const page = doc.addPage(PAGE_A5);
      const heading = answer
        ? `Answer Key — Handwriting (${blocks} ô ly · ${cellMm}×${cellMm} mm${sizeTag})`
        : options.showSample
          ? 'Look at the picture, read the sample word, and write.'
          : 'Look at the picture and write neatly on the lines.';
      drawWorksheetHeadingPdf(
        page,
        heading,
        pageNo,
        version,
        totalVersions,
        left,
        right,
        PAGE_A5[1],
        penFont,
        unicodeFont
      );

      const slice = items.slice(start, start + perPage);
      for (let i = 0; i < slice.length; i += 1) {
        const item = slice[i];
        const rowTop = usableTop - i * rowH;
        const gridBottomY = rowTop - (rowH + gridH) / 2;
        const imgX = left + mm(7);
        const imgW = mm(16);
        const gridX = imgX + imgW + mm(3);
        const maxGridW = right - gridX;

        const { baselineY, gridWidth } = drawPrimaryGridPdf(
          page,
          gridX,
          gridBottomY,
          maxGridW,
          gridUnit,
          blocks,
          textScale
        );
        const gridRight = gridX + gridWidth;

        page.drawText(`${start + i + 1}.`, {
          x: left,
          y: baselineY,
          size: Math.min(13.5, Math.max(9.5, gridUnit * 1.92 * (textScale === 2 ? 1.15 : 0.92))),
          font: penFont,
          color: rgb(0.18, 0.22, 0.3),
        });

        const embedded = await embedCachedImage(doc, cache, images, item.imageId);
        if (embedded) {
          const box = fitRect(
            embedded.width,
            embedded.height,
            imgX,
            rowTop - rowH + mm(1.6),
            imgW,
            rowH - mm(3.2)
          );
          page.drawImage(embedded, box);
        }

        const f = safeFontForText(item.en, penFont, unicodeFont);
        const useVietVector = fontStyle === 'viet-primary';
        const sampleStartX = gridX + gridUnit;
        let practiceStartX = sampleStartX;

        if (options.showSample) {
          let sampleW = 0;
          let fittedSampleText = item.en;
          let fittedSampleSize = gridFontSize;
          let drawUnit = vietBaseUnit;

          if (useVietVector) {
            const rawUnits = Math.max(0.5, measureVietTextUnits(item.en));
            const maxSampleW = gridWidth * (textScale === 2 ? 0.68 : 0.48);
            if (rawUnits * vietBaseUnit > maxSampleW) {
              drawUnit = Math.max(vietBaseUnit * 0.62, maxSampleW / rawUnits);
            }
            sampleW = drawVietTextPdf(
              page,
              item.en,
              sampleStartX,
              baselineY,
              drawUnit,
              {
                pdfColor: rgb(0.12, 0.16, 0.24),
                strokeWidthUnits: vietStroke,
              }
            );
          } else {
            const fittedSample = fitTextWidth(
              (t, s) => f.widthOfTextAtSize(t, s),
              item.en,
              gridWidth * (textScale === 2 ? 0.64 : 0.44),
              gridFontSize,
              7.8
            );
            fittedSampleText = fittedSample.text;
            fittedSampleSize = fittedSample.size;
            sampleW = f.widthOfTextAtSize(fittedSampleText, fittedSampleSize);
            page.drawText(fittedSampleText, {
              x: sampleStartX,
              y: baselineY + gridBaselineShift,
              size: fittedSampleSize,
              font: f,
              color: rgb(0.16, 0.22, 0.32),
            });
          }

          // Snap separator to next clean vertical grid line after sample word
          const sepCols = Math.ceil((sampleStartX + sampleW - gridX) / gridUnit) + 1;
          const sepX = gridX + sepCols * gridUnit;
          if (sepX < gridRight - gridUnit * 3) {
            page.drawLine({
              start: { x: sepX, y: gridBottomY + gridUnit * 0.4 },
              end: { x: sepX, y: gridBottomY + gridH - gridUnit * 0.4 },
              thickness: 0.55,
              color: rgb(0.55, 0.72, 0.9),
            });
          }

          practiceStartX = sepX + gridUnit;

          // Add a faint dashed/ghost tracing copy if plenty of blank practice space remains
          const remainingAfterSample = gridRight - practiceStartX;
          if (!answer && remainingAfterSample >= sampleW * (textScale === 2 ? 1.12 : 1.9) + gridUnit * 2) {
            if (useVietVector) {
              drawVietTextPdf(
                page,
                item.en,
                practiceStartX,
                baselineY,
                drawUnit,
                {
                  pdfColor: rgb(0.58, 0.65, 0.75),
                  dashed: true,
                  strokeWidthUnits: vietStroke,
                }
              );
            } else {
              page.drawText(fittedSampleText, {
                x: practiceStartX,
                y: baselineY + gridBaselineShift,
                size: fittedSampleSize,
                font: f,
                color: rgb(0.76, 0.81, 0.87),
              });
            }
            const nextCols = Math.ceil((practiceStartX + sampleW - gridX) / gridUnit) + 2;
            practiceStartX = gridX + nextCols * gridUnit;
          }
        }

        if (answer && practiceStartX < gridRight - mm(8)) {
          if (useVietVector) {
            const rawUnits = Math.max(0.5, measureVietTextUnits(item.en));
            const availW = gridRight - practiceStartX - gridUnit * 0.5;
            const ansUnit =
              rawUnits * vietBaseUnit > availW
                ? Math.max(vietBaseUnit * 0.62, availW / rawUnits)
                : vietBaseUnit;
            drawVietTextPdf(
              page,
              item.en,
              practiceStartX,
              baselineY,
              ansUnit,
              {
                pdfColor: rgb(0.11, 0.31, 0.78),
                strokeWidthUnits: vietStroke,
              }
            );
          } else {
            const fittedAns = fitTextWidth(
              (t, s) => f.widthOfTextAtSize(t, s),
              item.en,
              gridRight - practiceStartX - gridUnit * 0.5,
              gridFontSize,
              7.8
            );
            page.drawText(fittedAns.text, {
              x: practiceStartX,
              y: baselineY + gridBaselineShift,
              size: fittedAns.size,
              font: f,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        }
      }
    }
    return doc.save();
  }

  // Standard compact 2-column × 14-row (28 items / page) layout
  const colGap = mm(5);
  const colW = (right - left - colGap) / 2;
  const rowH = (usableTop - WORKSHEET_BOTTOM) / 14;
  const useViet = fontStyle === 'viet-primary';
  const useOverlay = (useViet || customCal.isCustom) && Boolean(options.guidelineOverlay);
  const overlayBlocks: GridBlockCount = options.gridBlocks === 5 ? 5 : 4;
  const vietMult = vietNonGridMultiplier(options.fontSize);
  const stdMult = standardTextMultiplier(options.fontSize);

  for (let start = 0, pageNo = 1; start < items.length; start += TYPING1_PER_PAGE, pageNo += 1) {
    const page = doc.addPage(PAGE_A5);
    drawWorksheetHeadingPdf(
      page,
      answer ? 'Answer Key — Look and Write' : 'Look at the picture and write the word.',
      pageNo,
      version,
      totalVersions,
      left,
      right,
      PAGE_A5[1],
      penFont,
      unicodeFont
    );
    const slice = items.slice(start, start + TYPING1_PER_PAGE);

    for (let i = 0; i < slice.length; i += 1) {
      const item = slice[i];
      const col = Math.floor(i / 14);
      const row = i % 14;
      const x = left + col * (colW + colGap);
      const top = usableTop - row * rowH;
      const rowBottom = top - rowH;
      const baseline = top - rowH * 0.65;
      const writingLineY = rowBottom + mm(2.2);
      const imageX = mm(7.5);
      const imageW = mm(12.5);

      page.drawText(`${start + i + 1}.`, {
        x,
        y: baseline,
        size: 11.5 * profile.fontScale,
        font: penFont,
        color: rgb(0.15, 0.18, 0.24),
      });

      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(embedded.width, embedded.height, x + imageX, rowBottom + mm(1), imageW, rowH - mm(2));
        page.drawImage(embedded, box);
      }

      let lineStart = x + imageX + imageW + mm(2);
      const areaRight = x + colW;
      const f = safeFontForText(item.en, penFont, unicodeFont);

      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          lineStart,
          rowBottom + mm(0.8),
          rowH - mm(1.6),
          areaRight - lineStart,
          mm(1.65) * profile.fontScale,
          overlayBlocks,
          1.4,
          options.fontSize
        );
        let cursorX = lineStart + g.gridUnit * 0.35;
        if (useViet) {
          if (options.showSample && !answer) {
            const sampleMaxW = (areaRight - cursorX) * 0.48;
            const sUnit = fitVietUnit(item.en, sampleMaxW, g.unit, mm(0.75));
            const sw = drawVietTextPdf(page, item.en, cursorX, g.baselineY, sUnit, {
              pdfColor: rgb(0.35, 0.42, 0.52),
              strokeWidthUnits: vietStroke,
            });
            cursorX += sw + mm(2.2);
          } else if (!answer && profile.revealFirstLetter && item.en.trim().length > 0) {
            drawVietTextPdf(page, item.en.trim()[0], cursorX, g.baselineY, g.unit, {
              pdfColor: rgb(0.45, 0.52, 0.62),
              strokeWidthUnits: vietStroke,
            });
          }
          if (answer) {
            const aUnit = fitVietUnit(item.en, areaRight - cursorX - g.gridUnit * 0.3, g.unit, mm(0.8));
            drawVietTextPdf(page, item.en, cursorX, g.baselineY, aUnit, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          }
        } else {
          const customOverlaySize = g.unit * 1.92 * customCal.scaleMult;
          const customOverlayY = g.baselineY + customCal.offsetCells * g.unit;
          if (options.showSample && !answer) {
            const sampleMaxW = (areaRight - cursorX) * 0.48;
            const fittedSample = fitTextWidth(
              (t, s) => f.widthOfTextAtSize(t, s),
              item.en,
              sampleMaxW,
              customOverlaySize,
              6.5
            );
            page.drawText(fittedSample.text, {
              x: cursorX,
              y: customOverlayY,
              size: fittedSample.size,
              font: f,
              color: rgb(0.35, 0.42, 0.52),
            });
            cursorX += f.widthOfTextAtSize(fittedSample.text, fittedSample.size) + mm(2.2);
          } else if (!answer && profile.revealFirstLetter && item.en.trim().length > 0) {
            page.drawText(item.en.trim()[0], {
              x: cursorX,
              y: customOverlayY,
              size: customOverlaySize,
              font: f,
              color: rgb(0.45, 0.52, 0.62),
            });
          }
          if (answer) {
            const fittedAns = fitTextWidth(
              (t, s) => f.widthOfTextAtSize(t, s),
              item.en,
              areaRight - cursorX - g.gridUnit * 0.3,
              customOverlaySize,
              6.5
            );
            page.drawText(fittedAns.text, {
              x: cursorX,
              y: customOverlayY,
              size: fittedAns.size,
              font: f,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        }
        continue;
      }

      if (options.showSample && !answer) {
        const sampleMaxW = (areaRight - lineStart) * 0.48;
        if (useViet) {
          const sUnit = fitVietUnit(item.en, sampleMaxW, mm(1.55) * profile.fontScale * vietMult, mm(0.8));
          const sw = drawVietTextPdf(page, item.en, lineStart, writingLineY + mm(0.8), sUnit, {
            pdfColor: rgb(0.42, 0.48, 0.56),
            strokeWidthUnits: vietStroke,
          });
          lineStart += sw + mm(2.2);
        } else {
          const fittedSample = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            item.en,
            sampleMaxW,
            10.5 * profile.fontScale * stdMult * customCal.scaleMult,
            6.8
          );
          const sampleW = f.widthOfTextAtSize(fittedSample.text, fittedSample.size);
          page.drawText(fittedSample.text, {
            x: lineStart,
            y: writingLineY + mm(1) + customCal.nonGridShiftPt,
            size: fittedSample.size,
            font: f,
            color: rgb(0.42, 0.48, 0.56),
          });
          lineStart += sampleW + mm(2.2);
        }
      } else if (!answer && profile.revealFirstLetter && item.en.trim().length > 0) {
        const firstChar = item.en.trim()[0];
        if (useViet) {
          const cw = drawVietTextPdf(page, firstChar, lineStart, writingLineY + mm(0.8), mm(1.6) * profile.fontScale * vietMult, {
            pdfColor: rgb(0.45, 0.52, 0.62),
            strokeWidthUnits: vietStroke,
          });
          lineStart += cw + mm(1.2);
        } else {
          const hintSize = 11 * profile.fontScale * stdMult * customCal.scaleMult;
          page.drawText(firstChar, {
            x: lineStart,
            y: writingLineY + mm(1) + customCal.nonGridShiftPt,
            size: hintSize,
            font: f,
            color: rgb(0.45, 0.52, 0.62),
          });
          lineStart += f.widthOfTextAtSize(firstChar, hintSize) + mm(1.2);
        }
      }

      if (answer) {
        if (useViet) {
          const aUnit = fitVietUnit(item.en, areaRight - lineStart, mm(1.65) * profile.fontScale * vietMult, mm(0.8));
          drawVietTextPdf(page, item.en, lineStart, writingLineY + mm(0.8), aUnit, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const fitted = fitTextWidth(
            (t, s) => f.widthOfTextAtSize(t, s),
            item.en,
            areaRight - lineStart,
            11.5 * profile.fontScale * stdMult * customCal.scaleMult,
            7
          );
          page.drawText(fitted.text, {
            x: lineStart,
            y: writingLineY + mm(1) + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      } else if (lineStart < areaRight - mm(4)) {
        page.drawLine({
          start: { x: lineStart, y: writingLineY },
          end: { x: areaRight, y: writingLineY },
          thickness: 0.55,
          color: rgb(0.28, 0.32, 0.4),
        });
      }
    }
  }
  return doc.save();
}

// ============================================================
// 7 & 8. TYPING 2 / 3: Dual Side-by-Side Vocabulary Check (A4 Landscape)
// ============================================================
function vocabHeaders(mode: TypingDirection): [string, string, string] {
  return mode === 'vi-to-en' ? ['No.', 'Vietnamese', 'English'] : ['No.', 'English', 'Vietnamese'];
}

export async function makeVocabularyCheckPdf(
  items: VocabRow[],
  mode: TypingDirection,
  studentHeader: string,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  difficulty: DifficultyLevel = 'intermediate',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const profile = getDifficultyProfile(difficulty);
  const panelW = (PAGE_A4_LANDSCAPE[0] - VOCAB_MARGIN * 2 - VOCAB_PANEL_GAP) / 2;
  const numW = mm(10);
  const promptW = (panelW - numW) * 0.46;
  const answerW = panelW - numW - promptW;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let start = 0, pageNo = 1; start < items.length; start += VOCAB_ROWS_PER_PAGE, pageNo += 1) {
    const page = doc.addPage(PAGE_A4_LANDSCAPE);
    const slice = items.slice(start, start + VOCAB_ROWS_PER_PAGE);
    const displayRows = Math.max(slice.length, 1);
    const tableTop = PAGE_A4_LANDSCAPE[1] - VOCAB_MARGIN - VOCAB_HEADER_H;
    const usableH = tableTop - VOCAB_MARGIN;
    const rowH = Math.min(mm(profile.vocabMaxRowMm), usableH / (displayRows + 1));
    const tableBottom = tableTop - rowH * (displayRows + 1);
    const headers = vocabHeaders(mode);

    // Center cut line between left and right student copies
    const midX = PAGE_A4_LANDSCAPE[0] / 2;
    drawDashedLinePdf(page, midX, VOCAB_MARGIN, midX, PAGE_A4_LANDSCAPE[1] - VOCAB_MARGIN, rgb(0.65, 0.7, 0.76));

    for (let panel = 0; panel < 2; panel += 1) {
      const px = VOCAB_MARGIN + panel * (panelW + VOCAB_PANEL_GAP);

      // Header line per panel
      const headerLine = answer
        ? `Answer Key (${mode === 'vi-to-en' ? 'VI → EN' : 'EN → VI'})`
        : studentHeader || 'Full name: ____________________';
      const hFont = safeFontForText(headerLine, unicodeFont, unicodeFont);
      page.drawText(headerLine, {
        x: px,
        y: PAGE_A4_LANDSCAPE[1] - VOCAB_MARGIN - 9,
        size: 9.5,
        font: hFont,
        color: rgb(0.12, 0.16, 0.22),
      });
      const codeStr = totalVersions > 1 ? `Code ${version} · P.${pageNo}` : `P.${pageNo}`;
      const cw = unicodeFont.widthOfTextAtSize(codeStr, 8);
      page.drawText(codeStr, {
        x: px + panelW - cw,
        y: PAGE_A4_LANDSCAPE[1] - VOCAB_MARGIN - 9,
        size: 8,
        font: unicodeFont,
        color: rgb(0.42, 0.48, 0.55),
      });

      // Header shaded strip
      page.drawRectangle({
        x: px,
        y: tableTop - rowH,
        width: panelW,
        height: rowH,
        color: rgb(0.95, 0.96, 0.98),
      });

      // Outer border
      page.drawRectangle({
        x: px,
        y: tableBottom,
        width: panelW,
        height: tableTop - tableBottom,
        borderColor: rgb(0.25, 0.3, 0.38),
        borderWidth: 0.6,
      });

      // Horizontal lines
      for (let r = 1; r <= displayRows; r += 1) {
        const y = tableTop - r * rowH;
        page.drawLine({
          start: { x: px, y },
          end: { x: px + panelW, y },
          thickness: 0.35,
          color: rgb(0.6, 0.65, 0.72),
        });
      }

      // Vertical lines
      [numW, numW + promptW].forEach((offset) => {
        page.drawLine({
          start: { x: px + offset, y: tableBottom },
          end: { x: px + offset, y: tableTop },
          thickness: 0.4,
          color: rgb(0.45, 0.5, 0.58),
        });
      });

      // Column headers
      const colWidths = [numW, promptW, answerW];
      let cx = px;
      colWidths.forEach((w, idx) => {
        const text = headers[idx];
        const tw = boldFont.widthOfTextAtSize(text, 8.5);
        page.drawText(text, {
          x: cx + (w - tw) / 2,
          y: tableTop - rowH * 0.68,
          size: 8.5,
          font: boldFont,
          color: rgb(0.12, 0.16, 0.24),
        });
        cx += w;
      });

      // Data rows
      const sizeScale = fontSizeScale(overlay.fontSize);
      const vietStroke = vietStrokeUnitsForScale(sizeScale);
      const vietMult = vietNonGridMultiplier(overlay.fontSize);
      const stdMult = standardTextMultiplier(overlay.fontSize);
      const fontSize = Math.min(11.5 * profile.fontScale * stdMult, Math.max(6.8, rowH * 0.58 * profile.fontScale * stdMult));
      for (let i = 0; i < slice.length; i += 1) {
        const item = slice[i];
        const rowBottomY = tableTop - (i + 2) * rowH;
        const y = tableTop - (i + 1) * rowH - rowH * 0.68;
        const numText = `${start + i + 1}.`;
        const nw = unicodeFont.widthOfTextAtSize(numText, fontSize * 0.9);
        page.drawText(numText, {
          x: px + (numW - nw) / 2,
          y,
          size: fontSize * 0.9,
          font: unicodeFont,
          color: rgb(0.3, 0.35, 0.42),
        });

        const promptText = mode === 'vi-to-en' ? item.vi : item.en;
        if (useViet) {
          const pUnit = fitVietUnit(promptText, promptW - mm(2.6), mm(1.35) * profile.fontScale * vietMult, mm(0.65));
          drawVietTextPdf(page, promptText, px + numW + mm(1.3), y, pUnit, {
            pdfColor: rgb(0.08, 0.1, 0.15),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const pFont = customCal.isCustom ? safeFontForText(promptText, penFont, unicodeFont) : unicodeFont;
          const fittedPrompt = fitTextWidth(
            (t, s) => pFont.widthOfTextAtSize(t, s),
            promptText,
            promptW - mm(2.5),
            fontSize * customCal.scaleMult,
            6.2
          );
          page.drawText(fittedPrompt.text, {
            x: px + numW + mm(1.3),
            y: y + customCal.nonGridShiftPt,
            size: fittedPrompt.size,
            font: pFont,
            color: rgb(0.08, 0.1, 0.15),
          });
        }

        const ansText = mode === 'vi-to-en' ? item.en : item.vi;
        const ansCellX = px + numW + promptW;
        if (useOverlay) {
          const g = drawGuidelineOverlayPdf(
            page,
            ansCellX + mm(0.6),
            rowBottomY + mm(0.3),
            rowH - mm(0.6),
            answerW - mm(1.2),
            mm(1.35) * profile.fontScale,
            overlay.blocks,
            1.2,
            overlay.fontSize
          );
          if (useViet) {
            if (answer) {
              const aUnit = fitVietUnit(ansText, answerW - mm(2.4), g.unit, mm(0.65));
              drawVietTextPdf(page, ansText, ansCellX + mm(1.2), g.baselineY, aUnit, {
                pdfColor: rgb(0.11, 0.31, 0.78),
                strokeWidthUnits: vietStroke,
              });
            } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
              drawVietTextPdf(page, ansText.trim()[0], ansCellX + mm(1.2), g.baselineY, g.unit, {
                pdfColor: rgb(0.58, 0.64, 0.72),
                strokeWidthUnits: vietStroke,
              });
            }
          } else {
            const aFont = safeFontForText(ansText, penFont, unicodeFont);
            if (answer) {
              const fittedAns = fitTextWidth(
                (t, s) => aFont.widthOfTextAtSize(t, s),
                ansText,
                answerW - mm(2.4),
                g.unit * 1.92 * customCal.scaleMult,
                5.5
              );
              page.drawText(fittedAns.text, {
                x: ansCellX + mm(1.2),
                y: g.baselineY + customCal.offsetCells * g.unit,
                size: fittedAns.size,
                font: aFont,
                color: rgb(0.11, 0.31, 0.78),
              });
            } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
              page.drawText(ansText.trim()[0], {
                x: ansCellX + mm(1.2),
                y: g.baselineY + customCal.offsetCells * g.unit,
                size: g.unit * 1.92 * customCal.scaleMult,
                font: aFont,
                color: rgb(0.58, 0.64, 0.72),
              });
            }
          }
        } else if (answer) {
          if (useViet) {
            const aUnit = fitVietUnit(ansText, answerW - mm(2.5), mm(1.35) * profile.fontScale * vietMult, mm(0.65));
            drawVietTextPdf(page, ansText, ansCellX + mm(1.3), y, aUnit, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          } else {
            const aFont = customCal.isCustom ? safeFontForText(ansText, penFont, unicodeFont) : unicodeFont;
            const fittedAns = fitTextWidth(
              (t, s) => aFont.widthOfTextAtSize(t, s),
              ansText,
              answerW - mm(2.5),
              fontSize * customCal.scaleMult,
              6.2
            );
            page.drawText(fittedAns.text, {
              x: ansCellX + mm(1.3),
              y: y + customCal.nonGridShiftPt,
              size: fittedAns.size,
              font: aFont,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
          const cue = `${ansText.trim()[0]}_____`;
          const cueFont = customCal.isCustom ? safeFontForText(cue, penFont, unicodeFont) : unicodeFont;
          page.drawText(cue, {
            x: ansCellX + mm(1.3),
            y: y + customCal.nonGridShiftPt,
            size: fontSize * 0.92 * customCal.scaleMult,
            font: cueFont,
            color: rgb(0.58, 0.64, 0.72),
          });
        }
      }
    }
  }
  return doc.save();
}

// ============================================================
// 9. MIX A4 PORTRAIT WORKSHEET
// ============================================================
export async function makeMixPdf(
  plan: MixPlan,
  images: Map<string, ImageAsset>,
  studentHeader: string,
  answer: boolean,
  version: number,
  totalVersions: number,
  fontStyle: WorksheetFontStyle = 'penmanship',
  overlay: GuidelineOverlayOptions = DEFAULT_OVERLAY
): Promise<Uint8Array> {
  const { doc, penFont, unicodeFont, boldFont } = await createDocumentWithFonts(fontStyle, overlay.customFontId);
  const cache = new Map<string, PDFImage>();
  const [pageW, pageH] = PAGE_A4_PORTRAIT;
  const useViet = fontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(fontStyle, overlay.customFontScale, overlay.customFontBaselineOffset);
  const useOverlay = (useViet || customCal.isCustom) && overlay.enabled;

  for (let pIdx = 0; pIdx < plan.pages.length; pIdx += 1) {
    const page = doc.addPage(PAGE_A4_PORTRAIT);
    const layout = plan.pages[pIdx];

    const topHeader = answer
      ? `Answer Key — Mix Worksheet`
      : studentHeader || 'Full name: ________________________';
    page.drawText(topHeader, {
      x: mm(9),
      y: pageH - mm(9),
      size: 10.5,
      font: unicodeFont,
      color: rgb(0.1, 0.14, 0.2),
    });
    const meta = totalVersions > 1 ? `Code ${version} · Page ${pIdx + 1}` : `Page ${pIdx + 1}`;
    const mw = unicodeFont.widthOfTextAtSize(meta, 8.5);
    page.drawText(meta, {
      x: pageW - mm(9) - mw,
      y: pageH - mm(9),
      size: 8.5,
      font: unicodeFont,
      color: rgb(0.42, 0.48, 0.55),
    });

    page.drawLine({
      start: { x: mm(9), y: pageH - mm(11.5) },
      end: { x: pageW - mm(9), y: pageH - mm(11.5) },
      thickness: 0.5,
      color: rgb(0.82, 0.85, 0.9),
    });

    for (const block of layout.blocks) {
      await drawMixBlockPdf(
        doc,
        page,
        block,
        images,
        cache,
        answer,
        customCal.isCustom ? penFont : unicodeFont,
        unicodeFont,
        boldFont,
        pageH,
        useViet,
        useOverlay,
        overlay.blocks,
        overlay.fontSize,
        customCal
      );
    }
  }

  return doc.save();
}

async function drawMixBlockPdf(
  doc: PDFDocument,
  page: PDFPage,
  block: MixPageBlock,
  images: Map<string, ImageAsset>,
  cache: Map<string, PDFImage>,
  answer: boolean,
  preferredFont: PDFFont,
  fallbackFont: PDFFont,
  boldFont: PDFFont,
  pageH: number,
  useViet = false,
  useOverlay = false,
  overlayBlocks: GridBlockCount = 4,
  fontSize: WorksheetFontSize = 'small',
  customCal: CustomCalibration = { isCustom: false, scaleMult: 1, offsetCells: 0, nonGridShiftPt: 0 }
) {
  const fontFor = (t: string) => safeFontForText(t, preferredFont, fallbackFont);
  const font = fallbackFont;
  const sizeScale = fontSizeScale(fontSize);
  const vietStroke = vietStrokeUnitsForScale(sizeScale);
  const vietMult = vietNonGridMultiplier(fontSize);
  const stdMult = standardTextMultiplier(fontSize);
  const section = block.section;
  const heading = `${String.fromCharCode(65 + section.order)}. ${section.label}`;
  page.drawText(heading, {
    x: block.x,
    y: pageH - block.y - mm(3.5),
    size: 11.5,
    font: boldFont,
    color: rgb(0.1, 0.14, 0.22),
  });

  const bodyTop = block.y + mm(7);

  if (section.type === 'matching-3') {
    const terms = section.matchingTerms || [];
    const leftDotX = block.x + mm(48);
    const rightDotX = block.x + mm(102);
    for (let i = 0; i < section.items.length; i += 1) {
      const item = section.items[i];
      const rowTop = bodyTop + i * MIX_MATCHING3_ROW_HEIGHT;
      const rowBottomY = pageH - rowTop - MIX_MATCHING3_ROW_HEIGHT;
      const centerY = pageH - (rowTop + MIX_MATCHING3_ROW_HEIGHT / 2);

      page.drawText(`${i + 1}.`, {
        x: block.x,
        y: centerY - 3,
        size: 10,
        font: boldFont,
        color: rgb(0.2, 0.24, 0.3),
      });

      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          block.x + mm(8),
          rowBottomY + mm(1),
          mm(22),
          MIX_MATCHING3_ROW_HEIGHT - mm(2)
        );
        page.drawImage(embedded, box);
      }

      page.drawCircle({ x: leftDotX, y: centerY, size: 2, color: rgb(0.12, 0.15, 0.22) });
      page.drawCircle({ x: rightDotX, y: centerY, size: 2, color: rgb(0.12, 0.15, 0.22) });

      const term = terms[i];
      if (term) {
        if (useViet) {
          const prefix = `${term.letter}. `;
          const pw = boldFont.widthOfTextAtSize(prefix, 9.5);
          const wx = rightDotX + mm(5) + pw;
          const ww = Math.max(mm(14), block.x + block.width - wx);
          let wy = centerY - 2.5;
          let wu = mm(1.65) * vietMult;
          let padX = 0;
          if (useOverlay) {
            const g = drawGuidelineOverlayPdf(
              page,
              wx,
              rowBottomY + mm(1),
              MIX_MATCHING3_ROW_HEIGHT - mm(2),
              ww,
              mm(1.7),
              overlayBlocks,
              1.4,
              fontSize
            );
            wy = g.baselineY;
            wu = g.unit;
            padX = g.gridUnit * 0.3;
          }
          page.drawText(prefix, { x: rightDotX + mm(5), y: wy, size: 9.5, font: boldFont, color: rgb(0.15, 0.18, 0.24) });
          const fu = fitVietUnit(term.item.en, ww - mm(1), wu, mm(0.8));
          drawVietTextPdf(page, term.item.en, wx + padX, wy, fu, {
            pdfColor: rgb(0.1, 0.12, 0.18),
            strokeWidthUnits: vietStroke,
          });
        } else if (useOverlay) {
          const prefix = `${term.letter}. `;
          const pw = boldFont.widthOfTextAtSize(prefix, 9.5);
          const wx = rightDotX + mm(5) + pw;
          const ww = Math.max(mm(14), block.x + block.width - wx);
          const g = drawGuidelineOverlayPdf(
            page,
            wx,
            rowBottomY + mm(1),
            MIX_MATCHING3_ROW_HEIGHT - mm(2),
            ww,
            mm(1.7),
            overlayBlocks,
            1.4,
            fontSize
          );
          page.drawText(prefix, { x: rightDotX + mm(5), y: g.baselineY, size: 9.5, font: boldFont, color: rgb(0.15, 0.18, 0.24) });
          const f = fontFor(term.item.en);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), term.item.en, ww - mm(1), g.unit * 1.92 * customCal.scaleMult, 6.5);
          page.drawText(fitted.text, {
            x: wx + g.gridUnit * 0.3,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        } else {
          const label = `${term.letter}. ${term.item.en}`;
          const f = fontFor(label);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), label, Math.max(mm(20), block.x + block.width - (rightDotX + mm(5))), 10 * stdMult * customCal.scaleMult, 6.5);
          page.drawText(fitted.text, {
            x: rightDotX + mm(5),
            y: centerY - 3 + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.1, 0.12, 0.18),
          });
        }
      }

      if (answer) {
        const tIdx = terms.findIndex((t) => t.item.uid === item.uid);
        if (tIdx >= 0) {
          const targetY = pageH - (bodyTop + tIdx * MIX_MATCHING3_ROW_HEIGHT + MIX_MATCHING3_ROW_HEIGHT / 2);
          page.drawLine({
            start: { x: leftDotX, y: centerY },
            end: { x: rightDotX, y: targetY },
            thickness: 1.0,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      }
    }
    return;
  }

  if (section.type === 'anagram') {
    const entries = section.anagramEntries || [];
    for (let i = 0; i < section.items.length; i += 1) {
      const item = section.items[i];
      const entry = entries[i];
      const rowTop = bodyTop + i * MIX_ANAGRAM_ROW_HEIGHT;
      const rowBottomY = pageH - rowTop - MIX_ANAGRAM_ROW_HEIGHT;
      const centerY = pageH - (rowTop + MIX_ANAGRAM_ROW_HEIGHT / 2);
      const num = (section.offset || 0) + i + 1;

      page.drawText(`${num}.`, { x: block.x, y: centerY - 3, size: 10, font: boldFont });
      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          block.x + mm(8),
          rowBottomY + mm(1),
          mm(15),
          MIX_ANAGRAM_ROW_HEIGHT - mm(2)
        );
        page.drawImage(embedded, box);
      }

      if (useViet) {
        const clueText = entry?.scrambled || item.en;
        const cu = fitVietUnit(clueText, mm(70), mm(1.65) * vietMult, mm(0.8));
        drawVietTextPdf(page, clueText, block.x + mm(27), centerY - 2.5, cu, {
          pdfColor: rgb(0.25, 0.3, 0.38),
          strokeWidthUnits: vietStroke,
        });
      } else {
        const clueText = entry?.scrambled || item.en;
        const f = fontFor(clueText);
        const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), clueText, mm(70), 10.5 * stdMult * customCal.scaleMult, 6.5);
        page.drawText(fitted.text, {
          x: block.x + mm(27),
          y: centerY - 3 + customCal.nonGridShiftPt,
          size: fitted.size,
          font: f,
          color: rgb(0.25, 0.3, 0.38),
        });
      }

      const lineX = block.x + mm(102);
      const ansW = block.x + block.width - lineX;
      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          lineX,
          rowBottomY + mm(0.8),
          MIX_ANAGRAM_ROW_HEIGHT - mm(1.6),
          ansW,
          mm(1.65),
          overlayBlocks,
          1.4,
          fontSize
        );
        if (answer) {
          if (useViet) {
            const au = fitVietUnit(item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.8));
            drawVietTextPdf(page, item.en, lineX + g.gridUnit * 0.35, g.baselineY, au, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          } else {
            const f = fontFor(item.en);
            const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), item.en, ansW - g.gridUnit * 0.8, g.unit * 1.92 * customCal.scaleMult, 6.5);
            page.drawText(fitted.text, {
              x: lineX + g.gridUnit * 0.35,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: fitted.size,
              font: f,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        }
      } else if (answer) {
        if (useViet) {
          const au = fitVietUnit(item.en, ansW, mm(1.65) * vietMult, mm(0.8));
          drawVietTextPdf(page, item.en, lineX, centerY - 2.5, au, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const f = fontFor(item.en);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), item.en, ansW, 10.5 * stdMult * customCal.scaleMult, 6.5);
          page.drawText(fitted.text, {
            x: lineX,
            y: centerY - 3 + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      } else {
        page.drawLine({
          start: { x: lineX, y: centerY - mm(1.5) },
          end: { x: block.x + block.width, y: centerY - mm(1.5) },
          thickness: 0.55,
          color: rgb(0.32, 0.38, 0.45),
        });
      }
    }
    return;
  }

  if (section.type === 'matching-2') {
    const groups = section.matching2Groups || [];
    const cardW = (block.width - MIX_MATCHING2.cardGap * 4) / 5;
    let cursorTop = bodyTop;

    for (const group of groups) {
      for (let i = 0; i < group.pictures.length; i += 1) {
        const item = group.pictures[i];
        const cardX = block.x + (i % 5) * (cardW + MIX_MATCHING2.cardGap);
        const cardY = pageH - cursorTop - MIX_MATCHING2.cardHeight;
        drawDashedBoxPdf(page, cardX, cardY, cardW, MIX_MATCHING2.cardHeight, mm(2));
        const embedded = await embedCachedImage(doc, cache, images, item.imageId);
        if (embedded) {
          const box = fitRect(
            embedded.width,
            embedded.height,
            cardX + MIX_MATCHING2.cardPadding,
            cardY + MIX_MATCHING2.labelHeight + MIX_MATCHING2.cardPadding,
            cardW - MIX_MATCHING2.cardPadding * 2,
            MIX_MATCHING2.imageHeight
          );
          page.drawImage(embedded, box);
        }
        const letter = String.fromCharCode(65 + i);
        const lw = boldFont.widthOfTextAtSize(letter, 11);
        page.drawText(letter, {
          x: cardX + (cardW - lw) / 2,
          y: cardY + mm(1.2),
          size: 11,
          font: boldFont,
        });
      }

      const promptTop = cursorTop + MIX_MATCHING2.cardHeight + mm(2);
      const colW = (block.width - mm(6)) / 3;
      for (let pIdx = 0; pIdx < group.prompts.length; pIdx += 1) {
        const item = group.prompts[pIdx];
        const colIdx = pIdx % 3;
        const rowIdx = Math.floor(pIdx / 3);
        const picIdx = group.pictures.findIndex((p) => p.uid === item.uid);
        const letter = picIdx >= 0 ? String.fromCharCode(65 + picIdx) : '?';
        const px = block.x + colIdx * (colW + mm(3));
        const rowBottomY = pageH - (promptTop + (rowIdx + 1) * MIX_MATCHING2.promptRowHeight);
        const py = pageH - (promptTop + rowIdx * MIX_MATCHING2.promptRowHeight + mm(4.5));

        if (useViet) {
          const prefix = answer ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
          const pw = font.widthOfTextAtSize(prefix, 8.5);
          const wx = px + pw;
          const ww = Math.max(mm(10), colW - pw - mm(1.5));
          let wy = py;
          let wu = mm(1.35) * vietMult;
          let padX = 0;
          if (useOverlay) {
            const g = drawGuidelineOverlayPdf(
              page,
              wx,
              rowBottomY + mm(0.3),
              MIX_MATCHING2.promptRowHeight - mm(0.6),
              ww,
              mm(1.35),
              overlayBlocks,
              1.2,
              fontSize
            );
            wy = g.baselineY;
            wu = g.unit;
            padX = g.gridUnit * 0.25;
          }
          page.drawText(prefix, {
            x: px,
            y: wy,
            size: 8.5,
            font,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.15, 0.18, 0.24),
          });
          const fu = fitVietUnit(item.en, ww - mm(0.6), wu, mm(0.7));
          drawVietTextPdf(page, item.en, wx + padX, wy, fu, {
            pdfColor: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
            strokeWidthUnits: vietStroke,
          });
        } else if (useOverlay) {
          const prefix = answer ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
          const pw = font.widthOfTextAtSize(prefix, 8.5);
          const wx = px + pw;
          const ww = Math.max(mm(10), colW - pw - mm(1.5));
          const g = drawGuidelineOverlayPdf(
            page,
            wx,
            rowBottomY + mm(0.3),
            MIX_MATCHING2.promptRowHeight - mm(0.6),
            ww,
            mm(1.35),
            overlayBlocks,
            1.2,
            fontSize
          );
          page.drawText(prefix, {
            x: px,
            y: g.baselineY,
            size: 8.5,
            font,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.15, 0.18, 0.24),
          });
          const f = fontFor(item.en);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), item.en, ww - mm(0.6), g.unit * 1.92 * customCal.scaleMult, 5.5);
          page.drawText(fitted.text, {
            x: wx + g.gridUnit * 0.25,
            y: g.baselineY + customCal.offsetCells * g.unit,
            size: fitted.size,
            font: f,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
          });
        } else {
          const text = answer ? `${pIdx + 1}. [${letter}] ${item.en}` : `${pIdx + 1}. ____ ${item.en}`;
          const f = fontFor(text);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), text, colW - mm(2), 10 * stdMult * customCal.scaleMult, 6.5);
          page.drawText(fitted.text, {
            x: px,
            y: py + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: answer ? rgb(0.11, 0.31, 0.78) : rgb(0.1, 0.12, 0.18),
          });
        }
      }
      cursorTop += group.height + MIX_MATCHING2.groupGap;
    }
    return;
  }

  // Two-column Typing sections inside Mix (typing-image, typing-2, typing-3)
  const colGap = mm(8);
  const colW = (block.width - colGap) / 2;
  for (let i = 0; i < section.items.length; i += 1) {
    const item = section.items[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cellX = block.x + col * (colW + colGap);
    const rowTop = bodyTop + row * MIX_TYPING_ROW_HEIGHT;
    const rowBottomY = pageH - rowTop - MIX_TYPING_ROW_HEIGHT;
    const base = pageH - (rowTop + MIX_TYPING_ROW_HEIGHT * 0.65);
    const num = (section.offset || 0) + i + 1;

    if (section.type === 'typing-image') {
      page.drawText(`${num}.`, { x: cellX, y: base, size: 10, font: boldFont });
      const embedded = await embedCachedImage(doc, cache, images, item.imageId);
      if (embedded) {
        const box = fitRect(
          embedded.width,
          embedded.height,
          cellX + mm(8),
          rowBottomY + mm(1),
          mm(16),
          MIX_TYPING_ROW_HEIGHT - mm(2)
        );
        page.drawImage(embedded, box);
      }
      const lineX = cellX + mm(27);
      const ansW = cellX + colW - lineX;
      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          lineX,
          rowBottomY + mm(0.8),
          MIX_TYPING_ROW_HEIGHT - mm(1.6),
          ansW,
          mm(1.65),
          overlayBlocks,
          1.4,
          fontSize
        );
        if (answer) {
          if (useViet) {
            const au = fitVietUnit(item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.8));
            drawVietTextPdf(page, item.en, lineX + g.gridUnit * 0.35, g.baselineY, au, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          } else {
            const f = fontFor(item.en);
            const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), item.en, ansW - g.gridUnit * 0.8, g.unit * 1.92 * customCal.scaleMult, 6.2);
            page.drawText(fitted.text, {
              x: lineX + g.gridUnit * 0.35,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: fitted.size,
              font: f,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        }
      } else if (answer) {
        if (useViet) {
          const au = fitVietUnit(item.en, ansW, mm(1.65) * vietMult, mm(0.8));
          drawVietTextPdf(page, item.en, lineX, base, au, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const f = fontFor(item.en);
          const fitted = fitTextWidth((t, s) => f.widthOfTextAtSize(t, s), item.en, ansW, 10 * stdMult * customCal.scaleMult, 6.5);
          page.drawText(fitted.text, {
            x: lineX,
            y: base + customCal.nonGridShiftPt,
            size: fitted.size,
            font: f,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      } else {
        page.drawLine({
          start: { x: lineX, y: base - mm(1) },
          end: { x: cellX + colW, y: base - mm(1) },
          thickness: 0.55,
          color: rgb(0.32, 0.38, 0.45),
        });
      }
    } else {
      const prompt = section.type === 'typing-2' ? item.vi : item.en;
      const ans = section.type === 'typing-2' ? item.en : item.vi;
      const promptStr = `${num}. ${prompt}`;
      const pFont = fontFor(promptStr);
      const fittedP = fitTextWidth(
        (t, s) => pFont.widthOfTextAtSize(t, s),
        promptStr,
        colW * 0.52,
        9.5 * stdMult * customCal.scaleMult,
        6.5
      );
      page.drawText(fittedP.text, { x: cellX, y: base + customCal.nonGridShiftPt, size: fittedP.size, font: pFont });
      const ansStartX = cellX + colW * 0.54;
      const ansW = cellX + colW - ansStartX;
      if (useOverlay) {
        const g = drawGuidelineOverlayPdf(
          page,
          ansStartX,
          rowBottomY + mm(0.8),
          MIX_TYPING_ROW_HEIGHT - mm(1.6),
          ansW,
          mm(1.55),
          overlayBlocks,
          1.4,
          fontSize
        );
        if (answer) {
          if (useViet) {
            const au = fitVietUnit(ans, ansW - g.gridUnit * 0.7, g.unit, mm(0.75));
            drawVietTextPdf(page, ans, ansStartX + g.gridUnit * 0.3, g.baselineY, au, {
              pdfColor: rgb(0.11, 0.31, 0.78),
              strokeWidthUnits: vietStroke,
            });
          } else {
            const aFont = fontFor(ans);
            const fittedA = fitTextWidth((t, s) => aFont.widthOfTextAtSize(t, s), ans, ansW - g.gridUnit * 0.7, g.unit * 1.92 * customCal.scaleMult, 6.2);
            page.drawText(fittedA.text, {
              x: ansStartX + g.gridUnit * 0.3,
              y: g.baselineY + customCal.offsetCells * g.unit,
              size: fittedA.size,
              font: aFont,
              color: rgb(0.11, 0.31, 0.78),
            });
          }
        }
      } else if (answer) {
        if (useViet) {
          const au = fitVietUnit(ans, ansW, mm(1.55) * vietMult, mm(0.75));
          drawVietTextPdf(page, ans, ansStartX + mm(1), base, au, {
            pdfColor: rgb(0.11, 0.31, 0.78),
            strokeWidthUnits: vietStroke,
          });
        } else {
          const aFont = fontFor(ans);
          const fittedA = fitTextWidth((t, s) => aFont.widthOfTextAtSize(t, s), ans, colW * 0.44, 9.5 * stdMult * customCal.scaleMult, 6.5);
          page.drawText(fittedA.text, {
            x: cellX + colW * 0.55,
            y: base + customCal.nonGridShiftPt,
            size: fittedA.size,
            font: aFont,
            color: rgb(0.11, 0.31, 0.78),
          });
        }
      } else {
        page.drawLine({
          start: { x: ansStartX, y: base - mm(1) },
          end: { x: cellX + colW, y: base - mm(1) },
          thickness: 0.55,
          color: rgb(0.32, 0.38, 0.45),
        });
      }
    }
  }
}

// ============================================================
// LIVE HIGH-DPI CANVAS PREVIEW RENDERER (Matches PDF coordinates)
// ============================================================
export interface PreviewPageDescriptor {
  id: string;
  worksheetType: WorksheetType;
  title: string;
  paperLabel: string;
  widthPt: number;
  heightPt: number;
  draw: (canvas: HTMLCanvasElement, displayWidthPx: number) => Promise<void>;
}

const loadedImgCache = new Map<string, HTMLImageElement>();

async function loadHtmlImage(asset: ImageAsset | undefined): Promise<HTMLImageElement | null> {
  if (!asset) return null;
  const cached = loadedImgCache.get(asset.objectUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = asset.objectUrl;
  });
  loadedImgCache.set(asset.objectUrl, img);
  return img;
}

function setupCanvas(
  canvas: HTMLCanvasElement,
  widthPt: number,
  heightPt: number,
  displayWidthPx: number
): { ctx: CanvasRenderingContext2D; scale: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayHeightPx = Math.round((displayWidthPx * heightPt) / widthPt);
  canvas.width = Math.round(displayWidthPx * dpr);
  canvas.height = Math.round(displayHeightPx * dpr);
  canvas.style.width = `${displayWidthPx}px`;
  canvas.style.height = `${displayHeightPx}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayWidthPx, displayHeightPx);
  return { ctx, scale: displayWidthPx / widthPt };
}

function drawCanvasHeading(
  ctx: CanvasRenderingContext2D,
  scale: number,
  title: string,
  pageNo: number,
  version: number,
  totalVersions: number,
  leftX: number,
  rightX: number,
  fontFamily = 'KGPen, DejaVuWorksheet, sans-serif'
) {
  ctx.fillStyle = '#1E293B';
  ctx.font = `600 ${14 * scale}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, leftX * scale, (WORKSHEET_TOP + 13) * scale);

  const meta = totalVersions > 1 ? `Code ${version} · Page ${pageNo}` : `Page ${pageNo}`;
  ctx.fillStyle = '#64748B';
  ctx.font = `500 ${8 * scale}px DejaVuWorksheet, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(meta, rightX * scale, (WORKSHEET_TOP + 11) * scale);
  ctx.textAlign = 'left';
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxPx: number,
  startPx: number,
  minPx: number,
  fontTemplate: (px: number) => string
): { text: string; sizePx: number } {
  let px = startPx;
  ctx.font = fontTemplate(px);
  while (px > minPx && ctx.measureText(text).width > maxPx) {
    px -= 0.5;
    ctx.font = fontTemplate(px);
  }
  if (ctx.measureText(text).width <= maxPx) return { text, sizePx: px };
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxPx) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}…`, sizePx: px };
}

function drawCanvasImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (!img) return;
  const ratio = Math.min(w / Math.max(1, img.naturalWidth), h / Math.max(1, img.naturalHeight));
  const dw = img.naturalWidth * ratio;
  const dh = img.naturalHeight * ratio;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawGuidelineOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  scale: number,
  x: number,
  bandTopY: number,
  bandHeight: number,
  width: number,
  preferredUnit: number,
  blocks: GridBlockCount = 4,
  descenderCells = 1.5,
  fontSize: WorksheetFontSize = 'small'
): { baselineY: number; unit: number; gridUnit: number } {
  const textScale = fontSizeScale(fontSize);
  const aboveRows = textScale === 2 ? Math.max(blocks, 5) : blocks;
  const effectiveDesc = textScale === 2 ? Math.max(descenderCells, 3) : descenderCells;
  const gridUnit = computeOverlayUnit(bandHeight, aboveRows, preferredUnit, effectiveDesc);
  const totalH = (aboveRows + effectiveDesc) * gridUnit;
  const topY = bandTopY + (bandHeight - totalH) / 2;
  const baselineY = topY + aboveRows * gridUnit;
  const bottomY = topY + totalH;
  const endX = x + width;

  // Vertical square ô ly grid lines
  for (let c = 0; c * gridUnit <= width + 0.05; c += 1) {
    const vx = Math.min(endX, x + c * gridUnit);
    const isMajor = c % blocks === 0;
    ctx.strokeStyle = isMajor ? '#60A5FA' : '#D5E5FA';
    ctx.lineWidth = Math.max(isMajor ? 0.55 : 0.35, (isMajor ? 0.42 : 0.2) * scale);
    ctx.beginPath();
    ctx.moveTo(vx * scale, topY * scale);
    ctx.lineTo(vx * scale, bottomY * scale);
    ctx.stroke();
  }
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = Math.max(0.45, 0.36 * scale);
  ctx.beginPath();
  ctx.moveTo(endX * scale, topY * scale);
  ctx.lineTo(endX * scale, bottomY * scale);
  ctx.stroke();

  // Bottom descender edge
  ctx.strokeStyle = '#B8D4F7';
  ctx.lineWidth = Math.max(0.4, 0.28 * scale);
  ctx.beginPath();
  ctx.moveTo(x * scale, bottomY * scale);
  ctx.lineTo(endX * scale, bottomY * scale);
  ctx.stroke();

  // Horizontal auxiliary lines
  const minIntRow = -Math.floor(effectiveDesc);
  for (let r = minIntRow; r <= aboveRows; r += 1) {
    const hy = baselineY - r * gridUnit;
    if (hy >= bottomY - 0.05) continue;
    if (r === 0) {
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = Math.max(0.85, 0.72 * scale);
    } else if (r === blocks) {
      ctx.strokeStyle = '#60A5FA';
      ctx.lineWidth = Math.max(0.65, 0.5 * scale);
    } else if (r === textScale) {
      ctx.strokeStyle = '#93C5FD';
      ctx.lineWidth = Math.max(0.45, 0.32 * scale);
    } else {
      ctx.strokeStyle = '#D5E5FA';
      ctx.lineWidth = Math.max(0.35, 0.22 * scale);
    }
    ctx.beginPath();
    ctx.moveTo(x * scale, hy * scale);
    ctx.lineTo(endX * scale, hy * scale);
    ctx.stroke();
  }

  return { baselineY, unit: gridUnit * textScale, gridUnit };
}

export function buildPreviewDescriptors(
  types: WorksheetType[],
  plan: VersionPlan,
  images: Map<string, ImageAsset>,
  config: WorksheetConfig,
  answerKey: boolean
): PreviewPageDescriptor[] {
  const pages: PreviewPageDescriptor[] = [];
  const activeFontStyle = config.fontStyle || 'penmanship';
  const activeFontFamily = canvasFontStack(activeFontStyle, config.customFontId);
  const difficulty = config.difficulty || 'intermediate';
  const profile = getDifficultyProfile(difficulty);
  const useViet = activeFontStyle === 'viet-primary';
  const customCal = resolveCustomCalibration(
    activeFontStyle,
    config.customFontScale,
    config.customFontBaselineOffset
  );
  const useOverlay = (useViet || customCal.isCustom) && Boolean(config.guidelineOverlay);
  const overlayBlocks: GridBlockCount = config.typingImageGridBlocks === 5 ? 5 : 4;
  const fontSize: WorksheetFontSize = config.fontSize === 'normal' ? 'normal' : 'small';
  const textScale = fontSizeScale(fontSize);
  const vietStroke = vietStrokeUnitsForScale(textScale);
  const vietMult = vietNonGridMultiplier(fontSize);
  const stdMult = standardTextMultiplier(fontSize);
  const ensureFontReady = async () => {
    if (customCal.isCustom) {
      await ensureCustomFontFaceLoaded(config.customFontId);
    }
  };

  for (const type of types) {
    if (type === 'flashcards') {
      const perPage = FLASHCARD_COLS * FLASHCARD_ROWS;
      const cellW = (PAGE_A5[0] - FLASHCARD_MARGIN * 2) / FLASHCARD_COLS;
      const cellH = (PAGE_A5[1] - FLASHCARD_MARGIN * 2) / FLASHCARD_ROWS;
      for (let start = 0, p = 1; start < plan.imageOrder.length; start += perPage, p += 1) {
        const slice = plan.imageOrder.slice(start, start + perPage);
        pages.push({
          id: `flashcards-${plan.version}-${p}-${useOverlay}-${overlayBlocks}-${fontSize}`,
          worksheetType: 'flashcards',
          title: `Flashcards — Page ${p}`,
          paperLabel: 'A5 Portrait · 148 × 210 mm',
          widthPt: PAGE_A5[0],
          heightPt: PAGE_A5[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
            ctx.strokeStyle = '#CBD5E1';
            ctx.lineWidth = Math.max(0.6, 0.5 * scale);
            for (let c = 0; c <= FLASHCARD_COLS; c += 1) {
              const x = (FLASHCARD_MARGIN + c * cellW) * scale;
              ctx.beginPath();
              ctx.moveTo(x, FLASHCARD_MARGIN * scale);
              ctx.lineTo(x, (PAGE_A5[1] - FLASHCARD_MARGIN) * scale);
              ctx.stroke();
            }
            for (let r = 0; r <= FLASHCARD_ROWS; r += 1) {
              const y = (FLASHCARD_MARGIN + r * cellH) * scale;
              ctx.beginPath();
              ctx.moveTo(FLASHCARD_MARGIN * scale, y);
              ctx.lineTo((PAGE_A5[0] - FLASHCARD_MARGIN) * scale, y);
              ctx.stroke();
            }

            const loaded = await Promise.all(slice.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))));
            const labelBandH = useOverlay ? mm(7.8) : mm(6.8);
            slice.forEach((item, i) => {
              const col = i % FLASHCARD_COLS;
              const row = Math.floor(i / FLASHCARD_COLS);
              const cellXPt = FLASHCARD_MARGIN + col * cellW;
              const cellYPt = FLASHCARD_MARGIN + row * cellH;
              const x = cellXPt * scale;
              const y = cellYPt * scale;
              drawCanvasImageFit(
                ctx,
                loaded[i],
                x + mm(1.4) * scale,
                y + mm(1.2) * scale,
                (cellW - mm(2.8)) * scale,
                (cellH - labelBandH - mm(2.2)) * scale
              );
              if (useViet) {
                const padX = mm(1.1);
                const maxW = cellW - padX * 2;
                const preferredUnit = mm(1.35) * profile.fontScale;
                let baseY = cellYPt + cellH - mm(2.2);
                let drawUnit = preferredUnit * vietMult;
                if (useOverlay) {
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    cellXPt + padX,
                    cellYPt + cellH - labelBandH + mm(0.2),
                    labelBandH - mm(0.6),
                    maxW,
                    preferredUnit,
                    overlayBlocks,
                    1.2,
                    fontSize
                  );
                  baseY = g.baselineY;
                  drawUnit = g.unit;
                }
                const fu = fitVietUnit(item.en, maxW - mm(0.8), drawUnit, mm(0.65));
                const textW = measureVietTextUnits(item.en) * fu;
                drawVietTextCanvas(
                  ctx,
                  item.en,
                  (cellXPt + (cellW - textW) / 2) * scale,
                  baseY * scale,
                  fu * scale,
                  { color: '#0F172A', strokeWidthUnits: vietStroke }
                );
              } else if (useOverlay) {
                const padX = mm(1.1);
                const maxW = cellW - padX * 2;
                const preferredUnit = mm(1.35) * profile.fontScale;
                const g = drawGuidelineOverlayCanvas(
                  ctx,
                  scale,
                  cellXPt + padX,
                  cellYPt + cellH - labelBandH + mm(0.2),
                  labelBandH - mm(0.6),
                  maxW,
                  preferredUnit,
                  overlayBlocks,
                  1.2,
                  fontSize
                );
                const fitted = fitCanvasText(
                  ctx,
                  item.en,
                  (maxW - mm(0.8)) * scale,
                  g.unit * 1.92 * customCal.scaleMult * scale,
                  5.5 * scale,
                  (px) => `${px}px ${activeFontFamily}`
                );
                ctx.fillStyle = '#0F172A';
                ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                ctx.textAlign = 'center';
                ctx.fillText(
                  fitted.text,
                  x + (cellW * scale) / 2,
                  (g.baselineY - customCal.offsetCells * g.unit) * scale
                );
              } else {
                const fitted = fitCanvasText(
                  ctx,
                  item.en,
                  (cellW - mm(2.2)) * scale,
                  11.5 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                  6.5 * scale,
                  (px) => `${px}px ${activeFontFamily}`
                );
                ctx.fillStyle = '#0F172A';
                ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                ctx.textAlign = 'center';
                ctx.fillText(
                  fitted.text,
                  x + (cellW * scale) / 2,
                  y + (cellH - mm(2.1) - customCal.nonGridShiftPt) * scale
                );
              }
            });
            ctx.textAlign = 'left';
          },
        });
      }
    } else if (type === 'anagram') {
      const left = mm(6);
      const right = PAGE_A5[0] - mm(6);
      const perPage = profile.anagramPerPage || ANAGRAM_PER_PAGE;
      const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - mm(6);
      const rowH = usableH / perPage;
      for (let start = 0, p = 1; start < plan.anagramEntries.length; start += perPage, p += 1) {
        const slice = plan.anagramEntries.slice(start, start + perPage);
        pages.push({
          id: `anagram-${plan.version}-${p}-${answerKey}-${difficulty}-${useOverlay}-${overlayBlocks}-${fontSize}`,
          worksheetType: 'anagram',
          title: `Picture Anagram${answerKey ? ' (Key)' : ''} — Page ${p}`,
          paperLabel: `A5 Portrait · ${perPage} items / page`,
          widthPt: PAGE_A5[0],
          heightPt: PAGE_A5[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
            drawCanvasHeading(
              ctx,
              scale,
              answerKey ? 'Answer Key — Picture Anagram' : 'Unscramble the letters and write.',
              p,
              plan.version,
              config.versionCount,
              left,
              right,
              activeFontFamily
            );
            const loaded = await Promise.all(
              slice.map((e) => loadHtmlImage(images.get(numericId(e.item.imageId))))
            );
            slice.forEach((entry, i) => {
              const rowTop = WORKSHEET_TOP + WORKSHEET_HEADER_H + i * rowH;
              const centerY = rowTop + rowH / 2;
              ctx.fillStyle = '#1E293B';
              ctx.font = `${13 * profile.fontScale * scale}px ${activeFontFamily}`;
              ctx.fillText(`${start + i + 1}.`, left * scale, (centerY + 4) * scale);

              const imgX = left + mm(9);
              const imgW = mm(16);
              drawCanvasImageFit(
                ctx,
                loaded[i],
                imgX * scale,
                (rowTop + mm(1.2)) * scale,
                imgW * scale,
                (rowH - mm(2.4)) * scale
              );

              const clueX = imgX + imgW + mm(4);
              const clueMaxW = mm(48);
              if (useViet) {
                const cu = fitVietUnit(entry.scrambled, clueMaxW, mm(2.0) * profile.fontScale * vietMult, mm(1.0));
                drawVietTextCanvas(ctx, entry.scrambled, clueX * scale, (centerY + 3.5) * scale, cu * scale, {
                  color: '#334155',
                  strokeWidthUnits: vietStroke,
                });
              } else {
                const fittedClue = fitCanvasText(
                  ctx,
                  entry.scrambled,
                  clueMaxW * scale,
                  13.5 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                  8.5 * scale,
                  (px) => `${px}px ${activeFontFamily}`
                );
                ctx.fillStyle = '#334155';
                ctx.font = `${fittedClue.sizePx}px ${activeFontFamily}`;
                ctx.fillText(fittedClue.text, clueX * scale, (centerY + 4 - customCal.nonGridShiftPt) * scale);
              }

              const lineX = clueX + clueMaxW + mm(4);
              const ansW = right - lineX;
              if (useOverlay) {
                const g = drawGuidelineOverlayCanvas(
                  ctx,
                  scale,
                  lineX,
                  rowTop + mm(1.0),
                  rowH - mm(2.0),
                  ansW,
                  mm(2.1) * profile.fontScale,
                  overlayBlocks,
                  1.5,
                  fontSize
                );
                if (useViet) {
                  if (answerKey) {
                    const au = fitVietUnit(entry.item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.9));
                    drawVietTextCanvas(
                      ctx,
                      entry.item.en,
                      (lineX + g.gridUnit * 0.4) * scale,
                      g.baselineY * scale,
                      au * scale,
                      { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                    );
                  } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
                    drawVietTextCanvas(
                      ctx,
                      entry.item.en.trim()[0],
                      (lineX + g.gridUnit * 0.4) * scale,
                      g.baselineY * scale,
                      g.unit * scale,
                      { color: '#64748B', strokeWidthUnits: vietStroke }
                    );
                  }
                } else {
                  const customOverlayY = (g.baselineY - customCal.offsetCells * g.unit) * scale;
                  if (answerKey) {
                    const fittedAns = fitCanvasText(
                      ctx,
                      entry.item.en,
                      (ansW - g.gridUnit * 0.8) * scale,
                      g.unit * 1.92 * customCal.scaleMult * scale,
                      7.5 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    ctx.fillStyle = '#1D4ED8';
                    ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                    ctx.fillText(fittedAns.text, (lineX + g.gridUnit * 0.4) * scale, customOverlayY);
                  } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
                    ctx.fillStyle = '#64748B';
                    ctx.font = `${g.unit * 1.92 * customCal.scaleMult * scale}px ${activeFontFamily}`;
                    ctx.fillText(entry.item.en.trim()[0], (lineX + g.gridUnit * 0.4) * scale, customOverlayY);
                  }
                }
              } else if (answerKey) {
                if (useViet) {
                  const au = fitVietUnit(entry.item.en, ansW, mm(2.0) * profile.fontScale * vietMult, mm(1.0));
                  drawVietTextCanvas(ctx, entry.item.en, lineX * scale, (centerY + 3.5) * scale, au * scale, {
                    color: '#1D4ED8',
                    strokeWidthUnits: vietStroke,
                  });
                } else {
                  const fittedAns = fitCanvasText(
                    ctx,
                    entry.item.en,
                    ansW * scale,
                    13.5 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                    8.5 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#1D4ED8';
                  ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(fittedAns.text, lineX * scale, (centerY + 4 - customCal.nonGridShiftPt) * scale);
                }
              } else {
                let drawLineStart = lineX;
                if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
                  const firstChar = entry.item.en.trim()[0];
                  if (useViet) {
                    const cw =
                      drawVietTextCanvas(
                        ctx,
                        firstChar,
                        lineX * scale,
                        (centerY + 3.5) * scale,
                        mm(1.9) * profile.fontScale * vietMult * scale,
                        { color: '#64748B', strokeWidthUnits: vietStroke }
                      ) / scale;
                    drawLineStart = lineX + cw + mm(1.2);
                  } else {
                    ctx.fillStyle = '#64748B';
                    ctx.font = `${13 * profile.fontScale * stdMult * customCal.scaleMult * scale}px ${activeFontFamily}`;
                    ctx.fillText(firstChar, lineX * scale, (centerY + 4 - customCal.nonGridShiftPt) * scale);
                    drawLineStart = lineX + ctx.measureText(firstChar).width / scale + mm(1.2);
                  }
                }
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = Math.max(0.7, 0.65 * scale);
                ctx.beginPath();
                ctx.moveTo(drawLineStart * scale, (centerY + 5) * scale);
                ctx.lineTo(right * scale, (centerY + 5) * scale);
                ctx.stroke();
              }
            });
          },
        });
      }
    } else if (type === 'word-scramble') {
      const left = mm(10);
      const right = PAGE_A4_PORTRAIT[0] - mm(10);
      const headerBottom = mm(22);
      const perPage = profile.wordScramblePerPage || WORD_SCRAMBLE_PER_PAGE;
      const usableH = PAGE_A4_PORTRAIT[1] - headerBottom - mm(10);
      const rowH = usableH / perPage;
      const tilesStartX = left + mm(9);
      const tilesMaxW = mm(95);
      const ansX = left + mm(109);
      const ansMaxW = right - ansX;

      for (
        let start = 0, p = 1;
        start < plan.wordScrambleEntries.length;
        start += perPage, p += 1
      ) {
        const slice = plan.wordScrambleEntries.slice(start, start + perPage);
        pages.push({
          id: `word-scramble-${plan.version}-${p}-${answerKey}-${config.wordScrambleShowHint}-${difficulty}`,
          worksheetType: 'word-scramble',
          title: `Word Scramble${answerKey ? ' (Key)' : ''} — Page ${p}`,
          paperLabel: `A4 Portrait · ${perPage} items / page · Letter Tiles`,
          widthPt: PAGE_A4_PORTRAIT[0],
          heightPt: PAGE_A4_PORTRAIT[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A4_PORTRAIT[0], PAGE_A4_PORTRAIT[1], widthPx);
            const topLine = answerKey
              ? 'Answer Key — Word Scramble'
              : config.studentHeader || 'Full name: ________________________   Class: __________';
            ctx.fillStyle = '#0F172A';
            ctx.font = `600 ${10.5 * scale}px DejaVuWorksheet, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(topLine, left * scale, mm(11) * scale);

            const meta = config.versionCount > 1 ? `Code ${plan.version} · Page ${p}` : `Page ${p}`;
            ctx.fillStyle = '#64748B';
            ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(meta, right * scale, mm(11) * scale);
            ctx.textAlign = 'left';

            const subtitle = answerKey
              ? 'Unscrambled vocabulary answers (matches letter tile order).'
              : 'Unscramble the letter tiles and write the correct English word.';
            ctx.fillStyle = '#334155';
            ctx.font = `${11.5 * profile.fontScale * scale}px ${activeFontFamily}`;
            ctx.fillText(subtitle, left * scale, mm(17.5) * scale);

            ctx.strokeStyle = '#CBD5E1';
            ctx.lineWidth = Math.max(0.6, 0.6 * scale);
            ctx.beginPath();
            ctx.moveTo(left * scale, mm(20.5) * scale);
            ctx.lineTo(right * scale, mm(20.5) * scale);
            ctx.stroke();

            slice.forEach((entry, i) => {
              const rowTop = headerBottom + i * rowH;
              const hasHint = config.wordScrambleShowHint && entry.item.vi.trim().length > 0;
              const centerY = hasHint ? rowTop + rowH * 0.42 : rowTop + rowH * 0.5;

              if (i > 0) {
                ctx.save();
                ctx.setLineDash([3 * scale, 2.5 * scale]);
                ctx.strokeStyle = '#E2E8F0';
                ctx.lineWidth = Math.max(0.5, 0.45 * scale);
                ctx.beginPath();
                ctx.moveTo(left * scale, rowTop * scale);
                ctx.lineTo(right * scale, rowTop * scale);
                ctx.stroke();
                ctx.restore();
              }

              ctx.fillStyle = '#334155';
              ctx.font = `700 ${10.5 * profile.fontScale * scale}px sans-serif`;
              ctx.textAlign = 'left';
              ctx.fillText(`${start + i + 1}.`, left * scale, (centerY + 3.5) * scale);

              // Scrambled letter tiles
              const tokenGroups = splitScrambleTokens(entry.scrambled);
              const totalChars = tokenGroups.reduce((sum, g) => sum + g.length, 0);
              const wordGaps = Math.max(0, tokenGroups.length - 1);
              const charGaps = Math.max(0, totalChars - tokenGroups.length);

              let tileSize = mm(6.2 * Math.min(1.14, Math.max(0.88, profile.fontScale)));
              let tileGap = mm(1.1);
              let wordGap = mm(3.8);
              const rawW = totalChars * tileSize + charGaps * tileGap + wordGaps * wordGap;
              if (rawW > tilesMaxW && rawW > 0) {
                const shrink = tilesMaxW / rawW;
                tileSize = Math.max(mm(3.6), tileSize * shrink);
                tileGap = Math.max(mm(0.55), tileGap * shrink);
                wordGap = Math.max(mm(2.1), wordGap * shrink);
              }

              const tileTop = centerY - tileSize / 2;
              let cursorX = tilesStartX;
              tokenGroups.forEach((group, gIdx) => {
                if (gIdx > 0) cursorX += wordGap;
                group.forEach((ch, cIdx) => {
                  if (cIdx > 0) cursorX += tileGap;
                  ctx.fillStyle = '#F8FAFC';
                  ctx.strokeStyle = '#64748B';
                  ctx.lineWidth = Math.max(0.6, 0.55 * scale);
                  ctx.beginPath();
                  ctx.roundRect(
                    cursorX * scale,
                    tileTop * scale,
                    tileSize * scale,
                    tileSize * scale,
                    mm(1.0) * scale
                  );
                  ctx.fill();
                  ctx.stroke();

                  if (useViet) {
                    const tileUnit = Math.min(
                      tileSize * 0.28,
                      fitVietUnit(ch, tileSize * 0.78, tileSize * 0.28, mm(0.9))
                    );
                    const chW = measureVietTextUnits(ch) * tileUnit;
                    drawVietTextCanvas(
                      ctx,
                      ch,
                      (cursorX + (tileSize - chW) / 2) * scale,
                      (tileTop + tileSize * 0.66) * scale,
                      tileUnit * scale,
                      { color: '#0F172A' }
                    );
                  } else {
                    const fontSize = Math.min(14, Math.max(7.5, tileSize * 0.68));
                    ctx.fillStyle = '#0F172A';
                    ctx.font = `${fontSize * scale}px ${activeFontFamily}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ch, (cursorX + tileSize / 2) * scale, (tileTop + tileSize / 2 + 0.4) * scale);
                  }
                  cursorX += tileSize;
                });
              });
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';

              // Optional Vietnamese hint
              if (hasHint) {
                const hintText = `(${entry.item.vi.trim()})`;
                const fittedHint = fitCanvasText(
                  ctx,
                  hintText,
                  tilesMaxW * scale,
                  8.4 * profile.fontScale * scale,
                  6.5 * scale,
                  (px) => `${px}px DejaVuWorksheet, sans-serif`
                );
                ctx.fillStyle = '#64748B';
                ctx.font = `${fittedHint.sizePx}px DejaVuWorksheet, sans-serif`;
                ctx.fillText(
                  fittedHint.text,
                  tilesStartX * scale,
                  Math.min(rowTop + rowH - mm(1.4), tileTop + tileSize + mm(3.8)) * scale
                );
              }

              // Right side: Guideline Overlay, answer key, letter-count slots, or blank line
              if (useOverlay) {
                const g = drawGuidelineOverlayCanvas(
                  ctx,
                  scale,
                  ansX,
                  rowTop + mm(1.4),
                  rowH - mm(2.8),
                  ansMaxW,
                  mm(2.2) * profile.fontScale,
                  overlayBlocks,
                  1.5,
                  fontSize
                );
                if (useViet) {
                  if (answerKey) {
                    const au = fitVietUnit(entry.item.en, ansMaxW - g.gridUnit * 0.8, g.unit, mm(1.0));
                    drawVietTextCanvas(
                      ctx,
                      entry.item.en,
                      (ansX + g.gridUnit * 0.4) * scale,
                      g.baselineY * scale,
                      au * scale,
                      { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                    );
                  } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
                    drawVietTextCanvas(
                      ctx,
                      entry.item.en.trim()[0],
                      (ansX + g.gridUnit * 0.4) * scale,
                      g.baselineY * scale,
                      g.unit * scale,
                      { color: '#64748B', strokeWidthUnits: vietStroke }
                    );
                  }
                } else {
                  const customOverlayY = (g.baselineY - customCal.offsetCells * g.unit) * scale;
                  if (answerKey) {
                    const fittedAns = fitCanvasText(
                      ctx,
                      entry.item.en,
                      (ansMaxW - g.gridUnit * 0.8) * scale,
                      g.unit * 1.92 * customCal.scaleMult * scale,
                      7.5 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    ctx.fillStyle = '#1D4ED8';
                    ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                    ctx.fillText(fittedAns.text, (ansX + g.gridUnit * 0.4) * scale, customOverlayY);
                  } else if (profile.revealFirstLetter && entry.item.en.trim().length > 0) {
                    ctx.fillStyle = '#64748B';
                    ctx.font = `${g.unit * 1.92 * customCal.scaleMult * scale}px ${activeFontFamily}`;
                    ctx.fillText(entry.item.en.trim()[0], (ansX + g.gridUnit * 0.4) * scale, customOverlayY);
                  }
                }
              } else if (answerKey) {
                if (useViet) {
                  const au = fitVietUnit(entry.item.en, ansMaxW, mm(2.1) * profile.fontScale * vietMult, mm(1.0));
                  drawVietTextCanvas(ctx, entry.item.en, ansX * scale, (centerY + mm(2.2)) * scale, au * scale, {
                    color: '#1D4ED8',
                    strokeWidthUnits: vietStroke,
                  });
                } else {
                  const fittedAns = fitCanvasText(
                    ctx,
                    entry.item.en,
                    ansMaxW * scale,
                    13 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                    8 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#1D4ED8';
                  ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(fittedAns.text, ansX * scale, (centerY + 3.5 - customCal.nonGridShiftPt) * scale);
                }

                ctx.strokeStyle = '#BFDBFE';
                ctx.lineWidth = Math.max(0.5, 0.45 * scale);
                ctx.beginPath();
                ctx.moveTo(ansX * scale, (centerY + mm(2.6)) * scale);
                ctx.lineTo(right * scale, (centerY + mm(2.6)) * scale);
                ctx.stroke();
              } else if (!profile.wordScrambleLetterSlots) {
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = Math.max(0.75, 0.75 * scale);
                ctx.beginPath();
                ctx.moveTo(ansX * scale, (centerY + mm(2.6)) * scale);
                ctx.lineTo(right * scale, (centerY + mm(2.6)) * scale);
                ctx.stroke();
              } else {
                const ansGroups = splitAnswerTokens(entry.item.en);
                const ansChars = ansGroups.reduce((sum, g) => sum + g.length, 0);
                const ansWordGaps = Math.max(0, ansGroups.length - 1);
                const ansCharGaps = Math.max(0, ansChars - ansGroups.length);

                let slotW = mm(5.0 * Math.min(1.12, profile.fontScale));
                let slotGap = mm(1.2);
                let slotWordGap = mm(4.2);
                const rawAnsW = ansChars * slotW + ansCharGaps * slotGap + ansWordGaps * slotWordGap;
                if (rawAnsW > ansMaxW && rawAnsW > 0) {
                  const shrink = ansMaxW / rawAnsW;
                  slotW = Math.max(mm(2.6), slotW * shrink);
                  slotGap = Math.max(mm(0.55), slotGap * shrink);
                  slotWordGap = Math.max(mm(2.0), slotWordGap * shrink);
                }

                const slotY = centerY + mm(2.6);
                let ax = ansX;
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = Math.max(0.75, 0.75 * scale);
                ansGroups.forEach((group, gIdx) => {
                  if (gIdx > 0) ax += slotWordGap;
                  group.forEach((ch, cIdx) => {
                    if (cIdx > 0) ax += slotGap;
                    ctx.beginPath();
                    ctx.moveTo(ax * scale, slotY * scale);
                    ctx.lineTo((ax + slotW) * scale, slotY * scale);
                    ctx.stroke();
                    if (profile.revealFirstLetter && cIdx === 0) {
                      if (useViet) {
                        const cu = fitVietUnit(ch, slotW * 0.9, mm(2.0), mm(1.0));
                        const cw = measureVietTextUnits(ch) * cu;
                        drawVietTextCanvas(
                          ctx,
                          ch,
                          (ax + (slotW - cw) / 2) * scale,
                          (slotY - mm(0.8)) * scale,
                          cu * scale,
                          { color: '#64748B' }
                        );
                      } else {
                        const cueSize = Math.min(13.5, Math.max(8, slotW * 0.78));
                        ctx.fillStyle = '#64748B';
                        ctx.font = `${cueSize * scale}px ${activeFontFamily}`;
                        ctx.textAlign = 'center';
                        ctx.fillText(ch, (ax + slotW / 2) * scale, (slotY - mm(1.0)) * scale);
                        ctx.textAlign = 'left';
                      }
                    }
                    ax += slotW;
                  });
                });
              }
            });
          },
        });
      }
    } else if (type === 'matching') {
      const left = WORKSHEET_LEFT;
      const right = PAGE_A5[0] - WORKSHEET_RIGHT;
      const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - WORKSHEET_BOTTOM;
      const rowH = usableH / 6;
      plan.matchingOrders.forEach((terms, gIdx) => {
        const slice = plan.imageOrder.slice(gIdx * 6, gIdx * 6 + 6);
        pages.push({
          id: `matching1-${plan.version}-${gIdx}-${answerKey}`,
          worksheetType: 'matching',
          title: `Matching 1${answerKey ? ' (Key)' : ''} — Set ${gIdx + 1}`,
          paperLabel: 'A5 Portrait · 148 × 210 mm',
          widthPt: PAGE_A5[0],
          heightPt: PAGE_A5[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
            drawCanvasHeading(
              ctx,
              scale,
              answerKey ? 'Answer Key — Look and Match' : 'Task 1. Look and Match.',
              gIdx + 1,
              plan.version,
              config.versionCount,
              left,
              right,
              activeFontFamily
            );
            const loaded = await Promise.all(slice.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))));
            const leftDotX = left + mm(42);
            const rightDotX = left + mm(78);
            const termX = rightDotX + mm(5);

            slice.forEach((item, i) => {
              const top = WORKSHEET_TOP + WORKSHEET_HEADER_H + i * rowH;
              const centerY = top + rowH / 2;
              ctx.fillStyle = '#1E293B';
              ctx.font = `700 ${12 * scale}px sans-serif`;
              ctx.fillText(`${i + 1}.`, left * scale, (centerY + 4) * scale);

              drawCanvasImageFit(
                ctx,
                loaded[i],
                (left + mm(9)) * scale,
                (top + mm(2.5)) * scale,
                mm(28) * scale,
                (rowH - mm(5)) * scale
              );

              ctx.fillStyle = '#0F172A';
              ctx.beginPath();
              ctx.arc(leftDotX * scale, centerY * scale, 2.5 * scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(rightDotX * scale, centerY * scale, 2.5 * scale, 0, Math.PI * 2);
              ctx.fill();

              const term = terms[i];
              if (term) {
                if (useViet) {
                  const prefix = `${term.letter}. `;
                  ctx.font = `700 ${11 * scale}px sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = termX + prefixW;
                  const wordMaxW = Math.max(mm(12), right - wordX);
                  let wordBaseY = centerY + 3;
                  let drawUnit = mm(2.1) * vietMult;
                  let padX = 0;
                  if (useOverlay) {
                    const g = drawGuidelineOverlayCanvas(
                      ctx,
                      scale,
                      wordX,
                      top + mm(3.0),
                      rowH - mm(6.0),
                      wordMaxW,
                      mm(2.2),
                      overlayBlocks,
                      1.5,
                      fontSize
                    );
                    wordBaseY = g.baselineY;
                    drawUnit = g.unit;
                    padX = g.gridUnit * 0.35;
                  }
                  ctx.fillStyle = '#1E293B';
                  ctx.fillText(prefix, termX * scale, wordBaseY * scale);
                  const fu = fitVietUnit(term.item.en, wordMaxW - mm(1), drawUnit, mm(0.95));
                  drawVietTextCanvas(
                    ctx,
                    term.item.en,
                    (wordX + padX) * scale,
                    wordBaseY * scale,
                    fu * scale,
                    { color: '#0F172A', strokeWidthUnits: vietStroke }
                  );
                } else if (useOverlay) {
                  const prefix = `${term.letter}. `;
                  ctx.font = `700 ${11 * scale}px sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = termX + prefixW;
                  const wordMaxW = Math.max(mm(12), right - wordX);
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    wordX,
                    top + mm(3.0),
                    rowH - mm(6.0),
                    wordMaxW,
                    mm(2.2),
                    overlayBlocks,
                    1.5,
                    fontSize
                  );
                  ctx.fillStyle = '#1E293B';
                  ctx.fillText(prefix, termX * scale, g.baselineY * scale);
                  const fitted = fitCanvasText(
                    ctx,
                    term.item.en,
                    (wordMaxW - mm(1)) * scale,
                    g.unit * 1.92 * customCal.scaleMult * scale,
                    7.5 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(
                    fitted.text,
                    (wordX + g.gridUnit * 0.35) * scale,
                    (g.baselineY - customCal.offsetCells * g.unit) * scale
                  );
                } else {
                  const label = `${term.letter}. ${term.item.en}`;
                  const fitted = fitCanvasText(
                    ctx,
                    label,
                    (right - termX) * scale,
                    14 * stdMult * customCal.scaleMult * scale,
                    8.5 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(fitted.text, termX * scale, (centerY + 4 - customCal.nonGridShiftPt) * scale);
                }
              }

              if (answerKey) {
                const targetIdx = terms.findIndex((t) => t.item.uid === item.uid);
                if (targetIdx >= 0) {
                  const targetY = WORKSHEET_TOP + WORKSHEET_HEADER_H + targetIdx * rowH + rowH / 2;
                  ctx.strokeStyle = '#1D4ED8';
                  ctx.lineWidth = Math.max(1.2, 1.1 * scale);
                  ctx.beginPath();
                  ctx.moveTo(leftDotX * scale, centerY * scale);
                  ctx.lineTo(rightDotX * scale, targetY * scale);
                  ctx.stroke();
                }
              }
            });
          },
        });
      });
    } else if (type === 'matching-2') {
      const cardW = (matching2Width() - MATCHING2_LAYOUT.cardGap * 4) / 5;
      const cols = matching2Columns();
      plan.matching2.forEach((groups, pIdx) => {
        pages.push({
          id: `matching2-${plan.version}-${pIdx}-${answerKey}`,
          worksheetType: 'matching-2',
          title: `Matching 2${answerKey ? ' (Key)' : ''} — Page ${pIdx + 1}`,
          paperLabel: 'A5 Portrait · 7 mm L / 3.2 mm R',
          widthPt: PAGE_A5[0],
          heightPt: PAGE_A5[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
            drawCanvasHeading(
              ctx,
              scale,
              answerKey ? 'Answer Key — Picture Letter Match' : 'Task 2. Write the picture letter.',
              pIdx + 1,
              plan.version,
              config.versionCount,
              MATCHING2_LEFT,
              PAGE_A5[0] - MATCHING2_RIGHT,
              activeFontFamily
            );

            for (let gIdx = 0; gIdx < groups.length; gIdx += 1) {
              const group = groups[gIdx];
              const loaded = await Promise.all(
                group.pictures.map((it) => loadHtmlImage(images.get(numericId(it.imageId))))
              );
              group.pictures.forEach((_item, i) => {
                const col = i % 5;
                const row = Math.floor(i / 5);
                const x = (MATCHING2_LEFT + col * (cardW + MATCHING2_LAYOUT.cardGap)) * scale;
                const y = (group.geometry.top + row * (MATCHING2_LAYOUT.cardHeight + MATCHING2_LAYOUT.cardGap)) * scale;
                const w = cardW * scale;
                const h = MATCHING2_LAYOUT.cardHeight * scale;

                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#1E293B';
                ctx.lineWidth = Math.max(0.7, DASH.thickness * scale);
                ctx.setLineDash([DASH.on * scale, DASH.off * scale]);
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, mm(2) * scale);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                drawCanvasImageFit(
                  ctx,
                  loaded[i],
                  x + MATCHING2_LAYOUT.cardPadding * scale,
                  y + MATCHING2_LAYOUT.cardPadding * scale,
                  w - MATCHING2_LAYOUT.cardPadding * 2 * scale,
                  MATCHING2_LAYOUT.imageHeight * scale
                );

                ctx.fillStyle = '#0F172A';
                ctx.font = `700 ${MATCHING2_LAYOUT.letterSize * scale}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(String.fromCharCode(65 + i), x + w / 2, y + h - mm(1) * scale);
              });

              // Dashed column dividers
              const populatedCols = Math.min(3, group.prompts.length);
              ctx.save();
              ctx.setLineDash([DASH.on * scale, DASH.off * scale]);
              ctx.strokeStyle = '#94A3B8';
              ctx.lineWidth = Math.max(0.6, 0.55 * scale);
              for (let d = 0; d < populatedCols - 1; d += 1) {
                const divX = (cols[d].start + cols[d].width + mm(1)) * scale;
                ctx.beginPath();
                ctx.moveTo(divX, group.geometry.promptTop * scale);
                ctx.lineTo(
                  divX,
                  (group.geometry.promptTop + group.geometry.promptRows * MATCHING2_LAYOUT.promptRowHeight) * scale
                );
                ctx.stroke();
              }
              ctx.restore();

              ctx.textAlign = 'left';
              group.prompts.forEach((item, promptIdx) => {
                const colIdx = promptIdx % 3;
                const rowIdx = Math.floor(promptIdx / 3);
                const col = cols[colIdx];
                const picIdx = group.pictures.findIndex((p) => p.uid === item.uid);
                const letter = picIdx >= 0 ? String.fromCharCode(65 + picIdx) : '?';
                const rowTopY = group.geometry.promptTop + rowIdx * MATCHING2_LAYOUT.promptRowHeight;
                const baseY = rowTopY + mm(4.8);
                if (useViet) {
                  const prefix = answerKey ? `${promptIdx + 1}. [${letter}] ` : `${promptIdx + 1}. ___ `;
                  ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = col.start + prefixW;
                  const wordW = Math.max(mm(8), col.width - prefixW - mm(1.2));
                  let drawBaseY = baseY;
                  let drawUnit = mm(1.35) * vietMult;
                  let padX = 0;
                  if (useOverlay) {
                    const g = drawGuidelineOverlayCanvas(
                      ctx,
                      scale,
                      wordX,
                      rowTopY + mm(0.3),
                      MATCHING2_LAYOUT.promptRowHeight - mm(0.6),
                      wordW,
                      mm(1.35),
                      overlayBlocks,
                      1.2,
                      fontSize
                    );
                    drawBaseY = g.baselineY;
                    drawUnit = g.unit;
                    padX = g.gridUnit * 0.25;
                  }
                  ctx.fillStyle = answerKey ? '#1D4ED8' : '#1E293B';
                  ctx.fillText(prefix, col.start * scale, drawBaseY * scale);
                  const fu = fitVietUnit(item.en, wordW - mm(0.6), drawUnit, mm(0.65));
                  drawVietTextCanvas(
                    ctx,
                    item.en,
                    (wordX + padX) * scale,
                    drawBaseY * scale,
                    fu * scale,
                    { color: answerKey ? '#1D4ED8' : '#0F172A', strokeWidthUnits: vietStroke }
                  );
                } else if (useOverlay) {
                  const prefix = answerKey ? `${promptIdx + 1}. [${letter}] ` : `${promptIdx + 1}. ___ `;
                  ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = col.start + prefixW;
                  const wordW = Math.max(mm(8), col.width - prefixW - mm(1.2));
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    wordX,
                    rowTopY + mm(0.3),
                    MATCHING2_LAYOUT.promptRowHeight - mm(0.6),
                    wordW,
                    mm(1.35),
                    overlayBlocks,
                    1.2,
                    fontSize
                  );
                  ctx.fillStyle = answerKey ? '#1D4ED8' : '#1E293B';
                  ctx.fillText(prefix, col.start * scale, g.baselineY * scale);
                  const fitted = fitCanvasText(
                    ctx,
                    item.en,
                    (wordW - mm(0.6)) * scale,
                    g.unit * 1.92 * customCal.scaleMult * scale,
                    5.5 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = answerKey ? '#1D4ED8' : '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(
                    fitted.text,
                    (wordX + g.gridUnit * 0.25) * scale,
                    (g.baselineY - customCal.offsetCells * g.unit) * scale
                  );
                } else {
                  const text = answerKey ? `${promptIdx + 1}. [${letter}] ${item.en}` : `${promptIdx + 1}. ____ ${item.en}`;
                  const fitted = fitCanvasText(
                    ctx,
                    text,
                    (col.width - mm(1.5)) * scale,
                    MATCHING2_LAYOUT.promptSize * stdMult * customCal.scaleMult * scale,
                    MATCHING2_LAYOUT.promptMinSize * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = answerKey ? '#1D4ED8' : '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(fitted.text, col.start * scale, (baseY - customCal.nonGridShiftPt) * scale);
                }
              });

              if (gIdx === 0 && groups.length > 1) {
                const sepY = (group.geometry.top + group.geometry.height + mm(2)) * scale;
                ctx.save();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#94A3B8';
                ctx.beginPath();
                ctx.moveTo(MATCHING2_LEFT * scale, sepY);
                ctx.lineTo((PAGE_A5[0] - MATCHING2_RIGHT) * scale, sepY);
                ctx.stroke();
                ctx.restore();
              }
            }
          },
        });
      });
    } else if (type === 'matching-3' && plan.matching3.items.length > 0) {
      const m3 = plan.matching3;
      const pageSize = m3.twoUp ? PAGE_A4_LANDSCAPE : PAGE_A5;
      const panelW = PAGE_A5[0];
      const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - WORKSHEET_BOTTOM;
      const rowH = usableH / Math.max(m3.items.length, 6);
      pages.push({
        id: `matching3-${plan.version}-${m3.twoUp}-${answerKey}`,
        worksheetType: 'matching-3',
        title: `Matching 3${m3.twoUp ? ' (2-Up A4)' : ''}${answerKey ? ' (Key)' : ''}`,
        paperLabel: m3.twoUp ? 'A4 Landscape · 2-Up Cut Sheet' : 'A5 Portrait · 148 × 210 mm',
        widthPt: pageSize[0],
        heightPt: pageSize[1],
        draw: async (canvas, widthPx) => {
          await ensureFontReady();
          const { ctx, scale } = setupCanvas(canvas, pageSize[0], pageSize[1], widthPx);
          const loaded = await Promise.all(m3.items.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))));

          if (m3.twoUp) {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = '#94A3B8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(panelW * scale, mm(4) * scale);
            ctx.lineTo(panelW * scale, (pageSize[1] - mm(4)) * scale);
            ctx.stroke();
            ctx.restore();
          }

          m3.panels.forEach((terms, pIdx) => {
            const originX = pIdx * panelW;
            const left = originX + WORKSHEET_LEFT;
            const right = originX + panelW - WORKSHEET_RIGHT;
            drawCanvasHeading(
              ctx,
              scale,
              answerKey
                ? `Answer Key — Match${m3.twoUp ? (pIdx === 0 ? ' (Left)' : ' (Right)') : ''}`
                : 'Look and Match.',
              1,
              plan.version,
              config.versionCount,
              left,
              right,
              activeFontFamily
            );

            const leftDotX = left + mm(40);
            const rightDotX = left + mm(74);
            const termX = rightDotX + mm(4.5);

            m3.items.forEach((item, i) => {
              const top = WORKSHEET_TOP + WORKSHEET_HEADER_H + i * rowH;
              const centerY = top + rowH / 2;

              ctx.fillStyle = '#1E293B';
              ctx.font = `700 ${11 * scale}px sans-serif`;
              ctx.fillText(`${i + 1}.`, left * scale, (centerY + 3.5) * scale);

              drawCanvasImageFit(
                ctx,
                loaded[i],
                (left + mm(8)) * scale,
                (top + mm(1.5)) * scale,
                mm(27) * scale,
                (rowH - mm(3)) * scale
              );

              ctx.fillStyle = '#0F172A';
              ctx.beginPath();
              ctx.arc(leftDotX * scale, centerY * scale, 2.3 * scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(rightDotX * scale, centerY * scale, 2.3 * scale, 0, Math.PI * 2);
              ctx.fill();

              const term = terms[i];
              if (term) {
                if (useViet) {
                  const prefix = `${term.letter}. `;
                  ctx.font = `700 ${10 * scale}px sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = termX + prefixW;
                  const wordMaxW = Math.max(mm(12), right - wordX);
                  let wordBaseY = centerY + 2.8;
                  let drawUnit = mm(1.9) * vietMult;
                  let padX = 0;
                  if (useOverlay) {
                    const g = drawGuidelineOverlayCanvas(
                      ctx,
                      scale,
                      wordX,
                      top + mm(1.4),
                      rowH - mm(2.8),
                      wordMaxW,
                      mm(2.0),
                      overlayBlocks,
                      1.5,
                      fontSize
                    );
                    wordBaseY = g.baselineY;
                    drawUnit = g.unit;
                    padX = g.gridUnit * 0.3;
                  }
                  ctx.fillStyle = '#1E293B';
                  ctx.fillText(prefix, termX * scale, wordBaseY * scale);
                  const fu = fitVietUnit(term.item.en, wordMaxW - mm(0.8), drawUnit, mm(0.85));
                  drawVietTextCanvas(
                    ctx,
                    term.item.en,
                    (wordX + padX) * scale,
                    wordBaseY * scale,
                    fu * scale,
                    { color: '#0F172A', strokeWidthUnits: vietStroke }
                  );
                } else if (useOverlay) {
                  const prefix = `${term.letter}. `;
                  ctx.font = `700 ${10 * scale}px sans-serif`;
                  const prefixW = ctx.measureText(prefix).width / scale;
                  const wordX = termX + prefixW;
                  const wordMaxW = Math.max(mm(12), right - wordX);
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    wordX,
                    top + mm(1.4),
                    rowH - mm(2.8),
                    wordMaxW,
                    mm(2.0),
                    overlayBlocks,
                    1.5,
                    fontSize
                  );
                  ctx.fillStyle = '#1E293B';
                  ctx.fillText(prefix, termX * scale, g.baselineY * scale);
                  const fitted = fitCanvasText(
                    ctx,
                    term.item.en,
                    (wordMaxW - mm(0.8)) * scale,
                    g.unit * 1.92 * customCal.scaleMult * scale,
                    7.2 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(
                    fitted.text,
                    (wordX + g.gridUnit * 0.3) * scale,
                    (g.baselineY - customCal.offsetCells * g.unit) * scale
                  );
                } else {
                  const label = `${term.letter}. ${term.item.en}`;
                  const fitted = fitCanvasText(
                    ctx,
                    label,
                    (right - termX) * scale,
                    12.5 * stdMult * customCal.scaleMult * scale,
                    8 * scale,
                    (px) => `${px}px ${activeFontFamily}`
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.font = `${fitted.sizePx}px ${activeFontFamily}`;
                  ctx.fillText(fitted.text, termX * scale, (centerY + 3.5 - customCal.nonGridShiftPt) * scale);
                }
              }

              if (answerKey) {
                const targetIdx = terms.findIndex((t) => t.item.uid === item.uid);
                if (targetIdx >= 0) {
                  const targetY = WORKSHEET_TOP + WORKSHEET_HEADER_H + targetIdx * rowH + rowH / 2;
                  ctx.strokeStyle = '#1D4ED8';
                  ctx.lineWidth = Math.max(1.1, 1.0 * scale);
                  ctx.beginPath();
                  ctx.moveTo(leftDotX * scale, centerY * scale);
                  ctx.lineTo(rightDotX * scale, targetY * scale);
                  ctx.stroke();
                }
              }
            });
          });
        },
      });
    } else if (type === 'typing-image') {
      const left = WORKSHEET_LEFT;
      const right = PAGE_A5[0] - WORKSHEET_RIGHT;
      const useGrid = Boolean(config.typingImageGridlines);
      const showSample = Boolean(config.typingImageShowSample);

      if (useGrid) {
        const cellMm: GridCellSize = config.typingImageGridSize === 2.5 ? 2.5 : 2;
        const blocks: GridBlockCount = config.typingImageGridBlocks === 5 ? 5 : 4;
        const aboveRows = textScale === 2 ? Math.max(blocks, 5) : blocks;
        const descenderCells = textScale === 2 ? 3 : 2;
        const totalRows = aboveRows + descenderCells;
        const gridUnit = mm(cellMm);
        const vietBaseUnit = gridUnit * textScale;
        const gridH = gridUnit * totalRows;
        const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - mm(6);
        const maxFitPerPage = Math.max(3, Math.floor(usableH / (gridH + mm(2.8))));
        const perPage = Math.min(profile.typing1GridPerPage || TYPING1_GRID_PER_PAGE, maxFitPerPage);
        const rowH = usableH / perPage;
        const gridFontSize = gridUnit * 1.92 * textScale * customCal.scaleMult;
        const gridBaselineShift = customCal.isCustom
          ? customCal.offsetCells * gridUnit * textScale
          : 0.4;
        const sizeTag = textScale === 2 ? ' · Normal 2×' : '';

        for (
          let start = 0, p = 1;
          start < plan.imageOrder.length;
          start += perPage, p += 1
        ) {
          const slice = plan.imageOrder.slice(start, start + perPage);
          pages.push({
            id: `typing1-grid-${plan.version}-${p}-${answerKey}-${showSample}-${cellMm}-${blocks}-${difficulty}-${fontSize}`,
            worksheetType: 'typing-image',
            title: `Typing 1 · Handwriting Grid${answerKey ? ' (Key)' : ''} — Page ${p}`,
            paperLabel: `A5 Portrait · ${perPage} items / page · ${blocks} ô ly (${cellMm}×${cellMm} mm${sizeTag})`,
            widthPt: PAGE_A5[0],
            heightPt: PAGE_A5[1],
            draw: async (canvas, widthPx) => {
              await ensureFontReady();
              const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
              const heading = answerKey
                ? `Answer Key — Handwriting (${blocks} ô ly · ${cellMm}×${cellMm} mm${sizeTag})`
                : showSample
                  ? 'Look at the picture, read the sample word, and write.'
                  : 'Look at the picture and write neatly on the lines.';
              drawCanvasHeading(
                ctx,
                scale,
                heading,
                p,
                plan.version,
                config.versionCount,
                left,
                right,
                activeFontFamily
              );

              const loaded = await Promise.all(slice.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))));
              slice.forEach((item, i) => {
                const rowTop = WORKSHEET_TOP + WORKSHEET_HEADER_H + i * rowH;
                const gridTop = rowTop + (rowH - gridH) / 2;
                const baselineY = gridTop + gridUnit * aboveRows;
                const imgX = left + mm(7);
                const imgW = mm(16);
                const gridX = imgX + imgW + mm(3);
                const cols = Math.max(blocks, Math.floor((right - gridX) / gridUnit));
                const gridW = cols * gridUnit;
                const gridRight = gridX + gridW;

                // Vertical square grid cells (major border every `blocks` cells -> 4×4 or 5×5 squares)
                for (let c = 0; c <= cols; c += 1) {
                  const vx = gridX + c * gridUnit;
                  const isMajor = c % blocks === 0 || c === cols;
                  ctx.strokeStyle = isMajor ? '#3B82F6' : '#CBDFF9';
                  ctx.lineWidth = Math.max(isMajor ? 0.75 : 0.4, (isMajor ? 0.58 : 0.25) * scale);
                  ctx.beginPath();
                  ctx.moveTo(vx * scale, gridTop * scale);
                  ctx.lineTo(vx * scale, (gridTop + gridH) * scale);
                  ctx.stroke();
                }

                // Horizontal lines from top row (r=0) down to bottom descender edge (r=totalRows)
                const blockMajorRow = aboveRows - blocks;
                const xHeightRow = aboveRows - textScale;
                for (let r = 0; r <= totalRows; r += 1) {
                  const hy = gridTop + r * gridUnit;
                  const isBlockMajor = r === blockMajorRow;
                  const isTopEdge = r === 0 && !isBlockMajor;
                  const isBaseline = r === aboveRows;
                  const isXHeight = r === xHeightRow;
                  const isBottomEdge = r === totalRows;

                  if (isBaseline) {
                    ctx.strokeStyle = '#1D4ED8';
                    ctx.lineWidth = Math.max(1.0, 0.85 * scale);
                  } else if (isBlockMajor) {
                    ctx.strokeStyle = '#3B82F6';
                    ctx.lineWidth = Math.max(0.75, 0.62 * scale);
                  } else if (isBottomEdge || isTopEdge) {
                    ctx.strokeStyle = '#93C5FD';
                    ctx.lineWidth = Math.max(0.5, 0.36 * scale);
                  } else if (isXHeight) {
                    ctx.strokeStyle = '#93C5FD';
                    ctx.lineWidth = Math.max(0.5, 0.35 * scale);
                  } else {
                    ctx.strokeStyle = '#CBDFF9';
                    ctx.lineWidth = Math.max(0.4, 0.25 * scale);
                  }

                  ctx.beginPath();
                  ctx.moveTo(gridX * scale, hy * scale);
                  ctx.lineTo(gridRight * scale, hy * scale);
                  ctx.stroke();
                }

                // Row number
                ctx.fillStyle = '#1E293B';
                ctx.font = `${Math.min(13.5, Math.max(9.5, gridUnit * 1.92 * (textScale === 2 ? 1.15 : 0.92))) * scale}px ${
                  customCal.isCustom ? 'DejaVuWorksheet, sans-serif' : activeFontFamily
                }`;
                ctx.textAlign = 'left';
                ctx.fillText(`${start + i + 1}.`, left * scale, baselineY * scale);

                // Picture
                drawCanvasImageFit(
                  ctx,
                  loaded[i],
                  imgX * scale,
                  (rowTop + mm(1.6)) * scale,
                  imgW * scale,
                  (rowH - mm(3.2)) * scale
                );

                // Sample word right after picture + faint tracing copy if space allows
                const useVietVector = useViet;
                const sampleStartX = gridX + gridUnit;
                let practiceStartX = sampleStartX;

                if (showSample) {
                  let sampleW = 0;
                  let fittedSampleText = item.en;
                  let fittedSampleSizePx = gridFontSize * scale;
                  let drawUnit = vietBaseUnit;

                  if (useVietVector) {
                    const rawUnits = Math.max(0.5, measureVietTextUnits(item.en));
                    const maxSampleW = gridW * (textScale === 2 ? 0.68 : 0.48);
                    if (rawUnits * vietBaseUnit > maxSampleW) {
                      drawUnit = Math.max(vietBaseUnit * 0.62, maxSampleW / rawUnits);
                    }
                    sampleW =
                      drawVietTextCanvas(
                        ctx,
                        item.en,
                        sampleStartX * scale,
                        baselineY * scale,
                        drawUnit * scale,
                        {
                          color: '#1E293B',
                          strokeWidthUnits: vietStroke,
                        }
                      ) / scale;
                  } else {
                    const fittedSample = fitCanvasText(
                      ctx,
                      item.en,
                      gridW * (textScale === 2 ? 0.64 : 0.44) * scale,
                      gridFontSize * scale,
                      7.2 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    fittedSampleText = fittedSample.text;
                    fittedSampleSizePx = fittedSample.sizePx;
                    ctx.fillStyle = '#1E293B';
                    ctx.font = `${fittedSampleSizePx}px ${activeFontFamily}`;
                    ctx.fillText(fittedSampleText, sampleStartX * scale, (baselineY - gridBaselineShift) * scale);
                    sampleW = ctx.measureText(fittedSampleText).width / scale;
                  }

                  // Snap separator tick to next clean vertical grid line
                  const sepCols = Math.ceil((sampleStartX + sampleW - gridX) / gridUnit) + 1;
                  const sepX = gridX + sepCols * gridUnit;
                  if (sepX < gridRight - gridUnit * 3) {
                    ctx.strokeStyle = '#60A5FA';
                    ctx.lineWidth = Math.max(0.65, 0.55 * scale);
                    ctx.beginPath();
                    ctx.moveTo(sepX * scale, (gridTop + gridUnit * 0.4) * scale);
                    ctx.lineTo(sepX * scale, (gridTop + gridH - gridUnit * 0.4) * scale);
                    ctx.stroke();
                  }

                  practiceStartX = sepX + gridUnit;
                  const remainingAfterSample = gridRight - practiceStartX;
                  if (!answerKey && remainingAfterSample >= sampleW * (textScale === 2 ? 1.12 : 1.9) + gridUnit * 2) {
                    if (useVietVector) {
                      drawVietTextCanvas(
                        ctx,
                        item.en,
                        practiceStartX * scale,
                        baselineY * scale,
                        drawUnit * scale,
                        {
                          color: '#94A3B8',
                          dashed: true,
                          strokeWidthUnits: vietStroke,
                        }
                      );
                    } else {
                      ctx.fillStyle = '#CBD5E1';
                      ctx.font = `${fittedSampleSizePx}px ${activeFontFamily}`;
                      ctx.fillText(fittedSampleText, practiceStartX * scale, (baselineY - gridBaselineShift) * scale);
                    }
                    const nextCols = Math.ceil((practiceStartX + sampleW - gridX) / gridUnit) + 2;
                    practiceStartX = gridX + nextCols * gridUnit;
                  }
                }

                if (answerKey && practiceStartX < gridRight - mm(8)) {
                  if (useVietVector) {
                    const rawUnits = Math.max(0.5, measureVietTextUnits(item.en));
                    const availW = gridRight - practiceStartX - gridUnit * 0.5;
                    const ansUnit =
                      rawUnits * vietBaseUnit > availW
                        ? Math.max(vietBaseUnit * 0.62, availW / rawUnits)
                        : vietBaseUnit;
                    drawVietTextCanvas(
                      ctx,
                      item.en,
                      practiceStartX * scale,
                      baselineY * scale,
                      ansUnit * scale,
                      {
                        color: '#1D4ED8',
                        strokeWidthUnits: vietStroke,
                      }
                    );
                  } else {
                    const fittedAns = fitCanvasText(
                      ctx,
                      item.en,
                      (gridRight - practiceStartX - gridUnit * 0.5) * scale,
                      gridFontSize * scale,
                      7.2 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    ctx.fillStyle = '#1D4ED8';
                    ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                    ctx.fillText(fittedAns.text, practiceStartX * scale, (baselineY - gridBaselineShift) * scale);
                  }
                }
              });
            },
          });
        }
      } else {
        const colGap = mm(5);
        const colW = (right - left - colGap) / 2;
        const usableH = PAGE_A5[1] - WORKSHEET_TOP - WORKSHEET_HEADER_H - WORKSHEET_BOTTOM;
        const rowH = usableH / 14;
        for (let start = 0, p = 1; start < plan.imageOrder.length; start += TYPING1_PER_PAGE, p += 1) {
          const slice = plan.imageOrder.slice(start, start + TYPING1_PER_PAGE);
          pages.push({
            id: `typing1-${plan.version}-${p}-${answerKey}-${showSample}-${difficulty}-${useOverlay}-${overlayBlocks}-${fontSize}`,
            worksheetType: 'typing-image',
            title: `Typing 1${answerKey ? ' (Key)' : ''} — Page ${p}`,
            paperLabel: 'A5 Portrait · 28 items / page',
            widthPt: PAGE_A5[0],
            heightPt: PAGE_A5[1],
            draw: async (canvas, widthPx) => {
              await ensureFontReady();
              const { ctx, scale } = setupCanvas(canvas, PAGE_A5[0], PAGE_A5[1], widthPx);
              drawCanvasHeading(
                ctx,
                scale,
                answerKey ? 'Answer Key — Look and Write' : 'Look at the picture and write the word.',
                p,
                plan.version,
                config.versionCount,
                left,
                right,
                activeFontFamily
              );
              const loaded = await Promise.all(slice.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))));
              slice.forEach((item, i) => {
                const col = Math.floor(i / 14);
                const row = i % 14;
                const x = left + col * (colW + colGap);
                const top = WORKSHEET_TOP + WORKSHEET_HEADER_H + row * rowH;
                const baseline = top + rowH * 0.65;
                const writingLineY = top + rowH - mm(2.2);
                const imageX = mm(7.5);
                const imageW = mm(12.5);

                ctx.fillStyle = '#1E293B';
                ctx.font = `${11.5 * profile.fontScale * scale}px ${
                  customCal.isCustom ? 'DejaVuWorksheet, sans-serif' : activeFontFamily
                }`;
                ctx.fillText(`${start + i + 1}.`, x * scale, baseline * scale);

                drawCanvasImageFit(
                  ctx,
                  loaded[i],
                  (x + imageX) * scale,
                  (top + mm(1)) * scale,
                  imageW * scale,
                  (rowH - mm(2)) * scale
                );

                let lineStart = x + imageX + imageW + mm(2);
                const areaRight = x + colW;

                if (useOverlay) {
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    lineStart,
                    top + mm(0.8),
                    rowH - mm(1.6),
                    areaRight - lineStart,
                    mm(1.65) * profile.fontScale,
                    overlayBlocks,
                    1.4,
                    fontSize
                  );
                  let cursorX = lineStart + g.gridUnit * 0.35;
                  if (useViet) {
                    if (showSample && !answerKey) {
                      const sampleMaxW = (areaRight - cursorX) * 0.48;
                      const sUnit = fitVietUnit(item.en, sampleMaxW, g.unit, mm(0.75));
                      const sw =
                        drawVietTextCanvas(ctx, item.en, cursorX * scale, g.baselineY * scale, sUnit * scale, {
                          color: '#475569',
                          strokeWidthUnits: vietStroke,
                        }) / scale;
                      cursorX += sw + mm(2.2);
                    } else if (!answerKey && profile.revealFirstLetter && item.en.trim().length > 0) {
                      drawVietTextCanvas(ctx, item.en.trim()[0], cursorX * scale, g.baselineY * scale, g.unit * scale, {
                        color: '#64748B',
                        strokeWidthUnits: vietStroke,
                      });
                    }
                    if (answerKey) {
                      const aUnit = fitVietUnit(item.en, areaRight - cursorX - g.gridUnit * 0.3, g.unit, mm(0.8));
                      drawVietTextCanvas(ctx, item.en, cursorX * scale, g.baselineY * scale, aUnit * scale, {
                        color: '#1D4ED8',
                        strokeWidthUnits: vietStroke,
                      });
                    }
                  } else {
                    const customY = (g.baselineY - customCal.offsetCells * g.unit) * scale;
                    const customPx = g.unit * 1.92 * customCal.scaleMult * scale;
                    if (showSample && !answerKey) {
                      const sampleMaxW = (areaRight - cursorX) * 0.48;
                      const fittedS = fitCanvasText(
                        ctx,
                        item.en,
                        sampleMaxW * scale,
                        customPx,
                        6.8 * scale,
                        (px) => `${px}px ${activeFontFamily}`
                      );
                      ctx.fillStyle = '#475569';
                      ctx.font = `${fittedS.sizePx}px ${activeFontFamily}`;
                      ctx.fillText(fittedS.text, cursorX * scale, customY);
                    } else if (!answerKey && profile.revealFirstLetter && item.en.trim().length > 0) {
                      ctx.fillStyle = '#64748B';
                      ctx.font = `${customPx}px ${activeFontFamily}`;
                      ctx.fillText(item.en.trim()[0], cursorX * scale, customY);
                    }
                    if (answerKey) {
                      const fittedA = fitCanvasText(
                        ctx,
                        item.en,
                        (areaRight - cursorX - g.gridUnit * 0.3) * scale,
                        customPx,
                        6.8 * scale,
                        (px) => `${px}px ${activeFontFamily}`
                      );
                      ctx.fillStyle = '#1D4ED8';
                      ctx.font = `${fittedA.sizePx}px ${activeFontFamily}`;
                      ctx.fillText(fittedA.text, cursorX * scale, customY);
                    }
                  }
                  return;
                }

                if (showSample && !answerKey) {
                  const sampleMaxW = (areaRight - lineStart) * 0.48;
                  if (useViet) {
                    const sUnit = fitVietUnit(item.en, sampleMaxW, mm(1.55) * profile.fontScale * vietMult, mm(0.8));
                    const sw =
                      drawVietTextCanvas(
                        ctx,
                        item.en,
                        lineStart * scale,
                        (writingLineY - mm(0.8)) * scale,
                        sUnit * scale,
                        { color: '#64748B', strokeWidthUnits: vietStroke }
                      ) / scale;
                    lineStart += sw + mm(2.2);
                  } else {
                    const fittedSample = fitCanvasText(
                      ctx,
                      item.en,
                      sampleMaxW * scale,
                      10.5 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                      6.8 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    ctx.fillStyle = '#64748B';
                    ctx.font = `${fittedSample.sizePx}px ${activeFontFamily}`;
                    ctx.fillText(
                      fittedSample.text,
                      lineStart * scale,
                      (writingLineY - mm(1) - customCal.nonGridShiftPt) * scale
                    );
                    lineStart += ctx.measureText(fittedSample.text).width / scale + mm(2.2);
                  }
                } else if (!answerKey && profile.revealFirstLetter && item.en.trim().length > 0) {
                  const firstChar = item.en.trim()[0];
                  if (useViet) {
                    const cw =
                      drawVietTextCanvas(
                        ctx,
                        firstChar,
                        lineStart * scale,
                        (writingLineY - mm(0.8)) * scale,
                        mm(1.6) * profile.fontScale * vietMult * scale,
                        { color: '#64748B', strokeWidthUnits: vietStroke }
                      ) / scale;
                    lineStart += cw + mm(1.2);
                  } else {
                    ctx.fillStyle = '#64748B';
                    ctx.font = `${11 * profile.fontScale * stdMult * customCal.scaleMult * scale}px ${activeFontFamily}`;
                    ctx.fillText(
                      firstChar,
                      lineStart * scale,
                      (writingLineY - mm(1) - customCal.nonGridShiftPt) * scale
                    );
                    lineStart += ctx.measureText(firstChar).width / scale + mm(1.2);
                  }
                }

                if (answerKey) {
                  if (useViet) {
                    const aUnit = fitVietUnit(item.en, areaRight - lineStart, mm(1.65) * profile.fontScale * vietMult, mm(0.8));
                    drawVietTextCanvas(
                      ctx,
                      item.en,
                      lineStart * scale,
                      (writingLineY - mm(0.8)) * scale,
                      aUnit * scale,
                      { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                    );
                  } else {
                    const fittedAns = fitCanvasText(
                      ctx,
                      item.en,
                      (areaRight - lineStart) * scale,
                      11.5 * profile.fontScale * stdMult * customCal.scaleMult * scale,
                      6.8 * scale,
                      (px) => `${px}px ${activeFontFamily}`
                    );
                    ctx.fillStyle = '#1D4ED8';
                    ctx.font = `${fittedAns.sizePx}px ${activeFontFamily}`;
                    ctx.fillText(
                      fittedAns.text,
                      lineStart * scale,
                      (writingLineY - mm(1) - customCal.nonGridShiftPt) * scale
                    );
                  }
                } else if (lineStart < areaRight - mm(4)) {
                  ctx.strokeStyle = '#475569';
                  ctx.lineWidth = Math.max(0.65, 0.55 * scale);
                  ctx.beginPath();
                  ctx.moveTo(lineStart * scale, writingLineY * scale);
                  ctx.lineTo(areaRight * scale, writingLineY * scale);
                  ctx.stroke();
                }
              });
            },
          });
        }
      }
    } else if (TEXT_TYPES.has(type)) {
      const mode: TypingDirection = type === 'typing-2' ? 'vi-to-en' : 'en-to-vi';
      const panelW = (PAGE_A4_LANDSCAPE[0] - VOCAB_MARGIN * 2 - VOCAB_PANEL_GAP) / 2;
      const numW = mm(10);
      const promptW = (panelW - numW) * 0.46;
      const answerW = panelW - numW - promptW;
      for (let start = 0, p = 1; start < plan.textOrder.length; start += VOCAB_ROWS_PER_PAGE, p += 1) {
        const slice = plan.textOrder.slice(start, start + VOCAB_ROWS_PER_PAGE);
        pages.push({
          id: `${type}-${plan.version}-${p}-${answerKey}-${difficulty}`,
          worksheetType: type,
          title: `${type === 'typing-2' ? 'Typing 2 (VI → EN)' : 'Typing 3 (EN → VI)'}${answerKey ? ' (Key)' : ''} — Page ${p}`,
          paperLabel: 'A4 Landscape · 297 × 210 mm',
          widthPt: PAGE_A4_LANDSCAPE[0],
          heightPt: PAGE_A4_LANDSCAPE[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A4_LANDSCAPE[0], PAGE_A4_LANDSCAPE[1], widthPx);
            const displayRows = Math.max(slice.length, 1);
            const tableTop = VOCAB_MARGIN + VOCAB_HEADER_H;
            const usableH = PAGE_A4_LANDSCAPE[1] - tableTop - VOCAB_MARGIN;
            const rowH = Math.min(mm(profile.vocabMaxRowMm), usableH / (displayRows + 1));
            const tableH = rowH * (displayRows + 1);
            const headers = vocabHeaders(mode);
            const textFontFamily = customCal.isCustom ? activeFontFamily : 'DejaVuWorksheet, sans-serif';

            // Center dashed cut line
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = '#94A3B8';
            ctx.beginPath();
            ctx.moveTo((PAGE_A4_LANDSCAPE[0] / 2) * scale, VOCAB_MARGIN * scale);
            ctx.lineTo((PAGE_A4_LANDSCAPE[0] / 2) * scale, (PAGE_A4_LANDSCAPE[1] - VOCAB_MARGIN) * scale);
            ctx.stroke();
            ctx.restore();

            for (let panel = 0; panel < 2; panel += 1) {
              const px = VOCAB_MARGIN + panel * (panelW + VOCAB_PANEL_GAP);
              const headerLine = answerKey
                ? `Answer Key (${mode === 'vi-to-en' ? 'VI → EN' : 'EN → VI'})`
                : config.studentHeader || 'Full name: ____________________';

              ctx.fillStyle = '#1E293B';
              ctx.font = `600 ${9.5 * scale}px DejaVuWorksheet, sans-serif`;
              ctx.textAlign = 'left';
              ctx.fillText(headerLine, px * scale, (VOCAB_MARGIN + 8) * scale);

              const codeStr = config.versionCount > 1 ? `Code ${plan.version} · P.${p}` : `P.${p}`;
              ctx.fillStyle = '#64748B';
              ctx.font = `${8 * scale}px DejaVuWorksheet, sans-serif`;
              ctx.textAlign = 'right';
              ctx.fillText(codeStr, (px + panelW) * scale, (VOCAB_MARGIN + 8) * scale);

              ctx.fillStyle = '#F1F5F9';
              ctx.fillRect(px * scale, tableTop * scale, panelW * scale, rowH * scale);

              ctx.strokeStyle = '#475569';
              ctx.lineWidth = Math.max(0.7, 0.6 * scale);
              ctx.strokeRect(px * scale, tableTop * scale, panelW * scale, tableH * scale);

              ctx.strokeStyle = '#94A3B8';
              ctx.lineWidth = Math.max(0.5, 0.35 * scale);
              for (let r = 1; r <= displayRows; r += 1) {
                const y = (tableTop + r * rowH) * scale;
                ctx.beginPath();
                ctx.moveTo(px * scale, y);
                ctx.lineTo((px + panelW) * scale, y);
                ctx.stroke();
              }
              [numW, numW + promptW].forEach((offset) => {
                ctx.beginPath();
                ctx.moveTo((px + offset) * scale, tableTop * scale);
                ctx.lineTo((px + offset) * scale, (tableTop + tableH) * scale);
                ctx.stroke();
              });

              ctx.fillStyle = '#0F172A';
              ctx.font = `700 ${8.5 * scale}px DejaVuWorksheet, sans-serif`;
              ctx.textAlign = 'center';
              const colWList = [numW, promptW, answerW];
              let cx = px;
              colWList.forEach((w, idx) => {
                ctx.fillText(headers[idx], (cx + w / 2) * scale, (tableTop + rowH * 0.68) * scale);
                cx += w;
              });

              const rowFontSize = Math.min(11.5 * profile.fontScale * stdMult, Math.max(6.8, rowH * 0.58 * profile.fontScale * stdMult));
              const rowCustomFontSize = rowFontSize * customCal.scaleMult;
              slice.forEach((item, i) => {
                const rowTopY = tableTop + (i + 1) * rowH;
                const baseY = rowTopY + rowH * 0.68;
                const y = baseY * scale;
                const shiftedY = (baseY - customCal.nonGridShiftPt) * scale;
                ctx.fillStyle = '#475569';
                ctx.textAlign = 'center';
                ctx.font = `${rowFontSize * 0.9 * scale}px DejaVuWorksheet, sans-serif`;
                ctx.fillText(`${start + i + 1}.`, (px + numW / 2) * scale, y);

                const promptText = mode === 'vi-to-en' ? item.vi : item.en;
                ctx.textAlign = 'left';
                if (useViet) {
                  const pu = fitVietUnit(promptText, promptW - mm(2.6), mm(1.35) * profile.fontScale * vietMult, mm(0.65));
                  drawVietTextCanvas(ctx, promptText, (px + numW + mm(1.3)) * scale, y, pu * scale, {
                    color: '#0F172A',
                    strokeWidthUnits: vietStroke,
                  });
                } else {
                  const fittedP = fitCanvasText(
                    ctx,
                    promptText,
                    (promptW - mm(2.5)) * scale,
                    rowCustomFontSize * scale,
                    6.2 * scale,
                    (pxVal) => `${pxVal}px ${textFontFamily}`
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.font = `${fittedP.sizePx}px ${textFontFamily}`;
                  ctx.fillText(fittedP.text, (px + numW + mm(1.3)) * scale, shiftedY);
                }

                const ansText = mode === 'vi-to-en' ? item.en : item.vi;
                const ansCellX = px + numW + promptW;
                if (useOverlay) {
                  const g = drawGuidelineOverlayCanvas(
                    ctx,
                    scale,
                    ansCellX + mm(0.6),
                    rowTopY + mm(0.3),
                    rowH - mm(0.6),
                    answerW - mm(1.2),
                    mm(1.35) * profile.fontScale,
                    overlayBlocks,
                    1.2,
                    fontSize
                  );
                  if (useViet) {
                    if (answerKey) {
                      const au = fitVietUnit(ansText, answerW - mm(2.4), g.unit, mm(0.65));
                      drawVietTextCanvas(ctx, ansText, (ansCellX + mm(1.2)) * scale, g.baselineY * scale, au * scale, {
                        color: '#1D4ED8',
                        strokeWidthUnits: vietStroke,
                      });
                    } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
                      drawVietTextCanvas(
                        ctx,
                        ansText.trim()[0],
                        (ansCellX + mm(1.2)) * scale,
                        g.baselineY * scale,
                        g.unit * scale,
                        { color: '#94A3B8', strokeWidthUnits: vietStroke }
                      );
                    }
                  } else {
                    const customOverlayY = (g.baselineY - customCal.offsetCells * g.unit) * scale;
                    const customOverlayPx = g.unit * 1.92 * customCal.scaleMult * scale;
                    if (answerKey) {
                      const fittedA = fitCanvasText(
                        ctx,
                        ansText,
                        (answerW - mm(2.4)) * scale,
                        customOverlayPx,
                        6.0 * scale,
                        (pxVal) => `${pxVal}px ${textFontFamily}`
                      );
                      ctx.fillStyle = '#1D4ED8';
                      ctx.font = `${fittedA.sizePx}px ${textFontFamily}`;
                      ctx.fillText(fittedA.text, (ansCellX + mm(1.2)) * scale, customOverlayY);
                    } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
                      ctx.fillStyle = '#94A3B8';
                      ctx.font = `${customOverlayPx}px ${textFontFamily}`;
                      ctx.fillText(ansText.trim()[0], (ansCellX + mm(1.2)) * scale, customOverlayY);
                    }
                  }
                } else if (answerKey) {
                  if (useViet) {
                    const au = fitVietUnit(ansText, answerW - mm(2.5), mm(1.35) * profile.fontScale * vietMult, mm(0.65));
                    drawVietTextCanvas(ctx, ansText, (ansCellX + mm(1.3)) * scale, y, au * scale, {
                      color: '#1D4ED8',
                      strokeWidthUnits: vietStroke,
                    });
                  } else {
                    const fittedA = fitCanvasText(
                      ctx,
                      ansText,
                      (answerW - mm(2.5)) * scale,
                      rowCustomFontSize * scale,
                      6.2 * scale,
                      (pxVal) => `${pxVal}px ${textFontFamily}`
                    );
                    ctx.fillStyle = '#1D4ED8';
                    ctx.font = `${fittedA.sizePx}px ${textFontFamily}`;
                    ctx.fillText(fittedA.text, (ansCellX + mm(1.3)) * scale, shiftedY);
                  }
                } else if (profile.revealFirstLetter && ansText.trim().length > 0) {
                  ctx.fillStyle = '#94A3B8';
                  ctx.font = `${rowCustomFontSize * 0.92 * scale}px ${textFontFamily}`;
                  ctx.fillText(`${ansText.trim()[0]}_____`, (ansCellX + mm(1.3)) * scale, shiftedY);
                }
              });
            }
            ctx.textAlign = 'left';
          },
        });
      }
    } else if (type === 'mix' && plan.mix && !plan.mix.errors.length) {
      const mix = plan.mix;
      mix.pages.forEach((pageLayout, pIdx) => {
        pages.push({
          id: `mix-${plan.version}-${pIdx}-${answerKey}`,
          worksheetType: 'mix',
          title: `Mix A4${answerKey ? ' (Key)' : ''} — Page ${pIdx + 1}`,
          paperLabel: 'A4 Portrait · 210 × 297 mm',
          widthPt: PAGE_A4_PORTRAIT[0],
          heightPt: PAGE_A4_PORTRAIT[1],
          draw: async (canvas, widthPx) => {
            await ensureFontReady();
            const { ctx, scale } = setupCanvas(canvas, PAGE_A4_PORTRAIT[0], PAGE_A4_PORTRAIT[1], widthPx);
            const mixFontFamily = customCal.isCustom ? activeFontFamily : 'DejaVuWorksheet, sans-serif';
            const topHeader = answerKey
              ? 'Answer Key — Mix Worksheet'
              : config.studentHeader || 'Full name: ________________________';
            ctx.fillStyle = '#0F172A';
            ctx.font = `600 ${10.5 * scale}px DejaVuWorksheet, sans-serif`;
            ctx.fillText(topHeader, mm(9) * scale, mm(9) * scale);

            const meta = config.versionCount > 1 ? `Code ${plan.version} · Page ${pIdx + 1}` : `Page ${pIdx + 1}`;
            ctx.fillStyle = '#64748B';
            ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(meta, (PAGE_A4_PORTRAIT[0] - mm(9)) * scale, mm(9) * scale);
            ctx.textAlign = 'left';

            ctx.strokeStyle = '#CBD5E1';
            ctx.lineWidth = Math.max(0.6, 0.5 * scale);
            ctx.beginPath();
            ctx.moveTo(mm(9) * scale, mm(11.5) * scale);
            ctx.lineTo((PAGE_A4_PORTRAIT[0] - mm(9)) * scale, mm(11.5) * scale);
            ctx.stroke();

            for (const block of pageLayout.blocks) {
              const sec = block.section;
              const heading = `${String.fromCharCode(65 + sec.order)}. ${sec.label}`;
              ctx.fillStyle = '#0F172A';
              ctx.font = `700 ${11.5 * scale}px DejaVuWorksheet, sans-serif`;
              ctx.fillText(heading, block.x * scale, (block.y + mm(3.5)) * scale);

              const bodyTop = block.y + mm(7);

              if (sec.type === 'matching-3') {
                const terms = sec.matchingTerms || [];
                const leftDotX = block.x + mm(48);
                const rightDotX = block.x + mm(102);
                const loaded = await Promise.all(
                  sec.items.map((it) => loadHtmlImage(images.get(numericId(it.imageId))))
                );
                sec.items.forEach((item, i) => {
                  const rowTop = bodyTop + i * MIX_MATCHING3_ROW_HEIGHT;
                  const cy = rowTop + MIX_MATCHING3_ROW_HEIGHT / 2;
                  ctx.fillStyle = '#1E293B';
                  ctx.font = `700 ${10 * scale}px sans-serif`;
                  ctx.fillText(`${i + 1}.`, block.x * scale, (cy + 3) * scale);

                  drawCanvasImageFit(
                    ctx,
                    loaded[i],
                    (block.x + mm(8)) * scale,
                    (rowTop + mm(1)) * scale,
                    mm(22) * scale,
                    (MIX_MATCHING3_ROW_HEIGHT - mm(2)) * scale
                  );
                  ctx.fillStyle = '#0F172A';
                  ctx.beginPath();
                  ctx.arc(leftDotX * scale, cy * scale, 2.2 * scale, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.beginPath();
                  ctx.arc(rightDotX * scale, cy * scale, 2.2 * scale, 0, Math.PI * 2);
                  ctx.fill();

                  const term = terms[i];
                  if (term) {
                    if (useViet) {
                      const prefix = `${term.letter}. `;
                      ctx.font = `700 ${9.5 * scale}px sans-serif`;
                      const pw = ctx.measureText(prefix).width / scale;
                      const wx = rightDotX + mm(5) + pw;
                      const ww = Math.max(mm(14), block.x + block.width - wx);
                      let wy = cy + 2.5;
                      let wu = mm(1.65) * vietMult;
                      let padX = 0;
                      if (useOverlay) {
                        const g = drawGuidelineOverlayCanvas(
                          ctx,
                          scale,
                          wx,
                          rowTop + mm(1),
                          MIX_MATCHING3_ROW_HEIGHT - mm(2),
                          ww,
                          mm(1.7),
                          overlayBlocks,
                          1.4,
                          fontSize
                        );
                        wy = g.baselineY;
                        wu = g.unit;
                        padX = g.gridUnit * 0.3;
                      }
                      ctx.fillStyle = '#1E293B';
                      ctx.fillText(prefix, (rightDotX + mm(5)) * scale, wy * scale);
                      const fu = fitVietUnit(term.item.en, ww - mm(1), wu, mm(0.8));
                      drawVietTextCanvas(
                        ctx,
                        term.item.en,
                        (wx + padX) * scale,
                        wy * scale,
                        fu * scale,
                        { color: '#0F172A', strokeWidthUnits: vietStroke }
                      );
                    } else if (useOverlay) {
                      const prefix = `${term.letter}. `;
                      ctx.font = `700 ${9.5 * scale}px sans-serif`;
                      const pw = ctx.measureText(prefix).width / scale;
                      const wx = rightDotX + mm(5) + pw;
                      const ww = Math.max(mm(14), block.x + block.width - wx);
                      const g = drawGuidelineOverlayCanvas(
                        ctx,
                        scale,
                        wx,
                        rowTop + mm(1),
                        MIX_MATCHING3_ROW_HEIGHT - mm(2),
                        ww,
                        mm(1.7),
                        overlayBlocks,
                        1.4,
                        fontSize
                      );
                      ctx.fillStyle = '#1E293B';
                      ctx.fillText(prefix, (rightDotX + mm(5)) * scale, g.baselineY * scale);
                      const fitted = fitCanvasText(
                        ctx,
                        term.item.en,
                        (ww - mm(1)) * scale,
                        g.unit * 1.92 * customCal.scaleMult * scale,
                        6.8 * scale,
                        (pxVal) => `${pxVal}px ${mixFontFamily}`
                      );
                      ctx.fillStyle = '#0F172A';
                      ctx.font = `${fitted.sizePx}px ${mixFontFamily}`;
                      ctx.fillText(
                        fitted.text,
                        (wx + g.gridUnit * 0.3) * scale,
                        (g.baselineY - customCal.offsetCells * g.unit) * scale
                      );
                    } else {
                      ctx.fillStyle = '#0F172A';
                      ctx.font = `${10 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                      ctx.fillText(
                        `${term.letter}. ${term.item.en}`,
                        (rightDotX + mm(5)) * scale,
                        (cy + 3 - customCal.nonGridShiftPt) * scale
                      );
                    }
                  }
                  if (answerKey) {
                    const tIdx = terms.findIndex((t) => t.item.uid === item.uid);
                    if (tIdx >= 0) {
                      const ty = bodyTop + tIdx * MIX_MATCHING3_ROW_HEIGHT + MIX_MATCHING3_ROW_HEIGHT / 2;
                      ctx.strokeStyle = '#1D4ED8';
                      ctx.lineWidth = Math.max(1, scale);
                      ctx.beginPath();
                      ctx.moveTo(leftDotX * scale, cy * scale);
                      ctx.lineTo(rightDotX * scale, ty * scale);
                      ctx.stroke();
                    }
                  }
                });
              } else if (sec.type === 'anagram') {
                const entries = sec.anagramEntries || [];
                const loaded = await Promise.all(
                  sec.items.map((it) => loadHtmlImage(images.get(numericId(it.imageId))))
                );
                sec.items.forEach((item, i) => {
                  const rowTop = bodyTop + i * MIX_ANAGRAM_ROW_HEIGHT;
                  const cy = rowTop + MIX_ANAGRAM_ROW_HEIGHT / 2;
                  const num = (sec.offset || 0) + i + 1;
                  ctx.fillStyle = '#1E293B';
                  ctx.font = `700 ${10 * scale}px sans-serif`;
                  ctx.fillText(`${num}.`, block.x * scale, (cy + 3) * scale);
                  drawCanvasImageFit(
                    ctx,
                    loaded[i],
                    (block.x + mm(8)) * scale,
                    (rowTop + mm(1)) * scale,
                    mm(15) * scale,
                    (MIX_ANAGRAM_ROW_HEIGHT - mm(2)) * scale
                  );
                  if (useViet) {
                    const clueText = entries[i]?.scrambled || item.en;
                    const cu = fitVietUnit(clueText, mm(70), mm(1.65) * vietMult, mm(0.8));
                    drawVietTextCanvas(ctx, clueText, (block.x + mm(27)) * scale, (cy + 2.5) * scale, cu * scale, {
                      color: '#334155',
                      strokeWidthUnits: vietStroke,
                    });
                  } else {
                    ctx.fillStyle = '#334155';
                    ctx.font = `${10.5 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                    ctx.fillText(
                      entries[i]?.scrambled || item.en,
                      (block.x + mm(27)) * scale,
                      (cy + 3 - customCal.nonGridShiftPt) * scale
                    );
                  }

                  const lineX = block.x + mm(102);
                  const ansW = block.x + block.width - lineX;
                  if (useOverlay) {
                    const g = drawGuidelineOverlayCanvas(
                      ctx,
                      scale,
                      lineX,
                      rowTop + mm(0.8),
                      MIX_ANAGRAM_ROW_HEIGHT - mm(1.6),
                      ansW,
                      mm(1.65),
                      overlayBlocks,
                      1.4,
                      fontSize
                    );
                    if (answerKey) {
                      if (useViet) {
                        const au = fitVietUnit(item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.8));
                        drawVietTextCanvas(
                          ctx,
                          item.en,
                          (lineX + g.gridUnit * 0.35) * scale,
                          g.baselineY * scale,
                          au * scale,
                          { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                        );
                      } else {
                        const fittedA = fitCanvasText(
                          ctx,
                          item.en,
                          (ansW - g.gridUnit * 0.8) * scale,
                          g.unit * 1.92 * customCal.scaleMult * scale,
                          6.8 * scale,
                          (pxVal) => `${pxVal}px ${mixFontFamily}`
                        );
                        ctx.fillStyle = '#1D4ED8';
                        ctx.font = `${fittedA.sizePx}px ${mixFontFamily}`;
                        ctx.fillText(
                          fittedA.text,
                          (lineX + g.gridUnit * 0.35) * scale,
                          (g.baselineY - customCal.offsetCells * g.unit) * scale
                        );
                      }
                    }
                  } else if (answerKey) {
                    if (useViet) {
                      const au = fitVietUnit(item.en, ansW, mm(1.65) * vietMult, mm(0.8));
                      drawVietTextCanvas(ctx, item.en, lineX * scale, (cy + 2.5) * scale, au * scale, {
                        color: '#1D4ED8',
                        strokeWidthUnits: vietStroke,
                      });
                    } else {
                      ctx.fillStyle = '#1D4ED8';
                      ctx.font = `${10.5 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                      ctx.fillText(item.en, lineX * scale, (cy + 3 - customCal.nonGridShiftPt) * scale);
                    }
                  } else {
                    ctx.strokeStyle = '#64748B';
                    ctx.lineWidth = Math.max(0.6, 0.55 * scale);
                    ctx.beginPath();
                    ctx.moveTo(lineX * scale, (cy + 4) * scale);
                    ctx.lineTo((block.x + block.width) * scale, (cy + 4) * scale);
                    ctx.stroke();
                  }
                });
              } else if (sec.type === 'matching-2') {
                const groups = sec.matching2Groups || [];
                const cardW = (block.width - MIX_MATCHING2.cardGap * 4) / 5;
                let cursorTop = bodyTop;
                for (const group of groups) {
                  const loaded = await Promise.all(
                    group.pictures.map((it) => loadHtmlImage(images.get(numericId(it.imageId))))
                  );
                  group.pictures.forEach((_item, i) => {
                    const cx = (block.x + (i % 5) * (cardW + MIX_MATCHING2.cardGap)) * scale;
                    const cy = cursorTop * scale;
                    const cw = cardW * scale;
                    const ch = MIX_MATCHING2.cardHeight * scale;
                    ctx.save();
                    ctx.setLineDash([DASH.on * scale, DASH.off * scale]);
                    ctx.strokeStyle = '#1E293B';
                    ctx.beginPath();
                    ctx.roundRect(cx, cy, cw, ch, mm(2) * scale);
                    ctx.stroke();
                    ctx.restore();
                    drawCanvasImageFit(
                      ctx,
                      loaded[i],
                      cx + MIX_MATCHING2.cardPadding * scale,
                      cy + MIX_MATCHING2.cardPadding * scale,
                      cw - MIX_MATCHING2.cardPadding * 2 * scale,
                      MIX_MATCHING2.imageHeight * scale
                    );
                    ctx.fillStyle = '#0F172A';
                    ctx.font = `700 ${11 * scale}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(String.fromCharCode(65 + i), cx + cw / 2, cy + ch - mm(1.2) * scale);
                  });
                  ctx.textAlign = 'left';
                  const promptTop = cursorTop + MIX_MATCHING2.cardHeight + mm(2);
                  const colW = (block.width - mm(6)) / 3;
                  group.prompts.forEach((item, pIdx) => {
                    const colIdx = pIdx % 3;
                    const rowIdx = Math.floor(pIdx / 3);
                    const picIdx = group.pictures.findIndex((p) => p.uid === item.uid);
                    const letter = picIdx >= 0 ? String.fromCharCode(65 + picIdx) : '?';
                    const px = block.x + colIdx * (colW + mm(3));
                    const rowTopY = promptTop + rowIdx * MIX_MATCHING2.promptRowHeight;
                    const py = rowTopY + mm(4.5);
                    if (useViet) {
                      const prefix = answerKey ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
                      ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
                      const pw = ctx.measureText(prefix).width / scale;
                      const wx = px + pw;
                      const ww = Math.max(mm(10), colW - pw - mm(1.5));
                      let wy = py;
                      let wu = mm(1.35) * vietMult;
                      let padX = 0;
                      if (useOverlay) {
                        const g = drawGuidelineOverlayCanvas(
                          ctx,
                          scale,
                          wx,
                          rowTopY + mm(0.3),
                          MIX_MATCHING2.promptRowHeight - mm(0.6),
                          ww,
                          mm(1.35),
                          overlayBlocks,
                          1.2,
                          fontSize
                        );
                        wy = g.baselineY;
                        wu = g.unit;
                        padX = g.gridUnit * 0.25;
                      }
                      ctx.fillStyle = answerKey ? '#1D4ED8' : '#1E293B';
                      ctx.fillText(prefix, px * scale, wy * scale);
                      const fu = fitVietUnit(item.en, ww - mm(0.6), wu, mm(0.7));
                      drawVietTextCanvas(
                        ctx,
                        item.en,
                        (wx + padX) * scale,
                        wy * scale,
                        fu * scale,
                        { color: answerKey ? '#1D4ED8' : '#0F172A', strokeWidthUnits: vietStroke }
                      );
                    } else if (useOverlay) {
                      const prefix = answerKey ? `${pIdx + 1}. [${letter}] ` : `${pIdx + 1}. ___ `;
                      ctx.font = `${8.5 * scale}px DejaVuWorksheet, sans-serif`;
                      const pw = ctx.measureText(prefix).width / scale;
                      const wx = px + pw;
                      const ww = Math.max(mm(10), colW - pw - mm(1.5));
                      const g = drawGuidelineOverlayCanvas(
                        ctx,
                        scale,
                        wx,
                        rowTopY + mm(0.3),
                        MIX_MATCHING2.promptRowHeight - mm(0.6),
                        ww,
                        mm(1.35),
                        overlayBlocks,
                        1.2,
                        fontSize
                      );
                      ctx.fillStyle = answerKey ? '#1D4ED8' : '#1E293B';
                      ctx.fillText(prefix, px * scale, g.baselineY * scale);
                      const fitted = fitCanvasText(
                        ctx,
                        item.en,
                        (ww - mm(0.6)) * scale,
                        g.unit * 1.92 * customCal.scaleMult * scale,
                        6.2 * scale,
                        (pxVal) => `${pxVal}px ${mixFontFamily}`
                      );
                      ctx.fillStyle = answerKey ? '#1D4ED8' : '#0F172A';
                      ctx.font = `${fitted.sizePx}px ${mixFontFamily}`;
                      ctx.fillText(
                        fitted.text,
                        (wx + g.gridUnit * 0.25) * scale,
                        (g.baselineY - customCal.offsetCells * g.unit) * scale
                      );
                    } else {
                      const text = answerKey ? `${pIdx + 1}. [${letter}] ${item.en}` : `${pIdx + 1}. ____ ${item.en}`;
                      ctx.fillStyle = answerKey ? '#1D4ED8' : '#0F172A';
                      ctx.font = `${10 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                      ctx.fillText(text, px * scale, (py - customCal.nonGridShiftPt) * scale);
                    }
                  });
                  cursorTop += group.height + MIX_MATCHING2.groupGap;
                }
              } else {
                const colGap = mm(8);
                const colW = (block.width - colGap) / 2;
                const loaded =
                  sec.type === 'typing-image'
                    ? await Promise.all(sec.items.map((it) => loadHtmlImage(images.get(numericId(it.imageId)))))
                    : [];
                sec.items.forEach((item, i) => {
                  const col = i % 2;
                  const row = Math.floor(i / 2);
                  const cellX = block.x + col * (colW + colGap);
                  const rowTop = bodyTop + row * MIX_TYPING_ROW_HEIGHT;
                  const baseY = rowTop + MIX_TYPING_ROW_HEIGHT * 0.65;
                  const num = (sec.offset || 0) + i + 1;

                  if (sec.type === 'typing-image') {
                    ctx.fillStyle = '#1E293B';
                    ctx.font = `700 ${10 * scale}px sans-serif`;
                    ctx.fillText(`${num}.`, cellX * scale, baseY * scale);
                    drawCanvasImageFit(
                      ctx,
                      loaded[i] || null,
                      (cellX + mm(8)) * scale,
                      (rowTop + mm(1)) * scale,
                      mm(16) * scale,
                      (MIX_TYPING_ROW_HEIGHT - mm(2)) * scale
                    );
                    const lineX = cellX + mm(27);
                    const ansW = cellX + colW - lineX;
                    if (useOverlay) {
                      const g = drawGuidelineOverlayCanvas(
                        ctx,
                        scale,
                        lineX,
                        rowTop + mm(0.8),
                        MIX_TYPING_ROW_HEIGHT - mm(1.6),
                        ansW,
                        mm(1.65),
                        overlayBlocks,
                        1.4,
                        fontSize
                      );
                      if (answerKey) {
                        if (useViet) {
                          const au = fitVietUnit(item.en, ansW - g.gridUnit * 0.8, g.unit, mm(0.8));
                          drawVietTextCanvas(
                            ctx,
                            item.en,
                            (lineX + g.gridUnit * 0.35) * scale,
                            g.baselineY * scale,
                            au * scale,
                            { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                          );
                        } else {
                          const fittedA = fitCanvasText(
                            ctx,
                            item.en,
                            (ansW - g.gridUnit * 0.8) * scale,
                            g.unit * 1.92 * customCal.scaleMult * scale,
                            6.8 * scale,
                            (pxVal) => `${pxVal}px ${mixFontFamily}`
                          );
                          ctx.fillStyle = '#1D4ED8';
                          ctx.font = `${fittedA.sizePx}px ${mixFontFamily}`;
                          ctx.fillText(
                            fittedA.text,
                            (lineX + g.gridUnit * 0.35) * scale,
                            (g.baselineY - customCal.offsetCells * g.unit) * scale
                          );
                        }
                      }
                    } else if (answerKey) {
                      if (useViet) {
                        const au = fitVietUnit(item.en, ansW, mm(1.65) * vietMult, mm(0.8));
                        drawVietTextCanvas(ctx, item.en, lineX * scale, baseY * scale, au * scale, {
                          color: '#1D4ED8',
                          strokeWidthUnits: vietStroke,
                        });
                      } else {
                        ctx.fillStyle = '#1D4ED8';
                        ctx.font = `${10 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                        ctx.fillText(item.en, lineX * scale, (baseY - customCal.nonGridShiftPt) * scale);
                      }
                    } else {
                      ctx.strokeStyle = '#64748B';
                      ctx.beginPath();
                      ctx.moveTo(lineX * scale, (baseY + mm(1)) * scale);
                      ctx.lineTo((cellX + colW) * scale, (baseY + mm(1)) * scale);
                      ctx.stroke();
                    }
                  } else {
                    const prompt = sec.type === 'typing-2' ? item.vi : item.en;
                    const ans = sec.type === 'typing-2' ? item.en : item.vi;
                    ctx.fillStyle = '#0F172A';
                    ctx.font = `${9.5 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                    ctx.fillText(`${num}. ${prompt}`, cellX * scale, (baseY - customCal.nonGridShiftPt) * scale);
                    const ansStartX = cellX + colW * 0.54;
                    const ansW = cellX + colW - ansStartX;
                    if (useOverlay) {
                      const g = drawGuidelineOverlayCanvas(
                        ctx,
                        scale,
                        ansStartX,
                        rowTop + mm(0.8),
                        MIX_TYPING_ROW_HEIGHT - mm(1.6),
                        ansW,
                        mm(1.55),
                        overlayBlocks,
                        1.4,
                        fontSize
                      );
                      if (answerKey) {
                        if (useViet) {
                          const au = fitVietUnit(ans, ansW - g.gridUnit * 0.7, g.unit, mm(0.75));
                          drawVietTextCanvas(
                            ctx,
                            ans,
                            (ansStartX + g.gridUnit * 0.3) * scale,
                            g.baselineY * scale,
                            au * scale,
                            { color: '#1D4ED8', strokeWidthUnits: vietStroke }
                          );
                        } else {
                          const fittedA = fitCanvasText(
                            ctx,
                            ans,
                            (ansW - g.gridUnit * 0.7) * scale,
                            g.unit * 1.92 * customCal.scaleMult * scale,
                            6.5 * scale,
                            (pxVal) => `${pxVal}px ${mixFontFamily}`
                          );
                          ctx.fillStyle = '#1D4ED8';
                          ctx.font = `${fittedA.sizePx}px ${mixFontFamily}`;
                          ctx.fillText(
                            fittedA.text,
                            (ansStartX + g.gridUnit * 0.3) * scale,
                            (g.baselineY - customCal.offsetCells * g.unit) * scale
                          );
                        }
                      }
                    } else if (answerKey) {
                      if (useViet) {
                        const au = fitVietUnit(ans, ansW, mm(1.55) * vietMult, mm(0.75));
                        drawVietTextCanvas(ctx, ans, (ansStartX + mm(1)) * scale, baseY * scale, au * scale, {
                          color: '#1D4ED8',
                          strokeWidthUnits: vietStroke,
                        });
                      } else {
                        ctx.fillStyle = '#1D4ED8';
                        ctx.font = `${9.5 * stdMult * customCal.scaleMult * scale}px ${mixFontFamily}`;
                        ctx.fillText(ans, (cellX + colW * 0.55) * scale, (baseY - customCal.nonGridShiftPt) * scale);
                      }
                    } else {
                      ctx.strokeStyle = '#64748B';
                      ctx.beginPath();
                      ctx.moveTo(ansStartX * scale, (baseY + mm(1)) * scale);
                      ctx.lineTo((cellX + colW) * scale, (baseY + mm(1)) * scale);
                      ctx.stroke();
                    }
                  }
                });
              }
            }
          },
        });
      });
    }
  }

  return pages;
}

// ============================================================
// SINGLE PDF & MULTI-FILE ZIP BUNDLE EXPORT
// ============================================================
const EXPORT_SLUG: Record<WorksheetType, string> = {
  flashcards: 'Flashcards_A5',
  anagram: 'PictureAnagram_A5',
  'word-scramble': 'WordScramble_Tiles_A4',
  matching: 'Matching1_LookAndMatch',
  'matching-2': 'Matching2_PictureLetter',
  'matching-3': 'Matching3_Flexible',
  'typing-image': 'Typing1_PictureToWord',
  'typing-2': 'Typing2_VietToEng_A4',
  'typing-3': 'Typing3_EngToViet_A4',
  mix: 'Mix_Worksheet_A4',
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function generateSingleWorksheetPdf(
  type: WorksheetType,
  plan: VersionPlan,
  images: Map<string, ImageAsset>,
  config: WorksheetConfig,
  answerKey: boolean
): Promise<{ filename: string; bytes: Uint8Array }> {
  const suffix = config.versionCount > 1 ? `_Code${plan.version}` : '';
  const keyTag = answerKey ? '_AnswerKey' : '';
  const filename = `${EXPORT_SLUG[type]}${suffix}${keyTag}.pdf`;

  const fs = config.fontStyle || 'penmanship';
  const diff = config.difficulty || 'intermediate';
  const fontSize: WorksheetFontSize = config.fontSize === 'normal' ? 'normal' : 'small';
  const overlay: GuidelineOverlayOptions = {
    enabled: Boolean(config.guidelineOverlay),
    blocks: config.typingImageGridBlocks === 5 ? 5 : 4,
    fontSize,
    customFontId: config.customFontId,
    customFontScale: config.customFontScale,
    customFontBaselineOffset: config.customFontBaselineOffset,
  };
  let bytes: Uint8Array;
  switch (type) {
    case 'flashcards':
      bytes = await makeFlashcardsPdf(plan.imageOrder, images, fs, diff, overlay);
      break;
    case 'anagram':
      bytes = await makeAnagramPdf(
        plan.anagramEntries,
        images,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        diff,
        overlay
      );
      break;
    case 'word-scramble':
      bytes = await makeWordScramblePdf(
        plan.wordScrambleEntries,
        config.studentHeader,
        Boolean(config.wordScrambleShowHint),
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        diff,
        overlay
      );
      break;
    case 'matching':
      bytes = await makeMatching1Pdf(
        plan.imageOrder,
        plan.matchingOrders,
        images,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        overlay
      );
      break;
    case 'matching-2':
      bytes = await makeMatching2Pdf(
        plan.matching2,
        images,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        overlay
      );
      break;
    case 'matching-3':
      bytes = await makeMatching3Pdf(
        plan.matching3,
        images,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        overlay
      );
      break;
    case 'typing-image':
      bytes = await makeTyping1Pdf(
        plan.imageOrder,
        images,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        {
          gridlines: Boolean(config.typingImageGridlines),
          gridSizeMm: config.typingImageGridSize === 2.5 ? 2.5 : 2,
          gridBlocks: overlay.blocks,
          showSample: Boolean(config.typingImageShowSample),
          guidelineOverlay: overlay.enabled,
          fontSize,
          customFontId: config.customFontId,
          customFontScale: config.customFontScale,
          customFontBaselineOffset: config.customFontBaselineOffset,
        },
        diff
      );
      break;
    case 'typing-2':
      bytes = await makeVocabularyCheckPdf(
        plan.textOrder,
        'vi-to-en',
        config.studentHeader,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        diff,
        overlay
      );
      break;
    case 'typing-3':
      bytes = await makeVocabularyCheckPdf(
        plan.textOrder,
        'en-to-vi',
        config.studentHeader,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        diff,
        overlay
      );
      break;
    case 'mix':
      if (!plan.mix || plan.mix.errors.length) {
        throw new Error(plan.mix?.errors.join(' ') || 'Mix plan is incomplete.');
      }
      bytes = await makeMixPdf(
        plan.mix,
        images,
        config.studentHeader,
        answerKey,
        plan.version,
        config.versionCount,
        fs,
        overlay
      );
      break;
  }

  return { filename, bytes };
}

export async function downloadSinglePreviewPdf(
  type: WorksheetType,
  plan: VersionPlan,
  images: Map<string, ImageAsset>,
  config: WorksheetConfig,
  answerKey: boolean
): Promise<string> {
  const { filename, bytes } = await generateSingleWorksheetPdf(type, plan, images, config, answerKey);
  const safeBytes = new Uint8Array(bytes);
  triggerBlobDownload(new Blob([safeBytes], { type: 'application/pdf' }), filename);
  return filename;
}

export async function exportWorksheetBundle(
  rows: VocabRow[],
  images: Map<string, ImageAsset>,
  config: WorksheetConfig,
  shuffleNonces: Record<number, number>,
  onProgress?: (label: string) => void
): Promise<{ fileCount: number; archiveName: string }> {
  const files: Array<{ name: string; bytes: Uint8Array }> = [];

  for (let v = 1; v <= config.versionCount; v += 1) {
    const plan = buildVersionPlan(v, rows, images, config, shuffleNonces[v] || 0);
    for (const type of config.selectedTypes) {
      onProgress?.(`${EXPORT_SLUG[type]} (Code ${v})`);
      const studentFile = await generateSingleWorksheetPdf(type, plan, images, config, false);
      files.push({ name: studentFile.filename, bytes: studentFile.bytes });

      if (config.includeAnswerKeys && type !== 'flashcards') {
        const keyFile = await generateSingleWorksheetPdf(type, plan, images, config, true);
        files.push({ name: keyFile.filename, bytes: keyFile.bytes });
      }
    }
  }

  if (!files.length) {
    throw new Error('No worksheets selected for export.');
  }

  if (files.length === 1) {
    const safeBytes = new Uint8Array(files[0].bytes);
    triggerBlobDownload(new Blob([safeBytes], { type: 'application/pdf' }), files[0].name);
    return { fileCount: 1, archiveName: files[0].name };
  }

  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.bytes));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const archiveName = 'JoyEnglish_Worksheets.zip';
  triggerBlobDownload(zipBlob, archiveName);
  return { fileCount: files.length, archiveName };
}
