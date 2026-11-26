import { Locale, WorksheetType } from '../types/worksheet';

export interface Dictionary {
  nav: {
    data: string;
    builder: string;
    preview: string;
    guide: string;
    exportPdf: string;
    exportZip: string;
    exporting: string;
  };
  worksheets: Record<
    WorksheetType,
    {
      name: string;
      shortName: string;
      description: string;
      paper: string;
    }
  >;
  data: {
    title: string;
    subtitle: string;
    excelDropTitle: string;
    excelDropHint: string;
    zipDropTitle: string;
    zipDropHint: string;
    downloadTemplate: string;
    loadSample: string;
    pasteTitle: string;
    pastePlaceholder: string;
    parsePaste: string;
    confirmPaste: string;
    pasteDirEnVi: string;
    pasteDirViEn: string;
    tableTitle: string;
    addRow: string;
    clearAll: string;
    searchPlaceholder: string;
    colNo: string;
    colEnglish: string;
    colVietnamese: string;
    colImageId: string;
    colPreview: string;
    colAction: string;
    missingImage: string;
    noImageId: string;
    uploadImg: string;
    emptyTitle: string;
    emptyBody: string;
    rowsReady: string;
    imagesMatched: string;
    textPairsReady: string;
    privacyNote: string;
  };
  builder: {
    title: string;
    subtitle: string;
    sectionFormats: string;
    sectionExam: string;
    sectionMix: string;
    sectionTyping: string;
    examCodes: string;
    examCodeSingle: string;
    examCodePlural: string;
    includeAnswerKeys: string;
    headerLabel: string;
    matching3Count: string;
    matching3TwoUp: string;
    matching3TwoUpHint: string;
    typingLimitLabel: string;
    typingLimitPlaceholder: string;
    typingLimitHint: string;
    typingDirectionLabel: string;
    viToEn: string;
    enToVi: string;
    typingImageGridlines: string;
    typingImageGridlinesHint: string;
    typingImageGridSizeLabel: string;
    typingImageGridSize2: string;
    typingImageGridSize25: string;
    typingImageGridBlocksLabel: string;
    typingImageGridBlocks4: string;
    typingImageGridBlocks5: string;
    typingImageShowSample: string;
    typingImageShowSampleHint: string;
    guidelineOverlay: string;
    guidelineOverlayHint: string;
    wordScrambleShowHint: string;
    wordScrambleShowHintHint: string;
    fontStyleLabel: string;
    fontTabBuiltIn: string;
    fontTabCustom: string;
    customFontUploadTitle: string;
    customFontUploadHint: string;
    customFontEmpty: string;
    customFontDelete: string;
    customFontAlignmentTitle: string;
    customFontScaleLabel: string;
    customFontBaselineLabel: string;
    customFontLetterSpacingLabel: string;
    customFontReset: string;
    customFontInspectorTitle: string;
    customFontInspectorHint: string;
    customFontInspectorNeedsCheck: string;
    customFontInspectorAllClear: string;
    customFontInspectorWordLabel: string;
    customFontInspectorWordPlaceholder: string;
    customFontStatusOverlap: string;
    customFontStatusTight: string;
    customFontAutoFixBtn: string;
    customFontAutoFixRunning: string;
    customFontAutoFixUndo: string;
    customFontAutoFixOverlap: string;
    customFontAutoFixTight: string;
    customFontAutoFixWide: string;
    customFontAutoFixBalanced: string;
    customFontLigatureTitle: string;
    customFontLigatureHint: string;
    customFontLigaturePairPlaceholder: string;
    customFontLigatureAddPair: string;
    customFontLigaturePresetsLabel: string;
    customFontLigatureJoinOverlap: string;
    customFontLigatureClearAll: string;
    customFontLigatureEmpty: string;
    customFontLigatureActiveCount: string;
    customFontLigatureRemoveRule: string;
    fontSizeLabel: string;
    fontSizeSmall: string;
    fontSizeNormal: string;
    difficultyLabel: string;
    difficultyBeginner: string;
    difficultyIntermediate: string;
    difficultyAdvanced: string;
    difficultySummary: Record<'beginner' | 'intermediate' | 'advanced', string>;
    mixOptimize: string;
    mixOptimizeHint: string;
    mixUnusedInfo: string;
    livePreviewTitle: string;
    studentSheet: string;
    answerKey: string;
    shuffleOrder: string;
    openFullPreview: string;
    noSelectionTitle: string;
    noSelectionBody: string;
  };
  preview: {
    title: string;
    subtitle: string;
    worksheetFilter: string;
    allSelected: string;
    examCode: string;
    copyType: string;
    zoom: string;
    fitWidth: string;
    shuffle: string;
    downloadCurrent: string;
    exportBundle: string;
    printWarning: string;
    pageCount: string;
    renderError: string;
  };
  guide: {
    title: string;
    subtitle: string;
  };
}

export const COPY: Record<Locale, Dictionary> = {
  en: {
    nav: {
      data: 'Vocabulary',
      builder: 'Worksheet Studio',
      preview: 'Print Proofing',
      guide: 'Print Guide',
      exportPdf: 'Export PDF',
      exportZip: 'Export ZIP',
      exporting: 'Generating...',
    },
    worksheets: {
      flashcards: {
        name: 'Flashcards (Cut & Paste)',
        shortName: 'Flashcards',
        description: '42 mini picture cards per A5 sheet (6 × 7 grid) sized for notebook cut-and-paste.',
        paper: 'A5 Portrait · 3 mm margin',
      },
      anagram: {
        name: 'Picture Anagram (A5)',
        shortName: 'Anagram',
        description: 'Picture clue with scrambled letters and a ruled writing line for spelling practice.',
        paper: 'A5 Portrait · 3 mm margin',
      },
      'word-scramble': {
        name: 'Word Scramble (Letter Tiles)',
        shortName: 'Word Scramble',
        description: 'Scrambled letter tiles with exact-length answer slots and optional Vietnamese hints (no images required).',
        paper: 'A4 Portrait · 14 items/page',
      },
      matching: {
        name: 'Matching 1: Look and Match',
        shortName: 'Matching 1',
        description: 'Classic 6-item picture-to-word line matching sets with anchor dots.',
        paper: 'A5 Portrait · 10 mm left',
      },
      'matching-2': {
        name: 'Matching 2: Picture Letter Match',
        shortName: 'Matching 2',
        description: 'Dashed picture cards labeled A–J above a 3-column proportional prompt list.',
        paper: 'A5 Portrait · 7 mm left',
      },
      'matching-3': {
        name: 'Matching 3: Flexible Match (2–12)',
        shortName: 'Matching 3',
        description: 'Customizable 2–12 item sets with optional 2-up A4 landscape split printing.',
        paper: 'A5 Portrait or 2-Up A4',
      },
      'typing-image': {
        name: 'Typing 1: Picture to Word',
        shortName: 'Typing 1',
        description: '28 numbered image prompts per A5 page (2 columns × 14 rows) with aligned writing lines.',
        paper: 'A5 Portrait · 10 mm left',
      },
      'typing-2': {
        name: 'Typing 2: Vietnamese to English',
        shortName: 'Typing 2 (VI → EN)',
        description: 'Dual side-by-side vocabulary check tables with full Vietnamese diacritics.',
        paper: 'A4 Landscape · 40 rows/page',
      },
      'typing-3': {
        name: 'Typing 3: English to Vietnamese',
        shortName: 'Typing 3 (EN → VI)',
        description: 'Dual side-by-side English prompt tables for Vietnamese recall checks.',
        paper: 'A4 Landscape · 40 rows/page',
      },
      mix: {
        name: 'Mix Sheet (Multi-Format A4)',
        shortName: 'Mix A4',
        description: 'Combines multiple activities onto unified A4 portrait pages with zero word repeats.',
        paper: 'A4 Portrait · Auto-pack',
      },
    },
    data: {
      title: 'Vocabulary & Picture Library',
      subtitle: 'Import an Excel roster and image ZIP, paste directly from a spreadsheet, or edit rows inline.',
      excelDropTitle: 'Excel Roster (.xlsx / .csv)',
      excelDropHint: 'Columns: STT, English, Viet, ID_Anh',
      zipDropTitle: 'Picture Archive (.zip)',
      zipDropHint: 'Filenames match ID_Anh (e.g. 1.png, 2.jpg)',
      downloadTemplate: 'Download Excel Template',
      loadSample: 'Load 12-Word Sample Lesson',
      pasteTitle: 'Quick Paste from Spreadsheet',
      pastePlaceholder: 'Paste two tab-separated columns (e.g. from Excel or Google Sheets):\napple\tquả táo\nbicycle\txe đạp',
      parsePaste: 'Preview Pasted Rows',
      confirmPaste: 'Append to Table',
      pasteDirEnVi: 'Column 1 = English, Column 2 = Vietnamese',
      pasteDirViEn: 'Column 1 = Vietnamese, Column 2 = English',
      tableTitle: 'Active Word List',
      addRow: 'Add Word',
      clearAll: 'Clear Table',
      searchPlaceholder: 'Filter by English, Vietnamese, or ID...',
      colNo: '#',
      colEnglish: 'English',
      colVietnamese: 'Vietnamese',
      colImageId: 'Image ID',
      colPreview: 'Picture',
      colAction: 'Action',
      missingImage: 'Missing',
      noImageId: 'Text only',
      uploadImg: 'Attach image',
      emptyTitle: 'No vocabulary words loaded yet',
      emptyBody: 'Upload an Excel file, paste two columns from a sheet, or load the illustrated 12-word sample lesson to start designing worksheets.',
      rowsReady: 'total words',
      imagesMatched: 'with matched pictures',
      textPairsReady: 'bilingual pairs',
      privacyNote: 'All spreadsheets and student images stay locally in your browser and are never uploaded to a server.',
    },
    builder: {
      title: 'Worksheet Studio',
      subtitle: 'Select one or more printable layouts, configure exam versions, and proof the exact PDF sheet live.',
      sectionFormats: 'Worksheet Formats',
      sectionExam: 'Exam Codes & Header',
      sectionMix: 'Mix A4 Composition',
      sectionTyping: 'Typing Sheet Options',
      examCodes: 'Exam Versions',
      examCodeSingle: '1 version',
      examCodePlural: 'versions',
      includeAnswerKeys: 'Include matching Answer Key PDFs',
      headerLabel: 'Student Header Line',
      matching3Count: 'Questions per Matching 3 set (2–12)',
      matching3TwoUp: '2-Up A4 Landscape (2 sheets per page)',
      matching3TwoUpHint: 'Prints two identical picture sets side-by-side with independently shuffled answer orders. Cut down the center.',
      typingLimitLabel: 'Word Limit for Typing 2 / 3',
      typingLimitPlaceholder: 'All words (auto-paginate)',
      typingLimitHint: 'Leave blank to include every bilingual row (up to 40 rows per landscape page).',
      typingDirectionLabel: 'Prompt Direction Override',
      viToEn: 'Vietnamese prompt → write English',
      enToVi: 'English prompt → write Vietnamese',
      typingImageGridlines: 'Primary handwriting gridlines (ô ly)',
      typingImageGridlinesHint: 'Spacious single-column A5 layout with square penmanship cells sized to fit lowercase letters like o, a, h.',
      typingImageGridSizeLabel: 'Grid Box Size',
      typingImageGridSize2: '2 × 2 mm (Standard)',
      typingImageGridSize25: '2.5 × 2.5 mm (Large)',
      typingImageGridBlocksLabel: 'Grid Blocks (ô ly)',
      typingImageGridBlocks4: '4 ô ly (4 × 4)',
      typingImageGridBlocks5: '5 ô ly (5 × 5)',
      typingImageShowSample: 'Show sample word after picture',
      typingImageShowSampleHint: 'Prints a model word right after each picture (plus a light tracing guide when space permits) for typography training.',
      guidelineOverlay: 'Add Guideline Overlay (4 ô ly / 5 ô ly)',
      guidelineOverlayHint: 'Draws traditional 4-line or 5-line Vietnamese handwriting auxiliary lines behind text and writing areas.',
      wordScrambleShowHint: 'Show Vietnamese meaning hints',
      wordScrambleShowHintHint: 'Displays the Vietnamese translation under each row of scrambled letter tiles when available.',
      fontStyleLabel: 'Worksheet Typography',
      fontTabBuiltIn: 'Built-in Fonts',
      fontTabCustom: 'Custom Fonts',
      customFontUploadTitle: 'Upload .ttf or .otf font file',
      customFontUploadHint: 'Click to browse or drop TrueType / OpenType files. Stored locally in your browser.',
      customFontEmpty: 'No custom fonts uploaded yet. Upload a .ttf or .otf file to use it across every worksheet and ô ly grid.',
      customFontDelete: 'Remove font',
      customFontAlignmentTitle: 'Ô Ly Grid Alignment',
      customFontScaleLabel: 'Scale',
      customFontBaselineLabel: 'Baseline Offset',
      customFontLetterSpacingLabel: 'Letter Spacing (Kerning)',
      customFontReset: 'Reset',
      customFontInspectorTitle: 'Character Inspector',
      customFontInspectorHint: 'Click any pair to inspect its full word live on ô ly lines.',
      customFontInspectorNeedsCheck: 'tight',
      customFontInspectorAllClear: 'All pairs clear',
      customFontInspectorWordLabel: 'Test word',
      customFontInspectorWordPlaceholder: 'Type a word to inspect...',
      customFontStatusOverlap: 'Overlap',
      customFontStatusTight: 'Tight',
      customFontAutoFixBtn: 'Run Calibration Auto-Fix',
      customFontAutoFixRunning: 'Analyzing...',
      customFontAutoFixUndo: 'Undo',
      customFontAutoFixOverlap: 'Analyzed "ca" overlap and set Letter Spacing to {value}.',
      customFontAutoFixTight: 'Analyzed tight "ca" pair and set Letter Spacing to {value}.',
      customFontAutoFixWide: 'Analyzed wide "ca" spacing and tightened Letter Spacing to {value}.',
      customFontAutoFixBalanced: 'Analyzed "ca" pair: native spacing is already balanced ({value}).',
      customFontLigatureTitle: 'Advanced Ligature',
      customFontLigatureHint: 'Define per-pair Join Overlap (%) to pull strokes closer (+%) or widen crowded pairs (-%).',
      customFontLigaturePairPlaceholder: 'Pair (e.g. br, st)',
      customFontLigatureAddPair: 'Add Pair',
      customFontLigaturePresetsLabel: 'Quick pairs',
      customFontLigatureJoinOverlap: 'Join Overlap',
      customFontLigatureClearAll: 'Clear all',
      customFontLigatureEmpty: 'No custom pair overlaps yet. Pick a quick pair above or enter any 2 letters.',
      customFontLigatureActiveCount: 'active',
      customFontLigatureRemoveRule: 'Remove pair rule',
      fontSizeLabel: 'Font Size',
      fontSizeSmall: 'Small (1 ô ly)',
      fontSizeNormal: 'Normal (2 ô ly · 2×)',
      difficultyLabel: 'Difficulty Level',
      difficultyBeginner: 'Beginner',
      difficultyIntermediate: 'Intermediate',
      difficultyAdvanced: 'Advanced',
      difficultySummary: {
        beginner: 'Larger dashed tracing font (+16%), wider line spacing, 4-line grids, and first-letter & meaning cues.',
        intermediate: 'Primary penmanship font, balanced classroom spacing, and letter-count answer slots.',
        advanced: 'Standard clean font, compact exam density, and unassisted blank writing lines.',
      },
      mixOptimize: 'Auto-fill unused paper space',
      mixOptimizeHint: 'Automatically adds remaining unused words into selected sections when room remains on the current A4 page.',
      mixUnusedInfo: 'words remaining unused',
      livePreviewTitle: 'Live Print Proof',
      studentSheet: 'Student Sheet',
      answerKey: 'Answer Key',
      shuffleOrder: 'Shuffle Order',
      openFullPreview: 'Full Proofing View',
      noSelectionTitle: 'Select a worksheet format',
      noSelectionBody: 'Choose at least one format on the left to preview its exact millimeter print layout.',
    },
    preview: {
      title: 'Print Proofing Desk',
      subtitle: 'Inspect every generated page at print scale. PDF exports use this exact sequence and layout.',
      worksheetFilter: 'Worksheet',
      allSelected: 'All Selected Formats',
      examCode: 'Exam Code',
      copyType: 'Copy',
      zoom: 'Zoom',
      fitWidth: 'Fit to Width',
      shuffle: 'Shuffle Version Order',
      downloadCurrent: 'Download Visible PDF',
      exportBundle: 'Export All Selected',
      printWarning: 'Print setting: always choose Actual Size / 100% (disable Fit to Page) to preserve cut margins.',
      pageCount: 'pages rendered',
      renderError: 'Unable to render preview for this configuration.',
    },
    guide: {
      title: 'Print & Preparation Guide',
      subtitle: 'Exact paper geometry, millimeter margins, and file specifications for crisp classroom handouts.',
    },
  },
  vi: {
    nav: {
      data: 'Bảng từ vựng',
      builder: 'Thiết kế phiếu',
      preview: 'Xem bản in',
      guide: 'Hướng dẫn in',
      exportPdf: 'Xuất PDF',
      exportZip: 'Xuất gói ZIP',
      exporting: 'Đang tạo...',
    },
    worksheets: {
      flashcards: {
        name: 'Thẻ hình (Flashcards A5)',
        shortName: 'Thẻ hình',
        description: '42 thẻ cắt dán mỗi tờ A5 dọc (6 cột × 7 hàng), chữ mẫu tiểu học rõ nét.',
        paper: 'A5 dọc · Lề 3 mm',
      },
      anagram: {
        name: 'Xáo chữ có hình (Anagram)',
        shortName: 'Anagram',
        description: 'Hình minh họa kèm chữ cái bị xáo trộn và dòng kẻ viết từ hoàn chỉnh.',
        paper: 'A5 dọc · Lề 3 mm',
      },
      'word-scramble': {
        name: 'Xáo chữ ô chữ cái (Word Scramble)',
        shortName: 'Word Scramble',
        description: 'Các ô chữ cái bị xáo trộn kèm ô điền đáp án đúng số ký tự và gợi ý tiếng Việt (không cần ảnh).',
        paper: 'A4 dọc · 14 câu/trang',
      },
      matching: {
        name: 'Matching 1: Look and Match',
        shortName: 'Matching 1',
        description: 'Phiếu nối hình với từ chuẩn 6 câu mỗi bộ kèm chấm nối hai bên.',
        paper: 'A5 dọc · Lề trái 10 mm',
      },
      'matching-2': {
        name: 'Matching 2: Picture Letter Match',
        shortName: 'Matching 2',
        description: 'Thẻ hình bo tròn nét đứt A–J phía trên 3 cột từ tỷ lệ 30% / 33% / 37%.',
        paper: 'A5 dọc · Lề trái 7 mm',
      },
      'matching-3': {
        name: 'Matching 3: Nối linh hoạt (2–12 câu)',
        shortName: 'Matching 3',
        description: 'Tùy chọn 2–12 câu mỗi bộ; hỗ trợ in 2 bộ trên 1 tờ A4 ngang cắt đôi.',
        paper: 'A5 dọc hoặc 2 bộ / A4 ngang',
      },
      'typing-image': {
        name: 'Typing 1: Nhìn hình viết chữ',
        shortName: 'Typing 1',
        description: '28 câu mỗi tờ A5 (2 cột × 14 hàng), dòng viết căn cân đối với hình.',
        paper: 'A5 dọc · Lề trái 10 mm',
      },
      'typing-2': {
        name: 'Typing 2: Tiếng Việt → Tiếng Anh',
        shortName: 'Typing 2 (VI → EN)',
        description: 'Hai bảng dò từ song song trên A4 ngang, hiển thị chuẩn dấu tiếng Việt.',
        paper: 'A4 ngang · Tối đa 40 từ/trang',
      },
      'typing-3': {
        name: 'Typing 3: Tiếng Anh → Tiếng Việt',
        shortName: 'Typing 3 (EN → VI)',
        description: 'Hai bảng dò từ song song cho tiếng Anh, học sinh viết nghĩa tiếng Việt.',
        paper: 'A4 ngang · Tối đa 40 từ/trang',
      },
      mix: {
        name: 'Phiếu Mix (Nhiều dạng trên A4 dọc)',
        shortName: 'Mix A4',
        description: 'Ghép nhiều dạng bài trên cùng tờ A4 dọc, không trùng từ và tự tối ưu giấy.',
        paper: 'A4 dọc · Tự dồn trang',
      },
    },
    data: {
      title: 'Dữ liệu từ vựng & Thư viện ảnh',
      subtitle: 'Tải file Excel và ZIP ảnh, dán trực tiếp hai cột từ vựng, hoặc chỉnh sửa ngay trong bảng.',
      excelDropTitle: 'File Excel (.xlsx / .csv)',
      excelDropHint: 'Cột chuẩn: STT, English, Viet, ID_Anh',
      zipDropTitle: 'File ZIP chứa ảnh (.zip)',
      zipDropHint: 'Tên ảnh trùng số ID_Anh (vd: 1.png, 2.jpg)',
      downloadTemplate: 'Tải Excel mẫu',
      loadSample: 'Nạp bộ mẫu 12 từ có hình',
      pasteTitle: 'Dán nhanh từ Excel / Google Sheets',
      pastePlaceholder: 'Dán 2 cột ngăn cách bằng phím Tab:\napple\tquả táo\nbicycle\txe đạp',
      parsePaste: 'Xem trước dữ liệu dán',
      confirmPaste: 'Thêm vào bảng từ',
      pasteDirEnVi: 'Cột 1 = English, Cột 2 = Tiếng Việt',
      pasteDirViEn: 'Cột 1 = Tiếng Việt, Cột 2 = English',
      tableTitle: 'Danh sách từ đang sử dụng',
      addRow: 'Thêm dòng',
      clearAll: 'Xóa bảng',
      searchPlaceholder: 'Tìm theo English, tiếng Việt hoặc ID ảnh...',
      colNo: 'STT',
      colEnglish: 'English',
      colVietnamese: 'Tiếng Việt',
      colImageId: 'ID Ảnh',
      colPreview: 'Ảnh',
      colAction: 'Thao tác',
      missingImage: 'Thiếu ảnh',
      noImageId: 'Chỉ chữ',
      uploadImg: 'Chọn ảnh',
      emptyTitle: 'Chưa có từ vựng nào',
      emptyBody: 'Tải file Excel, dán hai cột từ vựng, hoặc bấm nạp bộ mẫu 12 từ có sẵn hình minh họa để trải nghiệm ngay.',
      rowsReady: 'từ trong bảng',
      imagesMatched: 'từ có đủ ảnh',
      textPairsReady: 'cặp Anh–Việt',
      privacyNote: 'Toàn bộ file Excel và ảnh được xử lý trực tiếp trên trình duyệt, không gửi lên máy chủ.',
    },
    builder: {
      title: 'Thiết kế phiếu bài tập',
      subtitle: 'Chọn một hoặc nhiều dạng phiếu, thiết lập mã đề và kiểm tra trực tiếp bố cục bản in.',
      sectionFormats: 'Chọn dạng phiếu',
      sectionExam: 'Mã đề & Tiêu đề phiếu',
      sectionMix: 'Cấu hình phiếu Mix (A4 dọc)',
      sectionTyping: 'Tùy chọn phiếu Typing',
      examCodes: 'Số mã đề',
      examCodeSingle: '1 mã đề',
      examCodePlural: 'mã đề',
      includeAnswerKeys: 'Xuất kèm file PDF đáp án',
      headerLabel: 'Dòng tiêu đề học sinh',
      matching3Count: 'Số câu Matching 3 mỗi bộ (2–12)',
      matching3TwoUp: 'In 2 bộ trên 1 tờ A4 ngang',
      matching3TwoUpHint: 'Hai bộ cùng hình đặt cạnh nhau, mỗi bên xáo đáp án riêng để cắt đôi.',
      typingLimitLabel: 'Giới hạn số từ Typing 2 / 3',
      typingLimitPlaceholder: 'Toàn bộ từ (tự sang trang)',
      typingLimitHint: 'Để trống để lấy tất cả dòng có đủ Anh–Việt (tối đa 40 từ/trang A4 ngang).',
      typingDirectionLabel: 'Chiều gợi ý Typing',
      viToEn: 'Gợi ý tiếng Việt → viết English',
      enToVi: 'Gợi ý English → viết tiếng Việt',
      typingImageGridlines: 'Dòng kẻ ô ly luyện viết (tiểu học)',
      typingImageGridlinesHint: 'Bố cục 1 cột rộng rãi với ô ly vuông chuẩn vừa thân chữ o, a, h giúp học sinh nhỏ rèn nét chữ.',
      typingImageGridSizeLabel: 'Cỡ ô ly',
      typingImageGridSize2: '2 × 2 mm (Chuẩn)',
      typingImageGridSize25: '2.5 × 2.5 mm (Cỡ lớn)',
      typingImageGridBlocksLabel: 'Số ô ly mỗi ô vuông',
      typingImageGridBlocks4: '4 ô ly (4 × 4)',
      typingImageGridBlocks5: '5 ô ly (5 × 5)',
      typingImageShowSample: 'Hiện từ mẫu ngay sau hình ảnh',
      typingImageShowSampleHint: 'In từ mẫu theo phông chữ đã chọn ngay sau mỗi hình (kèm chữ mờ tập tô nếu đủ chỗ) để bé tập chép.',
      guidelineOverlay: 'Thêm dòng kẻ ô ly nền (4 ô ly / 5 ô ly)',
      guidelineOverlayHint: 'Vẽ hệ dòng kẻ ô ly tiểu học truyền thống (4 ô ly hoặc 5 ô ly) phía sau vùng chữ và dòng viết.',
      wordScrambleShowHint: 'Hiện gợi ý nghĩa tiếng Việt',
      wordScrambleShowHintHint: 'Hiển thị nghĩa tiếng Việt phía dưới các ô chữ cái xáo trộn nếu từ có cột tiếng Việt.',
      fontStyleLabel: 'Kiểu chữ trên phiếu bài tập',
      fontTabBuiltIn: 'Phông có sẵn',
      fontTabCustom: 'Phông tùy chỉnh',
      customFontUploadTitle: 'Tải lên file phông .ttf hoặc .otf',
      customFontUploadHint: 'Bấm để chọn hoặc kéo thả file TrueType / OpenType. Lưu cục bộ ngay trên trình duyệt.',
      customFontEmpty: 'Chưa có phông chữ tùy chỉnh. Tải file .ttf hoặc .otf để dùng trên mọi phiếu và lưới ô ly.',
      customFontDelete: 'Xóa phông chữ',
      customFontAlignmentTitle: 'Căn chỉnh trên dòng kẻ ô ly',
      customFontScaleLabel: 'Tỷ lệ chữ (Scale)',
      customFontBaselineLabel: 'Độ lệch đường cơ sở (Baseline Offset)',
      customFontLetterSpacingLabel: 'Khoảng cách chữ (Kerning)',
      customFontReset: 'Đặt lại',
      customFontInspectorTitle: 'Kiểm tra cặp chữ (Character Inspector)',
      customFontInspectorHint: 'Bấm vào cặp chữ để phóng to cả từ trực tiếp trên dòng kẻ ô ly.',
      customFontInspectorNeedsCheck: 'cần chỉnh',
      customFontInspectorAllClear: 'Tất cả cặp rõ nét',
      customFontInspectorWordLabel: 'Từ kiểm tra',
      customFontInspectorWordPlaceholder: 'Nhập từ để kiểm tra...',
      customFontStatusOverlap: 'Chồng nét',
      customFontStatusTight: 'Sát nét',
      customFontAutoFixBtn: 'Tự động căn chỉnh (Auto-Fix)',
      customFontAutoFixRunning: 'Đang phân tích...',
      customFontAutoFixUndo: 'Hoàn tác',
      customFontAutoFixOverlap: 'Phát hiện cặp "ca" chồng nét, đã chỉnh Khoảng cách chữ thành {value}.',
      customFontAutoFixTight: 'Phát hiện cặp "ca" quá sát, đã chỉnh Khoảng cách chữ thành {value}.',
      customFontAutoFixWide: 'Phát hiện cặp "ca" quá thưa, đã thu gọn Khoảng cách chữ thành {value}.',
      customFontAutoFixBalanced: 'Đã phân tích cặp "ca": khoảng cách mặc định đã cân đối ({value}).',
      customFontLigatureTitle: 'Nối nét nâng cao (Advanced Ligature)',
      customFontLigatureHint: 'Đặt tỷ lệ chồng nét (Join Overlap %) cho từng cặp chữ: số dương (+%) kéo nét nối liền, số âm (-%) giãn cách.',
      customFontLigaturePairPlaceholder: 'Cặp chữ (vd: br, st)',
      customFontLigatureAddPair: 'Thêm cặp',
      customFontLigaturePresetsLabel: 'Cặp phổ biến',
      customFontLigatureJoinOverlap: 'Độ chồng nét (Join Overlap)',
      customFontLigatureClearAll: 'Xóa tất cả',
      customFontLigatureEmpty: 'Chưa có quy tắc nối nét riêng. Chọn cặp gợi ý phía trên hoặc nhập 2 ký tự bất kỳ.',
      customFontLigatureActiveCount: 'quy tắc',
      customFontLigatureRemoveRule: 'Xóa quy tắc cặp chữ',
      fontSizeLabel: 'Cỡ chữ',
      fontSizeSmall: 'Nhỏ (1 ô ly)',
      fontSizeNormal: 'Thường (2 ô ly · Gấp đôi)',
      difficultyLabel: 'Mức độ bài tập',
      difficultyBeginner: 'Cơ bản',
      difficultyIntermediate: 'Trung bình',
      difficultyAdvanced: 'Nâng cao',
      difficultySummary: {
        beginner: 'Chữ nét đứt cỡ lớn (+16%), giãn dòng rộng, ô ly luyện viết và gợi ý chữ cái đầu + nghĩa tiếng Việt.',
        intermediate: 'Chữ mẫu tiểu học tiêu chuẩn, khoảng cách cân đối và ô điền đáp án theo độ dài từ.',
        advanced: 'Phông chữ tiêu chuẩn gọn gàng, mật độ đề kiểm tra cao và dòng kẻ trống không gợi ý.',
      },
      mixOptimize: 'Tối ưu giấy bằng các dạng đang chọn',
      mixOptimizeHint: 'Tự động thêm các từ chưa dùng vào dạng đã chọn nếu trang hiện tại còn chỗ trống.',
      mixUnusedInfo: 'từ chưa dùng trong Mix',
      livePreviewTitle: 'Xem trước bản in trực tiếp',
      studentSheet: 'Đề học sinh',
      answerKey: 'Đáp án',
      shuffleOrder: 'Xáo thứ tự',
      openFullPreview: 'Mở trang xem đầy đủ',
      noSelectionTitle: 'Hãy chọn ít nhất một dạng phiếu',
      noSelectionBody: 'Đánh dấu một hoặc nhiều dạng phiếu ở cột trái để xem bố cục thực tế.',
    },
    preview: {
      title: 'Kiểm tra bản in (Proofing)',
      subtitle: 'Mọi trang PDF xuất ra đều dùng đúng thứ tự, tỷ lệ và bố cục đang hiển thị tại đây.',
      worksheetFilter: 'Dạng phiếu',
      allSelected: 'Tất cả dạng đang chọn',
      examCode: 'Mã đề',
      copyType: 'Phiên bản',
      zoom: 'Thu phóng',
      fitWidth: 'Vừa chiều rộng',
      shuffle: 'Xáo lại mã đề này',
      downloadCurrent: 'Tải PDF đang xem',
      exportBundle: 'Tải tất cả phiếu',
      printWarning: 'Lưu ý khi in: luôn chọn Actual Size / 100% (tắt Fit to page) để giữ đúng kích thước thẻ và lề cắt.',
      pageCount: 'trang đã dựng',
      renderError: 'Không thể dựng bản xem trước cho thiết lập hiện tại.',
    },
    guide: {
      title: 'Hướng dẫn chuẩn bị & In ấn',
      subtitle: 'Thông số khổ giấy, căn lề từng milimét và quy chuẩn dữ liệu Excel / ZIP ảnh.',
    },
  },
};
