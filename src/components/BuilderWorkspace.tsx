import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import { buildPreviewDescriptors, downloadSinglePreviewPdf } from '../lib/pdfEngine';
import {
  getDifficultyProfile,
  MIX_LABELS,
  TEXT_TYPES,
  WORKSHEET_META,
} from '../lib/worksheetSupport';
import {
  CustomFontAsset,
  DifficultyLevel,
  GridBlockCount,
  GridCellSize,
  ImageAsset,
  MixSectionType,
  ValidationReport,
  VersionPlan,
  WorksheetConfig,
  WorksheetFontSize,
  WorksheetFontStyle,
  WorksheetType,
} from '../types/worksheet';
import { serializeLigatureOverlapsKey } from '../lib/customFontStore';
import { vietTextToSvgData } from '../lib/vietPrimaryFont';
import { AdvancedLigaturePanel } from './AdvancedLigaturePanel';
import { CustomFontInspector } from './CustomFontInspector';
import { SheetCanvasCard } from './SheetCanvasCard';

const FONT_OPTIONS: Array<{
  id: WorksheetFontStyle;
  label: string;
  sample: string;
  previewClass: string;
}> = [
  { id: 'viet-primary', label: 'Primary Littlepen', sample: 'Abt', previewClass: '' },
  { id: 'penmanship', label: 'Primary Penmanship', sample: 'Apple', previewClass: 'font-penmanship' },
  { id: 'handwritten', label: 'Handwritten', sample: 'Apple', previewClass: 'font-handwritten' },
  { id: 'clean', label: 'Clean Sans', sample: 'Apple', previewClass: 'font-sans' },
  { id: 'dotted', label: 'Tracing Dots', sample: 'Apple', previewClass: 'font-dotted' },
];

const VIET_SAMPLE_SVG = vietTextToSvgData('Abt', 7);

interface BuilderWorkspaceProps {
  config: WorksheetConfig;
  copy: Dictionary;
  images: Map<string, ImageAsset>;
  customFonts: CustomFontAsset[];
  totalRows: number;
  validation: ValidationReport;
  previewPlan: VersionPlan;
  shuffleNonce: number;
  onUpdateConfig: (patch: Partial<WorksheetConfig>) => void;
  onUploadCustomFonts: (files: FileList | File[]) => Promise<{ added: CustomFontAsset[]; errors: string[] }>;
  onSelectCustomFont: (font: CustomFontAsset) => void;
  onDeleteCustomFont: (id: string) => Promise<void>;
  onUpdateCustomFontCalibration: (
    scale: number,
    baselineOffset: number,
    letterSpacing: number,
    ligatureOverlaps?: Record<string, number>
  ) => void;
  onToggleWorksheetType: (type: WorksheetType) => void;
  onUpdateMixSection: (type: MixSectionType, patch: { enabled?: boolean; target?: number }) => void;
  onShuffleVersion: (version: number) => void;
  onNavigateToData: () => void;
  onNavigateToPreview: () => void;
}

export function BuilderWorkspace({
  config,
  copy,
  images,
  customFonts,
  totalRows,
  validation,
  previewPlan,
  shuffleNonce,
  onUpdateConfig,
  onUploadCustomFonts,
  onSelectCustomFont,
  onDeleteCustomFont,
  onUpdateCustomFontCalibration,
  onToggleWorksheetType,
  onUpdateMixSection,
  onShuffleVersion,
  onNavigateToData,
  onNavigateToPreview,
}: BuilderWorkspaceProps) {
  const [focusedType, setFocusedType] = useState<WorksheetType>(
    config.selectedTypes[0] || 'flashcards'
  );
  const [answerKeyMode, setAnswerKeyMode] = useState(false);
  const [downloadingSingle, setDownloadingSingle] = useState(false);
  const [fontTab, setFontTab] = useState<'built-in' | 'custom'>(
    config.fontStyle === 'custom' ? 'custom' : 'built-in'
  );
  const [isDraggingFont, setIsDraggingFont] = useState(false);
  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const fontFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeCustomFont = useMemo(
    () => customFonts.find((f) => f.id === config.customFontId) || null,
    [customFonts, config.customFontId]
  );

  const isCustomFontActive = config.fontStyle === 'custom' && Boolean(activeCustomFont);
  const supportsGuidelineOverlay =
    (config.fontStyle || 'penmanship') === 'viet-primary' || isCustomFontActive;

  const handleFontFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingFont(true);
    setFontUploadError(null);
    try {
      const { added, errors } = await onUploadCustomFonts(files);
      if (added.length > 0) {
        setFontTab('custom');
      }
      if (errors.length > 0) {
        setFontUploadError(errors.join(' '));
      }
    } finally {
      setIsUploadingFont(false);
      if (fontFileInputRef.current) {
        fontFileInputRef.current.value = '';
      }
    }
  };

  const activePreviewType: WorksheetType | null = useMemo(() => {
    if (!config.selectedTypes.length) return null;
    if (config.selectedTypes.includes(focusedType)) return focusedType;
    return config.selectedTypes[0];
  }, [config.selectedTypes, focusedType]);

  const effectiveAnswerMode = activePreviewType === 'flashcards' ? false : answerKeyMode;

  const previewPages = useMemo(() => {
    if (!activePreviewType) return [];
    if (validation.errors.length > 0 && activePreviewType === 'mix' && previewPlan.mix?.errors.length) {
      return [];
    }
    return buildPreviewDescriptors(
      [activePreviewType],
      previewPlan,
      images,
      config,
      effectiveAnswerMode
    );
  }, [activePreviewType, previewPlan, images, config, effectiveAnswerMode, validation.errors.length]);

  const handleDownloadFocused = async () => {
    if (!activePreviewType) return;
    setDownloadingSingle(true);
    try {
      await downloadSinglePreviewPdf(
        activePreviewType,
        previewPlan,
        images,
        config,
        effectiveAnswerMode
      );
    } finally {
      setDownloadingSingle(false);
    }
  };

  const hasTextSelected = config.selectedTypes.some((t) => TEXT_TYPES.has(t));
  const hasWordScrambleSelected = config.selectedTypes.includes('word-scramble');
  const hasTypingImageSelected = config.selectedTypes.includes('typing-image');
  const hasMatching3Selected = config.selectedTypes.includes('matching-3');
  const hasMixSelected = config.selectedTypes.includes('mix');

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-7">
      {/* Workspace top subheader & utility strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            {copy.builder.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">{copy.builder.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="font-mono font-semibold text-slate-900 tabular-nums">{totalRows}</span>
            <span>{copy.data.rowsReady}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono font-semibold text-emerald-700 tabular-nums">
              {validation.validImageRows.length}
            </span>
            <span>{copy.data.imagesMatched}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <button
              type="button"
              onClick={onNavigateToData}
              className="font-medium text-blue-700 hover:text-blue-900 underline underline-offset-4 whitespace-nowrap"
            >
              Edit Data
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Studio */}
      <div className="mt-7 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration Deck */}
        <div className="lg:col-span-5 space-y-6">
          {/* Validation Errors */}
          {validation.errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-1.5">
              {validation.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-rose-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-700" aria-hidden="true" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* 01. Worksheet Formats */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-950">
                01. {copy.builder.sectionFormats}
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {config.selectedTypes.length} / {WORKSHEET_META.length}
              </span>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {WORKSHEET_META.map((meta) => {
                const checked = config.selectedTypes.includes(meta.type);
                const label = copy.worksheets[meta.type];
                return (
                  <div key={meta.type} className="py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start gap-3">
                      <input
                        id={`ws-${meta.type}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          onToggleWorksheetType(meta.type);
                          if (!checked) setFocusedType(meta.type);
                        }}
                        className="mt-1 h-4 w-4 rounded border-slate-300 accent-blue-700 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <label
                            htmlFor={`ws-${meta.type}`}
                            className="text-sm font-semibold text-slate-900 cursor-pointer"
                          >
                            {label.name}
                          </label>
                          {checked && (
                            <button
                              type="button"
                              onClick={() => setFocusedType(meta.type)}
                              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                                activePreviewType === meta.type
                                  ? 'text-blue-700'
                                  : 'text-slate-400 hover:text-slate-700'
                              }`}
                            >
                              {activePreviewType === meta.type ? 'Viewing' : 'Preview'}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          {label.description}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-500">
                          <span>{label.paper}</span>
                          <span aria-hidden="true">·</span>
                          <span>{meta.densityNote}</span>
                        </div>
                      </div>
                    </div>

                    {/* Word Scramble contextual options */}
                    {meta.type === 'word-scramble' && hasWordScrambleSelected && (
                      <div className="mt-3 ml-7 pl-4 border-l border-slate-200 space-y-2.5">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.wordScrambleShowHint}
                            onChange={(e) => onUpdateConfig({ wordScrambleShowHint: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {copy.builder.wordScrambleShowHint}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {copy.builder.wordScrambleShowHintHint}
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Typing 1: Picture to Word handwriting gridline & sample word options */}
                    {meta.type === 'typing-image' && hasTypingImageSelected && (
                      <div className="mt-3 ml-7 pl-4 border-l border-slate-200 space-y-3">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.typingImageGridlines}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              onUpdateConfig(
                                enabled
                                  ? { typingImageGridlines: true, typingImageShowSample: true }
                                  : { typingImageGridlines: false }
                              );
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {copy.builder.typingImageGridlines}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {copy.builder.typingImageGridlinesHint}
                            </p>
                          </div>
                        </label>

                        {config.typingImageGridlines && (
                          <div className="pl-6 space-y-2.5">
                            <div className="space-y-1.5">
                              <span className="block text-[11px] font-semibold text-slate-600">
                                {copy.builder.typingImageGridSizeLabel}
                              </span>
                              <div
                                className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                                role="radiogroup"
                                aria-label={copy.builder.typingImageGridSizeLabel}
                              >
                                {(
                                  [
                                    { size: 2 as GridCellSize, label: copy.builder.typingImageGridSize2 },
                                    { size: 2.5 as GridCellSize, label: copy.builder.typingImageGridSize25 },
                                  ]
                                ).map((opt) => {
                                  const current = config.typingImageGridSize === 2.5 ? 2.5 : 2;
                                  const active = current === opt.size;
                                  return (
                                    <button
                                      key={opt.size}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => onUpdateConfig({ typingImageGridSize: opt.size })}
                                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                                        active
                                          ? 'bg-white text-blue-700 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block text-[11px] font-semibold text-slate-600">
                                {copy.builder.typingImageGridBlocksLabel}
                              </span>
                              <div
                                className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                                role="radiogroup"
                                aria-label={copy.builder.typingImageGridBlocksLabel}
                              >
                                {(
                                  [
                                    { count: 4 as GridBlockCount, label: copy.builder.typingImageGridBlocks4 },
                                    { count: 5 as GridBlockCount, label: copy.builder.typingImageGridBlocks5 },
                                  ]
                                ).map((opt) => {
                                  const current = config.typingImageGridBlocks === 5 ? 5 : 4;
                                  const active = current === opt.count;
                                  return (
                                    <button
                                      key={opt.count}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => onUpdateConfig({ typingImageGridBlocks: opt.count })}
                                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                                        active
                                          ? 'bg-white text-blue-700 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.typingImageShowSample}
                            onChange={(e) => onUpdateConfig({ typingImageShowSample: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {copy.builder.typingImageShowSample}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {copy.builder.typingImageShowSampleHint}
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Matching 3 contextual options */}
                    {meta.type === 'matching-3' && hasMatching3Selected && (
                      <div className="mt-3 ml-7 pl-4 border-l border-slate-200 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <label htmlFor="m3-count" className="text-xs font-medium text-slate-700">
                            {copy.builder.matching3Count}
                          </label>
                          <input
                            id="m3-count"
                            type="number"
                            min={2}
                            max={12}
                            value={config.matching3Count}
                            onChange={(e) => {
                              const v = Math.max(2, Math.min(12, Number(e.target.value) || 2));
                              onUpdateConfig({ matching3Count: v });
                            }}
                            className="w-20 px-2.5 py-1.5 text-xs font-mono text-slate-900 border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none tabular-nums"
                          />
                        </div>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.matching3TwoUp}
                            onChange={(e) => onUpdateConfig({ matching3TwoUp: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {copy.builder.matching3TwoUp}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {copy.builder.matching3TwoUpHint}
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Mix A4 contextual options */}
                    {meta.type === 'mix' && hasMixSelected && (
                      <div className="mt-3 ml-7 pl-4 border-l border-slate-200 space-y-3">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.mixOptimize}
                            onChange={(e) => onUpdateConfig({ mixOptimize: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">
                              {copy.builder.mixOptimize}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {copy.builder.mixOptimizeHint}
                            </p>
                          </div>
                        </label>

                        <div className="space-y-2">
                          {config.mixSections.map((sec) => (
                            <div
                              key={sec.type}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={sec.enabled}
                                  onChange={(e) =>
                                    onUpdateMixSection(sec.type, { enabled: e.target.checked })
                                  }
                                  className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-700"
                                />
                                <span className="font-medium">{MIX_LABELS[sec.type]}</span>
                              </label>
                              <input
                                type="number"
                                min={sec.type === 'matching-2' ? 5 : sec.type === 'matching-3' ? 2 : 1}
                                max={sec.type === 'matching-3' ? 12 : 40}
                                step={sec.type === 'matching-2' ? 5 : 1}
                                disabled={!sec.enabled}
                                value={sec.target}
                                onChange={(e) =>
                                  onUpdateMixSection(sec.type, {
                                    target: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                aria-label={`${MIX_LABELS[sec.type]} question count`}
                                className="w-16 px-2 py-1 font-mono text-xs border border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-400 tabular-nums"
                              />
                            </div>
                          ))}
                        </div>

                        {previewPlan.mix && !previewPlan.mix.errors.length && (
                          <div className="text-[11px] font-mono text-slate-600 pt-1">
                            {previewPlan.mix.pages.length} A4 page(s) ·{' '}
                            {previewPlan.mix.usedIds.length} words placed ·{' '}
                            {previewPlan.mix.remainingCount} {copy.builder.mixUnusedInfo}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 02. Exam Versions, Header & Typing Options */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-950 pb-3 border-b border-slate-100">
              02. {copy.builder.sectionExam}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="exam-versions" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {copy.builder.examCodes}
                </label>
                <select
                  id="exam-versions"
                  value={config.versionCount}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    onUpdateConfig({
                      versionCount: count,
                      previewVersion: Math.min(config.previewVersion, count),
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? copy.builder.examCodeSingle : `${n} ${copy.builder.examCodePlural}`}
                    </option>
                  ))}
                </select>
              </div>

              {hasTextSelected && (
                <div>
                  <label htmlFor="typing-limit" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {copy.builder.typingLimitLabel}
                  </label>
                  <input
                    id="typing-limit"
                    type="number"
                    min={1}
                    placeholder={copy.builder.typingLimitPlaceholder}
                    value={config.typingWordLimit}
                    onChange={(e) => onUpdateConfig({ typingWordLimit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Difficulty Level */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                {copy.builder.difficultyLabel}
              </span>
              <div
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label={copy.builder.difficultyLabel}
              >
                {(
                  [
                    { id: 'beginner', label: copy.builder.difficultyBeginner },
                    { id: 'intermediate', label: copy.builder.difficultyIntermediate },
                    { id: 'advanced', label: copy.builder.difficultyAdvanced },
                  ] as Array<{ id: DifficultyLevel; label: string }>
                ).map((lvl) => {
                  const activeDifficulty = config.difficulty || 'intermediate';
                  const selected = activeDifficulty === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        const profile = getDifficultyProfile(lvl.id);
                        onUpdateConfig({
                          difficulty: lvl.id,
                          fontStyle:
                            config.fontStyle === 'custom' && config.customFontId
                              ? 'custom'
                              : profile.defaultFontStyle,
                          typingImageGridlines: profile.defaultGridlines,
                          typingImageGridSize: profile.typing1GridUnitMm,
                          typingImageShowSample: profile.defaultShowSample,
                          wordScrambleShowHint: profile.defaultShowHint,
                        });
                      }}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        selected
                          ? 'bg-blue-50/70 border-blue-600 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                {copy.builder.difficultySummary[config.difficulty || 'intermediate']}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  {copy.builder.fontStyleLabel}
                </span>
                <div
                  className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                  role="tablist"
                  aria-label={copy.builder.fontStyleLabel}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fontTab === 'built-in'}
                    onClick={() => setFontTab('built-in')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      fontTab === 'built-in'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {copy.builder.fontTabBuiltIn}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fontTab === 'custom'}
                    onClick={() => setFontTab('custom')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      fontTab === 'custom'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {copy.builder.fontTabCustom}
                    {customFonts.length > 0 && (
                      <span className="ml-1 font-mono text-[10px] tabular-nums opacity-75">
                        ({customFonts.length})
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {fontTab === 'built-in' ? (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Built-in typography styles">
                  {FONT_OPTIONS.map((opt) => {
                    const selected = (config.fontStyle || 'penmanship') === opt.id;
                    const isVietPrimary = opt.id === 'viet-primary';
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onUpdateConfig({ fontStyle: opt.id })}
                        className={`px-3 py-2.5 text-left rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          isVietPrimary ? 'col-span-2' : ''
                        } ${
                          selected
                            ? 'bg-blue-50/70 border-blue-600 text-slate-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold block truncate">{opt.label}</span>
                          </div>
                          {isVietPrimary ? (
                            <svg
                              width={VIET_SAMPLE_SVG.width}
                              height={VIET_SAMPLE_SVG.height}
                              viewBox={`0 0 ${VIET_SAMPLE_SVG.width} ${VIET_SAMPLE_SVG.height}`}
                              className="shrink-0 overflow-visible"
                              aria-hidden="true"
                            >
                              <line
                                x1="0"
                                y1={VIET_SAMPLE_SVG.baselineY}
                                x2={VIET_SAMPLE_SVG.width}
                                y2={VIET_SAMPLE_SVG.baselineY}
                                stroke="#60A5FA"
                                strokeWidth="0.9"
                              />
                              <line
                                x1="0"
                                y1={VIET_SAMPLE_SVG.baselineY - 7}
                                x2={VIET_SAMPLE_SVG.width}
                                y2={VIET_SAMPLE_SVG.baselineY - 7}
                                stroke="#BFDBFE"
                                strokeWidth="0.6"
                              />
                              <path
                                d={VIET_SAMPLE_SVG.pathD}
                                fill="none"
                                stroke="#0F172A"
                                strokeWidth="1.05"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {VIET_SAMPLE_SVG.dots.map((d, idx) => (
                                <circle key={idx} cx={d.cx} cy={d.cy} r="0.8" fill="#0F172A" />
                              ))}
                            </svg>
                          ) : (
                            <span className={`text-sm text-slate-600 shrink-0 ${opt.previewClass}`}>
                              {opt.sample}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <input
                    ref={fontFileInputRef}
                    type="file"
                    accept=".ttf,.otf"
                    multiple
                    onChange={(e) => {
                      void handleFontFiles(e.target.files);
                    }}
                    className="sr-only"
                    aria-label={copy.builder.customFontUploadTitle}
                  />

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fontFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fontFileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFont(true);
                    }}
                    onDragLeave={() => setIsDraggingFont(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFont(false);
                      void handleFontFiles(e.dataTransfer.files);
                    }}
                    className={`rounded-lg border border-dashed px-3.5 py-3.5 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isDraggingFont
                        ? 'border-blue-600 bg-blue-50/70'
                        : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-800">
                      <Upload className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
                      <span>
                        {isUploadingFont ? 'Loading font...' : copy.builder.customFontUploadTitle}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {copy.builder.customFontUploadHint}
                    </p>
                  </div>

                  {fontUploadError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-700" aria-hidden="true" />
                      <span>{fontUploadError}</span>
                    </div>
                  )}

                  {customFonts.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-1">{copy.builder.customFontEmpty}</p>
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label={copy.builder.fontTabCustom}>
                      {customFonts.map((font) => {
                        const selected =
                          config.fontStyle === 'custom' && config.customFontId === font.id;
                        const isNormalSize = config.fontSize === 'normal';
                        const blocks = config.typingImageGridBlocks === 5 ? 5 : 4;
                        const showOlyLines = Boolean(
                          config.typingImageGridlines || config.guidelineOverlay
                        );
                        const swatchScale = selected
                          ? (config.customFontScale ?? 1)
                          : font.scale;
                        const swatchOffset = selected
                          ? (config.customFontBaselineOffset ?? 0)
                          : font.baselineOffset;
                        const swatchLetterSpacing = selected
                          ? (config.customFontLetterSpacing ?? 0)
                          : font.letterSpacing;
                        const swatchLigatures = selected
                          ? (config.customFontLigatureOverlaps ?? {})
                          : (font.ligatureOverlaps ?? {});
                        const activeLigatureCount = Object.values(swatchLigatures).filter(
                          (v) => Math.abs(v) >= 1
                        ).length;
                        const aboveRows = isNormalSize ? Math.max(blocks, 5) : blocks;
                        const descRows = 2;
                        const totalRows = aboveRows + descRows;
                        const svgH = 48;
                        const cellPx = Math.floor((svgH - 6) / totalRows);
                        const gridTopY = Math.round((svgH - cellPx * totalRows) / 2);
                        const baselineY = gridTopY + cellPx * aboveRows;
                        const xHeightRow = aboveRows - (isNormalSize ? 2 : 1);
                        const blockMajorRow = aboveRows - blocks;
                        const textScale = isNormalSize ? 2 : 1;
                        const previewFontPx = Math.max(
                          10,
                          Math.min(34, cellPx * 1.92 * textScale * swatchScale)
                        );
                        const textY = baselineY - swatchOffset * cellPx * textScale;
                        const hasCalibration =
                          Math.abs(swatchScale - 1) > 0.005 ||
                          Math.abs(swatchOffset) > 0.005 ||
                          Math.abs(swatchLetterSpacing) > 0.005 ||
                          activeLigatureCount > 0;

                        return (
                          <div
                            key={font.id}
                            role="radio"
                            aria-checked={selected}
                            tabIndex={0}
                            onClick={() => onSelectCustomFont(font)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectCustomFont(font);
                              }
                            }}
                            className={`p-2.5 rounded-lg border transition-colors cursor-pointer space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                              selected
                                ? 'bg-blue-50/70 border-blue-600 text-slate-950'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className="text-xs font-semibold truncate">{font.name}</span>
                                <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0">
                                  {font.format}
                                </span>
                                {hasCalibration && (
                                  <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">
                                    {Math.round(swatchScale * 100)}% ·{' '}
                                    {swatchOffset > 0 ? '+' : ''}
                                    {swatchOffset.toFixed(2)}
                                    {Math.abs(swatchLetterSpacing) > 0.005
                                      ? ` · ${swatchLetterSpacing > 0 ? '+' : ''}${swatchLetterSpacing.toFixed(2)}em`
                                      : ''}
                                    {activeLigatureCount > 0 ? ` · ${activeLigatureCount} lig` : ''}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                aria-label={`${copy.builder.customFontDelete} ${font.name}`}
                                title={copy.builder.customFontDelete}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onDeleteCustomFont(font.id);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>

                            {/* Live settings-aware text preview swatch */}
                            <div
                              className="w-full h-12 rounded-md border border-slate-200/80 bg-white overflow-hidden"
                              aria-hidden="true"
                            >
                              <svg
                                width="100%"
                                height={svgH}
                                className="block w-full h-full"
                                preserveAspectRatio="none"
                              >
                                {showOlyLines ? (
                                  <>
                                    {config.typingImageGridlines &&
                                      Array.from({ length: 48 }, (_, c) => {
                                        const vx = c * cellPx;
                                        const isMajor = c % blocks === 0;
                                        return (
                                          <line
                                            key={`v-${c}`}
                                            x1={vx}
                                            y1={gridTopY}
                                            x2={vx}
                                            y2={gridTopY + cellPx * totalRows}
                                            stroke={isMajor ? '#93C5FD' : '#E2EEFD'}
                                            strokeWidth={isMajor ? 0.75 : 0.45}
                                          />
                                        );
                                      })}
                                    {Array.from({ length: totalRows + 1 }, (_, r) => {
                                      const hy = gridTopY + r * cellPx;
                                      const isBase = r === aboveRows;
                                      const isMajor = r === blockMajorRow;
                                      const isX = r === xHeightRow;
                                      return (
                                        <line
                                          key={`h-${r}`}
                                          x1="0"
                                          y1={hy}
                                          x2="100%"
                                          y2={hy}
                                          stroke={
                                            isBase
                                              ? '#2563EB'
                                              : isMajor
                                                ? '#60A5FA'
                                                : isX
                                                  ? '#93C5FD'
                                                  : '#DCEBFC'
                                          }
                                          strokeWidth={isBase ? 1.15 : isMajor ? 0.75 : 0.5}
                                        />
                                      );
                                    })}
                                  </>
                                ) : (
                                  <line
                                    x1="8"
                                    y1={baselineY}
                                    x2="100%"
                                    y2={baselineY}
                                    stroke="#CBD5E1"
                                    strokeWidth="0.8"
                                    strokeDasharray="3 3"
                                  />
                                )}
                                <text
                                  x={10}
                                  y={textY}
                                  fill="#0F172A"
                                  fontSize={previewFontPx}
                                  style={{
                                    fontFamily: `"${font.familyName}", sans-serif`,
                                    letterSpacing: `${swatchLetterSpacing}em`,
                                  }}
                                >
                                  Aa Bb cat tree ice cream
                                </text>
                              </svg>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Real-time Scale, Baseline Offset & Letter Spacing calibration sliders for active custom font */}
              {isCustomFontActive && activeCustomFont && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {copy.builder.customFontAlignmentTitle}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        · {activeCustomFont.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={
                        (config.customFontScale ?? 1) === 1 &&
                        (config.customFontBaselineOffset ?? 0) === 0 &&
                        (config.customFontLetterSpacing ?? 0) === 0 &&
                        Object.keys(config.customFontLigatureOverlaps || {}).length === 0
                      }
                      onClick={() => onUpdateCustomFontCalibration(1, 0, 0, {})}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900 disabled:text-slate-400 whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>{copy.builder.customFontReset}</span>
                    </button>
                  </div>

                  {/* Scale Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="custom-font-scale" className="text-[11px] font-semibold text-slate-700">
                        {copy.builder.customFontScaleLabel}
                      </label>
                      <span className="text-[11px] font-mono text-slate-700 tabular-nums">
                        {Math.round((config.customFontScale ?? 1) * 100)}% · {(config.customFontScale ?? 1).toFixed(2)}×
                      </span>
                    </div>
                    <input
                      id="custom-font-scale"
                      type="range"
                      min={0.5}
                      max={1.8}
                      step={0.02}
                      value={config.customFontScale ?? 1}
                      onChange={(e) =>
                        onUpdateCustomFontCalibration(
                          Number(e.target.value),
                          config.customFontBaselineOffset ?? 0,
                          config.customFontLetterSpacing ?? 0
                        )
                      }
                      className="w-full h-1.5 accent-blue-700 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                      <span>50%</span>
                      <span>100%</span>
                      <span>180%</span>
                    </div>
                  </div>

                  {/* Baseline Offset Slider */}
                  {(() => {
                    const offset = config.customFontBaselineOffset ?? 0;
                    const cellMm = config.typingImageGridSize === 2.5 ? 2.5 : 2;
                    const offsetMm = offset * cellMm;
                    const sign = offset > 0 ? '+' : '';
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="custom-font-baseline"
                            className="text-[11px] font-semibold text-slate-700"
                          >
                            {copy.builder.customFontBaselineLabel}
                          </label>
                          <span className="text-[11px] font-mono text-slate-700 tabular-nums">
                            {sign}
                            {offset.toFixed(2)} ô ly ({sign}
                            {offsetMm.toFixed(2)} mm)
                          </span>
                        </div>
                        <input
                          id="custom-font-baseline"
                          type="range"
                          min={-0.5}
                          max={0.5}
                          step={0.02}
                          value={offset}
                          onChange={(e) =>
                            onUpdateCustomFontCalibration(
                              config.customFontScale ?? 1,
                              Number(e.target.value),
                              config.customFontLetterSpacing ?? 0
                            )
                          }
                          className="w-full h-1.5 accent-blue-700 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                          <span>-0.50 ↓</span>
                          <span>0.00</span>
                          <span>+0.50 ↑</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Letter Spacing / Kerning Slider */}
                  {(() => {
                    const spacing = config.customFontLetterSpacing ?? 0;
                    const sign = spacing > 0 ? '+' : '';
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="custom-font-letter-spacing"
                            className="text-[11px] font-semibold text-slate-700"
                          >
                            {copy.builder.customFontLetterSpacingLabel}
                          </label>
                          <span className="text-[11px] font-mono text-slate-700 tabular-nums">
                            {sign}
                            {spacing.toFixed(2)} em
                          </span>
                        </div>
                        <input
                          id="custom-font-letter-spacing"
                          type="range"
                          min={-0.12}
                          max={0.35}
                          step={0.01}
                          value={spacing}
                          onChange={(e) =>
                            onUpdateCustomFontCalibration(
                              config.customFontScale ?? 1,
                              config.customFontBaselineOffset ?? 0,
                              Number(e.target.value)
                            )
                          }
                          className="w-full h-1.5 accent-blue-700 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                          <span>-0.12 em</span>
                          <span>0.00 em</span>
                          <span>+0.35 em</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Live Character Inspector & Calibration Auto-Fix */}
                  <CustomFontInspector
                    font={activeCustomFont}
                    scale={config.customFontScale ?? 1}
                    baselineOffset={config.customFontBaselineOffset ?? 0}
                    letterSpacing={config.customFontLetterSpacing ?? 0}
                    ligatureOverlaps={config.customFontLigatureOverlaps || {}}
                    fontSize={config.fontSize === 'normal' ? 'normal' : 'small'}
                    gridBlocks={config.typingImageGridBlocks === 5 ? 5 : 4}
                    copy={copy}
                    onApplyLetterSpacing={(nextLetterSpacing) =>
                      onUpdateCustomFontCalibration(
                        config.customFontScale ?? 1,
                        config.customFontBaselineOffset ?? 0,
                        nextLetterSpacing
                      )
                    }
                  />

                  {/* Advanced Ligature Per-Pair Join Overlap Controls */}
                  <AdvancedLigaturePanel
                    font={activeCustomFont}
                    scale={config.customFontScale ?? 1}
                    baselineOffset={config.customFontBaselineOffset ?? 0}
                    letterSpacing={config.customFontLetterSpacing ?? 0}
                    ligatureOverlaps={config.customFontLigatureOverlaps || {}}
                    fontSize={config.fontSize === 'normal' ? 'normal' : 'small'}
                    gridBlocks={config.typingImageGridBlocks === 5 ? 5 : 4}
                    copy={copy}
                    onChangeLigatureOverlaps={(nextOverlaps) =>
                      onUpdateCustomFontCalibration(
                        config.customFontScale ?? 1,
                        config.customFontBaselineOffset ?? 0,
                        config.customFontLetterSpacing ?? 0,
                        nextOverlaps
                      )
                    }
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  {copy.builder.fontSizeLabel}
                </span>
                <div
                  className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                  role="radiogroup"
                  aria-label={copy.builder.fontSizeLabel}
                >
                  {(
                    [
                      { id: 'small' as WorksheetFontSize, label: copy.builder.fontSizeSmall },
                      { id: 'normal' as WorksheetFontSize, label: copy.builder.fontSizeNormal },
                    ]
                  ).map((opt) => {
                    const current: WorksheetFontSize = config.fontSize === 'normal' ? 'normal' : 'small';
                    const active = current === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onUpdateConfig({ fontSize: opt.id })}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {supportsGuidelineOverlay && (
                <div className="mt-3 pl-3.5 border-l-2 border-blue-200 space-y-2.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(config.guidelineOverlay)}
                      onChange={(e) => onUpdateConfig({ guidelineOverlay: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-700"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        {copy.builder.guidelineOverlay}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {copy.builder.guidelineOverlayHint}
                      </p>
                    </div>
                  </label>

                  {config.guidelineOverlay && (
                    <div className="pl-6">
                      <div
                        className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                        role="radiogroup"
                        aria-label={copy.builder.typingImageGridBlocksLabel}
                      >
                        {(
                          [
                            { count: 4 as GridBlockCount, label: copy.builder.typingImageGridBlocks4 },
                            { count: 5 as GridBlockCount, label: copy.builder.typingImageGridBlocks5 },
                          ]
                        ).map((opt) => {
                          const current = config.typingImageGridBlocks === 5 ? 5 : 4;
                          const active = current === opt.count;
                          return (
                            <button
                              key={opt.count}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => onUpdateConfig({ typingImageGridBlocks: opt.count })}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-white text-blue-700 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="student-header" className="block text-xs font-semibold text-slate-700 mb-1.5">
                {copy.builder.headerLabel}
              </label>
              <input
                id="student-header"
                type="text"
                value={config.studentHeader}
                onChange={(e) => onUpdateConfig({ studentHeader: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeAnswerKeys}
                onChange={(e) => onUpdateConfig({ includeAnswerKeys: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-blue-700"
              />
              <span className="text-sm text-slate-700">{copy.builder.includeAnswerKeys}</span>
            </label>
          </section>
        </div>

        {/* Right Column: Persistent Live Proofing Stage */}
        <div className="lg:col-span-7 lg:sticky lg:top-24">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Proofing Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {config.selectedTypes.length > 0 && (
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg max-w-full overflow-x-auto">
                    {config.selectedTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFocusedType(type)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          activePreviewType === type
                            ? 'bg-white text-slate-950 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {copy.worksheets[type].shortName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {config.versionCount > 1 && (
                  <select
                    aria-label="Preview exam code"
                    value={config.previewVersion}
                    onChange={(e) => onUpdateConfig({ previewVersion: Number(e.target.value) })}
                    className="px-2.5 py-1.5 text-xs font-mono font-medium border border-slate-200 rounded-lg bg-white text-slate-800"
                  >
                    {Array.from({ length: config.versionCount }, (_, idx) => idx + 1).map((v) => (
                      <option key={v} value={v}>
                        Code {v}
                      </option>
                    ))}
                  </select>
                )}

                {activePreviewType && activePreviewType !== 'flashcards' && (
                  <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/70">
                    <button
                      type="button"
                      onClick={() => setAnswerKeyMode(false)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        !effectiveAnswerMode
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {copy.builder.studentSheet}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerKeyMode(true)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        effectiveAnswerMode
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {copy.builder.answerKey}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onShuffleVersion(config.previewVersion)}
                  disabled={!activePreviewType}
                  title={copy.builder.shuffleOrder}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copy.builder.shuffleOrder}</span>
                </button>
              </div>
            </div>

            {/* Canvas Stage */}
            <div className="proofing-stage p-6 sm:p-8 min-h-[560px] max-h-[72vh] overflow-y-auto flex flex-col items-center gap-8">
              {!activePreviewType ? (
                <div className="my-auto text-center max-w-sm py-12">
                  <h3 className="text-base font-semibold text-slate-900">
                    {copy.builder.noSelectionTitle}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">{copy.builder.noSelectionBody}</p>
                </div>
              ) : previewPages.length === 0 ? (
                <div className="my-auto text-center max-w-sm py-12">
                  <p className="text-sm text-slate-600">
                    {validation.errors[0] ||
                      'Add vocabulary rows with matching pictures or translations to render this sheet.'}
                  </p>
                </div>
              ) : (
                previewPages.map((desc) => (
                  <SheetCanvasCard
                    key={desc.id}
                    descriptor={desc}
                    targetWidth={desc.widthPt > desc.heightPt ? 660 : 500}
                    renderKey={`${desc.id}-${shuffleNonce}-${config.difficulty}-${config.studentHeader}-${config.matching3Count}-${config.matching3TwoUp}-${config.fontStyle}-${config.customFontId || ''}-${config.customFontScale ?? 1}-${config.customFontBaselineOffset ?? 0}-${config.customFontLetterSpacing ?? 0}-${serializeLigatureOverlapsKey(config.customFontLigatureOverlaps)}-${config.fontSize || 'small'}-${config.guidelineOverlay}-${config.typingImageGridlines}-${config.typingImageGridSize}-${config.typingImageGridBlocks}-${config.typingImageShowSample}-${config.wordScrambleShowHint}`}
                  />
                ))
              )}
            </div>

            {/* Proofing Footer Actions */}
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-mono tabular-nums">
                {previewPages.length} {copy.preview.pageCount}
              </span>
              <div className="flex items-center gap-4">
                {activePreviewType && previewPages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadFocused}
                    disabled={downloadingSingle}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-blue-700 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{downloadingSingle ? 'Preparing...' : 'Download This PDF'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNavigateToPreview}
                  className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
                >
                  <span>{copy.builder.openFullPreview}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
