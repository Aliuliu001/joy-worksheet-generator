import { useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FolderArchive, Printer, ShieldCheck } from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import { WORKSHEET_META, downloadExcelTemplate } from '../lib/worksheetSupport';
import { Locale } from '../types/worksheet';

interface PrintGuideViewProps {
  copy: Dictionary;
  locale: Locale;
  onNavigateToData: () => void;
}

const GUIDE_TEXT = {
  en: {
    s1Title: '01. Print Dialog Settings',
    s1Lead: 'Every PDF is generated to exact ISO A5 or A4 millimeter coordinates. Configure your printer dialog as follows:',
    s1Rows: [
      { label: 'Scale', value: 'Actual Size / 100% (disable Fit to Page or Shrink to Fit)' },
      { label: 'Paper Size', value: 'Match A5 (148 × 210 mm) or A4 (210 × 297 mm) to the sheet format' },
      { label: 'Orientation', value: 'Portrait for A5 / Mix A4; Landscape for Typing 2–3 & 2-Up Matching 3' },
      { label: 'Cut Guides', value: 'Dashed center lines mark exact half-sheet cut boundaries' },
    ],
    s2Title: '02. Local-Only Privacy',
    s2Lead: 'JoyEnglish runs 100% inside your browser session with zero external data transfer:',
    s2Items: [
      'Excel rosters (.xlsx / .csv) are parsed locally in browser memory.',
      'Picture ZIP archives and individual uploads are never sent to any server.',
      'Vector PDFs and multi-version ZIP bundles are compiled directly on your device.',
      'Safe for school rosters, proprietary illustrations, and offline classroom prep.',
    ],
    s3Title: '03. Worksheet Paper & Margin Specifications',
    s3Subtitle: 'Exact page dimensions, print margins, item density, and answer key availability for all nine formats.',
    colFormat: 'Format',
    colPaper: 'Paper Size',
    colMargins: 'Margins',
    colDensity: 'Capacity',
    colRequirement: 'Data Required',
    colKey: 'Answer Key',
    reqImage: 'English + Image',
    reqText: 'English + Viet',
    reqMix: 'Per selected section',
    keyIncluded: 'Separate PDF',
    keyNone: 'Not needed',
    s4Title: '04. Preparing Excel (.xlsx) & Picture Archives (.zip)',
    downloadBtn: 'Download Excel Template',
    openDataBtn: 'Open Vocabulary Manager',
    excelTitle: 'Excel Column Structure',
    excelNote:
      'Use four header columns on row 1. For Typing 2 and Typing 3 sheets, only English and Viet are required—no image archive needed.',
    zipTitle: 'ZIP Picture Naming Rules',
    zipNote:
      'Name each picture with the exact numeric ID from ID_Anh. Nested subfolders inside the ZIP are scanned automatically, and PNG, JPG, WEBP, GIF, and BMP are all supported.',
    s5Title: '05. Quick FAQ',
    faqs: [
      {
        q: 'How do I prepare data for Typing 2 and Typing 3?',
        a: 'Upload an Excel file containing English and Viet columns, or copy two columns from Google Sheets / Excel and paste them directly in the Vocabulary tab. You do not need an image ZIP for text-only typing worksheets.',
      },
      {
        q: 'When is a picture ZIP archive required?',
        a: 'Only visual worksheets (Flashcards, Word Scramble, Matching 1–3, and Typing 1) require matched picture IDs. You can upload a ZIP archive or attach individual images row by row in the Vocabulary table.',
      },
      {
        q: 'Why does JoyEnglish download a ZIP file instead of one PDF?',
        a: 'When you generate a single worksheet without an answer key and only 1 exam version, JoyEnglish downloads a single PDF directly. When multiple formats, answer keys, or multiple exam codes are selected, all PDFs are neatly bundled into JoyEnglish_Worksheets.zip.',
      },
    ],
  },
  vi: {
    s1Title: '01. Thiết lập hộp thoại in',
    s1Lead: 'Mọi file PDF đều được dựng chuẩn kích thước milimét ISO A5 hoặc A4. Khi in, vui lòng chọn đúng các thông số sau:',
    s1Rows: [
      { label: 'Tỷ lệ in (Scale)', value: 'Actual Size / 100% (tắt Fit to Page hoặc Shrink to Fit)' },
      { label: 'Khổ giấy', value: 'Chọn đúng A5 (148 × 210 mm) hoặc A4 (210 × 297 mm) theo từng dạng phiếu' },
      { label: 'Chiều giấy', value: 'Dọc cho A5 & Mix A4; Ngang cho Typing 2–3 và Matching 3 (2 bộ/tờ)' },
      { label: 'Đường cắt', value: 'Đường nét đứt ở giữa tờ đánh dấu chính xác vị trí cắt đôi' },
    ],
    s2Title: '02. Quyền riêng tư & Xử lý tại máy',
    s2Lead: 'JoyEnglish xử lý 100% ngay trên trình duyệt của bạn, không tải dữ liệu lên máy chủ:',
    s2Items: [
      'File Excel (.xlsx / .csv) được đọc trực tiếp trong bộ nhớ trình duyệt.',
      'Kho ảnh ZIP và ảnh đính kèm từng dòng không bao giờ rời khỏi máy tính.',
      'File PDF vector và gói ZIP nhiều mã đề được tạo cục bộ với độ nét chuẩn in ấn.',
      'An toàn tuyệt đối cho danh sách từ vựng và hình ảnh tài liệu nội bộ của lớp học.',
    ],
    s3Title: '03. Thông số khổ giấy & Căn lề các dạng phiếu',
    s3Subtitle: 'Bảng quy chuẩn kích thước giấy, lề in từng milimét, mật độ câu và tình trạng file đáp án.',
    colFormat: 'Dạng phiếu',
    colPaper: 'Khổ giấy',
    colMargins: 'Lề in',
    colDensity: 'Mật độ',
    colRequirement: 'Dữ liệu cần',
    colKey: 'Đáp án',
    reqImage: 'English + Ảnh',
    reqText: 'English + Việt',
    reqMix: 'Theo mục đã chọn',
    keyIncluded: 'Kèm PDF riêng',
    keyNone: 'Không cần',
    s4Title: '04. Chuẩn bị file Excel (.xlsx) & Kho ảnh (.zip)',
    downloadBtn: 'Tải file Excel mẫu',
    openDataBtn: 'Mở bảng từ vựng',
    excelTitle: 'Cấu trúc 4 cột chuẩn trong Excel',
    excelNote:
      'Dòng đầu tiên gồm 4 tiêu đề cột bên dưới. Nếu chỉ làm Typing 2 hoặc Typing 3, chỉ cần 2 cột English và Viet (không cần ZIP ảnh).',
    zipTitle: 'Quy tắc đặt tên ảnh trong file ZIP',
    zipNote:
      'Đặt tên file ảnh trùng đúng con số ở cột ID_Anh (không ghi đuôi file vào Excel). Hệ thống tự quét cả thư mục con bên trong ZIP và hỗ trợ PNG, JPG, WEBP, GIF, BMP.',
    s5Title: '05. Câu hỏi thường gặp',
    faqs: [
      {
        q: 'Nhập dữ liệu cho Typing 2 và Typing 3 như thế nào?',
        a: 'Bạn có thể tải file Excel chỉ gồm 2 cột English và Viet, hoặc sao chép trực tiếp hai cột từ Excel / Google Sheets rồi dán vào khung Dán nhanh ở mục Bảng từ vựng. Các dạng này không cần file ZIP ảnh.',
      },
      {
        q: 'Khi nào cần file ZIP chứa ảnh?',
        a: 'Chỉ các phiếu có hình minh họa (Thẻ hình, Xáo chữ, Matching 1–3, Typing 1) mới cần ảnh khớp theo ID_Anh. Bạn có thể tải cả file ZIP hoặc gắn từng ảnh trực tiếp trong bảng từ.',
      },
      {
        q: 'Vì sao hệ thống tải file ZIP thay vì một file PDF lẻ?',
        a: 'Nếu bạn chỉ xuất đúng 1 phiếu (1 dạng, 1 mã đề, không kèm đáp án), hệ thống tải trực tiếp 1 file PDF. Khi chọn nhiều dạng, nhiều mã đề hoặc có kèm đáp án, tất cả PDF được đóng gói gọn trong file JoyEnglish_Worksheets.zip.',
      },
    ],
  },
} as const;

export function PrintGuideView({ copy, locale, onNavigateToData }: PrintGuideViewProps) {
  const [openFaq, setOpenFaq] = useState<number>(0);
  const t = GUIDE_TEXT[locale];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-8">
      <header className="pb-6 border-b border-slate-200">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
          {copy.guide.title}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">{copy.guide.subtitle}</p>
      </header>

      {/* Top 2-column balanced checklist cards */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Printer className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">{t.s1Title}</h2>
          </div>
          <p className="mt-4 text-sm text-slate-600 leading-relaxed">{t.s1Lead}</p>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            {t.s1Rows.map((row) => (
              <div key={row.label} className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3">
                <dt className="sm:col-span-4 font-semibold text-slate-900">{row.label}</dt>
                <dd className="sm:col-span-8 text-slate-600 leading-relaxed">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">{t.s2Title}</h2>
          </div>
          <p className="mt-4 text-sm text-slate-600 leading-relaxed">{t.s2Lead}</p>
          <ul className="mt-4 divide-y divide-slate-100 text-sm text-slate-600">
            {t.s2Items.map((item, idx) => (
              <li key={idx} className="py-2.5 flex items-baseline gap-3 leading-relaxed">
                <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums shrink-0">
                  0{idx + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Paper & Margin Specifications Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-950">{t.s3Title}</h2>
          <p className="mt-1 text-xs text-slate-500">{t.s3Subtitle}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pl-6 pr-3 whitespace-nowrap">{t.colFormat}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t.colPaper}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t.colMargins}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t.colDensity}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t.colRequirement}</th>
                <th className="py-3 pl-3 pr-6 whitespace-nowrap">{t.colKey}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {WORKSHEET_META.map((meta) => {
                const reqText =
                  meta.category === 'image'
                    ? t.reqImage
                    : meta.category === 'text'
                    ? t.reqText
                    : t.reqMix;
                return (
                  <tr key={meta.type} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 pl-6 pr-3 font-semibold text-slate-900 whitespace-nowrap">
                      {copy.worksheets[meta.type].name}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap tabular-nums">
                      {meta.paperSpec}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {meta.marginSpec}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                      {meta.densityNote}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                      {reqText}
                    </td>
                    <td className="py-3 pl-3 pr-6 text-xs text-slate-600 whitespace-nowrap">
                      {meta.hasAnswerKey ? t.keyIncluded : t.keyNone}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Excel & ZIP Visual Structure */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-950">{t.s4Title}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.downloadBtn}</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToData}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              {t.openDataBtn} →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Excel mini-table example */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <h3>{t.excelTitle}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{t.excelNote}</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3">STT</th>
                    <th className="py-2 px-3">English</th>
                    <th className="py-2 px-3">Viet</th>
                    <th className="py-2 px-3">ID_Anh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  <tr>
                    <td className="py-2 px-3 tabular-nums">1</td>
                    <td className="py-2 px-3">apple</td>
                    <td className="py-2 px-3 font-sans">quả táo</td>
                    <td className="py-2 px-3 tabular-nums">1</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 tabular-nums">2</td>
                    <td className="py-2 px-3">school bus</td>
                    <td className="py-2 px-3 font-sans">xe buýt trường học</td>
                    <td className="py-2 px-3 tabular-nums">2</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 tabular-nums">3</td>
                    <td className="py-2 px-3">ice cream</td>
                    <td className="py-2 px-3 font-sans">kem</td>
                    <td className="py-2 px-3 tabular-nums">3</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ZIP example structure */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FolderArchive className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
              <h3>{t.zipTitle}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{t.zipNote}</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-slate-900">Lesson_Images.zip</div>
              <div className="pl-4 flex items-center justify-between gap-4">
                <span>├── 1.png</span>
                <span className="text-slate-500 font-sans">→ ID_Anh = 1 (apple)</span>
              </div>
              <div className="pl-4 flex items-center justify-between gap-4">
                <span>├── 2.jpg</span>
                <span className="text-slate-500 font-sans">→ ID_Anh = 2 (school bus)</span>
              </div>
              <div className="pl-4 flex items-center justify-between gap-4">
                <span>└── unit1/3.webp</span>
                <span className="text-slate-500 font-sans">→ ID_Anh = 3 (ice cream)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-950">{t.s5Title}</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {t.faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/70 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-900">{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed max-w-3xl">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
