import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CircleDot,
  Hexagon,
  Moon,
  MousePointer2,
  Move,
  Pause,
  PenTool,
  Play,
  Redo2,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  dist,
  getSignedScale,
  getSpecimenPresets,
  interiorAnglesDeg,
  pointToSegmentDistance,
  polygonCentroid,
  polygonSignedArea,
  transformPoint,
  transformPoints,
  vertexName,
} from '../geometry/engine';
import type {
  Point,
  ShapeSnapshot,
  SpecimenPreset,
  StudioState,
  ThemeMode,
  ToolMode,
  TwinSettings,
} from '../geometry/types';

export interface StudioCanvasHandle {
  exportPng: () => void;
  resetCamera: () => void;
  getViewportInfo: () => { width: number; height: number; zoom: number; pan: Point };
}

interface StudioCanvasProps {
  state: StudioState;
  themeMode: ThemeMode;
  isAnimating: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onCommitShape: (shape: ShapeSnapshot) => void;
  onLiveShapeMutate: (shape: ShapeSnapshot) => void;
  onUpdateTwin: (patch: Partial<TwinSettings>) => void;
  onSetSplitOffset: (offset: Point) => void;
  onSetHomothetyCenter: (center: Point) => void;
  onSetTool: (tool: ToolMode) => void;
  onToggleAutoClose: () => void;
  onPolygonize: () => void;
  onToggleAnimate: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTheme: () => void;
  onLoadPreset: (preset: SpecimenPreset) => void;
  onHoverNoteChange: (note: string) => void;
}

interface BoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragKind =
  | null
  | 'vertex'
  | 'twin_move'
  | 'twin_scale'
  | 'twin_rotate'
  | 'homothety_o'
  | 'pan';

function shiftHueHex(hex: string, deg = 30): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  const nh = (h + deg / 360) % 1;
  const ns = Math.max(0.15, Math.min(1, s * 0.85));
  const nv = Math.max(0.2, Math.min(1, v * 1.08));

  const i = Math.floor(nh * 6);
  const f = nh * 6 - i;
  const p = nv * (1 - ns);
  const q = nv * (1 - f * ns);
  const t = nv * (1 - (1 - f) * ns);
  let rr = 0,
    gg = 0,
    bb = 0;
  switch (i % 6) {
    case 0:
      rr = nv;
      gg = t;
      bb = p;
      break;
    case 1:
      rr = q;
      gg = nv;
      bb = p;
      break;
    case 2:
      rr = p;
      gg = nv;
      bb = t;
      break;
    case 3:
      rr = p;
      gg = q;
      bb = nv;
      break;
    case 4:
      rr = t;
      gg = p;
      bb = nv;
      break;
    case 5:
      rr = nv;
      gg = p;
      bb = q;
      break;
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(37,99,235,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function traceCanvasPath(
  ctx: CanvasRenderingContext2D,
  screenPts: Point[],
  isClosed: boolean,
  isSmooth: boolean,
): void {
  const n = screenPts.length;
  ctx.beginPath();
  if (n === 0) return;
  if (n === 1) {
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    return;
  }
  if (!isSmooth || n < 3) {
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    for (let i = 1; i < n; i++) {
      ctx.lineTo(screenPts[i].x, screenPts[i].y);
    }
    if (isClosed && n >= 3) ctx.closePath();
    return;
  }

  if (isClosed) {
    const startMidX = 0.5 * (screenPts[n - 1].x + screenPts[0].x);
    const startMidY = 0.5 * (screenPts[n - 1].y + screenPts[0].y);
    ctx.moveTo(startMidX, startMidY);
    for (let i = 0; i < n; i++) {
      const curr = screenPts[i];
      const nxt = screenPts[(i + 1) % n];
      const mx = 0.5 * (curr.x + nxt.x);
      const my = 0.5 * (curr.y + nxt.y);
      ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(screenPts[0].x, screenPts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const mx = 0.5 * (screenPts[i].x + screenPts[i + 1].x);
      const my = 0.5 * (screenPts[i].y + screenPts[i + 1].y);
      ctx.quadraticCurveTo(screenPts[i].x, screenPts[i].y, mx, my);
    }
    ctx.lineTo(screenPts[n - 1].x, screenPts[n - 1].y);
  }
}

export const StudioCanvas = React.forwardRef<StudioCanvasHandle, StudioCanvasProps>(
  (
    {
      state,
      themeMode,
      isAnimating,
      canUndo,
      canRedo,
      onCommitShape,
      onLiveShapeMutate,
      onUpdateTwin,
      onSetSplitOffset,
      onSetHomothetyCenter,
      onSetTool,
      onToggleAutoClose,
      onPolygonize,
      onToggleAnimate,
      onClear,
      onUndo,
      onRedo,
      onToggleTheme,
      onLoadPreset,
      onHoverNoteChange,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [size, setSize] = useState({ width: 920, height: 680 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [cursorClass, setCursorClass] = useState('cursor-crosshair');
    const [polyUI, setPolyUI] = useState({ active: false, count: 0 });
    const [selectedVertexIdx, setSelectedVertexIdx] = useState(-1);

    // Interactive drawing refs (avoid React re-renders per pixel while brushing)
    const activeStrokeRef = useRef<Point[]>([]);
    const isBrushingRef = useRef(false);
    const polyPointsRef = useRef<Point[]>([]);
    const isPolyDrawingRef = useRef(false);
    const mouseScreenRef = useRef<Point>({ x: 0, y: 0 });
    const mouseInsideRef = useRef(false);
    const spaceDownRef = useRef(false);

    // Multi-touch pinch & active pointer tracking
    const activePointersRef = useRef<Map<number, Point>>(new Map());
    const activePointerIdRef = useRef<number | null>(null);
    const pinchRef = useRef<{
      dist: number;
      mid: Point;
      zoom: number;
      pan: Point;
      board: BoardRect;
    } | null>(null);

    // Drag state refs
    const dragKindRef = useRef<DragKind>(null);
    const dragVertexIdxRef = useRef(-1);
    const dragStartWorldRef = useRef<Point>({ x: 0, y: 0 });
    const dragStartScreenRef = useRef<Point>({ x: 0, y: 0 });
    const dragInitialPanRef = useRef<Point>({ x: 0, y: 0 });
    const dragInitialOffsetRef = useRef<Point>({ x: 0, y: 0 });
    const dragInitialORef = useRef<Point>({ x: 0, y: 0 });
    const dragInitialKRef = useRef(1);
    const dragInitialRotRef = useRef(0);
    const dragRefCenterRef = useRef<Point>({ x: 0, y: 0 });
    const dragInitialDistRef = useRef<number>(1);
    const dragInitialAngRef = useRef<number>(0);

    // Hover state refs
    const hoverVertexRef = useRef(-1);
    const hoverEdgeRef = useRef(-1);
    const hoverMidpointRef = useRef<{ edgeIdx: number; point: Point } | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const panRef = useRef(pan);
    panRef.current = pan;

    useEffect(() => {
      if (state.activeTool !== 'edit') {
        setSelectedVertexIdx(-1);
      }
    }, [state.activeTool]);

    useEffect(() => {
      setSelectedVertexIdx((idx) => (idx >= state.shape.points.length ? -1 : idx));
    }, [state.shape.points.length]);

    const getBoardRects = useCallback(
      (w: number, h: number, mode = stateRef.current.stageMode): { left: BoardRect; right: BoardRect | null } => {
        const isCompact = w < 640;
        const padX = isCompact ? 12 : 20;
        const padTop = isCompact ? 10 : 16;
        const padBot = isCompact ? 104 : 78;
        const availW = Math.max(200, w - 2 * padX);
        const availH = Math.max(200, h - padTop - padBot);

        if (mode === 'split') {
          if (isCompact) {
            const gutter = 10;
            const bh = (availH - gutter) * 0.5;
            return {
              left: { x: padX, y: padTop, w: availW, h: bh },
              right: { x: padX, y: padTop + bh + gutter, w: availW, h: bh },
            };
          }
          const gutter = 16;
          const bw = (availW - gutter) * 0.5;
          return {
            left: { x: padX, y: padTop, w: bw, h: availH },
            right: { x: padX + bw + gutter, y: padTop, w: bw, h: availH },
          };
        }
        return {
          left: { x: padX, y: padTop, w: availW, h: availH },
          right: null,
        };
      },
      [],
    );

    const effectiveZoom = useCallback(
      (b: BoardRect, z = zoom): number => {
        const fitFactor =
          b.w < 460 || b.h < 320
            ? Math.max(0.4, Math.min((b.w - 16) / 520, (b.h - 22) / 340))
            : 1;
        return z * fitFactor;
      },
      [zoom],
    );

    const boardCenterOffsetY = (b: BoardRect): number => (b.h < 250 ? 8 : 0);

    const srcWorldToScreen = useCallback(
      (p: Point, b: BoardRect, z = zoom, pn = pan): Point => {
        const ez = effectiveZoom(b, z);
        return {
          x: b.x + b.w * 0.5 + (p.x + pn.x) * ez,
          y: b.y + b.h * 0.5 + boardCenterOffsetY(b) + (p.y + pn.y) * ez,
        };
      },
      [zoom, pan, effectiveZoom],
    );

    const screenToSrcWorld = useCallback(
      (s: Point, b: BoardRect, z = zoom, pn = pan): Point => {
        const ez = effectiveZoom(b, z);
        return {
          x: (s.x - (b.x + b.w * 0.5)) / ez - pn.x,
          y: (s.y - (b.y + b.h * 0.5 + boardCenterOffsetY(b))) / ez - pn.y,
        };
      },
      [zoom, pan, effectiveZoom],
    );

    const twinWorldToScreen = useCallback(
      (p: Point, leftB: BoardRect, rightB: BoardRect | null, z = zoom, pn = pan): Point => {
        const b = stateRef.current.stageMode === 'split' && rightB ? rightB : leftB;
        const ez = effectiveZoom(b, z);
        return {
          x: b.x + b.w * 0.5 + (p.x + pn.x) * ez,
          y: b.y + b.h * 0.5 + boardCenterOffsetY(b) + (p.y + pn.y) * ez,
        };
      },
      [zoom, pan, effectiveZoom],
    );

    const screenToTwinWorld = useCallback(
      (s: Point, leftB: BoardRect, rightB: BoardRect | null, z = zoom, pn = pan): Point => {
        const b = stateRef.current.stageMode === 'split' && rightB ? rightB : leftB;
        const ez = effectiveZoom(b, z);
        return {
          x: (s.x - (b.x + b.w * 0.5)) / ez - pn.x,
          y: (s.y - (b.y + b.h * 0.5 + boardCenterOffsetY(b))) / ez - pn.y,
        };
      },
      [zoom, pan, effectiveZoom],
    );

    const getActiveSource = useCallback((): ShapeSnapshot => {
      if (isBrushingRef.current && activeStrokeRef.current.length > 0) {
        return { points: activeStrokeRef.current, isClosed: false, isSmooth: true };
      }
      if (isPolyDrawingRef.current && polyPointsRef.current.length > 0) {
        return { points: polyPointsRef.current, isClosed: false, isSmooth: false };
      }
      return stateRef.current.shape;
    }, []);

    const getTwinBboxHandles = useCallback(
      (twinPts: Point[], leftB: BoardRect, rightB: BoardRect | null) => {
        const activeBoard = stateRef.current.stageMode === 'split' && rightB ? rightB : leftB;
        const sc = twinPts.map((p) => twinWorldToScreen(p, leftB, rightB));
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (const p of sc) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const pad = activeBoard.h < 250 ? 8 : 12;
        const bbox = {
          x: minX - pad,
          y: minY - pad,
          w: maxX - minX + 2 * pad,
          h: maxY - minY + 2 * pad,
        };
        const corners: Point[] = [
          { x: bbox.x, y: bbox.y },
          { x: bbox.x + bbox.w, y: bbox.y },
          { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
          { x: bbox.x, y: bbox.y + bbox.h },
        ];
        const rotStem = activeBoard.h < 250 ? 16 : 26;
        const rotHandle: Point = {
          x: bbox.x + bbox.w * 0.5,
          y: Math.max(activeBoard.y + 18, bbox.y - rotStem),
        };
        return { bbox, corners, rotHandle };
      },
      [twinWorldToScreen],
    );

    // -------------------------------------------------------------------------
    // Main Canvas Render Function
    // -------------------------------------------------------------------------
    const renderCanvas = useCallback(
      (customCtx?: CanvasRenderingContext2D, customW?: number, customH?: number, forExport = false) => {
        const canvas = canvasRef.current;
        if (!canvas && !customCtx) return;
        const ctx = customCtx ?? canvas!.getContext('2d');
        if (!ctx) return;

        const w = customW ?? size.width;
        const h = customH ?? size.height;
        const st = stateRef.current;
        const isDark = themeMode === 'dark';

        const palette = {
          bg: isDark ? '#0B0F17' : '#F6F7F9',
          boardBg: isDark ? '#111622' : '#FFFFFF',
          boardBorder: isDark ? '#1E293B' : '#E2E8F0',
          gridDot: isDark ? '#253047' : '#CBD5E1',
          gridAxis: isDark ? '#1A2334' : '#F1F5F9',
          textPrimary: isDark ? '#F8FAFC' : '#0F172A',
          textMuted: isDark ? '#64748B' : '#94A3B8',
          srcStroke: isDark ? '#F8FAFC' : '#111827',
          srcFill: isDark ? '#FB923C' : '#0F172A',
          srcNode: isDark ? '#FB923C' : '#EA580C',
          gold: isDark ? '#FBBF24' : '#D97706',
          pillBg: isDark ? 'rgba(17,22,34,0.92)' : 'rgba(255,255,255,0.94)',
        };

        ctx.save();
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, w, h);

        const { left: leftB, right: rightB } = getBoardRects(w, h, st.stageMode);

        const drawArtboard = (b: BoardRect, title: string, subtitle: string) => {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 16);
          ctx.fillStyle = palette.boardBg;
          ctx.fill();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = palette.boardBorder;
          ctx.stroke();
          ctx.clip();

          // Architectural dot-matrix grid
          const step = 32 * zoom;
          if (step >= 12) {
            const origin = srcWorldToScreen({ x: 0, y: 0 }, b);
            ctx.strokeStyle = palette.gridAxis;
            ctx.lineWidth = 1;
            if (origin.x >= b.x && origin.x <= b.x + b.w) {
              ctx.beginPath();
              ctx.moveTo(origin.x, b.y);
              ctx.lineTo(origin.x, b.y + b.h);
              ctx.stroke();
            }
            if (origin.y >= b.y && origin.y <= b.y + b.h) {
              ctx.beginPath();
              ctx.moveTo(b.x, origin.y);
              ctx.lineTo(b.x + b.w, origin.y);
              ctx.stroke();
            }

            const ox = ((origin.x - b.x) % step + step) % step;
            const oy = ((origin.y - b.y) % step + step) % step;
            ctx.fillStyle = palette.gridDot;
            for (let gx = b.x + ox; gx < b.x + b.w; gx += step) {
              for (let gy = b.y + oy; gy < b.y + b.h; gy += step) {
                ctx.beginPath();
                ctx.arc(gx, gy, 1.05, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }

          // Header caption inside board
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          ctx.fillStyle = palette.textMuted;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(title, b.x + 16, b.y + 13);

          if (b.w > 280 && b.h > 190) {
            ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(subtitle, b.x + 16, b.y + 28, Math.max(100, b.w - 132));
          }
          ctx.restore();
        };

        if (st.stageMode === 'split' && rightB) {
          drawArtboard(leftB, '01. SOURCE CANVAS', 'Draw freely or place vertices');
          const kVal = getSignedScale(st.twin);
          drawArtboard(
            rightB,
            '02. SIMILAR TWIN',
            `Scale ${kVal >= 0 ? '' : ''}${kVal.toFixed(2)}× · Drag handles to adjust`,
          );
        } else {
          const title = st.stageMode === 'homothety' ? 'HOMOTHETY PROJECTION STAGE' : 'CENTROID OVERLAY PROOF';
          const sub =
            st.stageMode === 'homothety'
              ? 'Drag amber Center O to project rays through vertices'
              : 'Centroids aligned · Inspect congruent angles & parallel edges';
          drawArtboard(leftB, title, sub);
        }

        const active = getActiveSource();
        const pts = active.points;
        if (pts.length === 0) {
          ctx.restore();
          return;
        }

        const twinPts = transformPoints(pts, {
          stageMode: st.stageMode,
          twin: st.twin,
          splitTwinOffset: st.splitTwinOffset,
          homothetyCenter: st.homothetyCenter,
        });

        const showDetail = !active.isSmooth && pts.length <= 24 && active.isClosed && pts.length >= 3;

        const drawAngleArcs = (screenPts: Point[], worldPts: Point[], color: string) => {
          const n = screenPts.length;
          if (n < 3) return;
          const signed = polygonSignedArea(screenPts);
          const cwYDown = signed >= 0;
          const angles = interiorAnglesDeg(worldPts);

          for (let i = 0; i < n; i++) {
            const pPrev = screenPts[(i - 1 + n) % n];
            const pCurr = screenPts[i];
            const pNext = screenPts[(i + 1) % n];
            const ux = pPrev.x - pCurr.x;
            const uy = pPrev.y - pCurr.y;
            const vx = pNext.x - pCurr.x;
            const vy = pNext.y - pCurr.y;
            const lu = Math.hypot(ux, uy);
            const lv = Math.hypot(vx, vy);
            if (lu < 18 || lv < 18) continue;

            const r = Math.min(20, lu * 0.28, lv * 0.28);
            const angU = Math.atan2(uy, ux);
            const angV = Math.atan2(vy, vx);
            const sweepRad = (angles[i] * Math.PI) / 180;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pCurr.x, pCurr.y);
            if (cwYDown) {
              ctx.arc(pCurr.x, pCurr.y, r, angV, angV + sweepRad, false);
            } else {
              ctx.arc(pCurr.x, pCurr.y, r, angU, angU + sweepRad, false);
            }
            ctx.closePath();
            ctx.fillStyle = hexToRgba(color, 0.16);
            ctx.fill();

            ctx.beginPath();
            if (cwYDown) {
              ctx.arc(pCurr.x, pCurr.y, r, angV, angV + sweepRad, false);
            } else {
              ctx.arc(pCurr.x, pCurr.y, r, angU, angU + sweepRad, false);
            }
            ctx.strokeStyle = hexToRgba(color, 0.72);
            ctx.lineWidth = 1.25;
            ctx.stroke();
            ctx.restore();
          }
        };

        const drawSideLengths = (
          screenPts: Point[],
          worldPts: Point[],
          isClosed: boolean,
          color: string,
        ) => {
          const n = screenPts.length;
          const count = isClosed ? n : n - 1;
          if (count <= 0) return;
          const centerS = polygonCentroid(screenPts);
          ctx.save();
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          for (let i = 0; i < count; i++) {
            const j = (i + 1) % n;
            const a = screenPts[i];
            const b = screenPts[j];
            const segS = dist(a, b);
            if (segS < 34) continue;
            const mx = 0.5 * (a.x + b.x);
            const my = 0.5 * (a.y + b.y);
            let nx = -(b.y - a.y) / segS;
            let ny = (b.x - a.x) / segS;
            if ((mx + nx - centerS.x) ** 2 + (my + ny - centerS.y) ** 2 < (mx - nx - centerS.x) ** 2 + (my - ny - centerS.y) ** 2) {
              nx = -nx;
              ny = -ny;
            }
            const px = mx + nx * 14;
            const py = my + ny * 14;
            const label = `${dist(worldPts[i], worldPts[j]).toFixed(0)}`;
            const tw = ctx.measureText(label).width + 10;
            ctx.fillStyle = palette.pillBg;
            ctx.beginPath();
            ctx.roundRect(px - tw * 0.5, py - 8, tw, 16, 4);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.fillText(label, px, py);
          }
          ctx.restore();
        };

        const drawVertexLabels = (screenPts: Point[], isTwin: boolean, color: string) => {
          const centerS = polygonCentroid(screenPts);
          ctx.save();
          ctx.font = '600 11px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = palette.boardBg;
          ctx.fillStyle = color;
          for (let i = 0; i < screenPts.length; i++) {
            const sp = screenPts[i];
            const dx = sp.x - centerS.x;
            const dy = sp.y - centerS.y;
            const d = Math.max(1e-3, Math.hypot(dx, dy));
            const lx = sp.x + (dx / d) * 15;
            const ly = sp.y + (dy / d) * 15;
            const lbl = vertexName(i) + (isTwin ? '′' : '');
            ctx.strokeText(lbl, lx, ly);
            ctx.fillText(lbl, lx, ly);
          }
          ctx.restore();
        };

        const drawSource = (b: BoardRect) => {
          const screenPts = pts.map((p) => srcWorldToScreen(p, b));
          ctx.save();
          if (screenPts.length === 1) {
            ctx.fillStyle = palette.srcNode;
            ctx.beginPath();
            ctx.arc(screenPts[0].x, screenPts[0].y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
          }

          traceCanvasPath(ctx, screenPts, active.isClosed, active.isSmooth);
          if (active.isClosed) {
            ctx.fillStyle = hexToRgba(palette.srcFill, 0.09);
            ctx.fill();
          }
          ctx.strokeStyle = palette.srcStroke;
          ctx.lineWidth = 2.3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          if (!forExport && hoverEdgeRef.current >= 0 && screenPts.length >= 2) {
            const i = hoverEdgeRef.current;
            const j = (i + 1) % screenPts.length;
            ctx.beginPath();
            ctx.moveTo(screenPts[i].x, screenPts[i].y);
            ctx.lineTo(screenPts[j].x, screenPts[j].y);
            ctx.strokeStyle = palette.srcNode;
            ctx.lineWidth = 4.2;
            ctx.stroke();
          }

          if (showDetail && st.guides.showAngles) {
            drawAngleArcs(screenPts, pts, palette.srcNode);
          }
          if (showDetail && st.guides.showLengths) {
            drawSideLengths(screenPts, pts, active.isClosed, palette.textMuted);
          }

          const isEdit = st.activeTool === 'edit' && !forExport;
          if (showDetail || isEdit || isPolyDrawingRef.current) {
            const nodeR = screenPts.length <= 28 ? 4.4 : 2.8;
            for (let i = 0; i < screenPts.length; i++) {
              const sp = screenPts[i];
              const isHov = !forExport && (i === hoverVertexRef.current || (isEdit && i === selectedVertexIdx));
              if (isHov) {
                ctx.fillStyle = hexToRgba(palette.srcNode, 0.28);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
                ctx.fill();
              }
              if (showDetail || isEdit || i === 0) {
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, nodeR + (isHov ? 1.6 : 0), 0, Math.PI * 2);
                ctx.fillStyle = isEdit || isHov ? palette.srcNode : palette.boardBg;
                ctx.fill();
                ctx.lineWidth = 1.6;
                ctx.strokeStyle = palette.srcStroke;
                ctx.stroke();
              }
            }
          }

          // In Nodes (edit) mode, show tappable edge midpoint handles so touch users can insert vertices
          if (isEdit && pts.length >= 2 && pts.length <= 20) {
            const edgeCount = active.isClosed ? pts.length : pts.length - 1;
            for (let i = 0; i < edgeCount; i++) {
              const j = (i + 1) % pts.length;
              const midW = { x: 0.5 * (pts[i].x + pts[j].x), y: 0.5 * (pts[i].y + pts[j].y) };
              const ms = srcWorldToScreen(midW, b);
              const isHoveredMid = hoverMidpointRef.current?.edgeIdx === i;
              const r = isHoveredMid ? 6.5 : 4.5;
              ctx.save();
              ctx.globalAlpha = isHoveredMid ? 1 : 0.72;
              ctx.beginPath();
              ctx.arc(ms.x, ms.y, r, 0, Math.PI * 2);
              ctx.fillStyle = palette.boardBg;
              ctx.fill();
              ctx.strokeStyle = palette.srcNode;
              ctx.lineWidth = isHoveredMid ? 1.5 : 1.1;
              ctx.stroke();
              ctx.beginPath();
              const cross = isHoveredMid ? 3 : 2.2;
              ctx.moveTo(ms.x - cross, ms.y);
              ctx.lineTo(ms.x + cross, ms.y);
              ctx.moveTo(ms.x, ms.y - cross);
              ctx.lineTo(ms.x, ms.y + cross);
              ctx.stroke();
              ctx.restore();
            }
          }

          if (showDetail && st.guides.showLabels) {
            drawVertexLabels(screenPts, false, palette.textPrimary);
          }
          ctx.restore();
        };

        const applyTwinStyles = (screenPts: Point[], alphaMult: number, widthMult: number) => {
          const tw = st.twin;
          ctx.strokeStyle = hexToRgba(tw.colorHex, Math.max(0.08, alphaMult));
          ctx.lineWidth = Math.max(0.9, tw.strokeWidth * widthMult);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (tw.dashStyle === 'dashed') ctx.setLineDash([8, 6]);
          else if (tw.dashStyle === 'dotted') ctx.setLineDash([2, 5]);
          else ctx.setLineDash([]);

          const op = tw.fillOpacity * alphaMult;
          if (!active.isClosed || tw.fillMode === 'wire' || op <= 0.01) {
            ctx.fillStyle = 'transparent';
            return false;
          }
          if (tw.fillMode === 'solid') {
            ctx.fillStyle = hexToRgba(tw.colorHex, Math.min(0.9, Math.max(0.15, op * 2.2)));
            return true;
          }
          if (tw.fillMode === 'gradient') {
            let minX = Infinity,
              maxX = -Infinity,
              minY = Infinity,
              maxY = -Infinity;
            for (const p of screenPts) {
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
            }
            const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
            grad.addColorStop(0, hexToRgba(tw.colorHex, Math.min(0.9, op * 2.0 + 0.12)));
            grad.addColorStop(1, hexToRgba(shiftHueHex(tw.colorHex, 32), Math.min(0.65, op * 0.95 + 0.05)));
            ctx.fillStyle = grad;
            return true;
          }
          if (tw.fillMode === 'hatch') {
            const pCanvas = document.createElement('canvas');
            pCanvas.width = 12;
            pCanvas.height = 12;
            const pCtx = pCanvas.getContext('2d');
            if (pCtx) {
              pCtx.strokeStyle = hexToRgba(tw.colorHex, Math.min(0.92, Math.max(0.18, op * 1.45)));
              pCtx.lineWidth = 1.25;
              pCtx.beginPath();
              pCtx.moveTo(0, 12);
              pCtx.lineTo(12, 0);
              pCtx.moveTo(-6, 6);
              pCtx.lineTo(6, -6);
              pCtx.moveTo(6, 18);
              pCtx.lineTo(18, 6);
              pCtx.stroke();
              const pat = ctx.createPattern(pCanvas, 'repeat');
              if (pat) {
                ctx.fillStyle = pat;
                return true;
              }
            }
          }
          ctx.fillStyle = hexToRgba(tw.colorHex, Math.min(0.85, op));
          return true;
        };

        const drawTwin = () => {
          const screenMain = twinPts.map((p) => twinWorldToScreen(p, leftB, rightB));
          ctx.save();
          if (screenMain.length === 1) {
            ctx.fillStyle = st.twin.colorHex;
            ctx.beginPath();
            ctx.arc(screenMain[0].x, screenMain[0].y, Math.max(3.5, 5 * Math.abs(getSignedScale(st.twin))), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
          }

          // Similarity Echoes
          if (st.twin.echoCount > 1 && twinPts.length >= 3) {
            const cTwin = polygonCentroid(twinPts);
            for (let m = st.twin.echoCount - 1; m >= 1; m--) {
              const ratio = Math.pow(0.77, m);
              const echoWorld = twinPts.map((p) => ({
                x: cTwin.x + (p.x - cTwin.x) * ratio,
                y: cTwin.y + (p.y - cTwin.y) * ratio,
              }));
              const echoScreen = echoWorld.map((p) => twinWorldToScreen(p, leftB, rightB));
              const alphaM = Math.max(0.14, 0.58 * Math.pow(0.72, m));
              traceCanvasPath(ctx, echoScreen, active.isClosed, active.isSmooth);
              const hasFill = applyTwinStyles(echoScreen, alphaM, 0.78);
              if (hasFill) ctx.fill();
              ctx.stroke();
            }
          }

          traceCanvasPath(ctx, screenMain, active.isClosed, active.isSmooth);
          const hasFill = applyTwinStyles(screenMain, 1, 1);
          if (hasFill) ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          if (!forExport && hoverEdgeRef.current >= 0 && screenMain.length >= 2) {
            const i = hoverEdgeRef.current;
            const j = (i + 1) % screenMain.length;
            ctx.beginPath();
            ctx.moveTo(screenMain[i].x, screenMain[i].y);
            ctx.lineTo(screenMain[j].x, screenMain[j].y);
            ctx.strokeStyle = st.twin.colorHex;
            ctx.lineWidth = 4.6;
            ctx.stroke();
          }

          if (showDetail && st.guides.showAngles) {
            drawAngleArcs(screenMain, twinPts, st.twin.colorHex);
          }
          if (showDetail && st.guides.showLengths) {
            drawSideLengths(screenMain, twinPts, active.isClosed, st.twin.colorHex);
          }

          if (showDetail || (!forExport && hoverVertexRef.current >= 0)) {
            for (let i = 0; i < screenMain.length; i++) {
              const sp = screenMain[i];
              const isHov = !forExport && i === hoverVertexRef.current;
              if (isHov) {
                ctx.fillStyle = hexToRgba(st.twin.colorHex, 0.25);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 11, 0, Math.PI * 2);
                ctx.fill();
              }
              if (showDetail || isHov) {
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 4 + (isHov ? 1.4 : 0), 0, Math.PI * 2);
                ctx.fillStyle = isHov ? st.twin.colorHex : palette.boardBg;
                ctx.fill();
                ctx.lineWidth = 1.6;
                ctx.strokeStyle = st.twin.colorHex;
                ctx.stroke();
              }
            }
          }

          if (showDetail && st.guides.showLabels) {
            drawVertexLabels(screenMain, true, st.twin.colorHex);
          }

          // Direct-Manipulation Handles
          if (
            !forExport &&
            st.guides.showHandles &&
            !isBrushingRef.current &&
            !isPolyDrawingRef.current &&
            (st.stageMode === 'split' || st.activeTool === 'move') &&
            twinPts.length >= 2
          ) {
            const { bbox, corners, rotHandle } = getTwinBboxHandles(twinPts, leftB, rightB);
            ctx.save();
            ctx.strokeStyle = hexToRgba(st.twin.colorHex, 0.55);
            ctx.lineWidth = 1.1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(bbox.x + bbox.w * 0.5, bbox.y);
            ctx.lineTo(rotHandle.x, rotHandle.y);
            ctx.stroke();

            ctx.fillStyle = palette.boardBg;
            ctx.strokeStyle = st.twin.colorHex;
            ctx.lineWidth = 1.7;
            ctx.beginPath();
            ctx.arc(rotHandle.x, rotHandle.y, 5.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            for (const c of corners) {
              ctx.beginPath();
              ctx.roundRect(c.x - 4, c.y - 4, 8, 8, 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
          }

          ctx.restore();
        };

        const drawGlowNib = (pt: Point, color: string) => {
          ctx.save();
          ctx.fillStyle = hexToRgba(color, 0.25);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        const drawLiveNibs = (drawSourceNib: boolean, drawTwinNib: boolean) => {
          if (!mouseInsideRef.current || forExport) return;

          if (isPolyDrawingRef.current && polyPointsRef.current.length > 0) {
            const lastW = polyPointsRef.current[polyPointsRef.current.length - 1];
            const lastS = srcWorldToScreen(lastW, leftB);
            let curS = mouseScreenRef.current;
            let curW = screenToSrcWorld(curS, leftB);

            const p0S = srcWorldToScreen(polyPointsRef.current[0], leftB);
            if (polyPointsRef.current.length >= 3 && dist(curS, p0S) <= 15) {
              curS = p0S;
              curW = polyPointsRef.current[0];
              if (drawSourceNib) {
                ctx.save();
                ctx.strokeStyle = palette.srcNode;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(p0S.x, p0S.y, 11, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }
            }

            if (drawSourceNib) {
              ctx.save();
              ctx.strokeStyle = palette.srcNode;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([5, 5]);
              ctx.beginPath();
              ctx.moveTo(lastS.x, lastS.y);
              ctx.lineTo(curS.x, curS.y);
              ctx.stroke();
              ctx.setLineDash([]);

              const segLen = dist(lastW, curW);
              ctx.fillStyle = palette.pillBg;
              ctx.strokeStyle = palette.boardBorder;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(curS.x + 12, curS.y - 22, 56, 18, 5);
              ctx.fill();
              ctx.stroke();
              ctx.font = '600 10px "IBM Plex Mono", monospace';
              ctx.fillStyle = palette.textPrimary;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`${segLen.toFixed(0)} u`, curS.x + 40, curS.y - 13);
              ctx.restore();
            }

            if (drawTwinNib) {
              const overlayC = st.stageMode === 'overlay' ? polygonCentroid(polyPointsRef.current) : undefined;
              const lastTw = transformPoint(lastW, {
                stageMode: st.stageMode,
                twin: st.twin,
                splitTwinOffset: st.splitTwinOffset,
                homothetyCenter: st.homothetyCenter,
                overlayCentroid: overlayC,
              });
              const curTw = transformPoint(curW, {
                stageMode: st.stageMode,
                twin: st.twin,
                splitTwinOffset: st.splitTwinOffset,
                homothetyCenter: st.homothetyCenter,
                overlayCentroid: overlayC,
              });
              const lastTs = twinWorldToScreen(lastTw, leftB, rightB);
              const curTs = twinWorldToScreen(curTw, leftB, rightB);

              ctx.save();
              ctx.strokeStyle = st.twin.colorHex;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([5, 5]);
              ctx.beginPath();
              ctx.moveTo(lastTs.x, lastTs.y);
              ctx.lineTo(curTs.x, curTs.y);
              ctx.stroke();
              ctx.restore();
              drawGlowNib(curTs, st.twin.colorHex);
            }
          } else if (isBrushingRef.current && activeStrokeRef.current.length > 0) {
            const lastW = activeStrokeRef.current[activeStrokeRef.current.length - 1];
            if (drawSourceNib) {
              drawGlowNib(srcWorldToScreen(lastW, leftB), palette.srcNode);
            }
            if (drawTwinNib) {
              const overlayC = st.stageMode === 'overlay' ? polygonCentroid(activeStrokeRef.current) : undefined;
              const curTw = transformPoint(lastW, {
                stageMode: st.stageMode,
                twin: st.twin,
                splitTwinOffset: st.splitTwinOffset,
                homothetyCenter: st.homothetyCenter,
                overlayCentroid: overlayC,
              });
              drawGlowNib(twinWorldToScreen(curTw, leftB, rightB), st.twin.colorHex);
            }
          }
        };

        // ---------------------------------------------------------------------
        // Stage Compositing
        // ---------------------------------------------------------------------
        if (st.stageMode !== 'split') {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(leftB.x + 1.5, leftB.y + 1.5, leftB.w - 3, leftB.h - 3, 15);
          ctx.clip();

          if (st.stageMode === 'homothety') {
            const oS = srcWorldToScreen(st.homothetyCenter, leftB);
            if (st.guides.showRays && pts.length > 0) {
              ctx.save();
              ctx.strokeStyle = hexToRgba(palette.gold, 0.65);
              ctx.lineWidth = 1.2;
              ctx.setLineDash([5, 5]);
              const indices =
                pts.length <= 12
                  ? pts.map((_, idx) => idx)
                  : Array.from({ length: 10 }, (_, idx) => Math.round((idx * (pts.length - 1)) / 9));
              const pureDilation =
                Math.abs(st.twin.rotationDeg) < 0.5 && !st.twin.flipX && !st.twin.flipY;

              for (const i of indices) {
                const ps = srcWorldToScreen(pts[i], leftB);
                const pt = srcWorldToScreen(twinPts[i], leftB);
                ctx.beginPath();
                if (pureDilation) {
                  if (getSignedScale(st.twin) < 0) {
                    ctx.moveTo(ps.x, ps.y);
                    ctx.lineTo(pt.x, pt.y);
                  } else {
                    const far = dist(oS, ps) >= dist(oS, pt) ? ps : pt;
                    ctx.moveTo(oS.x, oS.y);
                    ctx.lineTo(far.x, far.y);
                  }
                } else {
                  ctx.moveTo(oS.x, oS.y);
                  ctx.lineTo(ps.x, ps.y);
                  ctx.moveTo(oS.x, oS.y);
                  ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                if (i === hoverVertexRef.current) {
                  ctx.save();
                  ctx.setLineDash([]);
                  ctx.strokeStyle = palette.gold;
                  ctx.lineWidth = 2.1;
                  ctx.beginPath();
                  ctx.moveTo(oS.x, oS.y);
                  ctx.lineTo(ps.x, ps.y);
                  ctx.moveTo(oS.x, oS.y);
                  ctx.lineTo(pt.x, pt.y);
                  ctx.stroke();
                  ctx.restore();
                }
              }
              ctx.restore();
            }

            // Center O marker
            ctx.save();
            ctx.fillStyle = hexToRgba(palette.gold, 0.22);
            ctx.beginPath();
            ctx.arc(oS.x, oS.y, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = palette.boardBg;
            ctx.strokeStyle = palette.gold;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(oS.x, oS.y, 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = palette.gold;
            ctx.beginPath();
            ctx.arc(oS.x, oS.y, 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '600 11px "IBM Plex Mono", monospace';
            ctx.fillText('O (Center)', oS.x + 12, oS.y - 10);
            ctx.restore();
          }

          drawTwin();
          drawSource(leftB);
          drawLiveNibs(true, true);
          ctx.restore();
        } else {
          // Split Artboards Mode
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(leftB.x + 1.5, leftB.y + 1.5, leftB.w - 3, leftB.h - 3, 15);
          ctx.clip();
          drawSource(leftB);
          drawLiveNibs(true, false);
          ctx.restore();

          if (rightB) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rightB.x + 1.5, rightB.y + 1.5, rightB.w - 3, rightB.h - 3, 15);
            ctx.clip();
            drawTwin();
            drawLiveNibs(false, true);
            ctx.restore();
          }
        }

        ctx.restore();
      },
      [
        size.width,
        size.height,
        themeMode,
        zoom,
        pan,
        selectedVertexIdx,
        getBoardRects,
        srcWorldToScreen,
        screenToSrcWorld,
        twinWorldToScreen,
        getActiveSource,
        getTwinBboxHandles,
      ],
    );

    // ResizeObserver for crisp HiDPI canvas sizing
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const obs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 10 && height > 10) {
            setSize({ width: Math.floor(width), height: Math.floor(height) });
          }
        }
      });
      obs.observe(el);
      return () => obs.disconnect();
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(size.width * dpr);
      canvas.height = Math.floor(size.height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderCanvas(ctx, size.width, size.height, false);
      }
    }, [size, state, themeMode, zoom, pan, selectedVertexIdx, renderCanvas]);

    // Imperative API for Export & Camera
    useImperativeHandle(ref, () => ({
      exportPng: () => {
        const dpr = 2;
        const off = document.createElement('canvas');
        off.width = size.width * dpr;
        off.height = size.height * dpr;
        const octx = off.getContext('2d');
        if (!octx) return;
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderCanvas(octx, size.width, size.height, true);
        off.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'similitude-studio.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
      },
      resetCamera: () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        onSetSplitOffset({ x: 0, y: 0 });
      },
      getViewportInfo: () => ({
        width: size.width,
        height: size.height,
        zoom,
        pan,
      }),
    }));

    const finishPendingPolygon = useCallback(() => {
      if (!isPolyDrawingRef.current) return;
      const pts = polyPointsRef.current;
      if (pts.length >= 3) {
        onCommitShape({ points: pts.map((p) => ({ ...p })), isClosed: true, isSmooth: false });
      } else if (pts.length === 2) {
        onCommitShape({ points: pts.map((p) => ({ ...p })), isClosed: false, isSmooth: false });
      }
      isPolyDrawingRef.current = false;
      polyPointsRef.current = [];
      setPolyUI({ active: false, count: 0 });
      renderCanvas();
    }, [onCommitShape, renderCanvas]);

    const undoPendingPolygonPoint = useCallback(() => {
      if (!isPolyDrawingRef.current || polyPointsRef.current.length === 0) return;
      polyPointsRef.current.pop();
      const count = polyPointsRef.current.length;
      if (count === 0) isPolyDrawingRef.current = false;
      setPolyUI({ active: count > 0, count });
      renderCanvas();
    }, [renderCanvas]);

    const cancelPendingPolygon = useCallback(() => {
      if (!isPolyDrawingRef.current) return;
      isPolyDrawingRef.current = false;
      polyPointsRef.current = [];
      setPolyUI({ active: false, count: 0 });
      renderCanvas();
    }, [renderCanvas]);

    const finishPolyRef = useRef(finishPendingPolygon);
    finishPolyRef.current = finishPendingPolygon;
    const undoPolyRef = useRef(undoPendingPolygonPoint);
    undoPolyRef.current = undoPendingPolygonPoint;
    const cancelPolyRef = useRef(cancelPendingPolygon);
    cancelPolyRef.current = cancelPendingPolygon;

    // Keyboard shortcuts for Spacebar pan & pending polygon finish/cancel
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.code === 'Space') {
          spaceDownRef.current = true;
          setCursorClass('cursor-grab');
        } else if (e.key === 'Backspace' && isPolyDrawingRef.current) {
          undoPolyRef.current();
        } else if (e.key === 'Escape' && isPolyDrawingRef.current) {
          cancelPolyRef.current();
        } else if (e.key === 'Enter' && isPolyDrawingRef.current) {
          finishPolyRef.current();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          spaceDownRef.current = false;
          setCursorClass('cursor-crosshair');
        }
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, []);

    const findHitVertex = (
      pos: Point,
      leftB: BoardRect,
      rightB: BoardRect | null,
      checkTwin: boolean,
      hitRadius = 13,
    ): number => {
      const pts = stateRef.current.shape.points;
      let bestIdx = -1;
      let bestD = hitRadius;
      for (let i = 0; i < pts.length; i++) {
        const sp = srcWorldToScreen(pts[i], leftB);
        const d = dist(pos, sp);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      if (checkTwin && bestIdx < 0 && pts.length > 0) {
        const twinPts = transformPoints(pts, {
          stageMode: stateRef.current.stageMode,
          twin: stateRef.current.twin,
          splitTwinOffset: stateRef.current.splitTwinOffset,
          homothetyCenter: stateRef.current.homothetyCenter,
        });
        for (let i = 0; i < twinPts.length; i++) {
          const sp = twinWorldToScreen(twinPts[i], leftB, rightB);
          const d = dist(pos, sp);
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
      }
      return bestIdx;
    };

    const findHitMidpoint = (
      pos: Point,
      leftB: BoardRect,
      hitRadius = 13,
    ): { edgeIdx: number; point: Point } | null => {
      const st = stateRef.current;
      const pts = st.shape.points;
      if (pts.length < 2 || pts.length > 20) return null;
      const edgeCount = st.shape.isClosed ? pts.length : pts.length - 1;
      let best: { edgeIdx: number; point: Point } | null = null;
      let bestD = hitRadius;
      for (let i = 0; i < edgeCount; i++) {
        const j = (i + 1) % pts.length;
        const midW = { x: 0.5 * (pts[i].x + pts[j].x), y: 0.5 * (pts[i].y + pts[j].y) };
        const d = dist(pos, srcWorldToScreen(midW, leftB));
        if (d < bestD) {
          bestD = d;
          best = { edgeIdx: i, point: midW };
        }
      }
      return best;
    };

    const updateHoverState = (pos: Point, leftB: BoardRect, rightB: BoardRect | null, hitMult = 1) => {
      const st = stateRef.current;
      const pts = st.shape.points;
      hoverVertexRef.current = -1;
      hoverEdgeRef.current = -1;
      hoverMidpointRef.current = null;

      if (pts.length < 2) {
        onHoverNoteChange('');
        return;
      }

      if (pts.length <= 28 || st.activeTool === 'edit') {
        const hitV = findHitVertex(pos, leftB, rightB, true, 12.5 * hitMult);
        if (hitV >= 0) {
          hoverVertexRef.current = hitV;
          const lbl = vertexName(hitV);
          const angles = st.shape.isClosed && pts.length >= 3 ? interiorAnglesDeg(pts) : [];
          if (angles.length > hitV) {
            onHoverNoteChange(`Vertex ${lbl} ↔ ${lbl}′ · ∠${lbl} = ∠${lbl}′ = ${angles[hitV].toFixed(1)}°`);
          } else {
            onHoverNoteChange(`Vertex ${lbl} ↔ ${lbl}′`);
          }
          return;
        }
      }

      const edgeCount = st.shape.isClosed ? pts.length : pts.length - 1;
      const twinPts = transformPoints(pts, {
        stageMode: st.stageMode,
        twin: st.twin,
        splitTwinOffset: st.splitTwinOffset,
        homothetyCenter: st.homothetyCenter,
      });

      let bestEdge = -1;
      let bestD = 9.5 * hitMult;
      for (let i = 0; i < edgeCount; i++) {
        const j = (i + 1) % pts.length;
        const dSrc = pointToSegmentDistance(pos, srcWorldToScreen(pts[i], leftB), srcWorldToScreen(pts[j], leftB)).distance;
        if (dSrc < bestD) {
          bestD = dSrc;
          bestEdge = i;
          if (st.activeTool === 'edit' && pts.length <= 20) {
            hoverMidpointRef.current = {
              edgeIdx: i,
              point: { x: 0.5 * (pts[i].x + pts[j].x), y: 0.5 * (pts[i].y + pts[j].y) },
            };
          }
        }
        const dTw = pointToSegmentDistance(
          pos,
          twinWorldToScreen(twinPts[i], leftB, rightB),
          twinWorldToScreen(twinPts[j], leftB, rightB),
        ).distance;
        if (dTw < bestD) {
          bestD = dTw;
          bestEdge = i;
          hoverMidpointRef.current = null;
        }
      }

      if (bestEdge >= 0) {
        hoverEdgeRef.current = bestEdge;
        const j = (bestEdge + 1) % pts.length;
        const lenSrc = dist(pts[bestEdge], pts[j]);
        const ak = Math.abs(getSignedScale(st.twin));
        const lenTw = lenSrc * ak;
        const la = vertexName(bestEdge);
        const lb = vertexName(j);
        onHoverNoteChange(`Side ${la}${lb}: ${lenSrc.toFixed(1)} → ${la}′${lb}′: ${lenTw.toFixed(1)} (×${ak.toFixed(2)})`);
        return;
      }

      onHoverNoteChange('');
    };

    const getCanvasPos = (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const startPinchGesture = () => {
      const pts = Array.from(activePointersRef.current.values());
      if (pts.length < 2) return;
      const [p1, p2] = pts;
      const mid = { x: 0.5 * (p1.x + p2.x), y: 0.5 * (p1.y + p2.y) };
      const d = Math.max(12, dist(p1, p2));
      const { left: leftB, right: rightB } = getBoardRects(size.width, size.height, stateRef.current.stageMode);
      const inRight =
        rightB &&
        mid.x >= rightB.x &&
        mid.x <= rightB.x + rightB.w &&
        mid.y >= rightB.y &&
        mid.y <= rightB.y + rightB.h;
      const board = inRight && rightB ? rightB : leftB;
      pinchRef.current = {
        dist: d,
        mid,
        zoom: zoomRef.current,
        pan: { ...panRef.current },
        board,
      };
      // Abort accidental single-finger stroke when second finger arrives for pinch-zoom
      isBrushingRef.current = false;
      activeStrokeRef.current = [];
      dragKindRef.current = null;
      dragVertexIdxRef.current = -1;
      activePointerIdRef.current = null;
      renderCanvas();
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      mouseScreenRef.current = pos;
      mouseInsideRef.current = true;
      const isTouch = e.pointerType === 'touch';
      const hitMult = isTouch ? 1.9 : 1;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable in synthetic test environments
      }

      activePointersRef.current.set(e.pointerId, pos);
      if (activePointersRef.current.size >= 2) {
        startPinchGesture();
        return;
      }

      activePointerIdRef.current = e.pointerId;
      const st = stateRef.current;
      const { left: leftB, right: rightB } = getBoardRects(size.width, size.height, st.stageMode);

      if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
        dragKindRef.current = 'pan';
        dragStartScreenRef.current = pos;
        dragInitialPanRef.current = { ...pan };
        setCursorClass('cursor-grabbing');
        return;
      }

      if (e.button === 2) {
        if (isPolyDrawingRef.current) {
          finishPendingPolygon();
          return;
        }
        if (st.activeTool === 'edit' && st.shape.points.length > (st.shape.isClosed ? 3 : 2)) {
          const hit = findHitVertex(pos, leftB, rightB, false, 13 * hitMult);
          if (hit >= 0) {
            const nextPts = st.shape.points.filter((_, idx) => idx !== hit);
            onCommitShape({ ...st.shape, points: nextPts });
            hoverVertexRef.current = -1;
            setSelectedVertexIdx(-1);
            return;
          }
        }
        return;
      }

      if (e.button !== 0 && !isTouch) return;

      // 1. Homothety Center O drag
      if (st.stageMode === 'homothety') {
        const oS = srcWorldToScreen(st.homothetyCenter, leftB);
        if (dist(pos, oS) <= 15 * hitMult) {
          dragKindRef.current = 'homothety_o';
          dragStartWorldRef.current = screenToSrcWorld(pos, leftB);
          dragInitialORef.current = { ...st.homothetyCenter };
          setCursorClass('cursor-grabbing');
          return;
        }
      }

      // 2. Twin direct-manipulation handles
      const active = getActiveSource();
      if (active.points.length >= 2 && !isBrushingRef.current && !isPolyDrawingRef.current) {
        const twinPts = transformPoints(active.points, {
          stageMode: st.stageMode,
          twin: st.twin,
          splitTwinOffset: st.splitTwinOffset,
          homothetyCenter: st.homothetyCenter,
        });
        const inRightBoard =
          rightB !== null &&
          pos.x >= rightB.x &&
          pos.x <= rightB.x + rightB.w &&
          pos.y >= rightB.y &&
          pos.y <= rightB.y + rightB.h;
        const inTwinZone = inRightBoard || st.activeTool === 'move';

        if (st.guides.showHandles && twinPts.length >= 2 && inTwinZone) {
          const { bbox, corners, rotHandle } = getTwinBboxHandles(twinPts, leftB, rightB);
          const centerPt = { x: bbox.x + bbox.w * 0.5, y: bbox.y + bbox.h * 0.5 };
          if (dist(pos, rotHandle) <= 12 * hitMult) {
            dragKindRef.current = 'twin_rotate';
            dragRefCenterRef.current = centerPt;
            dragInitialRotRef.current = st.twin.rotationDeg;
            dragInitialAngRef.current = (Math.atan2(pos.y - centerPt.y, pos.x - centerPt.x) * 180) / Math.PI;
            return;
          }
          for (const c of corners) {
            if (dist(pos, c) <= 11 * hitMult) {
              dragKindRef.current = 'twin_scale';
              dragRefCenterRef.current = centerPt;
              dragInitialKRef.current = st.twin.scaleMag;
              dragInitialDistRef.current = Math.max(8, dist(pos, centerPt));
              return;
            }
          }
        }

        if (st.stageMode === 'split' && (inRightBoard || st.activeTool === 'move')) {
          updateHoverState(pos, leftB, rightB, hitMult);
          dragKindRef.current = 'twin_move';
          dragStartWorldRef.current = screenToTwinWorld(pos, leftB, rightB);
          dragInitialOffsetRef.current = { ...st.splitTwinOffset };
          setCursorClass('cursor-grabbing');
          return;
        }
      }

      if (st.activeTool === 'move') {
        if (st.stageMode === 'homothety') {
          dragKindRef.current = 'homothety_o';
          dragStartWorldRef.current = screenToSrcWorld(pos, leftB);
          dragInitialORef.current = { ...st.homothetyCenter };
        } else {
          dragKindRef.current = 'pan';
          dragStartScreenRef.current = pos;
          dragInitialPanRef.current = { ...pan };
        }
        setCursorClass('cursor-grabbing');
        return;
      }

      // 3. Edit Nodes (works seamlessly with tap + drag on mobile!)
      if (st.activeTool === 'edit') {
        if (st.shape.points.length === 0) return;
        const hitV = findHitVertex(pos, leftB, rightB, false, 13.5 * hitMult);
        if (hitV >= 0) {
          onCommitShape(st.shape); // push undo snapshot prior to live drag
          setSelectedVertexIdx(hitV);
          updateHoverState(pos, leftB, rightB, hitMult);
          dragKindRef.current = 'vertex';
          dragVertexIdxRef.current = hitV;
          setCursorClass('cursor-grabbing');
          return;
        }
        const midHit = hoverMidpointRef.current ?? findHitMidpoint(pos, leftB, 14 * hitMult);
        if (midHit) {
          const { edgeIdx, point } = midHit;
          const nextPts = [...st.shape.points];
          nextPts.splice(edgeIdx + 1, 0, { ...point });
          onCommitShape({ ...st.shape, points: nextPts });
          setSelectedVertexIdx(edgeIdx + 1);
          dragKindRef.current = 'vertex';
          dragVertexIdxRef.current = edgeIdx + 1;
          hoverMidpointRef.current = null;
          return;
        }
        setSelectedVertexIdx(-1);
        updateHoverState(pos, leftB, rightB, hitMult);
        return;
      }

      // Split mode drawing restricted to Left Artboard
      if (
        st.stageMode === 'split' &&
        (pos.x < leftB.x || pos.x > leftB.x + leftB.w || pos.y < leftB.y || pos.y > leftB.y + leftB.h)
      ) {
        return;
      }

      const worldP = screenToSrcWorld(pos, leftB);

      if (st.activeTool === 'brush') {
        isBrushingRef.current = true;
        activeStrokeRef.current = [worldP];
        hoverVertexRef.current = -1;
        hoverEdgeRef.current = -1;
        onHoverNoteChange('');
        renderCanvas();
        return;
      }

      if (st.activeTool === 'polygon') {
        if (!isPolyDrawingRef.current) {
          isPolyDrawingRef.current = true;
          polyPointsRef.current = [worldP];
          setPolyUI({ active: true, count: 1 });
        } else {
          if (polyPointsRef.current.length >= 3) {
            const p0S = srcWorldToScreen(polyPointsRef.current[0], leftB);
            if (dist(pos, p0S) <= 15 * hitMult) {
              finishPendingPolygon();
              return;
            }
          }
          const ez = effectiveZoom(leftB, zoom);
          const last = polyPointsRef.current[polyPointsRef.current.length - 1];
          if (dist(last, worldP) > 2 / ez) {
            polyPointsRef.current.push(worldP);
            setPolyUI({ active: true, count: polyPointsRef.current.length });
          }
        }
        renderCanvas();
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      mouseScreenRef.current = pos;
      mouseInsideRef.current = true;
      const isTouch = e.pointerType === 'touch';
      const hitMult = isTouch ? 1.9 : 1;

      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, pos);
      }

      // Two-finger pinch-zoom & pan
      if (activePointersRef.current.size >= 2 && pinchRef.current) {
        const pts = Array.from(activePointersRef.current.values());
        const [p1, p2] = pts;
        const mid = { x: 0.5 * (p1.x + p2.x), y: 0.5 * (p1.y + p2.y) };
        const d = Math.max(12, dist(p1, p2));
        const base = pinchRef.current;
        const nextZoom = Math.max(0.35, Math.min(3.8, base.zoom * (d / base.dist)));
        const worldAtStart = screenToSrcWorld(base.mid, base.board, base.zoom, base.pan);
        const ezNext = effectiveZoom(base.board, nextZoom);
        setZoom(nextZoom);
        setPan({
          x: (mid.x - (base.board.x + base.board.w * 0.5)) / ezNext - worldAtStart.x,
          y: (mid.y - (base.board.y + base.board.h * 0.5 + boardCenterOffsetY(base.board))) / ezNext - worldAtStart.y,
        });
        return;
      }

      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }

      const st = stateRef.current;
      const { left: leftB, right: rightB } = getBoardRects(size.width, size.height, st.stageMode);

      if (dragKindRef.current === 'pan') {
        const ez = effectiveZoom(leftB, zoom);
        setPan({
          x: dragInitialPanRef.current.x + (pos.x - dragStartScreenRef.current.x) / ez,
          y: dragInitialPanRef.current.y + (pos.y - dragStartScreenRef.current.y) / ez,
        });
        return;
      }

      if (dragKindRef.current === 'homothety_o') {
        const cur = screenToSrcWorld(pos, leftB);
        onSetHomothetyCenter({
          x: dragInitialORef.current.x + (cur.x - dragStartWorldRef.current.x),
          y: dragInitialORef.current.y + (cur.y - dragStartWorldRef.current.y),
        });
        return;
      }

      if (dragKindRef.current === 'twin_move') {
        const cur = screenToTwinWorld(pos, leftB, rightB);
        onSetSplitOffset({
          x: dragInitialOffsetRef.current.x + (cur.x - dragStartWorldRef.current.x),
          y: dragInitialOffsetRef.current.y + (cur.y - dragStartWorldRef.current.y),
        });
        return;
      }

      if (dragKindRef.current === 'twin_scale') {
        const d = Math.max(4, dist(pos, dragRefCenterRef.current));
        let newK = dragInitialKRef.current * (d / dragInitialDistRef.current);
        if (e.shiftKey) newK = Math.round(newK / 0.05) * 0.05;
        onUpdateTwin({ scaleMag: Math.max(0.1, Math.min(2.5, newK)) });
        return;
      }

      if (dragKindRef.current === 'twin_rotate') {
        const ang = (Math.atan2(pos.y - dragRefCenterRef.current.y, pos.x - dragRefCenterRef.current.x) * 180) / Math.PI;
        let newRot = dragInitialRotRef.current + (ang - dragInitialAngRef.current);
        newRot = ((((newRot + 180) % 360) + 360) % 360) - 180;
        if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
        onUpdateTwin({ rotationDeg: newRot });
        return;
      }

      if (dragKindRef.current === 'vertex' && dragVertexIdxRef.current >= 0) {
        const wp = screenToSrcWorld(pos, leftB);
        const nextPts = st.shape.points.map((p, idx) => (idx === dragVertexIdxRef.current ? wp : p));
        onLiveShapeMutate({ ...st.shape, points: nextPts });
        return;
      }

      if (isBrushingRef.current) {
        const ez = effectiveZoom(leftB, zoom);
        const wp = screenToSrcWorld(pos, leftB);
        const stroke = activeStrokeRef.current;
        if (stroke.length === 0 || dist(stroke[stroke.length - 1], wp) >= 3.5 / ez) {
          stroke.push(wp);
          renderCanvas();
        }
        return;
      }

      if (isPolyDrawingRef.current) {
        renderCanvas();
        return;
      }

      if (!isTouch) {
        updateHoverState(pos, leftB, rightB, hitMult);
        if (st.activeTool === 'edit' || st.activeTool === 'move') {
          setCursorClass(hoverVertexRef.current >= 0 || hoverMidpointRef.current ? 'cursor-pointer' : 'cursor-grab');
        } else {
          setCursorClass('cursor-crosshair');
        }
        renderCanvas();
      }
    };

    const finishPointerInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
      activePointersRef.current.delete(e.pointerId);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }

      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (e.pointerId === activePointerIdRef.current) {
        activePointerIdRef.current = null;
      }

      if (e.pointerType === 'touch') {
        mouseInsideRef.current = false;
      }

      if (isBrushingRef.current) {
        isBrushingRef.current = false;
        const stroke = activeStrokeRef.current;
        if (stroke.length >= 3) {
          onCommitShape({
            points: stroke.map((p) => ({ ...p })),
            isClosed: stateRef.current.guides.autoCloseFreehand,
            isSmooth: true,
          });
        } else if (stroke.length === 2) {
          onCommitShape({
            points: stroke.map((p) => ({ ...p })),
            isClosed: false,
            isSmooth: false,
          });
        }
        activeStrokeRef.current = [];
        renderCanvas();
        return;
      }

      if (dragKindRef.current !== null) {
        dragKindRef.current = null;
        dragVertexIdxRef.current = -1;
        setCursorClass(stateRef.current.activeTool === 'move' ? 'cursor-grab' : 'cursor-crosshair');
      }
      renderCanvas();
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextZoom = Math.max(0.35, Math.min(3.8, zoom * factor));
      if (Math.abs(nextZoom - zoom) < 1e-5) return;
      const pos = getCanvasPos(e);
      const { left: leftB, right: rightB } = getBoardRects(size.width, size.height);
      const inRight = rightB && pos.x >= rightB.x && pos.x <= rightB.x + rightB.w && pos.y >= rightB.y && pos.y <= rightB.y + rightB.h;
      const b = inRight && rightB ? rightB : leftB;
      const worldBefore = screenToSrcWorld(pos, b, zoom, pan);
      const ezNext = effectiveZoom(b, nextZoom);
      setZoom(nextZoom);
      setPan({
        x: (pos.x - (b.x + b.w * 0.5)) / ezNext - worldBefore.x,
        y: (pos.y - (b.y + b.h * 0.5 + boardCenterOffsetY(b))) / ezNext - worldBefore.y,
      });
    };

    const presets = getSpecimenPresets();
    const quickChips = [presets[0], presets[1], presets[3]];
    const isEmpty = state.shape.points.length === 0 && !isBrushingRef.current && !isPolyDrawingRef.current;
    const leftBoard = getBoardRects(size.width, size.height, state.stageMode).left;
    const minVerts = state.shape.isClosed ? 3 : 2;
    const canDeleteSelectedVertex =
      state.activeTool === 'edit' && selectedVertexIdx >= 0 && state.shape.points.length > minVerts;

    return (
      <div
        ref={containerRef}
        className="relative flex-none h-[490px] sm:h-[540px] lg:flex-1 lg:h-full overflow-hidden select-none"
      >
        <canvas
          ref={canvasRef}
          data-testid="studio-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          onDoubleClick={finishPendingPolygon}
          onContextMenu={(e) => e.preventDefault()}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch' && dragKindRef.current === null && !isBrushingRef.current) {
              mouseInsideRef.current = false;
              hoverVertexRef.current = -1;
              hoverEdgeRef.current = -1;
              hoverMidpointRef.current = null;
              onHoverNoteChange('');
              renderCanvas();
            }
          }}
          onWheel={handleWheel}
          className={`block w-full h-full touch-none ${cursorClass}`}
        />

        {/* Top-right Zoom / Fit control */}
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            onSetSplitOffset({ x: 0, y: 0 });
          }}
          title="Reset camera zoom & center"
          className="absolute top-3.5 right-4 sm:top-5 sm:right-7 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white text-[11px] font-mono-tabular font-medium shadow-xs cursor-pointer transition-colors"
        >
          {Math.round(zoom * 100)}% · Fit
        </button>

        {/* Empty State Interactive Invitation inside Left Artboard */}
        {isEmpty && (
          <div
            style={{
              left: leftBoard.x,
              top: leftBoard.y,
              width: leftBoard.w,
              height: leftBoard.h,
            }}
            className="pointer-events-none absolute flex flex-col items-center justify-center p-4 sm:p-6 text-center"
          >
            <div className="max-w-sm space-y-2 sm:space-y-3">
              <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                Draw any shape to see its Similar Twin live
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Sketch with Brush, tap vertices with Polygon, or load a specimen:
              </p>
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 pt-0.5">
                {quickChips.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onLoadPreset(preset)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {preset.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Contextual Touch/Desktop Action Pill for Active Polygon or Selected Vertex */}
        {(polyUI.active || canDeleteSelectedVertex) && (
          <div className="absolute bottom-[98px] sm:bottom-[68px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-md whitespace-nowrap">
            {polyUI.active ? (
              <>
                <span className="text-[11px] font-mono-tabular font-medium text-slate-500 dark:text-slate-400 px-1">
                  {polyUI.count} pt{polyUI.count === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={undoPendingPolygonPoint}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Undo Pt
                </button>
                {polyUI.count >= 2 && (
                  <button
                    type="button"
                    onClick={finishPendingPolygon}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-sky-500 dark:hover:bg-sky-400 text-xs font-semibold text-white dark:text-slate-950 cursor-pointer"
                  >
                    Finish
                  </button>
                )}
                <button
                  type="button"
                  onClick={cancelPendingPolygon}
                  className="px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-mono-tabular font-medium text-slate-700 dark:text-slate-200 px-1">
                  Vertex {vertexName(selectedVertexIdx)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextPts = state.shape.points.filter((_, idx) => idx !== selectedVertexIdx);
                    onCommitShape({ ...state.shape, points: nextPts });
                    hoverVertexRef.current = -1;
                    setSelectedVertexIdx(-1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/70 text-xs font-semibold text-red-700 dark:text-red-300 cursor-pointer"
                >
                  Delete Node
                </button>
              </>
            )}
          </div>
        )}

        {/* Floating Bottom Workspace Dock (2 compact rows on mobile < sm, 1 sleek row on sm+) */}
        <div
          role="toolbar"
          aria-label="Drawing and workspace tools"
          className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 flex flex-col sm:flex-row items-center gap-1 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-md w-[calc(100%-24px)] sm:w-auto max-w-[calc(100%-24px)]"
        >
          <div className="flex items-center justify-center gap-1 w-full sm:w-auto">
            {[
              { id: 'brush' as const, label: 'Brush', Icon: PenTool, title: 'Freehand Sketch (B)' },
              { id: 'polygon' as const, label: 'Polygon', Icon: Hexagon, title: 'Vertex Polygon (P)' },
              { id: 'edit' as const, label: 'Nodes', Icon: MousePointer2, title: 'Edit Vertices (E)' },
              { id: 'move' as const, label: 'Twin', Icon: Move, title: 'Drag Twin / Center O (M)' },
            ].map(({ id, label, Icon, title }) => {
              const active = state.activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={title}
                  aria-pressed={active}
                  onClick={() => {
                    if (id !== 'polygon' && isPolyDrawingRef.current) finishPendingPolygon();
                    onSetTool(id);
                  }}
                  className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" aria-hidden="true" />

          <div className="flex items-center justify-between sm:justify-center gap-1 w-full sm:w-auto border-t sm:border-t-0 border-slate-100 dark:border-slate-800 pt-1 sm:pt-0">
            <button
              type="button"
              title="Auto-Close Freehand Strokes"
              aria-label="Auto-Close Freehand Strokes"
              aria-pressed={state.guides.autoCloseFreehand}
              onClick={onToggleAutoClose}
              className={`p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
                state.guides.autoCloseFreehand
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Simplify freehand stroke into clean polygon vertices"
              onClick={onPolygonize}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Polygonize</span>
            </button>

            <button
              type="button"
              title="Animate Similarity Scale Morph (T)"
              aria-pressed={isAnimating}
              onClick={onToggleAnimate}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isAnimating
                  ? 'bg-blue-600 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {isAnimating ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{isAnimating ? 'Pause' : 'Morph'}</span>
            </button>

            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" aria-hidden="true" />

            <button
              type="button"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              title="Toggle Light / Obsidian Theme"
              aria-label="Toggle Light or Dark Theme"
              onClick={onToggleTheme}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>

            <button
              type="button"
              title="Clear Canvas (Delete)"
              aria-label="Clear Canvas"
              onClick={() => {
                isBrushingRef.current = false;
                isPolyDrawingRef.current = false;
                activeStrokeRef.current = [];
                polyPointsRef.current = [];
                setPolyUI({ active: false, count: 0 });
                setSelectedVertexIdx(-1);
                onClear();
              }}
              className="p-2 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-300 dark:hover:text-red-400 dark:hover:bg-red-950/50 transition-colors shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  },
);

StudioCanvas.displayName = 'StudioCanvas';
