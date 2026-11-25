import { ImageAsset, VocabRow } from '../types/worksheet';
import { makeUid } from './worksheetSupport';

interface SampleItem {
  id: number;
  en: string;
  vi: string;
  svgBody: string;
}

const SAMPLE_ITEMS: SampleItem[] = [
  {
    id: 1,
    en: 'apple',
    vi: 'quả táo',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#FEF2F2"/>
      <path d="M160 95 C140 60, 88 70, 80 128 C72 188, 108 248, 146 248 C156 248, 160 242, 160 242 C160 242, 164 248, 174 248 C212 248, 248 188, 240 128 C232 70, 180 60, 160 95 Z" fill="#DC2626" stroke="#991B1B" stroke-width="6"/>
      <path d="M158 92 C156 64, 166 46, 178 40" fill="none" stroke="#78350F" stroke-width="10" stroke-linecap="round"/>
      <path d="M166 64 C188 42, 220 48, 224 72 C200 84, 178 82, 166 64 Z" fill="#16A34A" stroke="#166534" stroke-width="5"/>
      <path d="M114 126 C106 144, 108 164, 118 176" fill="none" stroke="#FCA5A5" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  {
    id: 2,
    en: 'cat',
    vi: 'con mèo',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#FFFBEB"/>
      <polygon points="88,128 76,58 134,94" fill="#F59E0B" stroke="#92400E" stroke-width="6" stroke-linejoin="round"/>
      <polygon points="232,128 244,58 186,94" fill="#F59E0B" stroke="#92400E" stroke-width="6" stroke-linejoin="round"/>
      <polygon points="94,116 88,76 122,98" fill="#FDE68A"/>
      <polygon points="226,116 232,76 198,98" fill="#FDE68A"/>
      <ellipse cx="160" cy="176" rx="84" ry="74" fill="#FBBF24" stroke="#92400E" stroke-width="6"/>
      <circle cx="126" cy="162" r="10" fill="#1E293B"/>
      <circle cx="194" cy="162" r="10" fill="#1E293B"/>
      <circle cx="129" cy="159" r="3" fill="#FFFFFF"/>
      <circle cx="197" cy="159" r="3" fill="#FFFFFF"/>
      <polygon points="150,184 170,184 160,196" fill="#EC4899"/>
      <path d="M160 196 C160 208, 146 212, 138 206 M160 196 C160 208, 174 212, 182 206" fill="none" stroke="#92400E" stroke-width="5" stroke-linecap="round"/>
      <path d="M62 178 L104 184 M60 196 L104 196 M258 178 L216 184 M260 196 L216 196" stroke="#92400E" stroke-width="4" stroke-linecap="round"/>
    `,
  },
  {
    id: 3,
    en: 'school bus',
    vi: 'xe buýt trường học',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#EFF6FF"/>
      <rect x="44" y="96" width="232" height="122" rx="18" fill="#FACC15" stroke="#854D0E" stroke-width="6"/>
      <rect x="64" y="114" width="46" height="44" rx="6" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
      <rect x="122" y="114" width="46" height="44" rx="6" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
      <rect x="180" y="114" width="46" height="44" rx="6" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
      <rect x="238" y="114" width="24" height="44" rx="4" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
      <line x1="44" y1="176" x2="276" y2="176" stroke="#1E293B" stroke-width="8"/>
      <circle cx="96" cy="222" r="24" fill="#1E293B" stroke="#0F172A" stroke-width="5"/>
      <circle cx="96" cy="222" r="10" fill="#CBD5E1"/>
      <circle cx="224" cy="222" r="24" fill="#1E293B" stroke="#0F172A" stroke-width="5"/>
      <circle cx="224" cy="222" r="10" fill="#CBD5E1"/>
      <circle cx="264" cy="196" r="7" fill="#EF4444"/>
    `,
  },
  {
    id: 4,
    en: 'sun',
    vi: 'mặt trời',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#FFF7ED"/>
      <g stroke="#F97316" stroke-width="10" stroke-linecap="round">
        <line x1="160" y1="36" x2="160" y2="70"/>
        <line x1="160" y1="250" x2="160" y2="284"/>
        <line x1="36" y1="160" x2="70" y2="160"/>
        <line x1="250" y1="160" x2="284" y2="160"/>
        <line x1="72" y1="72" x2="96" y2="96"/>
        <line x1="224" y1="224" x2="248" y2="248"/>
        <line x1="248" y1="72" x2="224" y2="96"/>
        <line x1="96" y1="224" x2="72" y2="248"/>
      </g>
      <circle cx="160" cy="160" r="64" fill="#FACC15" stroke="#EA580C" stroke-width="7"/>
      <circle cx="140" cy="150" r="6" fill="#7C2D12"/>
      <circle cx="180" cy="150" r="6" fill="#7C2D12"/>
      <path d="M138 176 Q160 194 182 176" fill="none" stroke="#7C2D12" stroke-width="5" stroke-linecap="round"/>
    `,
  },
  {
    id: 5,
    en: 'book',
    vi: 'quyển sách',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#EEF2FF"/>
      <path d="M58 92 C98 84, 134 92, 160 112 C186 92, 222 84, 262 92 L262 232 C222 224, 186 232, 160 250 C134 232, 98 224, 58 232 Z" fill="#FFFFFF" stroke="#1E3A8A" stroke-width="7" stroke-linejoin="round"/>
      <line x1="160" y1="112" x2="160" y2="250" stroke="#1E3A8A" stroke-width="6"/>
      <g stroke="#93C5FD" stroke-width="6" stroke-linecap="round">
        <line x1="82" y1="128" x2="136" y2="134"/>
        <line x1="82" y1="154" x2="136" y2="160"/>
        <line x1="82" y1="180" x2="136" y2="186"/>
        <line x1="184" y1="134" x2="238" y2="128"/>
        <line x1="184" y1="160" x2="238" y2="154"/>
        <line x1="184" y1="186" x2="238" y2="180"/>
      </g>
      <path d="M214 90 L214 146 L228 134 L242 146 L242 90 Z" fill="#EF4444"/>
    `,
  },
  {
    id: 6,
    en: 'bicycle',
    vi: 'xe đạp',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#ECFDF5"/>
      <circle cx="92" cy="206" r="46" fill="none" stroke="#1E293B" stroke-width="9"/>
      <circle cx="228" cy="206" r="46" fill="none" stroke="#1E293B" stroke-width="9"/>
      <circle cx="92" cy="206" r="8" fill="#1E293B"/>
      <circle cx="228" cy="206" r="8" fill="#1E293B"/>
      <polyline points="92,206 146,136 210,136 156,206 92,206" fill="none" stroke="#059669" stroke-width="9" stroke-linejoin="round"/>
      <line x1="228" y1="206" x2="202" y2="108" stroke="#059669" stroke-width="9" stroke-linecap="round"/>
      <line x1="184" y1="108" x2="224" y2="108" stroke="#1E293B" stroke-width="9" stroke-linecap="round"/>
      <line x1="126" y1="122" x2="162" y2="122" stroke="#1E293B" stroke-width="10" stroke-linecap="round"/>
      <line x1="146" y1="136" x2="144" y2="122" stroke="#1E293B" stroke-width="7"/>
    `,
  },
  {
    id: 7,
    en: 'ice cream',
    vi: 'kem',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#FDF2F8"/>
      <polygon points="116,166 204,166 160,278" fill="#F59E0B" stroke="#B45309" stroke-width="6" stroke-linejoin="round"/>
      <line x1="134" y1="196" x2="184" y2="196" stroke="#B45309" stroke-width="4"/>
      <line x1="144" y1="224" x2="176" y2="224" stroke="#B45309" stroke-width="4"/>
      <circle cx="132" cy="144" r="34" fill="#F472B6" stroke="#9D174D" stroke-width="5"/>
      <circle cx="188" cy="144" r="34" fill="#93C5FD" stroke="#1D4ED8" stroke-width="5"/>
      <circle cx="160" cy="108" r="38" fill="#FEF08A" stroke="#CA8A04" stroke-width="5"/>
      <circle cx="160" cy="64" r="14" fill="#DC2626" stroke="#991B1B" stroke-width="4"/>
    `,
  },
  {
    id: 8,
    en: 'umbrella',
    vi: 'cái ô',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#F0F9FF"/>
      <path d="M62 162 C62 94, 258 94, 258 162 C238 148, 214 148, 194 162 C174 148, 146 148, 126 162 C106 148, 82 148, 62 162 Z" fill="#2563EB" stroke="#1E3A8A" stroke-width="6" stroke-linejoin="round"/>
      <path d="M160 100 C134 114, 126 138, 126 160 M160 100 C186 114, 194 138, 194 160" fill="none" stroke="#93C5FD" stroke-width="5"/>
      <line x1="160" y1="84" x2="160" y2="236" stroke="#1E293B" stroke-width="8" stroke-linecap="round"/>
      <path d="M160 236 C160 264, 124 264, 124 240" fill="none" stroke="#B45309" stroke-width="9" stroke-linecap="round"/>
    `,
  },
  {
    id: 9,
    en: 'house',
    vi: 'ngôi nhà',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#F8FAFC"/>
      <rect x="82" y="144" width="156" height="114" rx="6" fill="#FEF3C7" stroke="#92400E" stroke-width="6"/>
      <polygon points="58,150 160,64 262,150" fill="#DC2626" stroke="#7F1D1D" stroke-width="6" stroke-linejoin="round"/>
      <rect x="138" y="192" width="44" height="66" rx="4" fill="#92400E" stroke="#451A03" stroke-width="5"/>
      <circle cx="172" cy="226" r="4" fill="#FDE047"/>
      <rect x="98" y="168" width="28" height="28" rx="3" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
      <rect x="194" y="168" width="28" height="28" rx="3" fill="#BAE6FD" stroke="#0369A1" stroke-width="4"/>
    `,
  },
  {
    id: 10,
    en: 'clock',
    vi: 'đồng hồ',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#F5F3FF"/>
      <circle cx="160" cy="160" r="96" fill="#FFFFFF" stroke="#4338CA" stroke-width="12"/>
      <g stroke="#64748B" stroke-width="6" stroke-linecap="round">
        <line x1="160" y1="84" x2="160" y2="96"/>
        <line x1="160" y1="224" x2="160" y2="236"/>
        <line x1="84" y1="160" x2="96" y2="160"/>
        <line x1="224" y1="160" x2="236" y2="160"/>
      </g>
      <line x1="160" y1="160" x2="160" y2="108" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/>
      <line x1="160" y1="160" x2="204" y2="178" stroke="#DC2626" stroke-width="6" stroke-linecap="round"/>
      <circle cx="160" cy="160" r="9" fill="#0F172A"/>
    `,
  },
  {
    id: 11,
    en: 'tree',
    vi: 'cái cây',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#F0FDF4"/>
      <rect x="140" y="176" width="40" height="86" rx="6" fill="#92400E" stroke="#451A03" stroke-width="6"/>
      <circle cx="160" cy="112" r="54" fill="#16A34A" stroke="#14532D" stroke-width="6"/>
      <circle cx="114" cy="150" r="46" fill="#22C55E" stroke="#14532D" stroke-width="6"/>
      <circle cx="206" cy="150" r="46" fill="#22C55E" stroke="#14532D" stroke-width="6"/>
      <circle cx="160" cy="144" r="44" fill="#22C55E"/>
      <circle cx="136" cy="120" r="8" fill="#DC2626"/>
      <circle cx="188" cy="148" r="8" fill="#DC2626"/>
      <circle cx="146" cy="162" r="8" fill="#DC2626"/>
    `,
  },
  {
    id: 12,
    en: 'pencil',
    vi: 'bút chì',
    svgBody: `
      <rect width="320" height="320" rx="28" fill="#FEFCE8"/>
      <g transform="rotate(-40 160 160)">
        <rect x="66" y="134" width="154" height="52" rx="4" fill="#FACC15" stroke="#854D0E" stroke-width="6"/>
        <line x1="66" y1="152" x2="220" y2="152" stroke="#CA8A04" stroke-width="4"/>
        <line x1="66" y1="168" x2="220" y2="168" stroke="#CA8A04" stroke-width="4"/>
        <rect x="42" y="134" width="26" height="52" rx="6" fill="#F472B6" stroke="#9D174D" stroke-width="6"/>
        <rect x="64" y="134" width="16" height="52" fill="#CBD5E1" stroke="#475569" stroke-width="5"/>
        <polygon points="220,134 276,160 220,186" fill="#FDE68A" stroke="#854D0E" stroke-width="6" stroke-linejoin="round"/>
        <polygon points="256,151 276,160 256,169" fill="#1E293B"/>
      </g>
    `,
  },
];

async function svgToPngBytes(svgMarkup: string): Promise<Uint8Array> {
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">${svgMarkup}</svg>`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to rasterize sample illustration'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(img, 0, 0, 320, 320);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createSampleDataset(): Promise<{
  rows: VocabRow[];
  images: Map<string, ImageAsset>;
}> {
  const rows: VocabRow[] = [];
  const images = new Map<string, ImageAsset>();

  await Promise.all(
    SAMPLE_ITEMS.map(async (item) => {
      const bytes = await svgToPngBytes(item.svgBody);
      const safeBytes = new Uint8Array(bytes);
      const objectUrl = URL.createObjectURL(new Blob([safeBytes], { type: 'image/png' }));
      images.set(String(item.id), {
        id: String(item.id),
        name: `${item.id}_${item.en.replace(/\s+/g, '_')}.png`,
        mime: 'image/png',
        bytes: safeBytes,
        objectUrl,
      });
    })
  );

  for (const item of SAMPLE_ITEMS) {
    rows.push({
      uid: makeUid(),
      id: item.id,
      en: item.en,
      vi: item.vi,
      imageId: String(item.id),
      source: 'sample',
    });
  }

  return { rows, images };
}
