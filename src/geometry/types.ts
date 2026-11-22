export interface Point {
  x: number;
  y: number;
}

export type StageMode = 'split' | 'homothety' | 'overlay';
export type ToolMode = 'brush' | 'polygon' | 'edit' | 'move';
export type FillMode = 'wash' | 'gradient' | 'solid' | 'hatch' | 'wire';
export type DashStyle = 'solid' | 'dashed' | 'dotted';
export type ThemeMode = 'light' | 'dark';

export interface ShapeSnapshot {
  points: Point[];
  isClosed: boolean;
  isSmooth: boolean;
}

export interface TwinSettings {
  scaleMag: number;
  invertSign: boolean;
  rotationDeg: number;
  flipX: boolean;
  flipY: boolean;
  echoCount: number;
  colorHex: string;
  fillMode: FillMode;
  fillOpacity: number;
  strokeWidth: number;
  dashStyle: DashStyle;
}

export interface GuideSettings {
  showLabels: boolean;
  showLengths: boolean;
  showAngles: boolean;
  showRays: boolean;
  showHandles: boolean;
  autoCloseFreehand: boolean;
}

export interface StudioState {
  stageMode: StageMode;
  activeTool: ToolMode;
  shape: ShapeSnapshot;
  twin: TwinSettings;
  guides: GuideSettings;
  splitTwinOffset: Point;
  homothetyCenter: Point;
}

export interface SpecimenPreset {
  id: string;
  name: string;
  subtitle: string;
  points: Point[];
  isClosed: boolean;
  isSmooth: boolean;
}

export type SimilarityVerdict = 'CONGRUENT (≅)' | 'ENLARGEMENT (~)' | 'REDUCTION (~)' | 'INVERTED (~)';

export interface TelemetryMetrics {
  signedScale: number;
  absScale: number;
  areaRatio: number;
  verdict: SimilarityVerdict;
  orientationLabel: string;
  rotationLabel: string;
  sourcePerimeter: number | null;
  twinPerimeter: number | null;
  sourceArea: number | null;
  twinArea: number | null;
  vertexCount: number;
}

export interface SwatchColor {
  name: string;
  hex: string;
}

export const TWIN_SWATCHES: SwatchColor[] = [
  { name: 'Yves Cobalt', hex: '#2563EB' },
  { name: 'Atelier Teal', hex: '#0D9488' },
  { name: 'Vermilion', hex: '#DC2626' },
  { name: 'Electric Iris', hex: '#7C3AED' },
  { name: 'Magenta Ink', hex: '#DB2777' },
  { name: 'Drafting Amber', hex: '#D97706' },
  { name: 'Cerulean', hex: '#0284C7' },
  { name: 'Emerald', hex: '#059669' },
];
