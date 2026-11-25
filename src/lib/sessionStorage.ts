import { ImageAsset, Locale, VocabRow, WorksheetConfig } from '../types/worksheet';
import { DEFAULT_CONFIG } from './worksheetSupport';

const STORAGE_KEY = 'joyenglish_session_v1';

export interface SerializedImageAsset {
  id: string;
  name: string;
  mime: string;
  dataBase64: string;
}

export interface SavedSession {
  savedAt: string;
  locale: Locale;
  excelFileName: string | null;
  zipFileName: string | null;
  rows: VocabRow[];
  images: SerializedImageAsset[];
  imagesTruncated?: boolean;
  config: WorksheetConfig;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function serializeImages(images: Map<string, ImageAsset>): SerializedImageAsset[] {
  const result: SerializedImageAsset[] = [];
  images.forEach((asset) => {
    result.push({
      id: asset.id,
      name: asset.name,
      mime: asset.mime,
      dataBase64: uint8ToBase64(asset.bytes),
    });
  });
  return result;
}

export function deserializeImages(entries: SerializedImageAsset[]): Map<string, ImageAsset> {
  const map = new Map<string, ImageAsset>();
  for (const entry of entries) {
    try {
      const bytes = base64ToUint8(entry.dataBase64);
      const safeBytes = new Uint8Array(bytes);
      const blob = new Blob([safeBytes], { type: entry.mime || 'image/png' });
      map.set(entry.id, {
        id: entry.id,
        name: entry.name,
        mime: entry.mime || 'image/png',
        bytes: safeBytes,
        objectUrl: URL.createObjectURL(blob),
      });
    } catch {
      // Skip corrupted serialized image entries safely
    }
  }
  return map;
}

export function saveSessionToStorage(params: {
  locale: Locale;
  excelFileName: string | null;
  zipFileName: string | null;
  rows: VocabRow[];
  images: Map<string, ImageAsset>;
  config: WorksheetConfig;
}): boolean {
  const basePayload: SavedSession = {
    savedAt: new Date().toISOString(),
    locale: params.locale,
    excelFileName: params.excelFileName,
    zipFileName: params.zipFileName,
    rows: params.rows,
    images: serializeImages(params.images),
    config: params.config,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(basePayload));
    return true;
  } catch {
    // Quota fallback: save rows + config without full image payloads so work is never lost
    try {
      const litePayload: SavedSession = {
        ...basePayload,
        images: [],
        imagesTruncated: true,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(litePayload));
      return true;
    } catch {
      return false;
    }
  }
}

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rows)) {
      return null;
    }
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      locale: parsed.locale === 'vi' ? 'vi' : 'en',
      excelFileName: typeof parsed.excelFileName === 'string' ? parsed.excelFileName : null,
      zipFileName: typeof parsed.zipFileName === 'string' ? parsed.zipFileName : null,
      rows: parsed.rows,
      images: Array.isArray(parsed.images) ? parsed.images : [],
      imagesTruncated: Boolean(parsed.imagesTruncated),
      config: {
        ...DEFAULT_CONFIG,
        ...(parsed.config || {}),
        mixSections: Array.isArray(parsed.config?.mixSections)
          ? parsed.config.mixSections
          : DEFAULT_CONFIG.mixSections,
      },
    };
  } catch {
    return null;
  }
}

export function clearSavedSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}
