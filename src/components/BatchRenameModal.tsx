import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  ImagePlus,
  ListOrdered,
  Sparkles,
  X,
} from 'lucide-react';
import {
  RenamePattern,
  buildRenamedFilename,
  downloadRenamedImagesZip,
  fileToImageAsset,
  matchAssetToRow,
  numericId,
} from '../lib/worksheetSupport';
import { ImageAsset, Locale, VocabRow } from '../types/worksheet';

interface BatchRenameModalProps {
  assets: ImageAsset[];
  rows: VocabRow[];
  locale: Locale;
  onClose: () => void;
  onApply: (nextImages: Map<string, ImageAsset>, rowImageIdUpdates: Map<string, string>) => void;
}

interface DraftEntry {
  sourceKey: string;
  asset: ImageAsset;
  targetRowUid: string; // '' means unmapped
  customName: string; // empty means auto-derived from pattern
}

const TEXT = {
  en: {
    title: 'Batch Rename & Map Pictures',
    subtitle: 'Bulk rename uploaded images to match your vocabulary rows and sync ID_Anh automatically.',
    patternLabel: 'Filename Format',
    patternId: 'ID only (1.png)',
    patternIdWord: 'ID + Word (1_apple.png)',
    patternWord: 'Word only (apple.png)',
    autoMatch: 'Auto-Match by Word',
    sequentialMap: 'Map 1 → N in Order',
    addImages: 'Add Images',
    colImage: 'Picture',
    colCurrent: 'Current Filename',
    colWord: 'Mapped Vocabulary Word',
    colNewName: 'New Filename & ID',
    unmappedOption: '— Unassigned —',
    unmappedStatus: 'Not mapped',
    duplicateWarning: 'Duplicate target ID detected. Assign unique vocabulary words or keep only one image per ID.',
    downloadZip: 'Download Renamed ZIP',
    cancel: 'Cancel',
    apply: 'Apply Rename & Mapping',
    mappedSummary: 'mapped to vocabulary words',
    empty: 'No images loaded yet. Click "Add Images" or upload a ZIP archive first.',
  },
  vi: {
    title: 'Đổi tên & Ghép ảnh hàng loạt',
    subtitle: 'Tự động đổi tên file ảnh khớp với bảng từ vựng và đồng bộ cột ID_Anh chỉ trong một bước.',
    patternLabel: 'Quy tắc tên file',
    patternId: 'Chỉ số ID (1.png)',
    patternIdWord: 'ID + Từ (1_apple.png)',
    patternWord: 'Chỉ từ tiếng Anh (apple.png)',
    autoMatch: 'Tự khớp theo từ vựng',
    sequentialMap: 'Ghép lần lượt 1 → N',
    addImages: 'Thêm ảnh lẻ',
    colImage: 'Ảnh',
    colCurrent: 'Tên file hiện tại',
    colWord: 'Từ vựng tương ứng',
    colNewName: 'Tên file mới & ID',
    unmappedOption: '— Chưa gán —',
    unmappedStatus: 'Chưa ghép',
    duplicateWarning: 'Phát hiện trùng ID đích. Hãy chọn từ vựng khác nhau cho từng ảnh trước khi lưu.',
    downloadZip: 'Tải ZIP đã đổi tên',
    cancel: 'Hủy',
    apply: 'Áp dụng đổi tên & ghép ảnh',
    mappedSummary: 'ảnh đã ghép vào từ vựng',
    empty: 'Chưa có ảnh nào. Bấm "Thêm ảnh lẻ" hoặc tải file ZIP ảnh lên trước.',
  },
} as const;

export function BatchRenameModal({
  assets,
  rows,
  locale,
  onClose,
  onApply,
}: BatchRenameModalProps) {
  const t = TEXT[locale];
  const [pattern, setPattern] = useState<RenamePattern>('id-word');
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    assets.map((asset) => {
      const existingById = numericId(asset.id)
        ? rows.find((r) => numericId(r.imageId) === numericId(asset.id))
        : null;
      const guessed = existingById || matchAssetToRow(asset.name, rows);
      return {
        sourceKey: asset.id,
        asset,
        targetRowUid: guessed ? guessed.uid : '',
        customName: '',
      };
    })
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const rowMap = useMemo(() => new Map(rows.map((r) => [r.uid, r])), [rows]);

  // Compute target ID and resolved filename for every entry
  const resolvedEntries = useMemo(() => {
    return entries.map((entry) => {
      const row = entry.targetRowUid ? rowMap.get(entry.targetRowUid) : undefined;
      const targetId = row ? numericId(row.imageId) || String(row.id) : numericId(entry.asset.id) || '';
      const autoName = row
        ? buildRenamedFilename(pattern, targetId, row.en || `word_${row.id}`, entry.asset.name, entry.asset.mime)
        : entry.asset.name;
      const newName = entry.customName.trim() || autoName;
      return {
        ...entry,
        row,
        targetId,
        newName,
      };
    });
  }, [entries, rowMap, pattern]);

  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of resolvedEntries) {
      if (item.targetId) {
        counts.set(item.targetId, (counts.get(item.targetId) || 0) + 1);
      }
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
  }, [resolvedEntries]);

  const mappedCount = resolvedEntries.filter((e) => !!e.row).length;

  const handleAutoMatch = () => {
    const claimedRowUids = new Set<string>();
    setEntries((prev) =>
      prev.map((entry) => {
        const availableRows = rows.filter((r) => !claimedRowUids.has(r.uid));
        const matched = matchAssetToRow(entry.asset.name, availableRows);
        if (matched) {
          claimedRowUids.add(matched.uid);
          return { ...entry, targetRowUid: matched.uid, customName: '' };
        }
        return { ...entry, customName: '' };
      })
    );
  };

  const handleSequentialMap = () => {
    setEntries((prev) =>
      prev.map((entry, idx) => ({
        ...entry,
        targetRowUid: rows[idx] ? rows[idx].uid : '',
        customName: '',
      }))
    );
  };

  const handleAddFiles = async (fileList: FileList) => {
    const added: DraftEntry[] = [];
    const existingKeys = new Set(entries.map((e) => e.sourceKey));
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      let key = `file:${file.name}`;
      let suffix = 2;
      while (existingKeys.has(key)) {
        key = `file:${suffix}_${file.name}`;
        suffix += 1;
      }
      existingKeys.add(key);
      const asset = await fileToImageAsset(file, key);
      const matched = matchAssetToRow(file.name, rows);
      added.push({
        sourceKey: key,
        asset,
        targetRowUid: matched ? matched.uid : '',
        customName: '',
      });
    }
    if (added.length) {
      setEntries((prev) => [...prev, ...added]);
    }
  };

  const buildOutputAssets = (): {
    nextMap: Map<string, ImageAsset>;
    rowUpdates: Map<string, string>;
    listForZip: ImageAsset[];
  } => {
    const nextMap = new Map<string, ImageAsset>();
    const rowUpdates = new Map<string, string>();
    const listForZip: ImageAsset[] = [];

    for (const item of resolvedEntries) {
      const finalId = item.targetId || item.sourceKey;
      const updatedAsset: ImageAsset = {
        ...item.asset,
        id: finalId,
        name: item.newName,
      };
      nextMap.set(finalId, updatedAsset);
      listForZip.push(updatedAsset);
      if (item.row && item.targetId) {
        rowUpdates.set(item.row.uid, item.targetId);
      }
    }

    return { nextMap, rowUpdates, listForZip };
  };

  const handleDownloadZip = async () => {
    if (!resolvedEntries.length || downloading) return;
    setDownloading(true);
    try {
      const { listForZip } = buildOutputAssets();
      await downloadRenamedImagesZip(listForZip);
    } finally {
      setDownloading(false);
    }
  };

  const handleApply = () => {
    if (duplicateIds.size > 0) return;
    const { nextMap, rowUpdates } = buildOutputAssets();
    onApply(nextMap, rowUpdates);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-rename-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 id="batch-rename-title" className="text-lg font-semibold text-slate-950">
              {t.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close batch rename utility"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoMatch}
              disabled={!rows.length || !entries.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.autoMatch}</span>
            </button>
            <button
              type="button"
              onClick={handleSequentialMap}
              disabled={!rows.length || !entries.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <ListOrdered className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.sequentialMap}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.addImages}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleAddFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{t.patternLabel}:</span>
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-200/70 rounded-lg">
              {(
                [
                  { id: 'id', label: t.patternId },
                  { id: 'id-word', label: t.patternIdWord },
                  { id: 'word', label: t.patternWord },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPattern(opt.id);
                    setEntries((prev) => prev.map((e) => ({ ...e, customName: '' })));
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    pattern === opt.id
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Duplicate ID Warning */}
        {duplicateIds.size > 0 && (
          <div className="mx-6 mt-4 flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t.duplicateWarning}</span>
          </div>
        )}

        {/* Mapping Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {resolvedEntries.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">{t.empty}</div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 pl-4 pr-2 w-14">{t.colImage}</th>
                    <th className="py-2.5 px-2">{t.colCurrent}</th>
                    <th className="py-2.5 px-2 w-64">{t.colWord}</th>
                    <th className="py-2.5 pl-2 pr-4">{t.colNewName}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolvedEntries.map((item, idx) => {
                    const hasDup = !!item.targetId && duplicateIds.has(item.targetId);
                    return (
                      <tr
                        key={item.sourceKey}
                        className={hasDup ? 'bg-amber-50/70' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-2 pl-4 pr-2">
                          <img
                            src={item.asset.objectUrl}
                            alt={item.asset.name}
                            className="w-10 h-10 rounded-md object-contain bg-slate-50 border border-slate-200 shrink-0"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-mono text-xs text-slate-700 truncate max-w-[180px]" title={item.asset.name}>
                            {item.asset.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {numericId(item.asset.id) ? `ID ${item.asset.id}` : t.unmappedStatus}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <select
                            aria-label={`Vocabulary word for ${item.asset.name}`}
                            value={item.targetRowUid}
                            onChange={(e) => {
                              const nextUid = e.target.value;
                              setEntries((prev) =>
                                prev.map((entry, i) =>
                                  i === idx ? { ...entry, targetRowUid: nextUid, customName: '' } : entry
                                )
                              );
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                          >
                            <option value="">{t.unmappedOption}</option>
                            {rows.map((r) => (
                              <option key={r.uid} value={r.uid}>
                                #{r.id} · {r.en || '(empty)'}
                                {r.vi ? ` — ${r.vi}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pl-2 pr-4">
                          <div className="flex items-center gap-2">
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                            <input
                              type="text"
                              value={item.newName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEntries((prev) =>
                                  prev.map((entry, i) =>
                                    i === idx ? { ...entry, customName: val } : entry
                                  )
                                );
                              }}
                              aria-label={`New filename for ${item.asset.name}`}
                              className={`flex-1 min-w-0 px-2.5 py-1.5 font-mono text-xs border rounded-md focus:outline-none ${
                                hasDup
                                  ? 'border-amber-400 bg-white text-amber-900 focus:border-amber-600'
                                  : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600'
                              }`}
                            />
                            <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums w-12 text-right">
                              {item.targetId ? `ID ${item.targetId}` : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {mappedCount} / {resolvedEntries.length} {t.mappedSummary}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={!resolvedEntries.length || downloading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.downloadZip}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!resolvedEntries.length || duplicateIds.size > 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{t.apply}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
