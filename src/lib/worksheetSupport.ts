import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  AnagramEntry,
  DifficultyLevel,
  GridCellSize,
  ImageAsset,
  Matching2Group,
  Matching3Plan,
  MatchingTermEntry,
  MixPageBlock,
  MixPageLayout,
  MixPlan,
  MixPlannedSection,
  MixSectionConfig,
  MixSectionType,
  ParsedPastePreview,
  TypingDirection,
  ValidationReport,
  VersionPlan,
  VocabRow,
  WorksheetConfig,
  WorksheetFontStyle,
  WorksheetMetadata,
  WorksheetType,
} from '../types/worksheet';

export const mm = (value: number): number => (value * 72) / 25.4;

export const PAGE_A5: [number, number] = [mm(148), mm(210)];
export const PAGE_A4_PORTRAIT: [number, number] = [mm(210), mm(297)];
export const PAGE_A4_LANDSCAPE: [number, number] = [mm(297), mm(210)];

export const TEXT_TYPES = new Set<WorksheetType>(['typing-2', 'typing-3']);
export const IMAGE_TYPES = new Set<WorksheetType>([
  'flashcards',
  'anagram',
  'matching',
  'matching-2',
  'matching-3',
  'typing-image',
]);
export const MIX_SECTION_TYPES: MixSectionType[] = [
  'matching-3',
  'anagram',
  'matching-2',
  'typing-image',
  'typing-2',
  'typing-3',
];
export const AUTO_FILL_MIX_TYPES = new Set<MixSectionType>([
  'anagram',
  'matching-2',
  'typing-image',
  'typing-2',
  'typing-3',
]);

export const MIX_LABELS: Record<MixSectionType, string> = {
  'matching-3': 'Look and Match',
  anagram: 'Unscramble the Words',
  'matching-2': 'Picture Letter Match',
  'typing-image': 'Look and Write',
  'typing-2': 'Write in English',
  'typing-3': 'Write in Vietnamese',
};

export const WORKSHEET_META: WorksheetMetadata[] = [
  {
    type: 'flashcards',
    category: 'image',
    paperSpec: 'A5 Portrait (148 × 210 mm)',
    marginSpec: '3 mm all sides',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: false,
    densityNote: '42 cards / page (6 × 7)',
  },
  {
    type: 'anagram',
    category: 'image',
    paperSpec: 'A5 Portrait (148 × 210 mm)',
    marginSpec: '3 mm all sides',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: '10 items / page',
  },
  {
    type: 'word-scramble',
    category: 'text',
    paperSpec: 'A4 Portrait (210 × 297 mm)',
    marginSpec: '10 mm L/R · 10 mm T',
    needsImages: false,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: '14 items / page · letter tiles',
  },
  {
    type: 'matching',
    category: 'image',
    paperSpec: 'A5 Portrait (148 × 210 mm)',
    marginSpec: '10 mm L/T · 5 mm R/B',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: '6 items / set',
  },
  {
    type: 'matching-2',
    category: 'image',
    paperSpec: 'A5 Portrait (148 × 210 mm)',
    marginSpec: '7 mm L · 3.2 mm R',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: 'Up to 10 cards / group',
  },
  {
    type: 'matching-3',
    category: 'image',
    paperSpec: 'A5 Portrait or 2-Up A4 Landscape',
    marginSpec: '10 mm L/T · 5 mm R/B',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: '2–12 items / set',
  },
  {
    type: 'typing-image',
    category: 'image',
    paperSpec: 'A5 Portrait (148 × 210 mm)',
    marginSpec: '10 mm L/T · 5 mm R/B',
    needsImages: true,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: '28 items / page (2 × 14)',
  },
  {
    type: 'typing-2',
    category: 'text',
    paperSpec: 'A4 Landscape (297 × 210 mm)',
    marginSpec: '5 mm all sides',
    needsImages: false,
    needsVietnamese: true,
    hasAnswerKey: true,
    densityNote: 'Dual table · up to 40 rows',
  },
  {
    type: 'typing-3',
    category: 'text',
    paperSpec: 'A4 Landscape (297 × 210 mm)',
    marginSpec: '5 mm all sides',
    needsImages: false,
    needsVietnamese: true,
    hasAnswerKey: true,
    densityNote: 'Dual table · up to 40 rows',
  },
  {
    type: 'mix',
    category: 'mixed',
    paperSpec: 'A4 Portrait (210 × 297 mm)',
    marginSpec: '5–9 mm structured blocks',
    needsImages: false,
    needsVietnamese: false,
    hasAnswerKey: true,
    densityNote: 'Multi-section auto-pack',
  },
];

export const DEFAULT_MIX_SECTIONS: MixSectionConfig[] = [
  { type: 'matching-3', enabled: true, target: 4 },
  { type: 'anagram', enabled: true, target: 4 },
  { type: 'matching-2', enabled: false, target: 5 },
  { type: 'typing-image', enabled: true, target: 4 },
  { type: 'typing-2', enabled: false, target: 4 },
  { type: 'typing-3', enabled: false, target: 4 },
];

export interface DifficultyProfile {
  fontScale: number;
  anagramPerPage: number;
  wordScramblePerPage: number;
  typing1GridPerPage: number;
  typing1GridUnitMm: GridCellSize;
  vocabMaxRowMm: number;
  revealFirstLetter: boolean;
  wordScrambleLetterSlots: boolean;
  defaultFontStyle: WorksheetFontStyle;
  defaultGridlines: boolean;
  defaultShowSample: boolean;
  defaultShowHint: boolean;
}

export const DIFFICULTY_PROFILES: Record<DifficultyLevel, DifficultyProfile> = {
  beginner: {
    fontScale: 1.16,
    anagramPerPage: 8,
    wordScramblePerPage: 10,
    typing1GridPerPage: 8,
    typing1GridUnitMm: 2.5,
    vocabMaxRowMm: 8.4,
    revealFirstLetter: true,
    wordScrambleLetterSlots: true,
    defaultFontStyle: 'dotted',
    defaultGridlines: true,
    defaultShowSample: true,
    defaultShowHint: true,
  },
  intermediate: {
    fontScale: 1.0,
    anagramPerPage: 10,
    wordScramblePerPage: 14,
    typing1GridPerPage: 10,
    typing1GridUnitMm: 2,
    vocabMaxRowMm: 7.2,
    revealFirstLetter: false,
    wordScrambleLetterSlots: true,
    defaultFontStyle: 'penmanship',
    defaultGridlines: false,
    defaultShowSample: false,
    defaultShowHint: true,
  },
  advanced: {
    fontScale: 0.93,
    anagramPerPage: 12,
    wordScramblePerPage: 18,
    typing1GridPerPage: 12,
    typing1GridUnitMm: 2,
    vocabMaxRowMm: 6.4,
    revealFirstLetter: false,
    wordScrambleLetterSlots: false,
    defaultFontStyle: 'clean',
    defaultGridlines: false,
    defaultShowSample: false,
    defaultShowHint: false,
  },
};

export function getDifficultyProfile(level?: DifficultyLevel): DifficultyProfile {
  return DIFFICULTY_PROFILES[level || 'intermediate'] || DIFFICULTY_PROFILES.intermediate;
}

export const DEFAULT_CONFIG: WorksheetConfig = {
  selectedTypes: ['flashcards', 'matching-2'],
  versionCount: 1,
  previewVersion: 1,
  matching3Count: 6,
  matching3TwoUp: false,
  typingWordLimit: '',
  typingDirection: 'vi-to-en',
  typingImageGridlines: false,
  typingImageGridSize: 2,
  typingImageGridBlocks: 4,
  typingImageShowSample: false,
  guidelineOverlay: false,
  wordScrambleShowHint: true,
  difficulty: 'intermediate',
  mixOptimize: true,
  mixSections: DEFAULT_MIX_SECTIONS,
  studentHeader: 'Full name: ________________________   Class: __________',
  includeAnswerKeys: true,
  fontStyle: 'penmanship',
  fontSize: 'small',
  customFontId: null,
  customFontScale: 1,
  customFontBaselineOffset: 0,
};

export function cleanText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeHeader(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function numericId(value: unknown): string {
  const cleaned = cleanText(value);
  if (!cleaned) return '';
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
}

export function imageKeyFromFilename(name: string): string {
  const base = cleanText(name).split('/').pop() ?? '';
  if (base.startsWith('.') || name.includes('__MACOSX')) return '';
  const stem = base.replace(/\.[^.]+$/, '');
  return numericId(stem);
}

export function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
  };
  return map[ext] || 'image/png';
}

export function makeUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePairKey(en: string, vi: string): string {
  return `${cleanText(en).toLocaleLowerCase()}\u0000${cleanText(vi).toLocaleLowerCase()}`;
}

export function hasVietnameseDiacritics(value: string): boolean {
  return /[à-ỹđ]/i.test(cleanText(value).normalize('NFC'));
}

export function looksEnglish(value: string): boolean {
  return /^[a-z][a-z .,'’!?-]*$/i.test(cleanText(value));
}

export function detectPasteDirection(first: string, second: string): TypingDirection | 'uncertain' {
  if (hasVietnameseDiacritics(first) && !hasVietnameseDiacritics(second)) return 'vi-to-en';
  if (!hasVietnameseDiacritics(first) && hasVietnameseDiacritics(second)) return 'en-to-vi';
  if (looksEnglish(first) && !looksEnglish(second)) return 'en-to-vi';
  if (!looksEnglish(first) && looksEnglish(second)) return 'vi-to-en';
  return 'uncertain';
}

function headerPasteDirection(first: string, second: string): TypingDirection | '' {
  const left = normalizeHeader(first);
  const right = normalizeHeader(second);
  if (['english', 'en', 'tienganh'].includes(left) && ['viet', 'vi', 'tiengviet', 'vietnamese'].includes(right)) {
    return 'en-to-vi';
  }
  if (['viet', 'vi', 'tiengviet', 'vietnamese'].includes(left) && ['english', 'en', 'tienganh'].includes(right)) {
    return 'vi-to-en';
  }
  return '';
}

export function parsePastedPairs(raw: string): ParsedPastePreview {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('Paste at least one line with two columns separated by a Tab or comma.');
  }

  const splitLine = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t').map(cleanText);
    if (line.includes('|')) return line.split('|').map(cleanText);
    if (line.includes(' - ')) return line.split(' - ').map(cleanText);
    return line.split(',').map(cleanText);
  };

  const pairs = lines.map(splitLine);
  if (pairs.some((cells) => cells.length < 2 || !cells[0] || !cells[1])) {
    throw new Error('Every line needs two columns separated by Tab (copied directly from Excel / Sheets).');
  }

  let direction: TypingDirection | 'uncertain' | '' = headerPasteDirection(pairs[0][0], pairs[0][1]);
  const data = direction ? pairs.slice(1) : pairs;
  if (!data.length) {
    throw new Error('No vocabulary rows found below the header row.');
  }

  if (!direction) {
    const guesses = data.map(([a, b]) => detectPasteDirection(a, b));
    const found = guesses.find((d) => d !== 'uncertain');
    direction = found || 'uncertain';
  }

  return {
    direction,
    pairs: data.map(([first, second], idx) => ({
      first,
      second,
      sourceRow: idx + 1,
    })),
  };
}

export function orientPastedPairs(
  parsed: ParsedPastePreview,
  direction: TypingDirection,
  startingId: number
): VocabRow[] {
  return parsed.pairs.map(({ first, second }, idx) => ({
    uid: makeUid(),
    id: startingId + idx,
    en: direction === 'vi-to-en' ? second : first,
    vi: direction === 'vi-to-en' ? first : second,
    imageId: '',
    source: 'paste',
  }));
}

export async function parseExcelFile(file: File): Promise<VocabRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: '',
  });

  const nonEmpty = matrix.filter((row) =>
    Array.isArray(row) && row.some((cell) => cleanText(cell) !== '')
  );
  if (nonEmpty.length < 2) {
    throw new Error('Spreadsheet must include a header row and at least one vocabulary row.');
  }

  const headers = nonEmpty[0].map(normalizeHeader);
  const findCol = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

  const idIdx = findCol(['stt', 'no', 'id', 'index', 'number']);
  const enIdx = findCol(['english', 'en', 'word', 'term', 'tienganh', 'vocabulary']);
  const viIdx = findCol(['viet', 'vi', 'vietnamese', 'meaning', 'tiengviet', 'nghia']);
  const imgIdx = findCol(['idanh', 'imageid', 'imgid', 'anh', 'image', 'pictureid']);

  if (enIdx < 0 && viIdx < 0) {
    throw new Error('Missing required columns. Expected headers: STT, English, Viet, ID_Anh.');
  }

  const rows: VocabRow[] = [];
  for (let r = 1; r < nonEmpty.length; r += 1) {
    const cells = nonEmpty[r];
    const en = enIdx >= 0 ? cleanText(cells[enIdx]) : '';
    const vi = viIdx >= 0 ? cleanText(cells[viIdx]) : '';
    if (!en && !vi) continue;
    const rawId = idIdx >= 0 ? Number(cleanText(cells[idIdx])) : r;
    const id = Number.isInteger(rawId) && rawId > 0 ? rawId : r;
    const imageId = imgIdx >= 0 ? numericId(cells[imgIdx]) : '';
    rows.push({
      uid: makeUid(),
      id,
      en,
      vi,
      imageId,
      source: 'excel',
    });
  }

  if (!rows.length) {
    throw new Error('No readable vocabulary entries found in this spreadsheet.');
  }

  return rows;
}

export function downloadExcelTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['STT', 'English', 'Viet', 'ID_Anh'],
    [1, 'apple', 'quả táo', 1],
    [2, 'cat', 'con mèo', 2],
    [3, 'school bus', 'xe buýt trường học', 3],
    [4, 'ice cream', 'kem', 4],
    [5, 'bicycle', 'xe đạp', 5],
    [6, 'umbrella', 'cái ô', 6],
  ]);
  sheet['!cols'] = [{ wch: 8 }, { wch: 24 }, { wch: 26 }, { wch: 10 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Vocabulary');
  XLSX.writeFile(book, 'JoyEnglish_Template.xlsx');
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

export function isSupportedImageFile(name: string): boolean {
  const base = cleanText(name).split('/').pop() ?? '';
  if (!base || base.startsWith('.') || name.includes('__MACOSX')) return false;
  const ext = base.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export function fileExtensionOf(name: string, fallbackMime = 'image/png'): string {
  const base = cleanText(name).split('/').pop() ?? '';
  const ext = base.includes('.') ? base.split('.').pop()?.toLowerCase() ?? '' : '';
  if (IMAGE_EXTENSIONS.has(ext)) return ext;
  if (fallbackMime === 'image/jpeg') return 'jpg';
  if (fallbackMime === 'image/webp') return 'webp';
  return 'png';
}

export function slugifyWord(word: string): string {
  const slug = cleanText(word)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'image';
}

export type RenamePattern = 'id' | 'id-word' | 'word';

export function buildRenamedFilename(
  pattern: RenamePattern,
  targetId: string,
  word: string,
  originalName: string,
  mime = 'image/png'
): string {
  const ext = fileExtensionOf(originalName, mime);
  const cleanId = numericId(targetId);
  const slug = slugifyWord(word);

  if (pattern === 'id') {
    return `${cleanId || slug}.${ext}`;
  }
  if (pattern === 'word') {
    return `${slug}.${ext}`;
  }
  return cleanId ? `${cleanId}_${slug}.${ext}` : `${slug}.${ext}`;
}

export function matchAssetToRow(assetName: string, rows: VocabRow[]): VocabRow | null {
  const base = cleanText(assetName).split('/').pop() ?? '';
  const stem = base.replace(/\.[^.]+$/, '');
  if (!stem) return null;

  // 1. Exact numeric ID match against row.imageId or row.id
  const num = numericId(stem);
  if (num) {
    const byImgId = rows.find((r) => numericId(r.imageId) === num);
    if (byImgId) return byImgId;
    const byRowId = rows.find((r) => String(r.id) === num);
    if (byRowId) return byRowId;
  }

  // Strip leading numeric prefix like "12_school_bus" -> "school_bus"
  const stripped = stem.replace(/^\d+[_\-\s]+/, '');
  const normStem = normalizeHeader(stripped || stem);
  if (!normStem) return null;

  // 2. Exact normalized English word match
  const exact = rows.find((r) => r.en && normalizeHeader(r.en) === normStem);
  if (exact) return exact;

  // 3. Token / substring match (prefer longest matching English word to avoid "cat" matching "caterpillar")
  const candidates = rows
    .filter((r) => {
      const normEn = normalizeHeader(r.en);
      if (normEn.length < 2) return false;
      return normStem.includes(normEn) || normEn.includes(normStem);
    })
    .sort((a, b) => normalizeHeader(b.en).length - normalizeHeader(a.en).length);

  return candidates[0] || null;
}

export async function parseImagesZip(
  file: File
): Promise<{ assets: Map<string, ImageAsset>; numericCount: number; unmappedCount: number }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const assets = new Map<string, ImageAsset>();
  const entries = Object.entries(zip.files);
  let numericCount = 0;
  let unmappedCount = 0;

  for (const [name, entry] of entries) {
    if (entry.dir || !isSupportedImageFile(name)) continue;
    const baseName = name.split('/').pop() || name;
    const numericKey = imageKeyFromFilename(baseName);
    const key = numericKey || `file:${baseName}`;
    if (numericKey) numericCount += 1;
    else unmappedCount += 1;

    const mime = mimeFromFilename(baseName);
    const bytes = await entry.async('uint8array');
    const safeBytes = new Uint8Array(bytes);
    const blob = new Blob([safeBytes], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    assets.set(key, {
      id: key,
      name: baseName,
      mime,
      bytes: safeBytes,
      objectUrl,
    });
  }

  if (!assets.size) {
    throw new Error('No supported image files (PNG, JPG, WEBP, GIF, BMP) were found inside this ZIP.');
  }
  return { assets, numericCount, unmappedCount };
}

export async function downloadRenamedImagesZip(assets: ImageAsset[]): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Map<string, number>();

  for (const asset of assets) {
    const ext = fileExtensionOf(asset.name, asset.mime);
    const stem = asset.name.replace(/\.[^.]+$/, '');
    let finalName = asset.name;
    const count = usedNames.get(finalName.toLowerCase()) || 0;
    if (count > 0) {
      finalName = `${stem}_${count + 1}.${ext}`;
    }
    usedNames.set(asset.name.toLowerCase(), count + 1);
    zip.file(finalName, asset.bytes);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'JoyEnglish_Renamed_Images.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function fileToImageAsset(file: File, targetId: string): Promise<ImageAsset> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const mime = file.type || mimeFromFilename(file.name);
  const blob = new Blob([bytes], { type: mime });
  return {
    id: targetId,
    name: file.name,
    mime,
    bytes,
    objectUrl: URL.createObjectURL(blob),
  };
}

// Seeded PRNG for deterministic exam version ordering between live preview & PDF export
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function scrambleWord(word: string, seed: number): string {
  const rand = mulberry32(seed);
  const scrambleToken = (token: string): string => {
    const chars = [...token];
    if (chars.length <= 2) return chars.reverse().join('');
    const unique = new Set(chars.map((c) => c.toLowerCase()));
    if (unique.size <= 1) return token;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const copy = [...chars];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      const candidate = copy.join('');
      if (candidate.toLowerCase() !== token.toLowerCase()) return candidate;
    }
    return chars.slice(1).concat(chars[0]).join('');
  };

  return cleanText(word)
    .split(' ')
    .map((part) => scrambleToken(part))
    .join('  /  ');
}

export function mixMatchingTerms(items: VocabRow[], seed: number): MatchingTermEntry[] {
  const shuffled = seededShuffle(items, seed);
  // Avoid every item staying in its original slot when possible
  if (shuffled.length > 1 && shuffled.every((item, idx) => item.uid === items[idx].uid)) {
    const first = shuffled.shift();
    if (first) shuffled.push(first);
  }
  return shuffled.map((item, idx) => ({
    letter: String.fromCharCode(65 + idx),
    item,
  }));
}

// Matching 2 exact geometry constants (matching original repository)
export const MATCHING2_LEFT = mm(7);
export const MATCHING2_RIGHT = mm(3.2);
export const WORKSHEET_TOP = mm(10);
export const WORKSHEET_HEADER_H = mm(10);
export const MATCHING2_LAYOUT = {
  cardGap: mm(2.2),
  cardHeight: mm(26),
  cardPadding: mm(1.4),
  labelHeight: mm(4.2),
  imageHeight: mm(19),
  promptRowHeight: mm(6.8),
  promptSize: 11,
  promptMinSize: 7.5,
  letterSize: 11,
};

export function buildMatching2Plan(items: VocabRow[], seed: number): Matching2Group[][] {
  const pages: Matching2Group[][] = [];
  const perPage = 10;
  for (let start = 0; start < items.length; start += perPage) {
    const slice = items.slice(start, start + perPage);
    const groupSizes = slice.length > 5 ? [5, slice.length - 5] : [slice.length];
    const groups: Matching2Group[] = [];
    let top = WORKSHEET_TOP + WORKSHEET_HEADER_H;
    let cursor = 0;

    groupSizes.forEach((size, gIdx) => {
      const pictures = slice.slice(cursor, cursor + size);
      cursor += size;
      const prompts = seededShuffle(pictures, seed + start * 31 + gIdx * 97 + 13).sort(
        (a, b) => a.en.length - b.en.length
      );
      const imageRows = Math.ceil(pictures.length / 5);
      const promptRows = Math.ceil(prompts.length / 3);
      const imageBlockHeight =
        imageRows * MATCHING2_LAYOUT.cardHeight + Math.max(0, imageRows - 1) * MATCHING2_LAYOUT.cardGap;
      const height = imageBlockHeight + mm(2) + promptRows * MATCHING2_LAYOUT.promptRowHeight;
      groups.push({
        pictures,
        prompts,
        geometry: {
          top,
          imageRows,
          promptTop: top + imageBlockHeight + mm(2),
          promptRows,
          height,
        },
      });
      top += height + mm(4);
    });

    pages.push(groups);
  }
  return pages;
}

// Mix A4 layout & optimization engine
export const MIX_MATCHING2 = {
  titleHeight: mm(6),
  cardGap: mm(2.5),
  cardHeight: mm(28),
  cardPadding: mm(1.5),
  labelHeight: mm(4.5),
  imageHeight: mm(20),
  promptRowHeight: mm(7),
  promptSize: 10.5,
  promptMinSize: 7.5,
  groupGap: mm(4),
};

export const MIX_TYPING_ROW_HEIGHT = mm(12);
export const MIX_ANAGRAM_ROW_HEIGHT = mm(11);
export const MIX_MATCHING3_ROW_HEIGHT = mm(12.5);

function eligibleForMixType(row: VocabRow & { hasImage: boolean }, type: MixSectionType): boolean {
  if (!cleanText(row.en)) return false;
  if (IMAGE_TYPES.has(type)) return !!cleanText(row.imageId) && row.hasImage;
  if (TEXT_TYPES.has(type)) return !!cleanText(row.vi);
  return false;
}

function validMixGroupSize(type: MixSectionType, count: number): boolean {
  if (type === 'matching-2') return count >= 5 && count % 5 === 0;
  if (type === 'matching-3') return count >= 2 && count <= 12;
  return count > 0;
}

function estimateSectionHeight(section: MixPlannedSection): number {
  const titleH = mm(8);
  if (section.type === 'matching-3') {
    return titleH + section.items.length * MIX_MATCHING3_ROW_HEIGHT + mm(4);
  }
  if (section.type === 'anagram') {
    return titleH + section.items.length * MIX_ANAGRAM_ROW_HEIGHT + mm(4);
  }
  if (section.type === 'matching-2') {
    const groups = Math.ceil(section.items.length / 5);
    const perGroup = MIX_MATCHING2.cardHeight + mm(2) + Math.ceil(5 / 3) * MIX_MATCHING2.promptRowHeight + MIX_MATCHING2.groupGap;
    return titleH + groups * perGroup;
  }
  // typing-image, typing-2, typing-3 in 2 columns
  const rows = Math.ceil(section.items.length / 2);
  return titleH + rows * MIX_TYPING_ROW_HEIGHT + mm(4);
}

export function buildMixPageLayout(sections: MixPlannedSection[], seed: number): MixPageLayout[] {
  const usableTop = mm(16);
  const usableBottom = PAGE_A4_PORTRAIT[1] - mm(10);
  const usableHeight = usableBottom - usableTop;
  const contentX = mm(9);
  const contentW = PAGE_A4_PORTRAIT[0] - mm(18);

  const pages: MixPageLayout[] = [];
  let currentBlocks: MixPageBlock[] = [];
  let cursorY = usableTop;

  const flushPage = () => {
    if (currentBlocks.length) {
      pages.push({ blocks: currentBlocks });
      currentBlocks = [];
      cursorY = usableTop;
    }
  };

  sections.forEach((section, sIdx) => {
    // Decorate section with deterministic sub-plans
    if (section.type === 'anagram') {
      section.anagramEntries = section.items.map((item, idx) => ({
        item,
        scrambled: scrambleWord(item.en, seed + sIdx * 73 + idx * 17 + 5),
      }));
    } else if (section.type === 'matching-3') {
      section.matchingTerms = mixMatchingTerms(section.items, seed + sIdx * 89 + 11);
    } else if (section.type === 'matching-2') {
      const groups: NonNullable<MixPlannedSection['matching2Groups']> = [];
      for (let i = 0; i < section.items.length; i += 5) {
        const pictures = section.items.slice(i, i + 5);
        const prompts = seededShuffle(pictures, seed + i * 29 + 19);
        const imageHeight = MIX_MATCHING2.cardHeight;
        const promptRows = Math.ceil(prompts.length / 3);
        const height = imageHeight + mm(2) + promptRows * MIX_MATCHING2.promptRowHeight;
        groups.push({ pictures, prompts, imageHeight, promptRows, height });
      }
      section.matching2Groups = groups;
    }

    const blockH = estimateSectionHeight(section);

    // Matching 3 always starts cleanly on page 1
    if (section.type === 'matching-3') {
      flushPage();
      currentBlocks.push({
        x: contentX,
        y: cursorY,
        width: contentW,
        height: blockH,
        section: { ...section, offset: 0 },
      });
      cursorY += blockH + mm(4);
      return;
    }

    if (cursorY + blockH > usableBottom && currentBlocks.length > 0) {
      flushPage();
    }

    // If a single typing or anagram section is taller than a whole page, split cleanly across pages
    if (blockH > usableHeight && ['anagram', 'typing-image', 'typing-2', 'typing-3'].includes(section.type)) {
      const isTwoCol = section.type !== 'anagram';
      const rowH = isTwoCol ? MIX_TYPING_ROW_HEIGHT : MIX_ANAGRAM_ROW_HEIGHT;
      const maxRows = Math.max(1, Math.floor((usableHeight - mm(12)) / rowH));
      const chunkSize = isTwoCol ? maxRows * 2 : maxRows;
      for (let offset = 0; offset < section.items.length; offset += chunkSize) {
        flushPage();
        const subItems = section.items.slice(offset, offset + chunkSize);
        const subSection: MixPlannedSection = {
          ...section,
          items: subItems,
          offset,
          anagramEntries: section.anagramEntries?.slice(offset, offset + chunkSize),
        };
        const subH = estimateSectionHeight(subSection);
        currentBlocks.push({
          x: contentX,
          y: cursorY,
          width: contentW,
          height: subH,
          section: subSection,
        });
        cursorY += subH + mm(4);
      }
      return;
    }

    currentBlocks.push({
      x: contentX,
      y: cursorY,
      width: contentW,
      height: blockH,
      section: { ...section, offset: 0 },
    });
    cursorY += blockH + mm(4);
  });

  flushPage();
  return pages;
}

export function buildMixPlan(
  inputRows: VocabRow[],
  images: Map<string, ImageAsset>,
  mixConfigs: MixSectionConfig[],
  optimizePaper: boolean,
  seed: number
): MixPlan {
  const rows = inputRows.map((row) => ({
    ...row,
    hasImage: !!row.imageId && images.has(numericId(row.imageId)),
  }));

  const errors: string[] = [];
  const warnings: string[] = [];

  const requested = mixConfigs
    .filter((s) => s.enabled && s.target > 0)
    .map((s, order) => ({ ...s, order }));

  if (!requested.length) {
    errors.push('Select at least one section for the Mix A4 sheet.');
  }

  for (const req of requested) {
    if (!validMixGroupSize(req.type, req.target)) {
      if (req.type === 'matching-3') {
        errors.push('Mix Matching 3 requires between 2 and 12 questions.');
      } else if (req.type === 'matching-2') {
        errors.push('Mix Matching 2 requires a multiple of 5 questions (5, 10, 15...).');
      } else {
        errors.push(`${MIX_LABELS[req.type]} requires at least 1 question.`);
      }
    }
  }

  // Matching 3 always goes first
  const ordered = [...requested].sort((a, b) =>
    a.type === 'matching-3' ? -1 : b.type === 'matching-3' ? 1 : a.order - b.order
  );

  const unused = rows.slice();
  const sections: MixPlannedSection[] = [];

  for (const req of ordered) {
    const candidates = unused.filter((r) => eligibleForMixType(r, req.type));
    if (candidates.length < req.target) {
      errors.push(
        `${MIX_LABELS[req.type]} needs ${req.target} eligible words, but only ${candidates.length} unused word(s) qualify.`
      );
      continue;
    }
    const picked = candidates.slice(0, req.target);
    const pickedUids = new Set(picked.map((r) => r.uid));
    for (let i = unused.length - 1; i >= 0; i -= 1) {
      if (pickedUids.has(unused[i].uid)) unused.splice(i, 1);
    }
    sections.push({
      type: req.type,
      label: MIX_LABELS[req.type],
      target: req.target,
      requested: req.target,
      autoAdded: 0,
      items: picked,
      order: sections.length,
    });
  }

  const autoAddedByType: Record<string, number> = {};

  // Paper optimization: pack remaining unused words into existing selected auto-fill sections if they fit on the last page
  if (optimizePaper && !errors.length && unused.length > 0 && sections.length > 0) {
    const usableBottom = PAGE_A4_PORTRAIT[1] - mm(10);
    const initialPages = buildMixPageLayout(sections, seed);
    const lastPage = initialPages[initialPages.length - 1];
    if (lastPage && lastPage.blocks.length > 0) {
      const lastBlock = lastPage.blocks[lastPage.blocks.length - 1];
      let freeHeight = usableBottom - (lastBlock.y + lastBlock.height + mm(4));

      for (const section of sections) {
        if (!AUTO_FILL_MIX_TYPES.has(section.type) || freeHeight <= mm(12)) continue;
        const candidates = unused.filter((r) => eligibleForMixType(r, section.type));
        if (!candidates.length) continue;

        let maxExtra = 0;
        if (section.type === 'matching-2') {
          const groupH = MIX_MATCHING2.cardHeight + mm(2) + 2 * MIX_MATCHING2.promptRowHeight + MIX_MATCHING2.groupGap;
          const groupsFit = Math.floor(freeHeight / groupH);
          maxExtra = Math.min(groupsFit * 5, Math.floor(candidates.length / 5) * 5);
        } else if (section.type === 'anagram') {
          maxExtra = Math.min(Math.floor(freeHeight / MIX_ANAGRAM_ROW_HEIGHT), candidates.length);
        } else {
          // 2-column typing
          const oddPad = section.items.length % 2 === 1 ? 1 : 0;
          const extraRows = Math.floor(freeHeight / MIX_TYPING_ROW_HEIGHT);
          maxExtra = Math.min(oddPad + extraRows * 2, candidates.length);
        }

        if (maxExtra > 0) {
          const prevH = estimateSectionHeight(section);
          const added = candidates.slice(0, maxExtra);
          section.items.push(...added);
          section.autoAdded += added.length;
          autoAddedByType[section.type] = (autoAddedByType[section.type] || 0) + added.length;
          const addedUids = new Set(added.map((r) => r.uid));
          for (let i = unused.length - 1; i >= 0; i -= 1) {
            if (addedUids.has(unused[i].uid)) unused.splice(i, 1);
          }
          const nextH = estimateSectionHeight(section);
          freeHeight -= Math.max(0, nextH - prevH);
        }
      }
    }
  }

  const pages = errors.length ? [] : buildMixPageLayout(sections, seed);
  const usedIds = sections.flatMap((s) => s.items.map((r) => r.uid));

  return {
    rows,
    sections,
    pages,
    warnings,
    errors,
    usedIds,
    unused,
    remainingCount: unused.length,
    totalUnique: rows.length,
    autoAddedByType,
  };
}

export function validateDataset(
  rows: VocabRow[],
  images: Map<string, ImageAsset>,
  config: WorksheetConfig
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validImageRows = rows.filter(
    (r) => cleanText(r.en) && cleanText(r.imageId) && images.has(numericId(r.imageId))
  );
  const validTextRows = rows.filter((r) => cleanText(r.en) && cleanText(r.vi));

  const missingImageIds = rows
    .filter((r) => cleanText(r.imageId) && !images.has(numericId(r.imageId)))
    .map((r) => r.imageId);

  const seenPairs = new Map<string, number>();
  const duplicatePairs: string[] = [];
  for (const row of rows) {
    if (cleanText(row.en) && cleanText(row.vi)) {
      const key = normalizePairKey(row.en, row.vi);
      if (seenPairs.has(key)) {
        duplicatePairs.push(`${row.en} / ${row.vi}`);
      } else {
        seenPairs.set(key, row.id);
      }
    }
  }

  if (missingImageIds.length > 0) {
    warnings.push(
      `${missingImageIds.length} row(s) reference image IDs not found in the picture archive (${missingImageIds.slice(0, 5).join(', ')}${missingImageIds.length > 5 ? '…' : ''}).`
    );
  }
  if (duplicatePairs.length > 0) {
    warnings.push(`Duplicate English/Vietnamese pair detected: ${duplicatePairs[0]}.`);
  }

  if (!config.selectedTypes.length) {
    errors.push('Select at least one worksheet format.');
  }

  const needsImages = config.selectedTypes.some((t) => IMAGE_TYPES.has(t));
  const needsText = config.selectedTypes.some((t) => TEXT_TYPES.has(t));

  if (needsImages && validImageRows.length === 0) {
    errors.push('Selected image worksheets require at least one word with a matched picture.');
  }

  if (needsText && validTextRows.length === 0) {
    errors.push('Typing 2 and Typing 3 require rows with both English and Vietnamese columns filled.');
  }

  if (config.selectedTypes.includes('word-scramble')) {
    const validEnglishRows = rows.filter((r) => cleanText(r.en).length > 0);
    if (validEnglishRows.length === 0) {
      errors.push('Word Scramble requires at least one row with an English word.');
    }
  }

  if (config.selectedTypes.includes('matching-3')) {
    if (config.matching3Count < 2 || config.matching3Count > 12) {
      errors.push('Matching 3 question count must be between 2 and 12.');
    } else if (validImageRows.length < config.matching3Count) {
      errors.push(
        `Matching 3 is set to ${config.matching3Count} questions, but only ${validImageRows.length} illustrated word(s) are available.`
      );
    }
  }

  if (config.selectedTypes.includes('mix')) {
    const mixCheck = buildMixPlan(rows, images, config.mixSections, config.mixOptimize, 101);
    errors.push(...mixCheck.errors);
  }

  return {
    errors,
    warnings,
    validImageRows,
    validTextRows,
    missingImageIds,
    duplicatePairs,
  };
}

export function buildVersionPlan(
  version: number,
  rows: VocabRow[],
  images: Map<string, ImageAsset>,
  config: WorksheetConfig,
  shuffleNonce = 0
): VersionPlan {
  const seed = version * 1009 + shuffleNonce * 7919 + 42;
  const validImageRows = rows.filter(
    (r) => cleanText(r.en) && cleanText(r.imageId) && images.has(numericId(r.imageId))
  );
  const validTextRows = rows.filter((r) => cleanText(r.en) && cleanText(r.vi));

  const limitNum = Number(config.typingWordLimit);
  const limitedText =
    Number.isInteger(limitNum) && limitNum > 0
      ? validTextRows.slice(0, limitNum)
      : validTextRows;

  const shouldShuffleBase = version > 1 || shuffleNonce > 0;
  const imageOrder = shouldShuffleBase ? seededShuffle(validImageRows, seed) : [...validImageRows];
  const textOrder = shouldShuffleBase ? seededShuffle(limitedText, seed + 17) : [...limitedText];
  const allRowsOrdered = shouldShuffleBase ? seededShuffle(rows, seed + 37) : [...rows];

  const anagramEntries: AnagramEntry[] = imageOrder.map((item, idx) => ({
    item,
    scrambled: scrambleWord(item.en, seed + idx * 53 + 7),
  }));

  const validEnglishRows = allRowsOrdered.filter((r) => cleanText(r.en).length > 0);
  const wordScrambleEntries: AnagramEntry[] = validEnglishRows.map((item, idx) => ({
    item,
    scrambled: scrambleWord(item.en, seed + idx * 67 + 29),
  }));

  const matchingOrders: MatchingTermEntry[][] = [];
  for (let start = 0; start < imageOrder.length; start += 6) {
    matchingOrders.push(mixMatchingTerms(imageOrder.slice(start, start + 6), seed + start * 23 + 3));
  }

  const m3Items = imageOrder.slice(0, Math.min(config.matching3Count, imageOrder.length));
  const matching3: Matching3Plan = {
    items: m3Items,
    twoUp: config.matching3TwoUp,
    panels: config.matching3TwoUp
      ? [mixMatchingTerms(m3Items, seed + 111), mixMatchingTerms(m3Items, seed + 337)]
      : [mixMatchingTerms(m3Items, seed + 111)],
  };

  const matching2 = buildMatching2Plan(imageOrder, seed + 223);

  const mix = config.selectedTypes.includes('mix')
    ? buildMixPlan(allRowsOrdered, images, config.mixSections, config.mixOptimize, seed + 509)
    : null;

  return {
    version,
    seed,
    imageOrder,
    textOrder,
    anagramEntries,
    wordScrambleEntries,
    matchingOrders,
    matching3,
    matching2,
    mix,
  };
}
