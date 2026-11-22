import React from 'react';
import { Code2, FileImage, FileCode, X } from 'lucide-react';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onDownloadPython: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  onExportPng,
  onExportSvg,
  onDownloadPython,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="export-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Export Studio Artifact
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Download crisp vector geometry, retina raster, or the standalone Python desktop studio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onExportSvg();
              onClose();
            }}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <FileCode className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">SVG Vector Sheet</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Scalable curves, homothety rays, and exact artboard layout
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onExportPng();
              onClose();
            }}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <FileImage className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">High-Resolution PNG</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                2x Retina raster capture of the active studio canvas
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onDownloadPython();
              onClose();
            }}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Desktop Python Script (.py)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Download self-contained PySide6 geometry studio source
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
