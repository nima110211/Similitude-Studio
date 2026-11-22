import React, { useCallback, useRef, useState } from 'react';

interface AngleDialProps {
  angleDeg: number;
  accentColor: string;
  onChange: (deg: number) => void;
}

const QUICK_ANGLES = [-45, 0, 45, 90];

export const AngleDial: React.FC<AngleDialProps> = ({ angleDeg, accentColor, onChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const computeAngleFromEvent = useCallback(
    (clientX: number, clientY: number, snap: boolean) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      if (snap) {
        deg = Math.round(deg / 15) * 15;
      } else {
        deg = Math.round(deg * 2) / 2;
      }
      const norm = ((((deg + 180) % 360) + 360) % 360) - 180;
      onChange(norm);
    },
    [onChange],
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    computeAngleFromEvent(e.clientX, e.clientY, e.shiftKey);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    computeAngleFromEvent(e.clientX, e.clientY, e.shiftKey);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const radius = 32;
  const center = 40;
  const rad = (angleDeg * Math.PI) / 180;
  const tipX = center + Math.cos(rad) * (radius - 6);
  const tipY = center + Math.sin(rad) * (radius - 6);

  // Build SVG arc wedge from 0 deg to angleDeg
  const wedgePath = (() => {
    if (Math.abs(angleDeg) < 0.5) return '';
    const rW = radius - 4;
    const x1 = center + rW;
    const y1 = center;
    const x2 = center + Math.cos(rad) * rW;
    const y2 = center + Math.sin(rad) * rW;
    const largeArc = Math.abs(angleDeg) > 180 ? 1 : 0;
    const sweep = angleDeg >= 0 ? 1 : 0;
    return `M ${center} ${center} L ${x1} ${y1} A ${rW} ${rW} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  })();

  const formattedAngle = `${angleDeg > 0.05 ? '+' : ''}${angleDeg.toFixed(1)}°`;

  return (
    <div className="flex items-center gap-4">
      <svg
        ref={svgRef}
        width={80}
        height={80}
        viewBox="0 0 80 80"
        role="slider"
        aria-label="Twin rotation angle"
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={Math.round(angleDeg)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(angleDeg + (e.shiftKey ? 15 : 5));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(angleDeg - (e.shiftKey ? 15 : 5));
          } else if (e.key === '0') {
            onChange(0);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onChange(0)}
        className="shrink-0 cursor-pointer select-none touch-none focus-visible:outline-2 focus-visible:outline-blue-600 rounded-full"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="fill-slate-100 dark:fill-slate-800/80 stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={1.2}
        />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r0 = radius - (i % 3 === 0 ? 5.5 : 3);
          const r1 = radius - 1.2;
          return (
            <line
              key={i}
              x1={center + Math.cos(a) * r0}
              y1={center + Math.sin(a) * r0}
              x2={center + Math.cos(a) * r1}
              y2={center + Math.sin(a) * r1}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth={1}
            />
          );
        })}
        {wedgePath && <path d={wedgePath} fill={accentColor} fillOpacity={0.18} />}
        <line
          x1={center}
          y1={center}
          x2={tipX}
          y2={tipY}
          stroke={accentColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={tipX} cy={tipY} r={4.2} className="fill-white dark:fill-slate-900" stroke={accentColor} strokeWidth={2} />
        <circle cx={center} cy={center} r={2.6} fill={accentColor} />
      </svg>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Rotation (θ)</span>
          <span className="text-lg font-semibold font-mono-tabular text-slate-900 dark:text-slate-100">
            {formattedAngle}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_ANGLES.map((deg) => {
            const active = Math.abs(angleDeg - deg) < 0.5;
            return (
              <button
                key={deg}
                type="button"
                onClick={() => onChange(deg)}
                className={`py-1 rounded-md text-[11px] font-mono-tabular font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {deg > 0 ? `+${deg}°` : `${deg}°`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
