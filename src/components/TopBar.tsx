import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { SpecimenPreset, StageMode } from '../geometry/types';

interface TopBarProps {
  stageMode: StageMode;
  onStageModeChange: (mode: StageMode) => void;
  specimens: SpecimenPreset[];
  onSelectSpecimen: (preset: SpecimenPreset) => void;
  onOpenExport: () => void;
}

const STAGE_ITEMS: Array<{ mode: StageMode; label: string }> = [
  { mode: 'split', label: 'Split Artboards' },
  { mode: 'homothety', label: 'Homothety Rays' },
  { mode: 'overlay', label: 'Overlay Proof' },
];

export const TopBar: React.FC<TopBarProps> = ({
  stageMode,
  onStageModeChange,
  specimens,
  onSelectSpecimen,
  onOpenExport,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8 z-30">
      {/* Zone 1: Single-element brand wordmark */}
      <a
        href="#top"
        onClick={(e) => e.preventDefault()}
        className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
      >
        Similitude
      </a>

      {/* Zone 2: Clean single-line stage & specimen navigation */}
      <nav
        aria-label="Workspace Stage Modes"
        className="flex items-center gap-3 md:gap-6 min-w-0"
      >
        <div className="flex items-center gap-3 md:gap-6 min-w-0 overflow-x-auto py-1">
          {STAGE_ITEMS.map(({ mode, label }) => {
            const active = stageMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onStageModeChange(mode)}
                aria-pressed={active}
                className={`relative py-1.5 text-xs md:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 ${
                  active
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 dark:bg-sky-400"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            <span>Specimens</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Geometric Specimens"
              className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-50"
            >
              {specimens.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectSpecimen(preset);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {preset.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {preset.subtitle}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
