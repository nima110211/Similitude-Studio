import type {
  Point,
  ShapeSnapshot,
  SimilarityVerdict,
  SpecimenPreset,
  StageMode,
  TelemetryMetrics,
  TwinSettings,
} from './types';

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clonePoints(pts: Point[]): Point[] {
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

export function cloneSnapshot(snap: ShapeSnapshot): ShapeSnapshot {
  return {
    points: clonePoints(snap.points),
    isClosed: snap.isClosed,
    isSmooth: snap.isSmooth,
  };
}

export function getSignedScale(twin: Pick<TwinSettings, 'scaleMag' | 'invertSign'>): number {
  return twin.invertSign ? -twin.scaleMag : twin.scaleMag;
}

export function polygonSignedArea(pts: Point[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    acc += p1.x * p2.y - p2.x * p1.y;
  }
  return 0.5 * acc;
}

export function polygonArea(pts: Point[], isClosed = true): number {
  if (!isClosed || pts.length < 3) return 0;
  return Math.abs(polygonSignedArea(pts));
}

export function polygonCentroid(pts: Point[]): Point {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { x: pts[0].x, y: pts[0].y };
  if (n === 2) {
    return {
      x: 0.5 * (pts[0].x + pts[1].x),
      y: 0.5 * (pts[0].y + pts[1].y),
    };
  }

  const signed = polygonSignedArea(pts);
  if (Math.abs(signed) < 1e-3) {
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const cross = p1.x * p2.y - p2.x * p1.y;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }
  const factor = 1 / (6 * signed);
  return { x: cx * factor, y: cy * factor };
}

export function polylineLength(pts: Point[], isClosed = true): number {
  const n = pts.length;
  if (n < 2) return 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    total += dist(pts[i], pts[i + 1]);
  }
  if (isClosed && n >= 3) {
    total += dist(pts[n - 1], pts[0]);
  }
  return total;
}

/**
 * Computes exact interior angles in degrees (0..360) for any simple polygon
 * in Y-down screen coordinates, correctly preserving reflex angles (> 180 deg).
 */
export function interiorAnglesDeg(pts: Point[]): number[] {
  const n = pts.length;
  if (n < 3) return [];
  const signed = polygonSignedArea(pts);
  const cwYDown = signed >= 0;
  const angles: number[] = [];

  for (let i = 0; i < n; i++) {
    const pPrev = pts[(i - 1 + n) % n];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % n];
    const ux = pPrev.x - pCurr.x;
    const uy = pPrev.y - pCurr.y;
    const vx = pNext.x - pCurr.x;
    const vy = pNext.y - pCurr.y;

    if (Math.hypot(ux, uy) < 1e-6 || Math.hypot(vx, vy) < 1e-6) {
      angles.push(0);
      continue;
    }

    const angU = (Math.atan2(uy, ux) * 180) / Math.PI;
    const angV = (Math.atan2(vy, vx) * 180) / Math.PI;
    let sweep = cwYDown ? angU - angV : angV - angU;
    sweep = ((sweep % 360) + 360) % 360;
    angles.push(sweep);
  }
  return angles;
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): { distance: number; projection: Point } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-8) {
    return { distance: dist(p, a), projection: { x: a.x, y: a.y } };
  }
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  return { distance: dist(p, proj), projection: proj };
}

function rdpOpen(pts: Point[], eps: number): Point[] {
  if (pts.length <= 2) return clonePoints(pts);
  const a = pts[0];
  const b = pts[pts.length - 1];
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const { distance } = pointToSegmentDistance(pts[i], a, b);
    if (distance > maxD) {
      maxD = distance;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdpOpen(pts.slice(0, idx + 1), eps);
    const right = rdpOpen(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [{ ...a }, { ...b }];
}

/**
 * Corner-preserving Ramer-Douglas-Peucker simplification for turning rough
 * freehand sketches into crisp labeled polygons.
 */
export function simplifyPolygonRDP(pts: Point[], isClosed: boolean): Point[] {
  if (pts.length <= 4) return clonePoints(pts);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const eps = Math.max(5.5, diag * 0.042);

  if (!isClosed) {
    const res = rdpOpen(pts, eps);
    return res.length >= 2 ? res : clonePoints(pts.slice(0, 2));
  }

  const center = polygonCentroid(pts);
  let startIdx = 0;
  let maxR = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], center);
    if (d > maxR) {
      maxR = d;
      startIdx = i;
    }
  }
  const rotated = pts.slice(startIdx).concat(pts.slice(0, startIdx), [pts[startIdx]]);
  let simplified = rdpOpen(rotated, eps);
  if (simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) < eps) {
    simplified = simplified.slice(0, -1);
  }
  if (simplified.length < 3) {
    const tightEps = Math.max(2.5, diag * 0.018);
    simplified = rdpOpen(rotated, tightEps);
    if (simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) < tightEps) {
      simplified = simplified.slice(0, -1);
    }
  }
  return simplified.length >= 3 ? simplified : clonePoints(pts.slice(0, 3));
}

export function linearTransform(
  v: Point,
  scaleK: number,
  rotDeg: number,
  flipX: boolean,
  flipY: boolean,
): Point {
  const vx = (flipX ? -v.x : v.x) * scaleK;
  const vy = (flipY ? -v.y : v.y) * scaleK;
  if (Math.abs(rotDeg) > 1e-6) {
    const rad = (rotDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
      x: vx * c - vy * s,
      y: vx * s + vy * c,
    };
  }
  return { x: vx, y: vy };
}

export function transformPoint(
  p: Point,
  params: {
    stageMode: StageMode;
    twin: TwinSettings;
    splitTwinOffset: Point;
    homothetyCenter: Point;
    overlayCentroid?: Point;
    scaleOverride?: number;
  },
): Point {
  const k = params.scaleOverride ?? getSignedScale(params.twin);
  const { rotationDeg, flipX, flipY } = params.twin;

  if (params.stageMode === 'split') {
    const tp = linearTransform(p, k, rotationDeg, flipX, flipY);
    return {
      x: params.splitTwinOffset.x + tp.x,
      y: params.splitTwinOffset.y + tp.y,
    };
  }
  if (params.stageMode === 'homothety') {
    const o = params.homothetyCenter;
    const tp = linearTransform({ x: p.x - o.x, y: p.y - o.y }, k, rotationDeg, flipX, flipY);
    return { x: o.x + tp.x, y: o.y + tp.y };
  }
  const g = params.overlayCentroid ?? { x: 0, y: 0 };
  const tp = linearTransform({ x: p.x - g.x, y: p.y - g.y }, k, rotationDeg, flipX, flipY);
  return { x: g.x + tp.x, y: g.y + tp.y };
}

export function transformPoints(
  pts: Point[],
  params: {
    stageMode: StageMode;
    twin: TwinSettings;
    splitTwinOffset: Point;
    homothetyCenter: Point;
    scaleOverride?: number;
  },
): Point[] {
  if (pts.length === 0) return [];
  const overlayCentroid = params.stageMode === 'overlay' ? polygonCentroid(pts) : undefined;
  return pts.map((p) =>
    transformPoint(p, {
      ...params,
      overlayCentroid,
    }),
  );
}

export function computeTelemetry(pts: Point[], isClosed: boolean, twin: TwinSettings): TelemetryMetrics {
  const signedScale = getSignedScale(twin);
  const absScale = Math.abs(signedScale);
  const areaRatio = absScale * absScale;

  let verdict: SimilarityVerdict;
  if (twin.invertSign) {
    verdict = 'INVERTED (~)';
  } else if (Math.abs(absScale - 1.0) < 0.008) {
    verdict = 'CONGRUENT (≅)';
  } else if (absScale > 1.0) {
    verdict = 'ENLARGEMENT (~)';
  } else {
    verdict = 'REDUCTION (~)';
  }

  const isMirrored = twin.flipX !== twin.flipY;
  const orientationLabel = isMirrored ? 'Mirrored orientation' : 'Direct orientation';
  const rotationLabel =
    Math.abs(twin.rotationDeg) > 0.5
      ? `Rotated ${twin.rotationDeg > 0 ? '+' : ''}${twin.rotationDeg.toFixed(0)}°`
      : 'Zero rotation';

  const sourcePerimeter = pts.length >= 2 ? polylineLength(pts, isClosed) : null;
  const twinPerimeter = sourcePerimeter !== null ? sourcePerimeter * absScale : null;
  const sourceArea = isClosed && pts.length >= 3 ? polygonArea(pts, true) : null;
  const twinArea = sourceArea !== null ? sourceArea * areaRatio : null;

  return {
    signedScale,
    absScale,
    areaRatio,
    verdict,
    orientationLabel,
    rotationLabel,
    sourcePerimeter,
    twinPerimeter,
    sourceArea,
    twinArea,
    vertexCount: pts.length,
  };
}

export function vertexName(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < alphabet.length) return alphabet[index];
  return `P${index + 1}`;
}

export function formatCompactNumber(val: number): string {
  if (Math.abs(val) >= 10000) return `${(val / 1000).toFixed(1)}k`;
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(2)}k`;
  if (Math.abs(val) >= 100) return `${val.toFixed(0)}`;
  return `${val.toFixed(1)}`;
}

export function getSpecimenPresets(): SpecimenPreset[] {
  const starPts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 === 0 ? 104 : 44;
    starPts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
  }

  const pebblePts: Point[] = [];
  for (let i = 0; i < 14; i++) {
    const ang = (2 * Math.PI * i) / 14;
    const r = 84 + 22 * Math.sin(2 * ang + 0.7) + 14 * Math.cos(3 * ang);
    pebblePts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) * 0.85 });
  }

  return [
    {
      id: 'triangle',
      name: 'Scalene Triangle',
      subtitle: '3 vertices · Classic angle proof',
      points: [
        { x: -95, y: 72 },
        { x: -24, y: -96 },
        { x: 108, y: 56 },
      ],
      isClosed: true,
      isSmooth: false,
    },
    {
      id: 'l-monolith',
      name: 'L-Monolith (Reflex)',
      subtitle: '6 vertices · 270° concave corner',
      points: [
        { x: -86, y: -94 },
        { x: -8, y: -94 },
        { x: -8, y: 22 },
        { x: 94, y: 22 },
        { x: 94, y: 94 },
        { x: -86, y: 94 },
      ],
      isClosed: true,
      isSmooth: false,
    },
    {
      id: 'pentagon',
      name: 'Asymmetric Pentagon',
      subtitle: '5 vertices · Irregular hull',
      points: [
        { x: -10, y: -102 },
        { x: 96, y: -34 },
        { x: 72, y: 88 },
        { x: -64, y: 96 },
        { x: -98, y: -18 },
      ],
      isClosed: true,
      isSmooth: false,
    },
    {
      id: 'star',
      name: 'Nordic Star',
      subtitle: '10 vertices · Radial symmetry',
      points: starPts,
      isClosed: true,
      isSmooth: false,
    },
    {
      id: 'arch',
      name: 'Bauhaus Arch',
      subtitle: '7 vertices · Architectural profile',
      points: [
        { x: -78, y: 92 },
        { x: -78, y: -18 },
        { x: -54, y: -78 },
        { x: 0, y: -102 },
        { x: 54, y: -78 },
        { x: 78, y: -18 },
        { x: 78, y: 92 },
      ],
      isClosed: true,
      isSmooth: false,
    },
    {
      id: 'pebble',
      name: 'Organic Pebble',
      subtitle: 'Smooth spline · Affine invariant',
      points: pebblePts,
      isClosed: true,
      isSmooth: true,
    },
  ];
}
