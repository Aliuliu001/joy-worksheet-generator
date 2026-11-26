import { CustomFontAsset } from '../types/worksheet';

const DB_NAME = 'joyenglish_custom_fonts_v1';
const DB_VERSION = 1;
const STORE_NAME = 'fonts';
const MAX_FONT_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling

interface StoredCustomFontRecord {
  id: string;
  name: string;
  fileName: string;
  format: 'ttf' | 'otf';
  familyName: string;
  buffer: ArrayBuffer;
  scale: number;
  baselineOffset: number;
  letterSpacing?: number;
  ligatureOverlaps?: Record<string, number>;
  uploadedAt: string;
}

const fontRegistry = new Map<string, CustomFontAsset>();
const loadedFaceRegistry = new Map<string, FontFace>();

export function clampCustomScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.5, Math.min(1.8, Math.round(value * 100) / 100));
}

export function clampBaselineOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-0.5, Math.min(0.5, Math.round(value * 100) / 100));
}

export function clampLetterSpacing(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-0.12, Math.min(0.35, Math.round(value * 100) / 100));
}

export function clampLigatureOverlap(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-30, Math.min(40, Math.round(value)));
}

export function normalizeLigaturePairKey(raw: string): string | null {
  const compact = String(raw || '').replace(/\s+/g, '').toLowerCase();
  const chars = Array.from(compact);
  if (chars.length < 2) return null;
  return `${chars[0]}${chars[1]}`;
}

export function sanitizeLigatureOverlaps(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    const key = normalizeLigaturePairKey(rawKey);
    if (!key) continue;
    const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
    if (!Number.isFinite(num)) continue;
    out[key] = clampLigatureOverlap(num);
  }
  return out;
}

export function hasActiveLigatureOverlaps(overlaps?: Record<string, number> | null): boolean {
  if (!overlaps) return false;
  for (const val of Object.values(overlaps)) {
    if (typeof val === 'number' && Math.abs(val) >= 0.5) return true;
  }
  return false;
}

export function serializeLigatureOverlapsKey(overlaps?: Record<string, number> | null): string {
  if (!overlaps) return '';
  return Object.entries(overlaps)
    .filter(([, v]) => typeof v === 'number' && Math.abs(v) >= 0.5)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${Math.round(v)}`)
    .join(',');
}

function openFontDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function isValidFontHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  // TrueType (0x00010000)
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return true;
  // OpenType CFF ('OTTO')
  if (b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f) return true;
  // Apple TrueType ('true')
  if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) return true;
  // PostScript Type 1 ('typ1')
  if (b0 === 0x74 && b1 === 0x79 && b2 === 0x70 && b3 === 0x31) return true;
  // TrueType Collection ('ttcf')
  if (b0 === 0x74 && b1 === 0x74 && b2 === 0x63 && b3 === 0x66) return true;
  return false;
}

function cleanDisplayName(fileName: string): string {
  const withoutExt = fileName.replace(/\.(ttf|otf)$/i, '').trim();
  const normalized = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || 'Custom Font';
}

function createFontId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cf_${Date.now().toString(36)}_${rand}`;
}

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function registerBrowserFontFace(asset: CustomFontAsset): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  if (loadedFaceRegistry.has(asset.id)) return;
  const face = new FontFace(asset.familyName, toArrayBufferCopy(asset.bytes));
  const loaded = await face.load();
  document.fonts.add(loaded);
  loadedFaceRegistry.set(asset.id, loaded);
}

export function getCustomFontById(id: string | null | undefined): CustomFontAsset | null {
  if (!id) return null;
  return fontRegistry.get(id) || null;
}

export function getCustomFontFamily(id: string | null | undefined): string | null {
  const asset = getCustomFontById(id);
  return asset ? asset.familyName : null;
}

export function getAllCustomFonts(): CustomFontAsset[] {
  return Array.from(fontRegistry.values()).sort((a, b) =>
    a.uploadedAt.localeCompare(b.uploadedAt)
  );
}

export async function ensureCustomFontFaceLoaded(id: string | null | undefined): Promise<void> {
  const asset = getCustomFontById(id);
  if (!asset) return;
  if (!loadedFaceRegistry.has(asset.id)) {
    try {
      await registerBrowserFontFace(asset);
    } catch {
      // Ignore if font cannot load into browser FontFaceSet
    }
  }
  if (typeof document !== 'undefined' && document.fonts?.load) {
    try {
      await document.fonts.load(`16px "${asset.familyName}"`);
    } catch {
      // Ignore load errors
    }
  }
}

export async function loadStoredCustomFonts(): Promise<CustomFontAsset[]> {
  const db = await openFontDb();
  if (!db) return getAllCustomFonts();

  const records = await new Promise<StoredCustomFontRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  const loadedAssets: CustomFontAsset[] = [];
  for (const rec of records) {
    if (!rec || !rec.id || !rec.buffer) continue;
    const bytes = new Uint8Array(rec.buffer);
    const asset: CustomFontAsset = {
      id: rec.id,
      name: rec.name || cleanDisplayName(rec.fileName || 'Custom Font'),
      fileName: rec.fileName || `${rec.name || 'font'}.ttf`,
      format: rec.format === 'otf' ? 'otf' : 'ttf',
      familyName: rec.familyName || `JoyCustomFont_${rec.id}`,
      bytes,
      scale: clampCustomScale(rec.scale ?? 1),
      baselineOffset: clampBaselineOffset(rec.baselineOffset ?? 0),
      letterSpacing: clampLetterSpacing(rec.letterSpacing ?? 0),
      ligatureOverlaps: sanitizeLigatureOverlaps(rec.ligatureOverlaps),
      uploadedAt: rec.uploadedAt || new Date().toISOString(),
    };
    try {
      await registerBrowserFontFace(asset);
      fontRegistry.set(asset.id, asset);
      loadedAssets.push(asset);
    } catch {
      // Skip corrupted stored font entries safely
    }
  }

  return loadedAssets.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

async function persistCustomFontRecord(asset: CustomFontAsset): Promise<void> {
  const db = await openFontDb();
  if (!db) return;
  const record: StoredCustomFontRecord = {
    id: asset.id,
    name: asset.name,
    fileName: asset.fileName,
    format: asset.format,
    familyName: asset.familyName,
    buffer: toArrayBufferCopy(asset.bytes),
    scale: asset.scale,
    baselineOffset: asset.baselineOffset,
    letterSpacing: asset.letterSpacing,
    ligatureOverlaps: sanitizeLigatureOverlaps(asset.ligatureOverlaps),
    uploadedAt: asset.uploadedAt,
  };
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function addCustomFontFile(file: File): Promise<CustomFontAsset> {
  const lower = file.name.toLowerCase();
  const isTtf = lower.endsWith('.ttf');
  const isOtf = lower.endsWith('.otf');
  if (!isTtf && !isOtf) {
    throw new Error('Only .ttf and .otf font files are supported.');
  }
  if (file.size <= 0) {
    throw new Error('The selected font file is empty.');
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error('Font file is too large (maximum 15 MB).');
  }

  const rawBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(rawBuffer);
  if (!isValidFontHeader(bytes)) {
    throw new Error(`"${file.name}" is not a valid TrueType (.ttf) or OpenType (.otf) font.`);
  }

  const id = createFontId();
  const asset: CustomFontAsset = {
    id,
    name: cleanDisplayName(file.name),
    fileName: file.name,
    format: isOtf ? 'otf' : 'ttf',
    familyName: `JoyCustomFont_${id}`,
    bytes,
    scale: 1,
    baselineOffset: 0,
    letterSpacing: 0,
    ligatureOverlaps: {},
    uploadedAt: new Date().toISOString(),
  };

  try {
    await registerBrowserFontFace(asset);
  } catch {
    throw new Error(`Browser could not decode "${file.name}". Please check the font file.`);
  }

  fontRegistry.set(asset.id, asset);
  await persistCustomFontRecord(asset);
  return asset;
}

export async function updateCustomFontCalibration(
  id: string,
  scale: number,
  baselineOffset: number,
  letterSpacing = 0,
  ligatureOverlaps?: Record<string, number>
): Promise<CustomFontAsset | null> {
  const existing = fontRegistry.get(id);
  if (!existing) return null;
  const updated: CustomFontAsset = {
    ...existing,
    scale: clampCustomScale(scale),
    baselineOffset: clampBaselineOffset(baselineOffset),
    letterSpacing: clampLetterSpacing(letterSpacing),
    ligatureOverlaps:
      ligatureOverlaps !== undefined
        ? sanitizeLigatureOverlaps(ligatureOverlaps)
        : existing.ligatureOverlaps,
  };
  fontRegistry.set(id, updated);
  await persistCustomFontRecord(updated);
  return updated;
}

export async function removeCustomFont(id: string): Promise<void> {
  fontRegistry.delete(id);
  const face = loadedFaceRegistry.get(id);
  if (face && typeof document !== 'undefined' && document.fonts) {
    try {
      document.fonts.delete(face);
    } catch {
      // Ignore FontFaceSet deletion error
    }
  }
  loadedFaceRegistry.delete(id);

  const db = await openFontDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
