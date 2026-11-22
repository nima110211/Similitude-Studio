import { getSignedScale, polygonCentroid, transformPoints } from './engine';
import type { Point, StudioState, ThemeMode } from './types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSvgPathD(screenPts: Point[], isClosed: boolean, isSmooth: boolean): string {
  const n = screenPts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${screenPts[0].x.toFixed(2)} ${screenPts[0].y.toFixed(2)}`;

  const parts: string[] = [];
  if (!isSmooth || n < 3) {
    parts.push(`M ${screenPts[0].x.toFixed(2)} ${screenPts[0].y.toFixed(2)}`);
    for (let i = 1; i < n; i++) {
      parts.push(`L ${screenPts[i].x.toFixed(2)} ${screenPts[i].y.toFixed(2)}`);
    }
    if (isClosed && n >= 3) parts.push('Z');
    return parts.join(' ');
  }

  if (isClosed) {
    const startMidX = 0.5 * (screenPts[n - 1].x + screenPts[0].x);
    const startMidY = 0.5 * (screenPts[n - 1].y + screenPts[0].y);
    parts.push(`M ${startMidX.toFixed(2)} ${startMidY.toFixed(2)}`);
    for (let i = 0; i < n; i++) {
      const curr = screenPts[i];
      const nxt = screenPts[(i + 1) % n];
      const mx = 0.5 * (curr.x + nxt.x);
      const my = 0.5 * (curr.y + nxt.y);
      parts.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`);
    }
    parts.push('Z');
  } else {
    parts.push(`M ${screenPts[0].x.toFixed(2)} ${screenPts[0].y.toFixed(2)}`);
    for (let i = 1; i < n - 1; i++) {
      const mx = 0.5 * (screenPts[i].x + screenPts[i + 1].x);
      const my = 0.5 * (screenPts[i].y + screenPts[i + 1].y);
      parts.push(`Q ${screenPts[i].x.toFixed(2)} ${screenPts[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`);
    }
    parts.push(`L ${screenPts[n - 1].x.toFixed(2)} ${screenPts[n - 1].y.toFixed(2)}`);
  }
  return parts.join(' ');
}

export function generateSceneSvg(
  state: StudioState,
  themeMode: ThemeMode,
  width: number,
  height: number,
  zoom: number,
  pan: Point,
): string {
  const isDark = themeMode === 'dark';
  const bg = isDark ? '#0B0F17' : '#F6F7F9';
  const boardBg = isDark ? '#111622' : '#FFFFFF';
  const boardBorder = isDark ? '#1E293B' : '#E2E8F0';
  const textMuted = isDark ? '#64748B' : '#94A3B8';
  const srcStroke = isDark ? '#F8FAFC' : '#111827';
  const srcFill = isDark ? '#FB923C' : '#0F172A';
  const gold = isDark ? '#FBBF24' : '#D97706';

  const padX = 24;
  const padTop = 20;
  const padBot = 24;
  const availW = Math.max(240, width - 2 * padX);
  const availH = Math.max(240, height - padTop - padBot);

  const boards: Array<{ x: number; y: number; w: number; h: number; title: string }> = [];
  if (state.stageMode === 'split') {
    const gutter = 20;
    const bw = (availW - gutter) * 0.5;
    boards.push({ x: padX, y: padTop, w: bw, h: availH, title: '01 SOURCE CANVAS' });
    boards.push({ x: padX + bw + gutter, y: padTop, w: bw, h: availH, title: '02 SIMILAR TWIN' });
  } else {
    const title = state.stageMode === 'homothety' ? 'HOMOTHETY PROJECTION' : 'CENTROID OVERLAY PROOF';
    boards.push({ x: padX, y: padTop, w: availW, h: availH, title });
  }

  const leftB = boards[0];
  const rightB = boards.length > 1 ? boards[1] : boards[0];
  const toScreen = (p: Point, b: { x: number; y: number; w: number; h: number }): Point => ({
    x: b.x + b.w * 0.5 + (p.x + pan.x) * zoom,
    y: b.y + b.h * 0.5 + (p.y + pan.y) * zoom,
  });

  const pts = state.shape.points;
  const twinPts = transformPoints(pts, {
    stageMode: state.stageMode,
    twin: state.twin,
    splitTwinOffset: state.splitTwinOffset,
    homothetyCenter: state.homothetyCenter,
  });

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="100%" height="100%" fill="${bg}"/>`,
  ];

  for (const b of boards) {
    lines.push(
      `  <rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="16" fill="${boardBg}" stroke="${boardBorder}" stroke-width="1.2"/>`,
    );
    lines.push(
      `  <text x="${(b.x + 18).toFixed(1)}" y="${(b.y + 26).toFixed(1)}" font-family="monospace" font-size="11" font-weight="600" fill="${textMuted}">${escapeXml(b.title)}</text>`,
    );
  }

  if (state.stageMode === 'homothety' && state.guides.showRays && pts.length > 0) {
    const oS = toScreen(state.homothetyCenter, leftB);
    for (let i = 0; i < pts.length; i++) {
      const ps = toScreen(pts[i], leftB);
      const pt = toScreen(twinPts[i], leftB);
      lines.push(
        `  <line x1="${oS.x.toFixed(1)}" y1="${oS.y.toFixed(1)}" x2="${ps.x.toFixed(1)}" y2="${ps.y.toFixed(1)}" stroke="${gold}" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.65"/>`,
      );
      lines.push(
        `  <line x1="${oS.x.toFixed(1)}" y1="${oS.y.toFixed(1)}" x2="${pt.x.toFixed(1)}" y2="${pt.y.toFixed(1)}" stroke="${gold}" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.65"/>`,
      );
    }
    lines.push(`  <circle cx="${oS.x.toFixed(1)}" cy="${oS.y.toFixed(1)}" r="5.5" fill="${gold}"/>`);
  }

  if (pts.length > 0) {
    const srcScreen = pts.map((p) => toScreen(p, leftB));
    const dSrc = buildSvgPathD(srcScreen, state.shape.isClosed, state.shape.isSmooth);
    const fillAttr = state.shape.isClosed ? `${srcFill}" fill-opacity="0.09` : 'none';
    lines.push(
      `  <path d="${dSrc}" fill="${fillAttr}" stroke="${srcStroke}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  if (twinPts.length > 0) {
    const tw = state.twin;
    const dashAttr =
      tw.dashStyle === 'dashed'
        ? ' stroke-dasharray="8 6"'
        : tw.dashStyle === 'dotted'
          ? ' stroke-dasharray="2 5"'
          : '';
    const fillOpacity =
      !state.shape.isClosed || tw.fillMode === 'wire'
        ? 0
        : tw.fillMode === 'solid'
          ? Math.min(0.85, tw.fillOpacity * 2)
          : tw.fillOpacity;

    if (tw.echoCount > 1 && twinPts.length >= 3) {
      const cTwin = polygonCentroid(twinPts);
      for (let m = tw.echoCount - 1; m >= 1; m--) {
        const ratio = Math.pow(0.77, m);
        const echoWorld = twinPts.map((p) => ({
          x: cTwin.x + (p.x - cTwin.x) * ratio,
          y: cTwin.y + (p.y - cTwin.y) * ratio,
        }));
        const echoScreen = echoWorld.map((p) => toScreen(p, rightB));
        const dEcho = buildSvgPathD(echoScreen, state.shape.isClosed, state.shape.isSmooth);
        const op = Math.max(0.14, 0.58 * Math.pow(0.72, m));
        lines.push(
          `  <path d="${dEcho}" fill="${tw.colorHex}" fill-opacity="${(fillOpacity * op).toFixed(2)}" stroke="${tw.colorHex}" stroke-opacity="${op.toFixed(2)}" stroke-width="${(tw.strokeWidth * 0.78).toFixed(1)}"${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
    }

    const twinScreen = twinPts.map((p) => toScreen(p, rightB));
    const dTw = buildSvgPathD(twinScreen, state.shape.isClosed, state.shape.isSmooth);
    lines.push(
      `  <path d="${dTw}" fill="${tw.colorHex}" fill-opacity="${fillOpacity.toFixed(2)}" stroke="${tw.colorHex}" stroke-width="${tw.strokeWidth.toFixed(1)}"${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Footer note
  const k = getSignedScale(state.twin);
  lines.push(
    `  <text x="${padX}" y="${height - 8}" font-family="monospace" font-size="10" fill="${textMuted}">Similitude Studio · k = ${k.toFixed(2)}x · k^2 = ${(k * k).toFixed(2)}x</text>`,
  );
  lines.push('</svg>');
  return lines.join('\n');
}

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
