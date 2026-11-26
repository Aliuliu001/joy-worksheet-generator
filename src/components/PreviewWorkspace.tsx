import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Printer, Shuffle, ZoomIn, ZoomOut } from 'lucide-react';
import { serializeLigatureOverlapsKey } from '../lib/customFontStore';
import { Dictionary } from '../lib/i18n';
import { buildPreviewDescriptors, downloadSinglePreviewPdf } from '../lib/pdfEngine';
import {
  GridBlockCount,
  GridCellSize,
  ImageAsset,
  VersionPlan,
  WorksheetConfig,
  WorksheetFontSize,
  WorksheetType,
} from '../types/worksheet';
import { SheetCanvasCard } from './SheetCanvasCard';

type ZoomMode = 'fit' | 'percent';

interface PreviewWorkspaceProps {
  config: WorksheetConfig;
  copy: Dictionary;
  images: Map<string, ImageAsset>;
  previewPlan: VersionPlan;
  shuffleNonce: number;
  canExport: boolean;
  onUpdateConfig: (patch: Partial<WorksheetConfig>) => void;
  onShuffleVersion: (version: number) => void;
  onExportAll: () => void;
}

export function PreviewWorkspace({
  config,
  copy,
  images,
  previewPlan,
  shuffleNonce,
  canExport,
  onUpdateConfig,
  onShuffleVersion,
  onExportAll,
}: PreviewWorkspaceProps) {
  const [filterType, setFilterType] = useState<WorksheetType | 'all'>('all');
  const [answerKey, setAnswerKey] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [stageWidth, setStageWidth] = useState<number>(960);
  const [downloadingSingle, setDownloadingSingle] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.round(el.clientWidth);
      if (next > 0) setStageWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleTypes = useMemo(() => {
    if (filterType === 'all') return config.selectedTypes;
    return config.selectedTypes.includes(filterType) ? [filterType] : config.selectedTypes;
  }, [filterType, config.selectedTypes]);

  const descriptors = useMemo(() => {
    return buildPreviewDescriptors(visibleTypes, previewPlan, images, config, answerKey);
  }, [visibleTypes, previewPlan, images, config, answerKey]);

  const showsTypingImage = visibleTypes.includes('typing-image');
  const showsWordScramble = visibleTypes.includes('word-scramble');
  const supportsGuidelineOverlay =
    (config.fontStyle || 'penmanship') === 'viet-primary' ||
    (config.fontStyle === 'custom' && Boolean(config.customFontId));

  const handleSelectPreset = (preset: 'fit' | 100 | 150) => {
    if (preset === 'fit') {
      setZoomMode('fit');
    } else {
      setZoomMode('percent');
      setZoomPercent(preset);
    }
  };

  const handleStepZoom = (delta: number) => {
    setZoomMode('percent');
    setZoomPercent((prev) => Math.max(50, Math.min(200, prev + delta)));
  };

  const handleDownloadSingle = async () => {
    const singleType = visibleTypes.length === 1 ? visibleTypes[0] : null;
    if (!singleType) {
      onExportAll();
      return;
    }
    setDownloadingSingle(true);
    try {
      await downloadSinglePreviewPdf(
        singleType,
        previewPlan,
        images,
        config,
        singleType === 'flashcards' ? false : answerKey
      );
    } finally {
      setDownloadingSingle(false);
    }
  };

  const fitTargetWidth = Math.max(320, Math.min(1280, stageWidth - 80));

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-7">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            {copy.preview.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{copy.preview.subtitle}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3.5 py-2 rounded-lg">
          <Printer className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          <span>{copy.preview.printWarning}</span>
        </div>
      </div>

      {/* Proofing Controls Bar */}
      <div className="mt-5 bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Format Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="proof-filter" className="text-xs font-medium text-slate-500">
              {copy.preview.worksheetFilter}
            </label>
            <select
              id="proof-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as WorksheetType | 'all')}
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="all">{copy.preview.allSelected}</option>
              {config.selectedTypes.map((t) => (
                <option key={t} value={t}>
                  {copy.worksheets[t].name}
                </option>
              ))}
            </select>
          </div>

          {/* Exam Code Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="proof-version" className="text-xs font-medium text-slate-500">
              {copy.preview.examCode}
            </label>
            <select
              id="proof-version"
              value={config.previewVersion}
              onChange={(e) => onUpdateConfig({ previewVersion: Number(e.target.value) })}
              className="px-2.5 py-1.5 text-xs font-mono font-medium border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {Array.from({ length: config.versionCount }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>
                  Code {v}
                </option>
              ))}
            </select>
          </div>

          {/* Student vs Answer Key */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setAnswerKey(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                !answerKey ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {copy.builder.studentSheet}
            </button>
            <button
              type="button"
              onClick={() => setAnswerKey(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                answerKey ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {copy.builder.answerKey}
            </button>
          </div>

          {/* Font Size: Small (1x) vs Normal (2x) */}
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
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Actions: Zoom Presets & Stepper + Shuffle + Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Zoom Presets: Fit to Width / 100% / 150% */}
          <div
            className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
            role="group"
            aria-label={copy.preview.zoom}
          >
            <button
              type="button"
              onClick={() => handleSelectPreset('fit')}
              aria-pressed={zoomMode === 'fit'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                zoomMode === 'fit'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Maximize2 className="w-3 h-3" aria-hidden="true" />
              <span>{copy.preview.fitWidth}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(100)}
              aria-pressed={zoomMode === 'percent' && zoomPercent === 100}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                zoomMode === 'percent' && zoomPercent === 100
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(150)}
              aria-pressed={zoomMode === 'percent' && zoomPercent === 150}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                zoomMode === 'percent' && zoomPercent === 150
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              150%
            </button>
          </div>

          {/* Fine Zoom Stepper */}
          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => handleStepZoom(-15)}
              disabled={zoomMode === 'percent' && zoomPercent <= 50}
              aria-label="Zoom out"
              className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ZoomOut className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="px-2 text-xs font-mono text-slate-700 tabular-nums min-w-[46px] text-center">
              {zoomMode === 'fit' ? 'Fit' : `${zoomPercent}%`}
            </span>
            <button
              type="button"
              onClick={() => handleStepZoom(15)}
              disabled={zoomMode === 'percent' && zoomPercent >= 200}
              aria-label="Zoom in"
              className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ZoomIn className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onShuffleVersion(config.previewVersion)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{copy.preview.shuffle}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSingle}
            disabled={!canExport || downloadingSingle}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {visibleTypes.length === 1 ? copy.preview.downloadCurrent : copy.preview.exportBundle}
            </span>
          </button>
        </div>

        {/* Contextual sheet-specific toggles for Word Scramble, Typing 1 Grid & Guideline Overlay */}
        {(showsTypingImage || showsWordScramble || supportsGuidelineOverlay) && (
          <div className="w-full pt-3 mt-1 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-700">
            {supportsGuidelineOverlay && (
              <>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.guidelineOverlay)}
                    onChange={(e) => onUpdateConfig({ guidelineOverlay: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-700"
                  />
                  <span className="font-medium">{copy.builder.guidelineOverlay}</span>
                </label>

                {config.guidelineOverlay && !(showsTypingImage && config.typingImageGridlines) && (
                  <div
                    className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                    role="radiogroup"
                    aria-label={copy.builder.typingImageGridBlocksLabel}
                  >
                    {([4, 5] as GridBlockCount[]).map((blocks) => {
                      const active = (config.typingImageGridBlocks === 5 ? 5 : 4) === blocks;
                      return (
                        <button
                          key={blocks}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => onUpdateConfig({ typingImageGridBlocks: blocks })}
                          className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {blocks} ô ly
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {showsTypingImage && (
              <>
                <label className="inline-flex items-center gap-2 cursor-pointer">
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
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-700"
                  />
                  <span className="font-medium">{copy.builder.typingImageGridlines}</span>
                </label>

                {config.typingImageGridlines && (
                  <>
                    <div
                      className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                      role="radiogroup"
                      aria-label={copy.builder.typingImageGridSizeLabel}
                    >
                      {([2, 2.5] as GridCellSize[]).map((size) => {
                        const active = (config.typingImageGridSize === 2.5 ? 2.5 : 2) === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onUpdateConfig({ typingImageGridSize: size })}
                            className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                              active
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {size}×{size} mm
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                      role="radiogroup"
                      aria-label={copy.builder.typingImageGridBlocksLabel}
                    >
                      {([4, 5] as GridBlockCount[]).map((blocks) => {
                        const active = (config.typingImageGridBlocks === 5 ? 5 : 4) === blocks;
                        return (
                          <button
                            key={blocks}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onUpdateConfig({ typingImageGridBlocks: blocks })}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {blocks} ô ly
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.typingImageShowSample}
                    onChange={(e) => onUpdateConfig({ typingImageShowSample: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-700"
                  />
                  <span className="font-medium">{copy.builder.typingImageShowSample}</span>
                </label>
              </>
            )}

            {showsWordScramble && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.wordScrambleShowHint}
                  onChange={(e) => onUpdateConfig({ wordScrambleShowHint: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-700"
                />
                <span className="font-medium">{copy.builder.wordScrambleShowHint}</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Proofing Canvas Desk */}
      <div
        ref={stageRef}
        className="mt-5 proofing-stage border border-slate-200 rounded-xl p-6 sm:p-10 min-h-[65vh] overflow-x-auto"
      >
        {descriptors.length === 0 ? (
          <div className="py-24 text-center max-w-md mx-auto">
            <p className="text-sm text-slate-600">{copy.preview.renderError}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-10 min-w-fit mx-auto">
            {descriptors.map((desc) => {
              const baseW = desc.widthPt > desc.heightPt ? 860 : 620;
              const targetW =
                zoomMode === 'fit'
                  ? fitTargetWidth
                  : Math.round((baseW * zoomPercent) / 100);
              return (
                <SheetCanvasCard
                  key={desc.id}
                  descriptor={desc}
                  targetWidth={targetW}
                  allowOverflow
                  renderKey={`${desc.id}-${shuffleNonce}-${zoomMode}-${targetW}-${config.difficulty}-${config.studentHeader}-${config.fontStyle}-${config.customFontId || ''}-${config.customFontScale ?? 1}-${config.customFontBaselineOffset ?? 0}-${config.customFontLetterSpacing ?? 0}-${serializeLigatureOverlapsKey(config.customFontLigatureOverlaps)}-${config.fontSize || 'small'}-${config.guidelineOverlay}-${config.typingImageGridlines}-${config.typingImageGridSize}-${config.typingImageGridBlocks}-${config.typingImageShowSample}-${config.wordScrambleShowHint}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
