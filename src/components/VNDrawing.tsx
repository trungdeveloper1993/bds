/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { calculateCartesianDistance } from '../utils';
import { HelpCircle, Sliders, ZoomIn, ZoomOut, Maximize2, Hand } from 'lucide-react';

interface VNDrawingProps {
  points: { id: string; x: number; y: number; label: string }[];
  area: number;
}

export default function VNDrawing({ points, area }: VNDrawingProps) {
  // Navigation State for pan and zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Normalize the VN-2000 points to fit perfectly inside a 400x400 SVG viewBox with 50px padding
  const normalizedPoints = useMemo(() => {
    if (points.length === 0) return [];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    // Prevent division by zero
    const maxRange = Math.max(rangeX, rangeY) || 1;

    return points.map(p => {
      // VN-2000 X is North-South (corresponds to SVG vertical Y, increases upwards)
      // VN-2000 Y is East-West (corresponds to SVG horizontal X, increases rightwards)
      const px = ((p.y - minY) / maxRange) * 300 + 50;
      const py = 350 - ((p.x - minX) / maxRange) * 300;
      return {
        ...p,
        px,
        py
      };
    });
  }, [points]);

  // Calculate length of each segment and cumulative perimeter
  const segments = useMemo(() => {
    if (normalizedPoints.length < 2) return [];
    const results = [];
    const n = normalizedPoints.length;
    const totalLines = n >= 3 ? n : 1;

    for (let i = 0; i < totalLines; i++) {
      const p1 = normalizedPoints[i];
      const p2 = normalizedPoints[(i + 1) % n];
      const dist = calculateCartesianDistance(p1, p2);
      results.push({
        from: p1.label,
        to: p2.label,
        x1: p1.px,
        y1: p1.py,
        x2: p2.px,
        y2: p2.py,
        length: dist,
        midX: (p1.px + p2.px) / 2,
        midY: (p1.py + p2.py) / 2
      });
    }
    return results;
  }, [normalizedPoints]);

  const perimeter = useMemo(() => {
    return segments.reduce((sum, s) => sum + s.length, 0);
  }, [segments]);

  // Zoom and Pan Handlers
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.25, 8));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.25, 0.4));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(prev * zoomFactor, 8));
    } else {
      setZoom(prev => Math.max(prev / zoomFactor, 0.4));
    }
  };

  // Mouse drag start handler
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Touch drag start handler
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  };

  // Use global event listeners for window-based panning to ensure it never gets stuck, even if the cursor moves outside the SVG boundary
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      setPan({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    };

    const handleGlobalTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging, dragStart]);

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full relative">
      {/* Header Panel */}
      <div className="px-5 py-4 bg-slate-50/50 border-b border-slate-200/80 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="text-indigo-600 w-5 h-5 shrink-0" />
          <h3 className="font-bold text-slate-800 text-sm font-display tracking-tight">Bản Vẽ Thiết Kế Thửa Đất</h3>
        </div>
        <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
          <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0" />
          <span>Kỹ thuật số 2D (Tọa độ)</span>
        </div>
      </div>

      {/* Visualizer Canvas Area with clean White Background and delicate dot grids */}
      <div className="flex-1 p-0 flex items-center justify-center bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:20px_20px] bg-slate-50/20 relative min-h-[340px] select-none overflow-hidden">
        {points.length < 3 ? (
          <div className="text-center text-slate-400 p-8">
            <Sliders className="w-10 h-10 mx-auto text-slate-300 mb-2 animate-pulse" />
            <p className="text-xs font-bold text-slate-500">Đang chờ bảng tọa độ</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed mx-auto">
              Nhập tối thiểu 3 điểm mốc ở bảng tọa độ bên dưới để vẽ khép kín thửa đất.
            </p>
          </div>
        ) : (
          <>
            {/* Interactive SVG viewport */}
            <svg
              ref={svgRef}
              className={`w-full h-full min-h-[340px] max-h-[360px] outline-none ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              viewBox="0 0 400 400"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              {/* Pattern definitions */}
              <defs>
                <pattern id="grid-cad" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-cad)" pointerEvents="none" />

              {/* Zoom & Pan Applied Group (Scales about the 200,200 center point) */}
              <g transform={`translate(${pan.x}, ${pan.y}) translate(200, 200) scale(${zoom}) translate(-200, -200)`}>
                
                {/* Polygon Path Shape */}
                <polygon
                  points={normalizedPoints.map(p => `${p.px},${p.py}`).join(' ')}
                  className="fill-indigo-500/5 stroke-indigo-600 stroke-[2.5]"
                />

                {/* Line Segments & Dimension Labels */}
                {segments.map((seg, idx) => (
                  <g key={idx}>
                    {/* Dotted border outline */}
                    <line
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      className="stroke-indigo-600/40"
                      strokeDasharray="2,3"
                      strokeWidth="1.5"
                    />

                    {/* Distance label pill */}
                    <g transform={`translate(${seg.midX}, ${seg.midY})`}>
                      <rect
                        x={-22}
                        y={-8}
                        width={44}
                        height={16}
                        rx={4}
                        className="fill-white stroke-slate-200 shadow-sm"
                        strokeWidth="1"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-indigo-600 font-mono text-[9px] font-black"
                      >
                        {seg.length.toFixed(1)}m
                      </text>
                    </g>
                  </g>
                ))}

                {/* Coordinate Vertex Points */}
                {normalizedPoints.map((point, index) => (
                  <g key={point.id}>
                    {/* Point Label Text slightly above */}
                    <g transform={`translate(${point.px}, ${point.py - 14})`}>
                      <text
                        textAnchor="middle"
                        className="fill-slate-500 font-sans text-[9.5px] font-bold"
                      >
                        {point.label}
                      </text>
                    </g>

                    {/* Point Circle */}
                    <circle
                      cx={point.px}
                      cy={point.py}
                      r={9}
                      className="fill-indigo-600 stroke-white"
                      strokeWidth="2"
                    />

                    {/* Index inside the Circle */}
                    <text
                      x={point.px}
                      y={point.py}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-white font-sans text-[9px] font-black"
                    >
                      {index + 1}
                    </text>
                  </g>
                ))}
              </g>
            </svg>

            {/* Float HUD - Zoom and Navigation tool actions */}
            <div className="absolute top-4 right-4 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-slate-200/80 z-20">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Phóng to"
                className="p-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition text-slate-600 active:scale-95 cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Thu nhỏ"
                className="p-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition text-slate-600 active:scale-95 cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Vừa vặn khung hình"
                className="p-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition text-slate-600 active:scale-95 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Zoom display pill at top left of canvas */}
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 flex items-center gap-1">
              <Hand className="w-3 h-3 text-indigo-500" />
              <span>Phóng: {Math.round(zoom * 100)}%</span>
            </div>
          </>
        )}

        {/* Floating Quick Stats Panel inside the Canvas */}
        {points.length >= 3 && (
          <div className="absolute bottom-4 left-4 right-4 bg-white/95 border border-slate-200 p-2.5 rounded-xl flex justify-around text-center backdrop-blur-md shadow-md z-10">
            <div>
              <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400">Diện tích</span>
              <span className="text-emerald-600 font-mono text-xs font-black">
                {area.toFixed(2)} m²
              </span>
            </div>
            <div className="border-l border-slate-200" />
            <div>
              <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400">Chu vi</span>
              <span className="text-slate-600 font-mono text-xs font-bold">
                {perimeter.toFixed(2)} m
              </span>
            </div>
            <div className="border-l border-slate-200" />
            <div>
              <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400">Mốc ranh</span>
              <span className="text-slate-600 font-mono text-xs font-bold">
                {points.length} điểm
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Instructional Technical Footer */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-[9.5px] text-slate-400 flex items-center gap-1.5 shrink-0 leading-relaxed">
        <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          Nhấn giữ kéo để di chuyển bản vẽ. Cuộn chuột hoặc chạm đa điểm để phóng to, thu nhỏ.
        </span>
      </div>
    </div>
  );
}

