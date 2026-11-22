import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTelemetry,
  getSpecimenPresets,
  interiorAnglesDeg,
  polygonArea,
  polygonCentroid,
  polylineLength,
  simplifyPolygonRDP,
  transformPoints,
} from './engine';
import type { Point, TwinSettings } from './types';

const DEFAULT_TWIN: TwinSettings = {
  scaleMag: 1.5,
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
};

test('Shoelace area and perimeter scale accurately under similarity (P\'=|k|P, A\'=k^2 A)', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  const srcArea = polygonArea(square, true);
  const srcPerim = polylineLength(square, true);
  assert.equal(srcArea, 10000);
  assert.equal(srcPerim, 400);

  const twinPts = transformPoints(square, {
    stageMode: 'homothety',
    twin: { ...DEFAULT_TWIN, scaleMag: 1.5, rotationDeg: 37, flipX: true },
    splitTwinOffset: { x: 0, y: 0 },
    homothetyCenter: { x: -50, y: 20 },
  });

  const twinArea = polygonArea(twinPts, true);
  const twinPerim = polylineLength(twinPts, true);
  assert.ok(Math.abs(twinArea - 10000 * 2.25) < 1e-4);
  assert.ok(Math.abs(twinPerim - 400 * 1.5) < 1e-4);
});

test('Interior angles preserve reflex 270° corner on L-Monolith and remain invariant under similarity', () => {
  const presets = getSpecimenPresets();
  const lShape = presets.find((p) => p.id === 'l-monolith');
  assert.ok(lShape);

  const srcAngles = interiorAnglesDeg(lShape.points);
  const sumAngles = srcAngles.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumAngles - (lShape.points.length - 2) * 180) < 1e-4);
  assert.ok(srcAngles.some((a) => Math.abs(a - 270) < 1e-4));

  const twinPts = transformPoints(lShape.points, {
    stageMode: 'homothety',
    twin: { ...DEFAULT_TWIN, scaleMag: 0.65, invertSign: true, rotationDeg: 45, flipY: true },
    splitTwinOffset: { x: 0, y: 0 },
    homothetyCenter: { x: 0, y: 0 },
  });

  const twinAngles = interiorAnglesDeg(twinPts);
  srcAngles.forEach((ang, idx) => {
    assert.ok(Math.abs(ang - twinAngles[idx]) < 1e-4);
  });
});

test('Negative scale factor (-k) inverts points through homothety center O', () => {
  const pts: Point[] = [
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
  ];
  const center: Point = { x: 0, y: 0 };
  const inverted = transformPoints(pts, {
    stageMode: 'homothety',
    twin: { ...DEFAULT_TWIN, scaleMag: 2, invertSign: true },
    splitTwinOffset: { x: 0, y: 0 },
    homothetyCenter: center,
  });

  assert.deepEqual(inverted[0], { x: -200, y: 0 });
  assert.deepEqual(inverted[1], { x: -200, y: -100 });
  assert.deepEqual(inverted[2], { x: -100, y: -100 });
});

test('Overlay mode aligns twin centroid with source centroid', () => {
  const tri: Point[] = [
    { x: -40, y: 30 },
    { x: 20, y: -80 },
    { x: 90, y: 40 },
  ];
  const gSrc = polygonCentroid(tri);
  const twinOverlay = transformPoints(tri, {
    stageMode: 'overlay',
    twin: { ...DEFAULT_TWIN, scaleMag: 1.8, rotationDeg: 25 },
    splitTwinOffset: { x: 0, y: 0 },
    homothetyCenter: { x: -200, y: 0 },
  });
  const gTwin = polygonCentroid(twinOverlay);
  assert.ok(Math.hypot(gSrc.x - gTwin.x, gSrc.y - gTwin.y) < 1e-6);
});

test('RDP simplification collapses collinear dense stroke to crisp triangle vertices', () => {
  const dense: Point[] = [];
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 60, y: 110 },
  ];
  for (let side = 0; side < 3; side++) {
    const a = corners[side];
    const b = corners[(side + 1) % 3];
    for (let t = 0; t < 10; t++) {
      const f = t / 10;
      dense.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
  }
  const simplified = simplifyPolygonRDP(dense, true);
  assert.equal(simplified.length, 3);
});

test('Telemetry classifies congruent, enlargement, reduction, and inverted states', () => {
  const tri: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];

  assert.equal(computeTelemetry(tri, true, { ...DEFAULT_TWIN, scaleMag: 1.0 }).verdict, 'CONGRUENT (≅)');
  assert.equal(computeTelemetry(tri, true, { ...DEFAULT_TWIN, scaleMag: 1.5 }).verdict, 'ENLARGEMENT (~)');
  assert.equal(computeTelemetry(tri, true, { ...DEFAULT_TWIN, scaleMag: 0.5 }).verdict, 'REDUCTION (~)');
  assert.equal(computeTelemetry(tri, true, { ...DEFAULT_TWIN, scaleMag: 1.5, invertSign: true }).verdict, 'INVERTED (~)');
});
