/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { formatVND, convertNumberToVietnameseWords, spellOutNumberVietnamese } from '../utils';
import { Coins, ShieldCheck, Calculator, Map, FileSpreadsheet } from 'lucide-react';

interface PriceCalculatorProps {
  gpsArea: number;
  vn2000Area: number;
  expectedPrice: number;
  onChangePrice: (price: number) => void;
}

export default function PriceCalculator({ gpsArea, vn2000Area, expectedPrice, onChangePrice }: PriceCalculatorProps) {
  const [priceInput, setPriceInput] = useState(expectedPrice > 0 ? expectedPrice.toString() : '');
  const [areaSource, setAreaSource] = useState<'GPS' | 'VN2000'>('GPS');

  // Sync state and notify parent when typing
  const handlePriceChange = (val: string) => {
    const numeric = val.replace(/\D/g, '');
    setPriceInput(numeric);
    
    const parsed = parseInt(numeric);
    onChangePrice(isNaN(parsed) ? 0 : parsed);
  };

  // Determine active area based on selection
  const activeArea = useMemo(() => {
    return areaSource === 'GPS' ? gpsArea : vn2000Area;
  }, [areaSource, gpsArea, vn2000Area]);

  // Compute calculated values
  const pricePerSqm = useMemo(() => {
    if (activeArea <= 0 || expectedPrice <= 0) return 0;
    return Math.round(expectedPrice / activeArea);
  }, [activeArea, expectedPrice]);

  // Spell out prices in text
  const expectedPriceSpelledOut = useMemo(() => {
    if (expectedPrice <= 0) return '';
    try {
      return spellOutNumberVietnamese(expectedPrice);
    } catch {
      return '';
    }
  }, [expectedPrice]);

  const pricePerSqmSpelledOut = useMemo(() => {
    if (pricePerSqm <= 0) return '';
    try {
      return spellOutNumberVietnamese(pricePerSqm);
    } catch {
      return '';
    }
  }, [pricePerSqm]);

  // Quick helper buttons for price inputs
  const quickPriceButtons = [
    { label: "500Tr", value: 500000000 },
    { label: "1 Tỷ", value: 1000000000 },
    { label: "2 Tỷ", value: 2000000000 },
    { label: "5 Tỷ", value: 5000000000 },
    { label: "10 Tỷ", value: 10000000000 },
    { label: "20 Tỷ", value: 20000000000 },
  ];

  const handleQuickPrice = (value: number) => {
    setPriceInput(value.toString());
    onChangePrice(value);
  };

  return (
    <div className="bg-white p-6 rounded-[24px] border border-slate-200/80 shadow-sm space-y-6">
      <div className="flex items-center gap-2">
        <Coins className="text-indigo-600 w-5 h-5 shrink-0" />
        <h3 className="font-bold text-slate-800 text-sm font-display tracking-tight">Thẩm định đơn giá m² đất</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input Panel */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Price Input */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Nhập giá trị thửa đất (VNĐ)
            </label>
            <div className="relative rounded-xl shadow-sm">
              <input
                id="price-input-field"
                type="text"
                pattern="[0-9]*"
                value={priceInput ? parseInt(priceInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="Ví dụ: 2.500.000.000 (2.5 Tỷ)"
                className="w-full text-base font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl pl-4 pr-16 py-3 transition text-slate-800"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded">VNĐ</span>
              </div>
            </div>

            {/* Quick shortcuts */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickPriceButtons.map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickPrice(btn.value)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[10px] font-semibold text-slate-600 transition cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Spell out price */}
          {expectedPrice > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="block text-[9px] uppercase font-bold text-slate-400">Giá trị bằng chữ</span>
              <span className="text-xs font-bold text-indigo-600 block leading-relaxed">
                {convertNumberToVietnameseWords(expectedPrice)}
              </span>
              <p className="text-[10px] text-slate-400 italic font-medium leading-relaxed">
                (&quot;{expectedPriceSpelledOut}&quot;)
              </p>
            </div>
          )}

          {/* 2. Choose Area Source to Apply */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Chọn nguồn diện tích để quy đổi đơn giá /m²:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* GPS Option Card */}
              <button
                type="button"
                onClick={() => setAreaSource('GPS')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 ${
                  areaSource === 'GPS'
                    ? 'border-indigo-600 bg-indigo-50/20 shadow-sm ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Map className={`w-4 h-4 ${areaSource === 'GPS' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    Bản đồ vệ tinh
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    areaSource === 'GPS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {areaSource === 'GPS' ? 'Đang dùng' : 'Chọn dùng'}
                  </span>
                </div>
                <div className="font-mono text-base font-black text-slate-800">
                  {gpsArea > 0 ? `${gpsArea.toFixed(2)} m²` : "0.00 m²"}
                </div>
              </button>

              {/* VN2000 Option Card */}
              <button
                type="button"
                onClick={() => setAreaSource('VN2000')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 ${
                  areaSource === 'VN2000'
                    ? 'border-indigo-600 bg-indigo-50/20 shadow-sm ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileSpreadsheet className={`w-4 h-4 ${areaSource === 'VN2000' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    Tọa độ Sổ đỏ VN-2000
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    areaSource === 'VN2000' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {areaSource === 'VN2000' ? 'Đang dùng' : 'Chọn dùng'}
                  </span>
                </div>
                <div className="font-mono text-base font-black text-slate-800">
                  {vn2000Area > 0 ? `${vn2000Area.toFixed(2)} m²` : "0.00 m²"}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Calculations & Results display */}
        <div className="lg:col-span-5 h-full flex flex-col justify-between self-stretch min-h-[180px]">
          {activeArea > 0 && expectedPrice > 0 ? (
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-5 rounded-[24px] text-white shadow-lg relative overflow-hidden flex-1 flex flex-col justify-between">
              {/* Background Glow */}
              <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              
              <div className="relative space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-100 bg-indigo-800/40 px-3 py-1 rounded-full inline-block">
                  ĐƠN GIÁ ĐẤT QUY ĐỔI ({areaSource === 'GPS' ? 'Bản Đồ' : 'Tọa Độ'})
                </span>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black font-display tracking-tight leading-none text-emerald-300">
                    {formatVND(pricePerSqm)} <span className="text-sm font-medium text-indigo-100">/ m²</span>
                  </h1>
                  <p className="text-[11px] text-indigo-100 italic mt-3.5 leading-relaxed">
                    Bằng chữ: &quot;{pricePerSqmSpelledOut}&quot;
                  </p>
                </div>

                <div className="pt-3.5 border-t border-white/10 flex items-start gap-1.5 text-[10px] text-indigo-100">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-300" />
                  <p className="leading-relaxed">
                    Đơn giá tính dựa trên diện tích ranh giới {areaSource === 'GPS' ? 'đo vẽ trực tiếp trên bản đồ' : 'nhập từ hệ trục tọa độ Sổ đỏ VN-2000'}.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-[24px] p-8 text-center flex flex-col items-center justify-center h-full flex-1 min-h-[180px]">
              <Calculator className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500">Chưa đủ thông số tính đơn giá</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[280px] leading-relaxed">
                Vui lòng vẽ ranh giới đất (trên Bản đồ hoặc nhập Tọa độ Sổ đỏ) và điền số tiền đất để quy đổi chính xác ra đơn giá /m².
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
