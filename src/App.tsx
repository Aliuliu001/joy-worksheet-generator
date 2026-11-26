import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, History, Keyboard, RotateCcw, X } from 'lucide-react';
import { BuilderWorkspace } from './components/BuilderWorkspace';
import { DataWorkspace } from './components/DataWorkspace';
import { PreviewWorkspace } from './components/PreviewWorkspace';
import { PrintGuideView } from './components/PrintGuideView';
import { TopBar } from './components/TopBar';
import {
  addCustomFontFile,
  clampBaselineOffset,
  clampCustomScale,
  clampLetterSpacing,
  getCustomFontById,
  loadStoredCustomFonts,
  removeCustomFont,
  sanitizeLigatureOverlaps,
  updateCustomFontCalibration,
} from './lib/customFontStore';
import { COPY } from './lib/i18n';
import { exportWorksheetBundle } from './lib/pdfEngine';
import { createSampleDataset } from './lib/sampleData';
import {
  SavedSession,
  clearSavedSession,
  deserializeImages,
  loadSavedSession,
  saveSessionToStorage,
} from './lib/sessionStorage';
import {
  DEFAULT_CONFIG,
  buildVersionPlan,
  validateDataset,
} from './lib/worksheetSupport';
import {
  CustomFontAsset,
  ImageAsset,
  Locale,
  MixSectionType,
  NavView,
  VocabRow,
  WorksheetConfig,
  WorksheetType,
} from './types/worksheet';

export default function App() {
  const [activeView, setActiveView] = useState<NavView>('builder');
  const [locale, setLocale] = useState<Locale>('en');
  const [rows, setRows] = useState<VocabRow[]>([]);
  const [images, setImages] = useState<Map<string, ImageAsset>>(() => new Map());
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [config, setConfig] = useState<WorksheetConfig>(DEFAULT_CONFIG);
  const [customFonts, setCustomFonts] = useState<CustomFontAsset[]>([]);
  const [shuffleNonces, setShuffleNonces] = useState<Record<number, number>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // localStorage session persistence state
  const [pendingRestore, setPendingRestore] = useState<SavedSession | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const hasBootedRef = useRef(false);
  const lastNonDataViewRef = useRef<NavView>('builder');
  const calibrationTimerRef = useRef<number | null>(null);

  const copy = COPY[locale];

  const loadSampleLesson = useCallback(async () => {
    const sample = await createSampleDataset();
    setRows(sample.rows);
    setImages(sample.images);
    setExcelFileName('Sample_Lesson_12_Words.xlsx');
    setZipFileName('Sample_Illustrations.zip');
    setShuffleNonces({});
  }, []);

  // On mount: hydrate stored custom fonts from IndexedDB, check saved session, and preload sample dataset
  useEffect(() => {
    let active = true;
    const saved = loadSavedSession();
    if (saved && (saved.rows.length > 0 || saved.images.length > 0)) {
      setPendingRestore(saved);
    }

    loadStoredCustomFonts().then((fonts) => {
      if (!active) return;
      setCustomFonts(fonts);
    });

    createSampleDataset().then((sample) => {
      if (!active) return;
      setRows(sample.rows);
      setImages(sample.images);
      setExcelFileName('Sample_Lesson_12_Words.xlsx');
      setZipFileName('Sample_Illustrations.zip');
      hasBootedRef.current = true;
      // Only enable automatic saving immediately if there is no pending restore prompt waiting for user decision
      if (!saved || (saved.rows.length === 0 && saved.images.length === 0)) {
        setPersistenceReady(true);
      }
    });

    return () => {
      active = false;
      if (calibrationTimerRef.current !== null) {
        window.clearTimeout(calibrationTimerRef.current);
      }
    };
  }, []);

  // Debounced auto-save to localStorage once persistence is active
  useEffect(() => {
    if (!persistenceReady || !hasBootedRef.current) return;
    const timer = window.setTimeout(() => {
      saveSessionToStorage({
        locale,
        excelFileName,
        zipFileName,
        rows,
        images,
        config,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [persistenceReady, locale, excelFileName, zipFileName, rows, images, config]);

  const handleRestoreSession = useCallback(() => {
    if (!pendingRestore) return;
    const restoredImages = deserializeImages(pendingRestore.images);
    const restoredConfig: WorksheetConfig = { ...pendingRestore.config };
    if (restoredConfig.fontStyle === 'custom') {
      const matched = getCustomFontById(restoredConfig.customFontId);
      if (!matched) {
        if (customFonts.length > 0) {
          restoredConfig.customFontId = customFonts[0].id;
          restoredConfig.customFontScale = customFonts[0].scale;
          restoredConfig.customFontBaselineOffset = customFonts[0].baselineOffset;
          restoredConfig.customFontLetterSpacing = customFonts[0].letterSpacing;
          restoredConfig.customFontLigatureOverlaps = { ...customFonts[0].ligatureOverlaps };
        } else {
          restoredConfig.fontStyle = 'penmanship';
          restoredConfig.customFontId = null;
          restoredConfig.customFontScale = 1;
          restoredConfig.customFontBaselineOffset = 0;
          restoredConfig.customFontLetterSpacing = 0;
          restoredConfig.customFontLigatureOverlaps = {};
        }
      } else {
        restoredConfig.customFontLetterSpacing = clampLetterSpacing(
          restoredConfig.customFontLetterSpacing ?? matched.letterSpacing
        );
        restoredConfig.customFontLigatureOverlaps = sanitizeLigatureOverlaps(
          restoredConfig.customFontLigatureOverlaps ?? matched.ligatureOverlaps
        );
      }
    } else {
      restoredConfig.customFontLigatureOverlaps = sanitizeLigatureOverlaps(
        restoredConfig.customFontLigatureOverlaps
      );
    }
    setRows(pendingRestore.rows);
    setImages(restoredImages);
    setConfig(restoredConfig);
    setExcelFileName(pendingRestore.excelFileName);
    setZipFileName(pendingRestore.zipFileName);
    setLocale(pendingRestore.locale);
    setShuffleNonces({});
    setPendingRestore(null);
    setPersistenceReady(true);
    setExportToast({
      kind: 'success',
      message: pendingRestore.imagesTruncated
        ? `Restored ${pendingRestore.rows.length} words and settings. Re-upload your picture ZIP if images were too large for browser storage.`
        : `Restored previous session (${pendingRestore.rows.length} words, ${restoredImages.size} pictures).`,
    });
  }, [pendingRestore, customFonts]);

  const handleDismissRestore = useCallback(() => {
    clearSavedSession();
    setPendingRestore(null);
    setPersistenceReady(true);
  }, []);

  const validation = useMemo(
    () => validateDataset(rows, images, config),
    [rows, images, config]
  );

  const previewNonce = shuffleNonces[config.previewVersion] || 0;

  const previewPlan = useMemo(
    () => buildVersionPlan(config.previewVersion, rows, images, config, previewNonce),
    [config, rows, images, previewNonce]
  );

  const expectedFileCount = useMemo(() => {
    let count = 0;
    for (const type of config.selectedTypes) {
      count += config.versionCount;
      if (config.includeAnswerKeys && type !== 'flashcards') {
        count += config.versionCount;
      }
    }
    return count;
  }, [config.selectedTypes, config.versionCount, config.includeAnswerKeys]);

  const canExport = validation.errors.length === 0 && config.selectedTypes.length > 0 && rows.length > 0;

  const handleUpdateConfig = useCallback((patch: Partial<WorksheetConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUploadCustomFonts = useCallback(
    async (files: FileList | File[]): Promise<{ added: CustomFontAsset[]; errors: string[] }> => {
      const list = Array.from(files);
      const added: CustomFontAsset[] = [];
      const errors: string[] = [];

      for (const file of list) {
        try {
          const asset = await addCustomFontFile(file);
          added.push(asset);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : `Failed to load "${file.name}".`);
        }
      }

      if (added.length > 0) {
        setCustomFonts((prev) => [...prev, ...added]);
        const primary = added[0];
        setConfig((prev) => ({
          ...prev,
          fontStyle: 'custom',
          customFontId: primary.id,
          customFontScale: primary.scale,
          customFontBaselineOffset: primary.baselineOffset,
          customFontLetterSpacing: primary.letterSpacing,
          customFontLigatureOverlaps: { ...primary.ligatureOverlaps },
        }));
      }

      return { added, errors };
    },
    []
  );

  const handleSelectCustomFont = useCallback((font: CustomFontAsset) => {
    setConfig((prev) => ({
      ...prev,
      fontStyle: 'custom',
      customFontId: font.id,
      customFontScale: font.scale,
      customFontBaselineOffset: font.baselineOffset,
      customFontLetterSpacing: font.letterSpacing,
      customFontLigatureOverlaps: { ...font.ligatureOverlaps },
    }));
  }, []);

  const handleDeleteCustomFont = useCallback(
    async (id: string) => {
      await removeCustomFont(id);
      const remaining = customFonts.filter((f) => f.id !== id);
      setCustomFonts(remaining);
      setConfig((prev) => {
        if (prev.customFontId !== id) return prev;
        if (remaining.length > 0) {
          return {
            ...prev,
            fontStyle: 'custom',
            customFontId: remaining[0].id,
            customFontScale: remaining[0].scale,
            customFontBaselineOffset: remaining[0].baselineOffset,
            customFontLetterSpacing: remaining[0].letterSpacing,
            customFontLigatureOverlaps: { ...remaining[0].ligatureOverlaps },
          };
        }
        return {
          ...prev,
          fontStyle: 'viet-primary',
          customFontId: null,
          customFontScale: 1,
          customFontBaselineOffset: 0,
          customFontLetterSpacing: 0,
          customFontLigatureOverlaps: {},
        };
      });
    },
    [customFonts]
  );

  const handleUpdateCustomFontCalibration = useCallback(
    (
      scale: number,
      baselineOffset: number,
      letterSpacing: number,
      ligatureOverlaps?: Record<string, number>
    ) => {
      const nextScale = clampCustomScale(scale);
      const nextOffset = clampBaselineOffset(baselineOffset);
      const nextSpacing = clampLetterSpacing(letterSpacing);
      const nextLigatures =
        ligatureOverlaps !== undefined
          ? sanitizeLigatureOverlaps(ligatureOverlaps)
          : sanitizeLigatureOverlaps(config.customFontLigatureOverlaps);
      const activeId = config.customFontId;

      setConfig((prev) => ({
        ...prev,
        customFontScale: nextScale,
        customFontBaselineOffset: nextOffset,
        customFontLetterSpacing: nextSpacing,
        customFontLigatureOverlaps: nextLigatures,
      }));

      if (!activeId) return;

      setCustomFonts((prev) =>
        prev.map((font) =>
          font.id === activeId
            ? {
                ...font,
                scale: nextScale,
                baselineOffset: nextOffset,
                letterSpacing: nextSpacing,
                ligatureOverlaps: nextLigatures,
              }
            : font
        )
      );

      if (calibrationTimerRef.current !== null) {
        window.clearTimeout(calibrationTimerRef.current);
      }
      calibrationTimerRef.current = window.setTimeout(() => {
        void updateCustomFontCalibration(
          activeId,
          nextScale,
          nextOffset,
          nextSpacing,
          nextLigatures
        );
      }, 120);
    },
    [config.customFontId, config.customFontLigatureOverlaps]
  );

  const handleToggleWorksheetType = useCallback((type: WorksheetType) => {
    setConfig((prev) => {
      const exists = prev.selectedTypes.includes(type);
      const nextTypes = exists
        ? prev.selectedTypes.filter((t) => t !== type)
        : [...prev.selectedTypes, type];
      return { ...prev, selectedTypes: nextTypes };
    });
  }, []);

  const handleUpdateMixSection = useCallback(
    (type: MixSectionType, patch: { enabled?: boolean; target?: number }) => {
      setConfig((prev) => ({
        ...prev,
        mixSections: prev.mixSections.map((sec) =>
          sec.type === type ? { ...sec, ...patch } : sec
        ),
      }));
    },
    []
  );

  const handleShuffleVersion = useCallback((version: number) => {
    setShuffleNonces((prev) => ({
      ...prev,
      [version]: (prev[version] || 0) + 1,
    }));
  }, []);

  const handleReplaceRows = useCallback((nextRows: VocabRow[], sourceFileName: string | null) => {
    setRows(nextRows);
    setExcelFileName(sourceFileName);
    setShuffleNonces({});
  }, []);

  const handleAppendRows = useCallback((moreRows: VocabRow[]) => {
    setRows((prev) => [...prev, ...moreRows]);
  }, []);

  const handleUpdateRow = useCallback((uid: string, patch: Partial<VocabRow>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }, []);

  const handleDeleteRow = useCallback((uid: string) => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  }, []);

  const handleClearAll = useCallback(() => {
    setRows([]);
    setImages(new Map());
    setExcelFileName(null);
    setZipFileName(null);
    setShuffleNonces({});
  }, []);

  const handleMergeImages = useCallback((newAssets: Map<string, ImageAsset>, zipName?: string) => {
    setImages((prev) => {
      const next = new Map(prev);
      newAssets.forEach((asset, key) => {
        next.set(key, asset);
      });
      return next;
    });
    if (zipName) setZipFileName(zipName);
  }, []);

  const handleBatchRenameImages = useCallback(
    (nextImages: Map<string, ImageAsset>, rowImageIdUpdates: Map<string, string>) => {
      setImages(nextImages);
      if (rowImageIdUpdates.size > 0) {
        setRows((prev) =>
          prev.map((row) => {
            const updatedId = rowImageIdUpdates.get(row.uid);
            return updatedId ? { ...row, imageId: updatedId } : row;
          })
        );
      }
    },
    []
  );

  const handleExportAll = useCallback(async () => {
    if (!canExport || isExporting) return;
    setIsExporting(true);
    setExportToast(null);
    try {
      const result = await exportWorksheetBundle(rows, images, config, shuffleNonces);
      setExportToast({
        kind: 'success',
        message:
          result.fileCount === 1
            ? `Downloaded ${result.archiveName}. Print at Actual Size (100%).`
            : `Downloaded ${result.archiveName} containing ${result.fileCount} PDF files. Print at Actual Size (100%).`,
      });
    } catch (err) {
      setExportToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'PDF export failed.',
      });
    } finally {
      setIsExporting(false);
    }
  }, [canExport, isExporting, rows, images, config, shuffleNonces]);

  // Track last non-data view so Ctrl+Alt+D cleanly toggles back and forth
  useEffect(() => {
    if (activeView !== 'data') {
      lastNonDataViewRef.current = activeView;
    }
  }, [activeView]);

  // Global keyboard shortcuts for power-user navigation, save/export, and quick actions
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const code = e.code;
      const key = e.key.toLowerCase();

      // Escape: close shortcuts modal or dismiss active status banner
      if (key === 'escape') {
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
        } else if (exportToast) {
          setExportToast(null);
        }
        return;
      }

      // Ctrl/Cmd + S: Save current session immediately & export PDF/ZIP
      if (mod && !e.altKey && !e.shiftKey && (code === 'KeyS' || key === 's')) {
        e.preventDefault();
        if (hasBootedRef.current) {
          saveSessionToStorage({
            locale,
            excelFileName,
            zipFileName,
            rows,
            images,
            config,
          });
          setPersistenceReady(true);
        }
        if (canExport && !isExporting) {
          void handleExportAll();
        } else if (!isExporting) {
          setExportToast({
            kind: 'success',
            message:
              locale === 'vi'
                ? 'Đã lưu phiên làm việc. Chọn ít nhất một dạng phiếu hợp lệ để xuất PDF.'
                : 'Session saved locally. Select a valid worksheet format to export PDF.',
          });
        }
        return;
      }

      // Ctrl/Cmd + Alt + <Key> power-user workspace shortcuts
      if (mod && e.altKey && !e.shiftKey) {
        if (code === 'KeyD' || key === 'd') {
          e.preventDefault();
          setActiveView((prev) => (prev === 'data' ? lastNonDataViewRef.current : 'data'));
          return;
        }
        if (code === 'KeyP' || key === 'p') {
          e.preventDefault();
          setActiveView((prev) => (prev === 'preview' ? 'builder' : 'preview'));
          return;
        }
        if (code === 'KeyB' || key === 'b') {
          e.preventDefault();
          setActiveView('builder');
          return;
        }
        if (code === 'KeyG' || key === 'g') {
          e.preventDefault();
          setActiveView((prev) => (prev === 'guide' ? 'builder' : 'guide'));
          return;
        }
        if (code === 'KeyR' || key === 'r') {
          e.preventDefault();
          handleShuffleVersion(config.previewVersion);
          setExportToast({
            kind: 'success',
            message:
              locale === 'vi'
                ? `Đã xáo lại thứ tự câu hỏi cho Mã đề ${config.previewVersion}.`
                : `Shuffled question order for Exam Code ${config.previewVersion}.`,
          });
          return;
        }
        if (code === 'KeyL' || key === 'l') {
          e.preventDefault();
          setLocale((prev) => (prev === 'en' ? 'vi' : 'en'));
          return;
        }
      }

      // '?' (Shift + /) opens Keyboard Shortcuts reference when not typing in a field
      if (!mod && !e.altKey && e.key === '?' && !isEditableTarget(e.target)) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canExport,
    config,
    excelFileName,
    exportToast,
    handleExportAll,
    handleShuffleVersion,
    images,
    isExporting,
    locale,
    rows,
    showShortcutsModal,
    zipFileName,
  ]);

  const savedTimeLabel = useMemo(() => {
    if (!pendingRestore) return '';
    try {
      return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(pendingRestore.savedAt));
    } catch {
      return '';
    }
  }, [pendingRestore, locale]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        locale={locale}
        onChangeLocale={setLocale}
        copy={copy}
        canExport={canExport}
        isExporting={isExporting}
        exportWillZip={expectedFileCount > 1}
        onExport={handleExportAll}
      />

      {/* Previous Session Restore Prompt */}
      {pendingRestore && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-4">
          <div
            role="region"
            aria-label="Restore previous session"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm rounded-xl border border-blue-200 bg-blue-50/90 text-slate-900"
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <History className="w-4 h-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
              <div className="min-w-0">
                <span className="font-semibold text-slate-950">
                  {locale === 'vi' ? 'Tìm thấy phiên làm việc trước' : 'Previous session available'}
                </span>
                <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
                <span className="text-xs font-mono text-slate-600 tabular-nums">
                  {savedTimeLabel} · {pendingRestore.rows.length}{' '}
                  {locale === 'vi' ? 'từ' : 'words'} · {pendingRestore.images.length}{' '}
                  {locale === 'vi' ? 'ảnh' : 'pictures'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRestoreSession}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{locale === 'vi' ? 'Khôi phục phiên' : 'Restore Session'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismissRestore}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white/70 rounded-lg transition-colors whitespace-nowrap"
              >
                {locale === 'vi' ? 'Bắt đầu mới' : 'Start Fresh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportToast && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-4">
          <div
            role="status"
            className={`flex items-center justify-between gap-4 px-4 py-3 text-sm rounded-xl border ${
              exportToast.kind === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{exportToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setExportToast(null)}
              aria-label="Dismiss notification"
              className="p-1 rounded hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {activeView === 'builder' && (
          <BuilderWorkspace
            config={config}
            copy={copy}
            images={images}
            customFonts={customFonts}
            totalRows={rows.length}
            validation={validation}
            previewPlan={previewPlan}
            shuffleNonce={previewNonce}
            onUpdateConfig={handleUpdateConfig}
            onUploadCustomFonts={handleUploadCustomFonts}
            onSelectCustomFont={handleSelectCustomFont}
            onDeleteCustomFont={handleDeleteCustomFont}
            onUpdateCustomFontCalibration={handleUpdateCustomFontCalibration}
            onToggleWorksheetType={handleToggleWorksheetType}
            onUpdateMixSection={handleUpdateMixSection}
            onShuffleVersion={handleShuffleVersion}
            onNavigateToData={() => setActiveView('data')}
            onNavigateToPreview={() => setActiveView('preview')}
          />
        )}

        {activeView === 'data' && (
          <DataWorkspace
            rows={rows}
            images={images}
            validation={validation}
            copy={copy}
            locale={locale}
            excelFileName={excelFileName}
            zipFileName={zipFileName}
            onReplaceRows={handleReplaceRows}
            onAppendRows={handleAppendRows}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onClearAll={handleClearAll}
            onMergeImages={handleMergeImages}
            onBatchRenameImages={handleBatchRenameImages}
            onLoadSample={loadSampleLesson}
            onNavigateToBuilder={() => setActiveView('builder')}
          />
        )}

        {activeView === 'preview' && (
          <PreviewWorkspace
            config={config}
            copy={copy}
            images={images}
            previewPlan={previewPlan}
            shuffleNonce={previewNonce}
            canExport={canExport}
            onUpdateConfig={handleUpdateConfig}
            onShuffleVersion={handleShuffleVersion}
            onExportAll={handleExportAll}
          />
        )}

        {activeView === 'guide' && (
          <PrintGuideView
            copy={copy}
            locale={locale}
            onNavigateToData={() => setActiveView('data')}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>JoyEnglish · Print-exact classroom worksheet studio (100% in-browser processing)</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveView('data')}
              className="hover:text-slate-900 transition-colors"
            >
              {copy.nav.data}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('guide')}
              className="hover:text-slate-900 transition-colors"
            >
              {copy.nav.guide}
            </button>
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{locale === 'vi' ? 'Phím tắt (?)' : 'Shortcuts (?)'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Keyboard Shortcuts Reference Modal */}
      {showShortcutsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsModal(false);
          }}
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-blue-700" aria-hidden="true" />
                <h2 id="shortcuts-modal-title" className="text-base font-semibold text-slate-950">
                  {locale === 'vi' ? 'Phím tắt thao tác nhanh' : 'Keyboard Shortcuts'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                aria-label="Close shortcuts dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 divide-y divide-slate-100 text-sm">
              {[
                {
                  keys: ['Ctrl', 'S'],
                  label:
                    locale === 'vi'
                      ? 'Lưu phiên & Xuất PDF / ZIP'
                      : 'Save session & Export PDF / ZIP',
                },
                {
                  keys: ['Ctrl', 'Alt', 'D'],
                  label:
                    locale === 'vi'
                      ? 'Bật / tắt Bảng từ vựng (DataView)'
                      : 'Toggle Vocabulary DataView',
                },
                {
                  keys: ['Ctrl', 'Alt', 'P'],
                  label:
                    locale === 'vi'
                      ? 'Bật / tắt Xem bản in (Print Proofing)'
                      : 'Toggle Print Proofing view',
                },
                {
                  keys: ['Ctrl', 'Alt', 'B'],
                  label:
                    locale === 'vi'
                      ? 'Chuyển sang Thiết kế phiếu'
                      : 'Go to Worksheet Studio',
                },
                {
                  keys: ['Ctrl', 'Alt', 'G'],
                  label:
                    locale === 'vi' ? 'Bật / tắt Hướng dẫn in' : 'Toggle Print Guide',
                },
                {
                  keys: ['Ctrl', 'Alt', 'R'],
                  label:
                    locale === 'vi'
                      ? 'Xáo lại thứ tự câu hỏi mã đề hiện tại'
                      : 'Shuffle active exam code order',
                },
                {
                  keys: ['Ctrl', 'Alt', 'L'],
                  label:
                    locale === 'vi'
                      ? 'Đổi ngôn ngữ giao diện (EN / VI)'
                      : 'Switch interface language (EN / VI)',
                },
                {
                  keys: ['?'],
                  label:
                    locale === 'vi'
                      ? 'Mở / đóng bảng phím tắt này'
                      : 'Toggle this shortcuts reference',
                },
              ].map((item) => (
                <div
                  key={item.keys.join('+')}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <span className="text-slate-700">{item.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, idx) => (
                      <span key={k} className="inline-flex items-center gap-1">
                        {idx > 0 && <span className="text-[10px] text-slate-400">+</span>}
                        <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>
                {locale === 'vi'
                  ? 'Trên macOS có thể dùng ⌘ thay cho Ctrl.'
                  : 'On macOS, ⌘ (Command) works in place of Ctrl.'}
              </span>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="font-semibold text-blue-700 hover:text-blue-900"
              >
                {locale === 'vi' ? 'Đóng' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
