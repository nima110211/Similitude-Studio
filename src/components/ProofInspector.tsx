import React, { useState } from 'react';
import {
  Equal,
  FlipHorizontal2,
  FlipVertical2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { computeTelemetry, formatCompactNumber } from '../geometry/engine';
import { TWIN_SWATCHES } from '../geometry/types';
import type {
  DashStyle,
  FillMode,
  GuideSettings,
  StudioState,
  TwinSettings,
} from '../geometry/types';
import { AngleDial } from './AngleDial';

interface ProofInspectorProps {
  state: StudioState;
  hoverNote: string;
  onUpdateTwin: (patch: Partial<TwinSettings>) => void;
  onUpdateGuides: (patch: Partial<GuideSettings>) => void;
  onResetTwin: () => void;
}

const SCALE_PRESETS = [
  { val: 0.5, label: '0.5×' },
  { val: 0.75, label: '0.75×' },
  { val: 1.0, label: '1:1' },
  { val: 1.35, label: '1.35×' },
  { val: 1.618, label: '1.62×' },
];

const FILL_MODES: Array<{ key: FillMode; label: string }> = [
  { key: 'wash', label: 'Wash' },
  { key: 'gradient', label: 'Grad' },
  { key: 'solid', label: 'Solid' },
  { key: 'hatch', label: 'Hatch' },
  { key: 'wire', label: 'Wire' },
];

const DASH_STYLES: Array<{ key: DashStyle; label: string }> = [
  { key: 'solid', label: 'Solid' },
  { key: 'dashed', label: 'Dashed' },
  { key: 'dotted', label: 'Dotted' },
];

export const ProofInspector: React.FC<ProofInspectorProps> = ({
  state,
  hoverNote,
  onUpdateTwin,
  onUpdateGuides,
  onResetTwin,
}) => {
  const [activeTab, setActiveTab] = useState<'transform' | 'style'>('transform');
  const metrics = computeTelemetry(state.shape.points, state.shape.isClosed, state.twin);

  const verdictStyle = (() => {
    switch (metrics.verdict) {
      case 'CONGRUENT (≅)':
        return {
          textClass: 'text-emerald-700 dark:text-emerald-400',
          Icon: Equal,
        };
      case 'ENLARGEMENT (~)':
        return {
          textClass: 'text-blue-700 dark:text-sky-400',
          Icon: Maximize2,
        };
      case 'REDUCTION (~)':
        return {
          textClass: 'text-amber-700 dark:text-amber-400',
          Icon: Minimize2,
        };
      case 'INVERTED (~)':
        return {
          textClass: 'text-violet-700 dark:text-violet-400',
          Icon: RefreshCw,
        };
    }
  })();

  const VerdictIcon = verdictStyle.Icon;

  const hasClosedPolygon = state.shape.isClosed && state.shape.points.length >= 3;
  const defaultProofLine = hasClosedPolygon
    ? 'Angles invariant (∠i = ∠i′) · Hover vertex/edge'
    : 'Hover any vertex or edge to inspect correspondence';

  return (
    <aside
      aria-label="Similarity Proof & Twin Controls"
      className="w-full lg:w-[348px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden"
    >
      {/* Persistent Proof Telemetry Header */}
      <section className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Similarity Proof
          </h2>
          <span
            data-testid="similarity-verdict"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold font-mono-tabular whitespace-nowrap ${verdictStyle.textClass}`}
          >
            <VerdictIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{metrics.verdict}</span>
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div
            data-testid="hero-scale"
            className="text-3xl font-bold font-mono-tabular tracking-tight text-slate-950 dark:text-white"
          >
            {state.twin.invertSign
              ? `${metrics.signedScale.toFixed(2)}×`
              : `${metrics.signedScale.toFixed(2)}×`}
          </div>
          <div className="text-right text-xs text-slate-500 dark:text-slate-400 leading-snug">
            <div>{metrics.orientationLabel}</div>
            <div>{metrics.rotationLabel}</div>
          </div>
        </div>

        {/* 2x2 Clean Tabular Metrics Grid (no nested box borders) */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Linear ratio (k)
            </div>
            <div
              data-testid="metric-linear"
              className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100 mt-0.5"
            >
              {metrics.absScale.toFixed(2)}×
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Area ratio (k²)
            </div>
            <div
              data-testid="metric-area-ratio"
              className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100 mt-0.5"
            >
              {metrics.areaRatio.toFixed(2)}×
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Perimeter (P → P′)
            </div>
            <div
              data-testid="metric-perimeter"
              className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100 mt-0.5"
            >
              {metrics.sourcePerimeter !== null && metrics.twinPerimeter !== null
                ? `${formatCompactNumber(metrics.sourcePerimeter)} → ${formatCompactNumber(metrics.twinPerimeter)}`
                : '—'}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Area (A → A′)
            </div>
            <div
              data-testid="metric-area"
              className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100 mt-0.5"
            >
              {metrics.sourceArea !== null && metrics.twinArea !== null
                ? `${formatCompactNumber(metrics.sourceArea)} → ${formatCompactNumber(metrics.twinArea)}`
                : '—'}
            </div>
          </div>
        </div>

        <p
          data-testid="hover-correspondence"
          className="text-xs font-mono-tabular pt-1 text-slate-600 dark:text-slate-300 min-h-[1.25rem]"
          style={hoverNote ? { color: state.twin.colorHex } : undefined}
        >
          {hoverNote || defaultProofLine}
        </p>
      </section>

      {/* Tab Switcher */}
      <div className="px-5 pt-3.5 pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transform'}
            onClick={() => setActiveTab('transform')}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'transform'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Transform
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'style'}
            onClick={() => setActiveTab('style')}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'style'
                ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Style &amp; Guides
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Controls */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {activeTab === 'transform' ? (
          <>
            {/* Scale Factor Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="scale-slider"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Scale Factor |k|
                </label>
                <span className="text-xs font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                  {state.twin.scaleMag.toFixed(2)}×
                </span>
              </div>

              <input
                id="scale-slider"
                type="range"
                min={0.1}
                max={2.5}
                step={0.01}
                value={state.twin.scaleMag}
                onChange={(e) => onUpdateTwin({ scaleMag: parseFloat(e.target.value) })}
                style={{ accentColor: state.twin.colorHex }}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />

              <div className="grid grid-cols-6 gap-1">
                {SCALE_PRESETS.map(({ val, label }) => {
                  const active = Math.abs(state.twin.scaleMag - val) < 0.012;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onUpdateTwin({ scaleMag: val })}
                      className={`py-1 rounded-md text-[11px] font-mono-tabular font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onUpdateTwin({ invertSign: !state.twin.invertSign })}
                  aria-pressed={state.twin.invertSign}
                  title="Negate scale factor (-k) to invert through Center O"
                  className={`py-1 rounded-md text-[11px] font-mono-tabular font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    state.twin.invertSign
                      ? 'bg-violet-700 text-white dark:bg-violet-500 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  -k
                </button>
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Rotation Dial & Mirror Reflection */}
            <div className="space-y-3.5">
              <AngleDial
                angleDeg={state.twin.rotationDeg}
                accentColor={state.twin.colorHex}
                onChange={(deg) => onUpdateTwin({ rotationDeg: deg })}
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateTwin({ flipX: !state.twin.flipX })}
                  aria-pressed={state.twin.flipX}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    state.twin.flipX
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Mirror X</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateTwin({ flipY: !state.twin.flipY })}
                  aria-pressed={state.twin.flipY}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    state.twin.flipY
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <FlipVertical2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Mirror Y</span>
                </button>
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Similarity Cascade Echoes & Reset */}
            <div className="space-y-3.5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="echo-slider"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Similarity Echoes
                  </label>
                  <span className="text-xs font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    {state.twin.echoCount}×
                  </span>
                </div>
                <input
                  id="echo-slider"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={state.twin.echoCount}
                  onChange={(e) => onUpdateTwin({ echoCount: parseInt(e.target.value, 10) })}
                  style={{ accentColor: state.twin.colorHex }}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={onResetTwin}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Twin Transform</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Twin Color Swatches + Custom Color Picker */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Twin Palette
                </span>
                <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                  {state.twin.colorHex.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5">
                {TWIN_SWATCHES.map((sw) => {
                  const selected = sw.hex.toUpperCase() === state.twin.colorHex.toUpperCase();
                  return (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.name}
                      aria-label={`Select ${sw.name} color`}
                      aria-pressed={selected}
                      onClick={() => onUpdateTwin({ colorHex: sw.hex })}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        selected
                          ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-110'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  );
                })}

                <label
                  title="Custom Color"
                  className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 overflow-hidden"
                >
                  <span aria-hidden="true">+</span>
                  <input
                    type="color"
                    aria-label="Custom twin color"
                    value={state.twin.colorHex}
                    onChange={(e) => onUpdateTwin({ colorHex: e.target.value.toUpperCase() })}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Fill Material */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Fill Material
              </span>
              <div className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {FILL_MODES.map(({ key, label }) => {
                  const active = state.twin.fillMode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onUpdateTwin({ fillMode: key })}
                      className={`py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opacity & Stroke Sliders */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="opacity-slider"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Fill Opacity
                  </label>
                  <span className="text-xs font-mono-tabular text-slate-900 dark:text-slate-100">
                    {Math.round((state.twin.fillOpacity / 0.85) * 100)}%
                  </span>
                </div>
                <input
                  id="opacity-slider"
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.02}
                  value={state.twin.fillOpacity}
                  onChange={(e) => onUpdateTwin({ fillOpacity: parseFloat(e.target.value) })}
                  style={{ accentColor: state.twin.colorHex }}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="stroke-slider"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Stroke Weight
                  </label>
                  <span className="text-xs font-mono-tabular text-slate-900 dark:text-slate-100">
                    {state.twin.strokeWidth.toFixed(1)} px
                  </span>
                </div>
                <input
                  id="stroke-slider"
                  type="range"
                  min={1}
                  max={7}
                  step={0.2}
                  value={state.twin.strokeWidth}
                  onChange={(e) => onUpdateTwin({ strokeWidth: parseFloat(e.target.value) })}
                  style={{ accentColor: state.twin.colorHex }}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {DASH_STYLES.map(({ key, label }) => {
                  const active = state.twin.dashStyle === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onUpdateTwin({ dashStyle: key })}
                      className={`py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Annotations & Guides */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Geometry Annotations
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'showLabels' as const, label: 'Vertices (A, A′)' },
                  { key: 'showLengths' as const, label: 'Side Lengths' },
                  { key: 'showAngles' as const, label: 'Angle Arcs' },
                  { key: 'showRays' as const, label: 'Homothety Rays' },
                ].map(({ key, label }) => {
                  const active = state.guides[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onUpdateGuides({ [key]: !active })}
                      className={`py-2 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-pressed={state.guides.showHandles}
                onClick={() => onUpdateGuides({ showHandles: !state.guides.showHandles })}
                className={`w-full py-2 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  state.guides.showHandles
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Direct Twin Bounding Handles
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
        Created by Nima Khadivi
      </footer>
    </aside>
  );
};
