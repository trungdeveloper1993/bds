/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { SyncedPoint, MapFocus, SideInput } from './types';
import { calculateGPSArea, calculateCartesianArea, reconstructPointsFromSides, convertVN2000ToGPS } from './utils';
import LandMap from './components/LandMap';
import VNTable from './components/VNTable';
import VNDrawing from './components/VNDrawing';
import VNSideLengthTable from './components/VNSideLengthTable';
import PriceCalculator from './components/PriceCalculator';
import { Building, Map, Sliders, LayoutGrid, Coins } from 'lucide-react';

export default function App() {
  // Input method mode: 'coordinate' (VN-2000 coords) or 'sideLength' (dimensions only)
  const [inputMode, setInputMode] = useState<'coordinate' | 'sideLength'>('coordinate');

  // Total price state (VNĐ)
  const [expectedPrice, setExpectedPrice] = useState<number>(0);

  // Map focus triggers
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);

  // Single source of truth for synchronized points (Coordinate mode)
  const [points, setPoints] = useState<SyncedPoint[]>([
    { id: '1', label: 'Mốc 1', x: 2321542.15, y: 598314.56, lat: 21.028500, lng: 105.854200 },
    { id: '2', label: 'Mốc 2', x: 2321562.15, y: 598314.56, lat: 21.028680, lng: 105.854200 },
    { id: '3', label: 'Mốc 3', x: 2321562.15, y: 598329.56, lat: 21.028680, lng: 105.854344 },
    { id: '4', label: 'Mốc 4', x: 2321542.15, y: 598329.56, lat: 21.028500, lng: 105.854344 }
  ]);

  // Province & Central Meridian for VN-2000 coordinate conversion
  const [selectedProvince, setSelectedProvince] = useState<string>('Hà Nội');
  const [centralMeridian, setCentralMeridian] = useState<number>(105.0);

  const handleProvinceChange = (provinceName: string, meridian: number) => {
    setSelectedProvince(provinceName);
    setCentralMeridian(meridian);

    // Recalculate GPS coordinates of all current points to match the new meridian
    setPoints(prevPoints => {
      const updated = prevPoints.map(p => {
        const gps = convertVN2000ToGPS(p.x, p.y, meridian);
        return {
          ...p,
          lat: gps.lat,
          lng: gps.lng
        };
      });

      // Recenter the map to the new bounding box if we have points
      if (updated.length > 0) {
        setMapFocus({
          type: 'bounds',
          timestamp: Date.now()
        });
      }
      return updated;
    });
  };

  // Source of truth for side length inputs
  const [sideInputs, setSideInputs] = useState<SideInput[]>([
    { id: 's1', fromNode: '1', toNode: '2', length: 15.0 },
    { id: 's2', fromNode: '2', toNode: '3', length: 6.0 },
    { id: 's3', fromNode: '3', toNode: '4', length: 14.8 },
    { id: 's4', fromNode: '4', toNode: '1', length: 6.2 },
  ]);

  const handleFocusPoint = (lat: number, lng: number) => {
    if (inputMode === 'sideLength') return; // disabled in side length mode
    setMapFocus({
      type: 'point',
      lat,
      lng,
      timestamp: Date.now()
    });
  };

  const handleFocusBounds = () => {
    if (inputMode === 'sideLength') return; // disabled in side length mode
    setMapFocus({
      type: 'bounds',
      timestamp: Date.now()
    });
  };

  // Compute activePoints based on current input mode
  const activePoints = useMemo(() => {
    if (inputMode === 'sideLength') {
      return reconstructPointsFromSides(sideInputs);
    }
    return points;
  }, [inputMode, points, sideInputs]);

  // Compute areas dynamically for activePoints
  const gpsArea = useMemo(() => {
    return calculateCartesianArea(activePoints);
  }, [activePoints]);

  const vn2000Area = useMemo(() => {
    return calculateCartesianArea(activePoints);
  }, [activePoints]);

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-16 font-sans antialiased text-slate-850">
      {/* HEADER SECTION */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm sticky top-0 z-[100] px-4 py-3.5 md:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-600/20">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-black text-slate-800 font-display tracking-tight flex items-center gap-2 leading-none">
                Địa Bản Số Hóa
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Hệ Thống Đo Vẽ Ranh Đất & Đơn Giá</span>
              </h1>
              <p className="text-[11px] text-slate-400 mt-1">Đo vẽ bản đồ vệ tinh, nhập tọa độ sổ đỏ VN-2000 và tính quy đổi ra đơn giá m² đất tự động</p>
            </div>
          </div>
        </div>
      </header>
 
      {/* MAIN APPLICATION WORKSPACE */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 mt-6 space-y-6">
        
        {/* CHOOSE INPUT METHOD TAB SELECTOR */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl max-w-lg border border-slate-150">
          <button
            type="button"
            onClick={() => setInputMode('coordinate')}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              inputMode === 'coordinate'
                ? 'bg-white text-indigo-700 shadow-md'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>Tọa độ VN-2000 & Bản đồ</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('sideLength')}
            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              inputMode === 'sideLength'
                ? 'bg-white text-indigo-700 shadow-md'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Chiều dài các cạnh (Offline)</span>
          </button>
        </div>

        {/* Row 1: Draw Visualizer Canvases (Map left, CAD right on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          
          {/* Column A: Satellite Map or Offline Placeholder */}
          <div className="flex flex-col space-y-2 h-[480px] lg:h-[520px]">
            <div className="flex items-center gap-1.5 px-1 shrink-0">
              <Map className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                {inputMode === 'coordinate' ? '1. Vẽ trực quan trên bản đồ vệ tinh' : '1. Bản đồ vệ tinh (Ẩn ở chế độ offline)'}
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              {inputMode === 'sideLength' ? (
                <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full items-center justify-center p-8 text-center bg-slate-50/10">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4 shadow-sm border border-indigo-100">
                    <Map className="w-8 h-8 opacity-60" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-2">Bản đồ vệ tinh không hiển thị</h3>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    Bạn đang bật <span className="font-bold text-indigo-600">chế độ Nhập chiều dài ranh</span>.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs mt-2 leading-relaxed">
                    Vì ranh giới tự do này chỉ có kích thước dài/rộng và không chứa tọa độ địa lý GPS thực tế, hệ thống không thể hiển thị nó trên quả địa cầu. Bản vẽ 2D dựng hình ở bên phải vẫn hiển thị đầy đủ!
                  </p>
                  <button
                    type="button"
                    onClick={() => setInputMode('coordinate')}
                    className="mt-6 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer transition active:scale-95"
                  >
                    Chuyển sang chế độ Nhập Tọa Độ
                  </button>
                </div>
              ) : (
                <LandMap
                  points={points}
                  onChangePoints={setPoints}
                  onClear={() => setPoints([])}
                  area={gpsArea}
                  mapFocus={mapFocus}
                  centralMeridian={centralMeridian}
                />
              )}
            </div>
          </div>

          {/* Column B: Design CAD Drawing */}
          <div className="flex flex-col space-y-2 h-[480px] lg:h-[520px]">
            <div className="flex items-center gap-1.5 px-1 shrink-0">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                {inputMode === 'coordinate' ? '2. Bản vẽ thiết kế từ tọa độ' : '2. Bản vẽ hình học dựng từ các cạnh'}
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              <VNDrawing
                points={activePoints}
                area={vn2000Area}
              />
            </div>
          </div>

        </div>

        {/* Row 2: Input Table */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-1.5 px-1 shrink-0">
            <LayoutGrid className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              {inputMode === 'coordinate' ? '3. Nhập bảng tọa độ từ sổ đỏ' : '3. Danh sách chiều dài các cạnh ranh'}
            </h2>
          </div>
          {inputMode === 'coordinate' ? (
            <VNTable
              points={points}
              onChangePoints={setPoints}
              onClear={() => setPoints([])}
              onFocusPoint={handleFocusPoint}
              onFocusBounds={handleFocusBounds}
              selectedProvince={selectedProvince}
              centralMeridian={centralMeridian}
              onProvinceChange={handleProvinceChange}
            />
          ) : (
            <VNSideLengthTable
              sides={sideInputs}
              onChangeSides={setSideInputs}
              onClear={() => setSideInputs([])}
            />
          )}
        </div>

        {/* Row 3: Price Calculation Panel */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-1.5 px-1 shrink-0">
            <Coins className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">4. Thẩm định quy đổi đơn giá m² đất</h2>
          </div>
          <PriceCalculator
            gpsArea={gpsArea}
            vn2000Area={vn2000Area}
            expectedPrice={expectedPrice}
            onChangePrice={setExpectedPrice}
          />
        </div>

      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-6 mt-16 pt-6 border-t border-slate-200 text-center text-[10px] text-slate-400 select-none">
        <p className="font-semibold text-slate-500">© 2026 Địa Bản Số Hóa - Phần mềm chuyên dụng đo vẽ ranh đất và thẩm định đơn giá m² nhanh.</p>
      </footer>
    </div>
  );
}
