import { useCallback, useEffect, useRef, useState } from 'react';
import { ExportModal } from './components/ExportModal';
import { ProofInspector } from './components/ProofInspector';
import { StudioCanvas } from './components/StudioCanvas';
import type { StudioCanvasHandle } from './components/StudioCanvas';
import { TopBar } from './components/TopBar';
import {
  cloneSnapshot,
  getSpecimenPresets,
  simplifyPolygonRDP,
} from './geometry/engine';
import { generateSceneSvg, triggerDownload } from './geometry/exporter';
import { PYTHON_STUDIO_SOURCE } from './geometry/pythonScript';
import type {
  GuideSettings,
  Point,
  ShapeSnapshot,
  SpecimenPreset,
  StageMode,
  StudioState,
  ThemeMode,
  ToolMode,
  TwinSettings,
} from './geometry/types';

const SPECIMENS = getSpecimenPresets();

function createInitialState(): StudioState {
  const starter = SPECIMENS[0];
  return {
    stageMode: 'split',
    activeTool: 'brush',
    shape: {
      points: starter.points.map((p) => ({ ...p })),
      isClosed: starter.isClosed,
      isSmooth: starter.isSmooth,
    },
    twin: {
      scaleMag: 1.35,
      invertSign: false,
      rotationDeg: 0,
      flipX: false,
      flipY: false,
      echoCount: 1,
      colorHex: '#2563EB',
      fillMode: 'wash',
      fillOpacity: 0.24,
      strokeWidth: 2.6,
      dashStyle: 'solid',
    },
    guides: {
      showLabels: true,
      showLengths: true,
      showAngles: true,
      showRays: true,
      showHandles: true,
      autoCloseFreehand: true,
    },
    splitTwinOffset: { x: 0, y: 0 },
    homothetyCenter: { x: -200, y: 20 },
  };
}

export default function App() {
  const [state, setState] = useState<StudioState>(createInitialState);
  const [undoStack, setUndoStack] = useState<ShapeSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ShapeSnapshot[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [hoverNote, setHoverNote] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const canvasRef = useRef<StudioCanvasHandle>(null);
  const animPhaseRef = useRef(0);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themeMode]);

  // Smooth Morph Animation Loop
  useEffect(() => {
    if (!isAnimating) return;
    let rafId = 0;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      animPhaseRef.current += dt * 1.9;
      const s = 1.0 + 0.72 * Math.sin(animPhaseRef.current);
      setState((prev) => ({
        ...prev,
        twin: { ...prev.twin, scaleMag: Math.max(0.28, s) },
      }));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isAnimating]);

  const commitShape = useCallback((nextShape: ShapeSnapshot) => {
    setState((prev) => {
      setUndoStack((u) => [...u.slice(-59), cloneSnapshot(prev.shape)]);
      setRedoStack([]);
      return { ...prev, shape: cloneSnapshot(nextShape) };
    });
  }, []);

  const liveShapeMutate = useCallback((nextShape: ShapeSnapshot) => {
    setState((prev) => ({ ...prev, shape: cloneSnapshot(nextShape) }));
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const restored = u[u.length - 1];
      setState((prev) => {
        setRedoStack((r) => [...r, cloneSnapshot(prev.shape)]);
        return { ...prev, shape: cloneSnapshot(restored) };
      });
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const restored = r[r.length - 1];
      setState((prev) => {
        setUndoStack((u) => [...u, cloneSnapshot(prev.shape)]);
        return { ...prev, shape: cloneSnapshot(restored) };
      });
      return r.slice(0, -1);
    });
  }, []);

  const updateTwin = useCallback((patch: Partial<TwinSettings>) => {
    setState((prev) => ({ ...prev, twin: { ...prev.twin, ...patch } }));
  }, []);

  const updateGuides = useCallback((patch: Partial<GuideSettings>) => {
    setState((prev) => ({ ...prev, guides: { ...prev.guides, ...patch } }));
  }, []);

  const resetTwin = useCallback(() => {
    setIsAnimating(false);
    setState((prev) => ({
      ...prev,
      splitTwinOffset: { x: 0, y: 0 },
      twin: {
        ...prev.twin,
        scaleMag: 1.0,
        invertSign: false,
        rotationDeg: 0,
        flipX: false,
        flipY: false,
        echoCount: 1,
      },
    }));
  }, []);

  const handlePolygonize = useCallback(() => {
    setState((prev) => {
      if (prev.shape.points.length < 3) return prev;
      const simplified = simplifyPolygonRDP(prev.shape.points, prev.shape.isClosed);
      setUndoStack((u) => [...u.slice(-59), cloneSnapshot(prev.shape)]);
      setRedoStack([]);
      return {
        ...prev,
        shape: {
          points: simplified,
          isClosed: prev.shape.isClosed,
          isSmooth: false,
        },
      };
    });
  }, []);

  const handleClear = useCallback(() => {
    setIsAnimating(false);
    setHoverNote('');
    setState((prev) => {
      if (prev.shape.points.length > 0) {
        setUndoStack((u) => [...u.slice(-59), cloneSnapshot(prev.shape)]);
        setRedoStack([]);
      }
      return {
        ...prev,
        shape: { points: [], isClosed: true, isSmooth: true },
        splitTwinOffset: { x: 0, y: 0 },
      };
    });
  }, []);

  const handleLoadPreset = useCallback((preset: SpecimenPreset) => {
    setState((prev) => {
      if (prev.shape.points.length > 0) {
        setUndoStack((u) => [...u.slice(-59), cloneSnapshot(prev.shape)]);
        setRedoStack([]);
      }
      return {
        ...prev,
        shape: {
          points: preset.points.map((p) => ({ ...p })),
          isClosed: preset.isClosed,
          isSmooth: preset.isSmooth,
        },
        splitTwinOffset: { x: 0, y: 0 },
      };
    });
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'b') setState((p) => ({ ...p, activeTool: 'brush' }));
      else if (key === 'p') setState((p) => ({ ...p, activeTool: 'polygon' }));
      else if (key === 'e') setState((p) => ({ ...p, activeTool: 'edit' }));
      else if (key === 'm') setState((p) => ({ ...p, activeTool: 'move' }));
      else if (key === 't') setIsAnimating((a) => !a);
      else if (e.key === 'Delete') handleClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleClear]);

  const handleExportSvg = () => {
    const info = canvasRef.current?.getViewportInfo() ?? {
      width: 960,
      height: 680,
      zoom: 1,
      pan: { x: 0, y: 0 },
    };
    const svg = generateSceneSvg(state, themeMode, info.width, info.height, info.zoom, info.pan);
    triggerDownload('similitude-studio.svg', new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  };

  const handleExportPng = () => {
    canvasRef.current?.exportPng();
  };

  const handleDownloadPython = () => {
    triggerDownload(
      'similitude_studio.py',
      new Blob([PYTHON_STUDIO_SOURCE], { type: 'text/x-python;charset=utf-8' }),
    );
  };

  return (
    <div
      data-stage-mode={state.stageMode}
      data-theme={themeMode}
      className="min-h-dvh lg:h-dvh w-full lg:overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      <TopBar
        stageMode={state.stageMode}
        onStageModeChange={(mode: StageMode) => setState((prev) => ({ ...prev, stageMode: mode }))}
        specimens={SPECIMENS}
        onSelectSpecimen={handleLoadPreset}
        onOpenExport={() => setExportOpen(true)}
      />

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row lg:overflow-hidden">
        <StudioCanvas
          ref={canvasRef}
          state={state}
          themeMode={themeMode}
          isAnimating={isAnimating}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onCommitShape={commitShape}
          onLiveShapeMutate={liveShapeMutate}
          onUpdateTwin={updateTwin}
          onSetSplitOffset={(offset: Point) => setState((p) => ({ ...p, splitTwinOffset: offset }))}
          onSetHomothetyCenter={(center: Point) => setState((p) => ({ ...p, homothetyCenter: center }))}
          onSetTool={(tool: ToolMode) => setState((p) => ({ ...p, activeTool: tool }))}
          onToggleAutoClose={() =>
            updateGuides({ autoCloseFreehand: !state.guides.autoCloseFreehand })
          }
          onPolygonize={handlePolygonize}
          onToggleAnimate={() => setIsAnimating((a) => !a)}
          onClear={handleClear}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onToggleTheme={() => setThemeMode((t) => (t === 'light' ? 'dark' : 'light'))}
          onLoadPreset={handleLoadPreset}
          onHoverNoteChange={setHoverNote}
        />

        <ProofInspector
          state={state}
          hoverNote={hoverNote}
          onUpdateTwin={updateTwin}
          onUpdateGuides={updateGuides}
          onResetTwin={resetTwin}
        />
      </main>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onDownloadPython={handleDownloadPython}
      />
    </div>
  );
}
