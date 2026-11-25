import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ClipboardPaste,
  Crop,
  FilePenLine,
  FileSpreadsheet,
  FolderArchive,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import {
  downloadExcelTemplate,
  fileToImageAsset,
  makeUid,
  numericId,
  orientPastedPairs,
  parseExcelFile,
  parseImagesZip,
  parsePastedPairs,
} from '../lib/worksheetSupport';
import {
  ImageAsset,
  Locale,
  ParsedPastePreview,
  TypingDirection,
  ValidationReport,
  VocabRow,
} from '../types/worksheet';
import { BatchRenameModal } from './BatchRenameModal';
import { ImageEditorModal } from './ImageEditorModal';

interface DataWorkspaceProps {
  rows: VocabRow[];
  images: Map<string, ImageAsset>;
  validation: ValidationReport;
  copy: Dictionary;
  locale: Locale;
  excelFileName: string | null;
  zipFileName: string | null;
  onReplaceRows: (rows: VocabRow[], sourceFileName: string | null) => void;
  onAppendRows: (rows: VocabRow[]) => void;
  onUpdateRow: (uid: string, patch: Partial<VocabRow>) => void;
  onDeleteRow: (uid: string) => void;
  onClearAll: () => void;
  onMergeImages: (assets: Map<string, ImageAsset>, zipName?: string) => void;
  onBatchRenameImages: (nextImages: Map<string, ImageAsset>, rowImageIdUpdates: Map<string, string>) => void;
  onLoadSample: () => Promise<void>;
  onNavigateToBuilder: () => void;
}

export function DataWorkspace({
  rows,
  images,
  validation,
  copy,
  locale,
  excelFileName,
  zipFileName,
  onReplaceRows,
  onAppendRows,
  onUpdateRow,
  onDeleteRow,
  onClearAll,
  onMergeImages,
  onBatchRenameImages,
  onLoadSample,
  onNavigateToBuilder,
}: DataWorkspaceProps) {
  const [search, setSearch] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState<ParsedPastePreview | null>(null);
  const [pasteDirection, setPasteDirection] = useState<TypingDirection>('en-to-vi');
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ asset: ImageAsset; wordLabel?: string } | null>(null);
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);

  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const sortedAssets = useMemo(() => {
    return Array.from(images.values()).sort((a, b) => {
      const na = numericId(a.id);
      const nb = numericId(b.id);
      if (na && nb) return Number(na) - Number(nb);
      if (na) return -1;
      if (nb) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [images]);

  const unmappedAssetCount = useMemo(
    () => sortedAssets.filter((a) => !numericId(a.id)).length,
    [sortedAssets]
  );

  const handleSaveEditedImage = (updated: ImageAsset) => {
    onMergeImages(new Map([[updated.id, updated]]));
    setFeedback({
      type: 'info',
      text:
        locale === 'vi'
          ? `Đã cập nhật ảnh ID ${updated.id} (cắt / xoay).`
          : `Saved edited image for ID ${updated.id}.`,
    });
  };

  const handleApplyBatchRename = (
    nextImages: Map<string, ImageAsset>,
    rowImageIdUpdates: Map<string, string>
  ) => {
    onBatchRenameImages(nextImages, rowImageIdUpdates);
    setFeedback({
      type: 'info',
      text:
        locale === 'vi'
          ? `Đã đổi tên và đồng bộ ${nextImages.size} ảnh (${rowImageIdUpdates.size} dòng được cập nhật ID_Anh).`
          : `Renamed and mapped ${nextImages.size} images (${rowImageIdUpdates.size} vocabulary rows synced).`,
    });
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.en.toLowerCase().includes(q) ||
        r.vi.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        r.imageId.includes(q)
    );
  }, [rows, search]);

  const handleExcelUpload = async (file: File) => {
    try {
      setFeedback(null);
      const parsed = await parseExcelFile(file);
      onReplaceRows(parsed, file.name);
      setFeedback({ type: 'info', text: `Loaded ${parsed.length} vocabulary rows from ${file.name}.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to parse spreadsheet.',
      });
    }
  };

  const handleZipUpload = async (file: File) => {
    try {
      setFeedback(null);
      const { assets, unmappedCount } = await parseImagesZip(file);
      onMergeImages(assets, file.name);
      if (unmappedCount > 0) {
        setFeedback({
          type: 'info',
          text:
            locale === 'vi'
              ? `Đã nạp ${assets.size} ảnh từ ${file.name} (${unmappedCount} ảnh chưa có tên số). Hãy dùng "Đổi tên hàng loạt" để ghép nhanh với từ vựng.`
              : `Extracted ${assets.size} pictures from ${file.name} (${unmappedCount} have non-numeric filenames). Use Batch Rename to match them to your vocabulary words.`,
        });
        setBatchRenameOpen(true);
      } else {
        setFeedback({
          type: 'info',
          text: `Extracted ${assets.size} picture files from ${file.name}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to read ZIP archive.',
      });
    }
  };

  const handleParsePaste = () => {
    try {
      setFeedback(null);
      const parsed = parsePastedPairs(pasteText);
      setPastePreview(parsed);
      if (parsed.direction !== 'uncertain') {
        setPasteDirection(parsed.direction);
      }
    } catch (err) {
      setPastePreview(null);
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not parse pasted text.',
      });
    }
  };

  const handleConfirmPaste = () => {
    if (!pastePreview) return;
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    const oriented = orientPastedPairs(pastePreview, pasteDirection, nextId);
    onAppendRows(oriented);
    setPasteText('');
    setPastePreview(null);
    setFeedback({ type: 'info', text: `Appended ${oriented.length} pasted rows to the active table.` });
  };

  const handleAddBlankRow = () => {
    const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    onAppendRows([
      {
        uid: makeUid(),
        id: nextId,
        en: '',
        vi: '',
        imageId: String(nextId),
        source: 'manual',
      },
    ]);
  };

  const handleRowImagePick = async (row: VocabRow, file: File) => {
    const targetId = numericId(row.imageId) || String(row.id);
    const asset = await fileToImageAsset(file, targetId);
    const nextMap = new Map<string, ImageAsset>([[targetId, asset]]);
    onMergeImages(nextMap);
    if (row.imageId !== targetId) {
      onUpdateRow(row.uid, { imageId: targetId });
    }
  };

  const handleLoadSampleClick = async () => {
    setIsLoadingSample(true);
    setFeedback(null);
    try {
      await onLoadSample();
      setFeedback({ type: 'info', text: 'Loaded 12 illustrated classroom words.' });
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleDrop = (e: React.DragEvent, kind: 'excel' | 'zip') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (kind === 'excel') void handleExcelUpload(file);
    else void handleZipUpload(file);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
      {/* Page header & summary metrics */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            {copy.data.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">{copy.data.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
          <span>
            <strong className="font-mono font-semibold text-slate-950 tabular-nums">{rows.length}</strong>{' '}
            {copy.data.rowsReady}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            <strong className="font-mono font-semibold text-emerald-700 tabular-nums">
              {validation.validImageRows.length}
            </strong>{' '}
            {copy.data.imagesMatched}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            <strong className="font-mono font-semibold text-blue-700 tabular-nums">
              {validation.validTextRows.length}
            </strong>{' '}
            {copy.data.textPairsReady}
          </span>
        </div>
      </div>

      {/* Diagnostic banner */}
      {(feedback || validation.warnings.length > 0) && (
        <div className="mt-6 space-y-2">
          {feedback && (
            <div
              role="status"
              className={`flex items-start gap-2.5 px-4 py-3 text-sm rounded-lg border ${
                feedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{feedback.text}</span>
            </div>
          )}
          {validation.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 px-4 py-2.5 text-sm rounded-lg border bg-amber-50 border-amber-200 text-amber-900"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main 2-column studio split */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Import & Paste sources */}
        <div className="lg:col-span-4 space-y-6">
          {/* File Dropzones */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Import Files</h2>
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-4 whitespace-nowrap"
              >
                {copy.data.downloadTemplate}
              </button>
            </div>

            {/* Excel Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'excel')}
              onClick={() => excelInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') excelInputRef.current?.click();
              }}
              className="group cursor-pointer rounded-lg border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 p-4 transition-colors duration-150"
            >
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleExcelUpload(f);
                  e.target.value = '';
                }}
              />
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-800">
                    {copy.data.excelDropTitle}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {excelFileName ? `Loaded: ${excelFileName}` : copy.data.excelDropHint}
                  </div>
                </div>
              </div>
            </div>

            {/* ZIP Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'zip')}
              onClick={() => zipInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') zipInputRef.current?.click();
              }}
              className="group cursor-pointer rounded-lg border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 p-4 transition-colors duration-150"
            >
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleZipUpload(f);
                  e.target.value = '';
                }}
              />
              <div className="flex items-start gap-3">
                <FolderArchive className="w-5 h-5 text-blue-700 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-800">
                    {copy.data.zipDropTitle}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {zipFileName
                      ? `Loaded: ${zipFileName} (${images.size} images)`
                      : copy.data.zipDropHint}
                  </div>
                </div>
              </div>
            </div>

            {sortedAssets.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800">
                      {locale === 'vi' ? 'Kho ảnh đã nạp' : 'Uploaded Pictures'}
                    </span>
                    <span className="ml-1.5 font-mono text-slate-500 tabular-nums">
                      ({sortedAssets.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBatchRenameOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0"
                  >
                    <FilePenLine className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {locale === 'vi' ? 'Đổi tên hàng loạt' : 'Batch Rename'}
                      {unmappedAssetCount > 0 ? ` (${unmappedAssetCount})` : ''}
                    </span>
                  </button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-0.5">
                  {sortedAssets.map((asset) => {
                    const num = numericId(asset.id);
                    const matchedRow = num ? rows.find((r) => numericId(r.imageId) === num) : undefined;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() =>
                          setEditingTarget({ asset, wordLabel: matchedRow?.en || asset.name })
                        }
                        title={
                          locale === 'vi'
                            ? `Cắt / xoay ${asset.name}`
                            : `Crop or rotate ${asset.name}`
                        }
                        className={`group relative aspect-square rounded-lg border bg-slate-50 hover:border-blue-600 overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          num ? 'border-slate-200' : 'border-amber-300'
                        }`}
                      >
                        <img
                          src={asset.objectUrl}
                          alt={matchedRow?.en || asset.name}
                          className="w-full h-full object-contain p-1"
                        />
                        <span className="absolute bottom-0.5 left-1 max-w-[85%] truncate font-mono text-[10px] font-semibold text-slate-700 bg-white/90 px-1 rounded tabular-nums">
                          {num || asset.name.replace(/\.[^.]+$/, '')}
                        </span>
                        <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 flex items-center justify-center transition-colors">
                          <Crop
                            className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleLoadSampleClick}
                disabled={isLoadingSample}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors duration-150 whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span>{isLoadingSample ? 'Preparing...' : copy.data.loadSample}</span>
              </button>
            </div>
          </section>

          {/* Quick Paste Panel */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">{copy.data.pasteTitle}</h2>
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder={copy.data.pastePlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />

            <button
              type="button"
              onClick={handleParsePaste}
              disabled={!pasteText.trim()}
              className="w-full px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors duration-150"
            >
              {copy.data.parsePaste}
            </button>

            {pastePreview && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="space-y-1.5 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paste-dir"
                      checked={pasteDirection === 'en-to-vi'}
                      onChange={() => setPasteDirection('en-to-vi')}
                      className="accent-blue-700"
                    />
                    <span>{copy.data.pasteDirEnVi}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paste-dir"
                      checked={pasteDirection === 'vi-to-en'}
                      onChange={() => setPasteDirection('vi-to-en')}
                      className="accent-blue-700"
                    />
                    <span>{copy.data.pasteDirViEn}</span>
                  </label>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                  {pastePreview.pairs.slice(0, 8).map((p) => (
                    <div key={p.sourceRow} className="grid grid-cols-2 px-3 py-1.5 bg-slate-50/70">
                      <span className="font-medium text-slate-900 truncate">
                        {pasteDirection === 'vi-to-en' ? p.second : p.first}
                      </span>
                      <span className="text-slate-600 truncate">
                        {pasteDirection === 'vi-to-en' ? p.first : p.second}
                      </span>
                    </div>
                  ))}
                  {pastePreview.pairs.length > 8 && (
                    <div className="px-3 py-1.5 text-slate-500 bg-white">
                      +{pastePreview.pairs.length - 8} more rows
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleConfirmPaste}
                  className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors duration-150"
                >
                  {copy.data.confirmPaste} ({pastePreview.pairs.length})
                </button>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500 leading-relaxed px-1">{copy.data.privacyNote}</p>
        </div>

        {/* Right column: Inline Editable Vocabulary Table */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={copy.data.searchPlaceholder}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAddBlankRow}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{copy.data.addRow}</span>
              </button>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copy.data.clearAll}</span>
                </button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-8 py-16 text-center max-w-md mx-auto">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-base font-semibold text-slate-900">{copy.data.emptyTitle}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{copy.data.emptyBody}</p>
              <button
                type="button"
                onClick={handleLoadSampleClick}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                {copy.data.loadSample}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 pl-5 pr-2 w-12">{copy.data.colNo}</th>
                    <th className="py-2.5 px-2">{copy.data.colEnglish}</th>
                    <th className="py-2.5 px-2">{copy.data.colVietnamese}</th>
                    <th className="py-2.5 px-2 w-24">{copy.data.colImageId}</th>
                    <th className="py-2.5 px-2 w-32">{copy.data.colPreview}</th>
                    <th className="py-2.5 pl-2 pr-5 w-14 text-right">{copy.data.colAction}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRows.map((row) => {
                    const imgKey = numericId(row.imageId);
                    const asset = imgKey ? images.get(imgKey) : undefined;
                    return (
                      <tr key={row.uid} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 pl-5 pr-2 font-mono text-xs text-slate-500 tabular-nums">
                          {row.id}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={row.en}
                            onChange={(e) => onUpdateRow(row.uid, { en: e.target.value })}
                            aria-label={`English word row ${row.id}`}
                            className="w-full px-2.5 py-1.5 text-sm text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none rounded-md"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={row.vi}
                            onChange={(e) => onUpdateRow(row.uid, { vi: e.target.value })}
                            aria-label={`Vietnamese meaning row ${row.id}`}
                            className="w-full px-2.5 py-1.5 text-sm text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none rounded-md"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.imageId}
                            onChange={(e) => onUpdateRow(row.uid, { imageId: e.target.value.replace(/[^0-9]/g, '') })}
                            aria-label={`Image ID row ${row.id}`}
                            placeholder="—"
                            className="w-20 px-2.5 py-1.5 font-mono text-xs text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-blue-600 focus:outline-none rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            {asset ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingTarget({ asset, wordLabel: row.en || undefined })
                                  }
                                  title={locale === 'vi' ? 'Cắt / xoay ảnh' : 'Crop or rotate image'}
                                  className="relative group w-9 h-9 rounded-md overflow-hidden bg-slate-50 border border-slate-200 hover:border-blue-600 shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                >
                                  <img
                                    src={asset.objectUrl}
                                    alt={row.en || `Picture ${row.imageId}`}
                                    className="w-full h-full object-contain"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingTarget({ asset, wordLabel: row.en || undefined })
                                  }
                                  aria-label={`Crop or rotate ${row.en || `image ${row.imageId}`}`}
                                  title={locale === 'vi' ? 'Cắt / xoay ảnh' : 'Crop / Rotate'}
                                  className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                                >
                                  <Crop className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <span
                                className={`text-xs ${
                                  row.imageId ? 'text-rose-600 font-medium' : 'text-slate-400'
                                }`}
                              >
                                {row.imageId ? copy.data.missingImage : copy.data.noImageId}
                              </span>
                            )}
                            <label
                              title={copy.data.uploadImg}
                              className="cursor-pointer p-1.5 text-slate-400 hover:text-blue-700 rounded-md hover:bg-blue-50 transition-colors"
                            >
                              <ImagePlus className="w-4 h-4" aria-hidden="true" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleRowImagePick(row, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </td>
                        <td className="py-2 pl-2 pr-5 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteRow(row.uid)}
                            aria-label={`Delete ${row.en || `row ${row.id}`}`}
                            className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500">
                Showing {filteredRows.length} of {rows.length} rows
              </span>
              <button
                type="button"
                onClick={onNavigateToBuilder}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
              >
                Continue to Worksheet Studio →
              </button>
            </div>
          )}
        </section>
      </div>

      {editingTarget && (
        <ImageEditorModal
          asset={editingTarget.asset}
          wordLabel={editingTarget.wordLabel}
          locale={locale}
          onClose={() => setEditingTarget(null)}
          onSave={handleSaveEditedImage}
        />
      )}

      {batchRenameOpen && (
        <BatchRenameModal
          assets={sortedAssets}
          rows={rows}
          locale={locale}
          onClose={() => setBatchRenameOpen(false)}
          onApply={handleApplyBatchRename}
        />
      )}
    </div>
  );
}
