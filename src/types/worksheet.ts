export type Locale = 'en' | 'vi';

export type NavView = 'data' | 'builder' | 'preview' | 'guide';

export type WorksheetType =
  | 'flashcards'
  | 'anagram'
  | 'word-scramble'
  | 'matching'
  | 'matching-2'
  | 'matching-3'
  | 'typing-image'
  | 'typing-2'
  | 'typing-3'
  | 'mix';

export type MixSectionType =
  | 'matching-3'
  | 'anagram'
  | 'matching-2'
  | 'typing-image'
  | 'typing-2'
  | 'typing-3';

export type TypingDirection = 'vi-to-en' | 'en-to-vi';

export type WorksheetFontStyle =
  | 'penmanship'
  | 'viet-primary'
  | 'clean'
  | 'dotted'
  | 'handwritten'
  | 'custom';

export type WorksheetFontSize = 'small' | 'normal';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type GridCellSize = 2 | 2.5;

export type GridBlockCount = 4 | 5;

export interface CustomFontAsset {
  id: string;
  name: string;
  fileName: string;
  format: 'ttf' | 'otf';
  familyName: string;
  bytes: Uint8Array;
  scale: number;
  baselineOffset: number;
  uploadedAt: string;
}

export interface VocabRow {
  uid: string;
  id: number;
  en: string;
  vi: string;
  imageId: string;
  source: 'excel' | 'paste' | 'manual' | 'sample';
}

export interface ImageAsset {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  objectUrl: string;
}

export interface MixSectionConfig {
  type: MixSectionType;
  enabled: boolean;
  target: number;
}

export interface WorksheetConfig {
  selectedTypes: WorksheetType[];
  versionCount: number;
  previewVersion: number;
  matching3Count: number;
  matching3TwoUp: boolean;
  typingWordLimit: string;
  typingDirection: TypingDirection;
  typingImageGridlines: boolean;
  typingImageGridSize: GridCellSize;
  typingImageGridBlocks: GridBlockCount;
  typingImageShowSample: boolean;
  guidelineOverlay: boolean;
  wordScrambleShowHint: boolean;
  difficulty: DifficultyLevel;
  mixOptimize: boolean;
  mixSections: MixSectionConfig[];
  studentHeader: string;
  includeAnswerKeys: boolean;
  fontStyle: WorksheetFontStyle;
  fontSize: WorksheetFontSize;
  customFontId: string | null;
  customFontScale: number;
  customFontBaselineOffset: number;
}

export interface AnagramEntry {
  item: VocabRow;
  scrambled: string;
}

export interface MatchingTermEntry {
  letter: string;
  item: VocabRow;
}

export interface Matching2Group {
  pictures: VocabRow[];
  prompts: VocabRow[];
  geometry: {
    top: number;
    imageRows: number;
    promptTop: number;
    promptRows: number;
    height: number;
  };
}

export interface Matching3Plan {
  items: VocabRow[];
  twoUp: boolean;
  panels: MatchingTermEntry[][];
}

export interface MixPlannedSection {
  type: MixSectionType;
  label: string;
  target: number;
  requested: number;
  autoAdded: number;
  items: VocabRow[];
  order: number;
  offset?: number;
  anagramEntries?: AnagramEntry[];
  matchingTerms?: MatchingTermEntry[];
  matching2Groups?: Array<{
    pictures: VocabRow[];
    prompts: VocabRow[];
    imageHeight: number;
    promptRows: number;
    height: number;
  }>;
}

export interface MixPageBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  section: MixPlannedSection;
}

export interface MixPageLayout {
  blocks: MixPageBlock[];
}

export interface MixPlan {
  rows: Array<VocabRow & { hasImage: boolean }>;
  sections: MixPlannedSection[];
  pages: MixPageLayout[];
  warnings: string[];
  errors: string[];
  usedIds: string[];
  unused: Array<VocabRow & { hasImage: boolean }>;
  remainingCount: number;
  totalUnique: number;
  autoAddedByType: Record<string, number>;
}

export interface VersionPlan {
  version: number;
  seed: number;
  imageOrder: VocabRow[];
  textOrder: VocabRow[];
  anagramEntries: AnagramEntry[];
  wordScrambleEntries: AnagramEntry[];
  matchingOrders: MatchingTermEntry[][];
  matching3: Matching3Plan;
  matching2: Matching2Group[][];
  mix: MixPlan | null;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  validImageRows: VocabRow[];
  validTextRows: VocabRow[];
  missingImageIds: string[];
  duplicatePairs: string[];
}

export interface ParsedPastePreview {
  direction: TypingDirection | 'uncertain';
  pairs: Array<{ first: string; second: string; sourceRow: number }>;
}

export interface WorksheetMetadata {
  type: WorksheetType;
  category: 'image' | 'text' | 'mixed';
  paperSpec: string;
  marginSpec: string;
  needsImages: boolean;
  needsVietnamese: boolean;
  hasAnswerKey: boolean;
  densityNote: string;
}
