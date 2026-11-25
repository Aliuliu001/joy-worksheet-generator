import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FlipHorizontal2,
  Loader2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from 'lucide-react';
import { ImageAsset, Locale } from '../types/worksheet';

interface ImageEditorModalProps {
  asset: ImageAsset;
  wordLabel?: string;
  locale: Locale;
  onClose: () => void;
  onSave: (updated: ImageAsset) => void;
}

type AspectPreset = 'free' | '1:1' | '4:3';
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.08;

const LABELS = {
  en: {
    title: 'Edit Picture',
    rotateLeft: 'Rotate Left',
    rotateRight: 'Rotate Right',
    flipH: 'Flip Horizontal',
    reset: 'Reset',
    aspect: 'Crop Ratio',
    free: 'Free',
    square: '1:1 Square',
    card: '4:3 Card',
    cancel: 'Cancel',
    save: 'Save Changes',
    saving: 'Saving...',
    outputSize: 'Output',
    dragHint: 'Drag corners to crop or drag inside the frame to reposition.',
  },
  vi: {
    title: 'Chỉnh sửa ảnh',
    rotateLeft: 'Xoay trái 90°',
    rotateRight: 'Xoay phải 90°',
    flipH: 'Lật ngang',
    reset: 'Đặt lại',
    aspect: 'Tỷ lệ cắt',
    free: 'Tự do',
    square: 'Vuông 1:1',
    card: 'Thẻ 4:3',
    cancel: 'Hủy',
    save: 'Lưu thay đổi',
    saving: 'Đang lưu...',
    outputSize: 'Kích thước',
    dragHint: 'Kéo 4 góc để cắt ảnh hoặc kéo khung để di chuyển vùng chọn.',
  },
} as const;

function renderTransformedCanvas(
  img: HTMLImageElement,
  rotation: 0 | 90 | 180 | 270,
  flipH: boolean
): HTMLCanvasElement {
  const nw = img.naturalWidth || 320;
  const nh = img.naturalHeight || 320;
  const swap = rotation === 90 || rotation === 270;
  const outW = swap ? nh : nw;
  const outH = swap ? nw : nh;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  if (flipH) ctx.scale(-1, 1);
  ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
  return canvas;
}

function fitAspectCrop(aspect: AspectPreset, rotW: number, rotH: number): CropRect {
  if (aspect === 'free' || rotW <= 0 || rotH <= 0) return FULL_CROP;
  const targetRatio = aspect === '1:1' ? 1 : 4 / 3;
  const imgRatio = rotW / rotH;
  if (imgRatio > targetRatio) {
    const w = targetRatio / imgRatio;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = imgRatio / targetRatio;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

export function ImageEditorModal({
  asset,
  wordLabel,
  locale,
  onClose,
  onSave,
}: ImageEditorModalProps) {
  const t = LABELS[locale];
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [saving, setSaving] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
    rectW: number;
    rectH: number;
  } | null>(null);

  // Load source image once when modal opens
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSourceImg(img);
    };
    img.src = asset.objectUrl;
    return () => {
      cancelled = true;
    };
  }, [asset.objectUrl]);

  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const rotatedDims = useMemo(() => {
    if (!sourceImg) return { w: 320, h: 320 };
    const nw = sourceImg.naturalWidth || 320;
    const nh = sourceImg.naturalHeight || 320;
    const swap = rotation === 90 || rotation === 270;
    return { w: swap ? nh : nw, h: swap ? nw : nh };
  }, [sourceImg, rotation]);

  // Render rotated image onto preview canvas whenever source/rotation/flip changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceImg) return;
    const transformed = renderTransformedCanvas(sourceImg, rotation, flipH);
    canvas.width = transformed.width;
    canvas.height = transformed.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(transformed, 0, 0);
  }, [sourceImg, rotation, flipH]);

  const handleRotate = (delta: 90 | -90) => {
    const nextRot = (((rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    setRotation(nextRot);
    if (sourceImg) {
      const swap = nextRot === 90 || nextRot === 270;
      const rw = swap ? sourceImg.naturalHeight : sourceImg.naturalWidth;
      const rh = swap ? sourceImg.naturalWidth : sourceImg.naturalHeight;
      setCrop(fitAspectCrop(aspectPreset, rw, rh));
    } else {
      setCrop(FULL_CROP);
    }
  };

  const handleAspectChange = (preset: AspectPreset) => {
    setAspectPreset(preset);
    setCrop(fitAspectCrop(preset, rotatedDims.w, rotatedDims.h));
  };

  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setAspectPreset('free');
    setCrop(FULL_CROP);
  };

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      rectW: rect.width,
      rectH: rect.height,
    };
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || !drag.mode) return;
      const dx = (e.clientX - drag.startX) / Math.max(1, drag.rectW);
      const dy = (e.clientY - drag.startY) / Math.max(1, drag.rectH);
      const s = drag.startCrop;

      if (drag.mode === 'move') {
        const nx = Math.max(0, Math.min(1 - s.w, s.x + dx));
        const ny = Math.max(0, Math.min(1 - s.h, s.y + dy));
        setCrop({ x: nx, y: ny, w: s.w, h: s.h });
        return;
      }

      let left = s.x;
      let top = s.y;
      let right = s.x + s.w;
      let bottom = s.y + s.h;

      if (drag.mode === 'nw' || drag.mode === 'sw') {
        left = Math.max(0, Math.min(right - MIN_CROP, s.x + dx));
      }
      if (drag.mode === 'ne' || drag.mode === 'se') {
        right = Math.min(1, Math.max(left + MIN_CROP, s.x + s.w + dx));
      }
      if (drag.mode === 'nw' || drag.mode === 'ne') {
        top = Math.max(0, Math.min(bottom - MIN_CROP, s.y + dy));
      }
      if (drag.mode === 'sw' || drag.mode === 'se') {
        bottom = Math.min(1, Math.max(top + MIN_CROP, s.y + s.h + dy));
      }

      let w = right - left;
      let h = bottom - top;

      // Enforce locked aspect ratio in pixel space if preset is active
      if (aspectPreset !== 'free') {
        const targetPixelRatio = aspectPreset === '1:1' ? 1 : 4 / 3;
        const imgRatio = rotatedDims.w / Math.max(1, rotatedDims.h);
        // Normalized ratio: (w * rotW) / (h * rotH) = targetPixelRatio => w / h = targetPixelRatio / imgRatio
        const normRatio = targetPixelRatio / imgRatio;
        let desiredH = w / normRatio;
        let desiredW = w;

        // Clamp within bounds depending on anchored corner
        const maxH = drag.mode === 'nw' || drag.mode === 'ne' ? bottom : 1 - top;
        if (desiredH > maxH) {
          desiredH = maxH;
          desiredW = desiredH * normRatio;
        }
        const maxW = drag.mode === 'nw' || drag.mode === 'sw' ? right : 1 - left;
        if (desiredW > maxW) {
          desiredW = maxW;
          desiredH = desiredW / normRatio;
        }

        if (desiredW >= MIN_CROP && desiredH >= MIN_CROP) {
          w = desiredW;
          h = desiredH;
          if (drag.mode === 'nw' || drag.mode === 'sw') left = right - w;
          if (drag.mode === 'nw' || drag.mode === 'ne') top = bottom - h;
        }
      }

      setCrop({ x: left, y: top, w, h });
    },
    [aspectPreset, rotatedDims.w, rotatedDims.h]
  );

  const endDrag = () => {
    dragStateRef.current = null;
  };

  const outputPixels = useMemo(() => {
    const w = Math.max(1, Math.round(crop.w * rotatedDims.w));
    const h = Math.max(1, Math.round(crop.h * rotatedDims.h));
    return { w, h };
  }, [crop, rotatedDims]);

  const handleSave = async () => {
    if (!sourceImg || saving) return;
    setSaving(true);
    try {
      const transformed = renderTransformedCanvas(sourceImg, rotation, flipH);
      const sx = Math.round(crop.x * transformed.width);
      const sy = Math.round(crop.y * transformed.height);
      const sw = Math.max(1, Math.round(crop.w * transformed.width));
      const sh = Math.max(1, Math.round(crop.h * transformed.height));

      // Keep crisp resolution while clamping huge camera images to 1200px max edge for fast PDF export
      const maxEdge = 1200;
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * scale));
      const outH = Math.max(1, Math.round(sh * scale));

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(transformed, sx, sy, sw, sh, 0, 0, outW, outH);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode edited image'))),
          'image/png'
        );
      });
      const bytes = new Uint8Array(await pngBlob.arrayBuffer());
      const objectUrl = URL.createObjectURL(pngBlob);

      onSave({
        ...asset,
        mime: 'image/png',
        bytes,
        objectUrl,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="image-editor-title" className="text-base font-semibold text-slate-950 truncate">
              {t.title}
              {wordLabel ? ` — ${wordLabel}` : ''}
            </h2>
            <p className="text-xs font-mono text-slate-500 mt-0.5 tabular-nums">
              ID {asset.id} · {asset.name} · {t.outputSize}: {outputPixels.w} × {outputPixels.h} px
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Interactive Canvas Stage */}
        <div className="bg-slate-900 px-6 py-6 flex flex-col items-center justify-center min-h-[340px] flex-1 overflow-hidden select-none">
          <div
            ref={frameRef}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              aspectRatio: `${rotatedDims.w} / ${rotatedDims.h}`,
              maxWidth: '100%',
              maxHeight: '360px',
            }}
            className="relative h-full max-h-[360px] flex items-center justify-center shadow-lg touch-none"
          >
            <canvas
              ref={previewCanvasRef}
              className="w-full h-full block bg-white rounded-[2px]"
            />

            {/* Dark outer scrim + interactive crop box */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {/* Top scrim */}
              <div
                className="absolute left-0 right-0 top-0 bg-slate-950/55"
                style={{ height: `${crop.y * 100}%` }}
              />
              {/* Bottom scrim */}
              <div
                className="absolute left-0 right-0 bottom-0 bg-slate-950/55"
                style={{ height: `${(1 - crop.y - crop.h) * 100}%` }}
              />
              {/* Left scrim */}
              <div
                className="absolute left-0 bg-slate-950/55"
                style={{
                  top: `${crop.y * 100}%`,
                  height: `${crop.h * 100}%`,
                  width: `${crop.x * 100}%`,
                }}
              />
              {/* Right scrim */}
              <div
                className="absolute right-0 bg-slate-950/55"
                style={{
                  top: `${crop.y * 100}%`,
                  height: `${crop.h * 100}%`,
                  width: `${(1 - crop.x - crop.w) * 100}%`,
                }}
              />
            </div>

            {/* Draggable Crop Box */}
            <div
              onPointerDown={(e) => startDrag('move', e)}
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
              className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.5)] cursor-move"
            >
              {/* Rule-of-thirds guides */}
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/35 pointer-events-none" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/35 pointer-events-none" />
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/35 pointer-events-none" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/35 pointer-events-none" />

              {/* 4 Corner Handles */}
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                const posClass =
                  corner === 'nw'
                    ? '-top-2 -left-2 cursor-nwse-resize'
                    : corner === 'ne'
                    ? '-top-2 -right-2 cursor-nesw-resize'
                    : corner === 'sw'
                    ? '-bottom-2 -left-2 cursor-nesw-resize'
                    : '-bottom-2 -right-2 cursor-nwse-resize';
                return (
                  <div
                    key={corner}
                    onPointerDown={(e) => startDrag(corner, e)}
                    className={`absolute w-4 h-4 bg-white border-2 border-blue-700 rounded-sm shadow ${posClass}`}
                  />
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">{t.dragHint}</p>
        </div>

        {/* Transform & Aspect Controls */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Rotate & Flip buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleRotate(-90)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.rotateLeft}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRotate(90)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.rotateRight}</span>
            </button>
            <button
              type="button"
              onClick={() => setFlipH((f) => !f)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap ${
                flipH
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.flipH}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.reset}</span>
            </button>
          </div>

          {/* Aspect Ratio Segmented Selector */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(
              [
                { id: 'free', label: t.free },
                { id: '1:1', label: t.square },
                { id: '4:3', label: t.card },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleAspectChange(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  aspectPreset === opt.id
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!sourceImg || saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{t.saving}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>{t.save}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
