import { Download, Languages, Loader2 } from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import { Locale, NavView } from '../types/worksheet';

interface TopBarProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  copy: Dictionary;
  canExport: boolean;
  isExporting: boolean;
  exportWillZip: boolean;
  onExport: () => void;
}

export function TopBar({
  activeView,
  onSelectView,
  locale,
  onChangeLocale,
  copy,
  canExport,
  isExporting,
  exportWillZip,
  onExport,
}: TopBarProps) {
  const navItems: Array<{ id: NavView; label: string; shortcut: string }> = [
    { id: 'builder', label: copy.nav.builder, shortcut: 'Ctrl+Alt+B' },
    { id: 'data', label: copy.nav.data, shortcut: 'Ctrl+Alt+D' },
    { id: 'preview', label: copy.nav.preview, shortcut: 'Ctrl+Alt+P' },
    { id: 'guide', label: copy.nav.guide, shortcut: 'Ctrl+Alt+G' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('builder')}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          JoyEnglish
        </button>

        {/* Zone 2: Clean single-line text navigation links without vertical scroll clipping */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center h-full gap-4 sm:gap-7 md:gap-8 shrink-0"
        >
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={`${item.label} (${item.shortcut})`}
                onClick={() => onSelectView(item.id)}
                className={`relative h-full inline-flex items-center text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                  active ? 'text-slate-950 font-semibold' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-blue-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Top-right utility controls (Export CTA + Language switch) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            title={`${exportWillZip ? copy.nav.exportZip : copy.nav.exportPdf} (Ctrl+S)`}
            onClick={onExport}
            disabled={!canExport || isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{copy.nav.exporting}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>{exportWillZip ? copy.nav.exportZip : copy.nav.exportPdf}</span>
              </>
            )}
          </button>

          <div
            role="group"
            aria-label="Interface language"
            className="inline-flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0"
          >
            <Languages className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5 shrink-0" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onChangeLocale('en')}
              className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                locale === 'en'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onChangeLocale('vi')}
              className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                locale === 'vi'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              VI
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
