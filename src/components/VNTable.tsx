/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SyncedPoint } from '../types';
import { convertVN2000ToGPS, PROVINCES_CM, autoDetectProvince } from '../utils';
import { Plus, Trash2, LayoutGrid, ChevronDown, Sparkles, Camera, Upload, Loader2, Image as ImageIcon, AlertCircle, Compass, Eye } from 'lucide-react';
import Tesseract from 'tesseract.js';

// --- ROBUST OFFLINE COORDINATE PARSING UTILITIES ---
function parseSmartCoordinate(token: string): number | null {
  let clean = token.trim();
  // Strip non-numeric prefix/suffix (like "X=", "Y:", "m", etc.)
  clean = clean.replace(/^[^\d]+/, '').replace(/[^\d]+$/, '');
  
  if (!clean) return null;

  // Count dots and commas
  const dots = (clean.match(/\./g) || []).length;
  const commas = (clean.match(/,/g) || []).length;
  
  if (dots > 1 && commas === 0) {
    clean = clean.replace(/\./g, '');
  } else if (commas > 1 && dots === 0) {
    clean = clean.replace(/,/g, '');
  } else if (dots === 1 && commas === 1) {
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    if (lastDot > lastComma) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (dots === 1 && commas === 0) {
    const parts = clean.split('.');
    if (parts[1].length === 3 && parseFloat(parts[0]) < 3000) {
      clean = clean.replace(/\./g, '');
    }
  } else if (commas === 1 && dots === 0) {
    const parts = clean.split(',');
    if (parts[1].length === 3 && parseFloat(parts[0]) < 3000) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(/,/g, '.');
    }
  }

  const val = parseFloat(clean);
  if (!isNaN(val) && val >= 100000 && val <= 2600000) {
    return val;
  }

  // Fallback: If OCR returns digits without correct dots or mixed symbols
  const digitStr = clean.replace(/\D/g, '');
  if (digitStr.length >= 6 && digitStr.length <= 9) {
    if ((digitStr.startsWith('1') || digitStr.startsWith('2')) && digitStr.length >= 7) {
      const intPart = digitStr.slice(0, 7);
      const decPart = digitStr.slice(7);
      const guessed = parseFloat(intPart + (decPart ? '.' + decPart : ''));
      if (guessed >= 900000 && guessed <= 2600000) {
        return guessed;
      }
    } else {
      const intPart = digitStr.slice(0, 6);
      const decPart = digitStr.slice(6);
      const guessed = parseFloat(intPart + (decPart ? '.' + decPart : ''));
      if (guessed >= 100000 && guessed <= 900000) {
        return guessed;
      }
    }
  }

  return null;
}

export function parseCoordinatesFromText(text: string): { label: string; x: number; y: number }[] {
  const lines = text.split('\n');
  const results: { label: string; x: number; y: number }[] = [];

  // Robust coordinate matching regex using negative lookbehinds/lookaheads to prevent partial matches.
  // Matches 6-7 digits possibly separated by spaces, with optional decimal point/comma and 1-2 decimal digits.
  const coordRegex = /(?<!\d)\d(?:\s*\d){5,6}(?:\s*[\.,]\s*\d{1,2})?(?!\d)/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const matches = line.match(coordRegex);
    if (!matches) continue;

    const northings: number[] = [];
    const eastings: number[] = [];

    for (const match of matches) {
      // Remove all internal whitespace from the matched string
      let clean = match.replace(/\s+/g, '');
      // Standardize decimal separator
      clean = clean.replace(/,/g, '.');

      const val = parseFloat(clean);
      if (isNaN(val)) continue;

      // In VN-2000, X (Northing) is ~1M to 2.6M, Y (Easting) is ~100K to 900K (False Easting is 500K)
      if (val >= 900000 && val <= 2600000) {
        northings.push(val);
      } else if (val >= 100000 && val < 900000) {
        eastings.push(val);
      }
    }

    // Pair matching Northing and Easting values on the same line
    if (northings.length >= 1 && eastings.length >= 1) {
      const count = Math.min(northings.length, eastings.length);
      for (let i = 0; i < count; i++) {
        const x = northings[i];
        const y = eastings[i];

        // Intelligently extract a potential label (e.g. "1", "2", "A", "Mốc 1")
        // Split by typical delimiters and look for a short non-coordinate token
        const tokens = line.split(/[\s|]+/);
        let label = "";
        for (const token of tokens) {
          const t = token.replace(/[^a-zA-Z0-9À-ỹ]/g, '').trim();
          if (t && t.length <= 6 && !t.match(/^\d{6,7}$/)) {
            const digitOnly = t.replace(/\D/g, '');
            if (digitOnly.length < 5) {
              label = t;
              break;
            }
          }
        }

        if (!label) {
          label = `${results.length + 1}`;
        }

        results.push({ label, x, y });
      }
    }
  }

  return results;
}

interface VNTableProps {
  points: SyncedPoint[];
  onChangePoints: (points: SyncedPoint[]) => void;
  onClear: () => void;
  onFocusPoint: (lat: number, lng: number) => void;
  onFocusBounds: () => void;
  selectedProvince: string;
  centralMeridian: number;
  onProvinceChange: (province: string, meridian: number) => void;
}

const PRESETS = [
  {
    name: "Đất Lô Phố Tiêu Chuẩn (5x20m)",
    points: [
      { x: 2321542.15, y: 598314.56, label: "Mốc 1" },
      { x: 2321562.15, y: 598314.56, label: "Mốc 2" },
      { x: 2321562.15, y: 598319.56, label: "Mốc 3" },
      { x: 2321542.15, y: 598319.56, label: "Mốc 4" }
    ]
  },
  {
    name: "Đất Biệt Thự Sân Vườn (15x15m)",
    points: [
      { x: 2321542.15, y: 598314.56, label: "Mốc 1" },
      { x: 2321557.15, y: 598314.56, label: "Mốc 2" },
      { x: 2321557.15, y: 598329.56, label: "Mốc 3" },
      { x: 2321542.15, y: 598329.56, label: "Mốc 4" }
    ]
  },
  {
    name: "Đất Nở Hậu Tài Lộc (Trapezoid)",
    points: [
      { x: 2321542.15, y: 598314.56, label: "Mốc 1" },
      { x: 2321562.15, y: 598316.56, label: "Mốc 2" },
      { x: 2321562.15, y: 598326.56, label: "Mốc 3" },
      { x: 2321542.15, y: 598320.56, label: "Mốc 4" }
    ]
  },
  {
    name: "Đất Thửa L Góc Đường Phức Tạp",
    points: [
      { x: 2321542.15, y: 598314.56, label: "Mốc 1" },
      { x: 2321567.15, y: 598314.56, label: "Mốc 2" },
      { x: 2321567.15, y: 598324.56, label: "Mốc 3" },
      { x: 2321557.15, y: 598324.56, label: "Mốc 4" },
      { x: 2321557.15, y: 598334.56, label: "Mốc 5" },
      { x: 2321542.15, y: 598334.56, label: "Mốc 6" }
    ]
  }
];

export default function VNTable({ points, onChangePoints, onClear, onFocusPoint, onFocusBounds, selectedProvince, centralMeridian, onProvinceChange }: VNTableProps) {
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showOcrPanel, setShowOcrPanel] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [ocrMode, setOcrMode] = useState<'gemini' | 'tesseract'>('tesseract');

  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("gemini_api_key") || "";
  });
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showKeyInputForm, setShowKeyInputForm] = useState<boolean>(false);

  const handleSaveApiKey = (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem("gemini_api_key", trimmed);
      setCustomApiKey(trimmed);
      setApiKeyInput("");
      setShowKeyInputForm(false);
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem("gemini_api_key");
    setCustomApiKey("");
    setApiKeyInput("");
    setShowKeyInputForm(true);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setOcrError("Vui lòng chọn một file ảnh hợp lệ (PNG, JPG, JPEG).");
      return;
    }

    setOcrError(null);
    setIsOcrLoading(true);

    if (ocrMode === 'tesseract') {
      setOcrStatus("Đang tải thư viện xử lý offline...");
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) throw new Error("Không thể đọc file ảnh.");

          setOcrStatus("Đang chuẩn bị quét ngoại tuyến...");
          
          // Use Tesseract recognize directly
          const response = await Tesseract.recognize(
            result,
            'vie+eng',
            {
              logger: m => {
                if (m.status === 'recognizing text') {
                  setOcrStatus(`Đang xử lý chữ viết: ${Math.round(m.progress * 100)}%`);
                } else {
                  setOcrStatus(`Chuẩn bị: ${m.status === 'loading tesseract core' ? 'Tải nhân lõi' : m.status}...`);
                }
              }
            }
          );

          const text = response.data.text;
          console.log("Tesseract Raw Output:\n", text);

          setOcrStatus("Đang giải mã bảng tọa độ VN-2000...");
          const parsed = parseCoordinatesFromText(text);

          if (parsed.length === 0) {
            throw new Error("Không tìm thấy hàng tọa độ VN-2000 nào khớp ở chế độ Quét Offline. Bạn có thể tự điền tay hoặc bấm đổi sang chế độ 'Quét bằng Gemini AI' phía trên để trích xuất cực kỳ chuẩn xác!");
          }

          const detected = autoDetectProvince(parsed);
          let meridianToUse = centralMeridian;
          if (detected) {
            meridianToUse = detected.meridian;
            onProvinceChange(detected.name, detected.meridian);
          }

          const syncedPoints: SyncedPoint[] = parsed.map((p, idx) => {
            const gps = convertVN2000ToGPS(p.x, p.y, meridianToUse);
            return {
              id: `ocr-${idx}-${Date.now()}`,
              label: p.label || `Mốc ${idx + 1}`,
              x: p.x,
              y: p.y,
              lat: gps.lat,
              lng: gps.lng
            };
          });

          onChangePoints(syncedPoints);
          setOcrStatus("Thành công!");
          setIsOcrLoading(false);
          setShowOcrPanel(false);
        } catch (err: any) {
          console.error(err);
          setOcrError(err?.message || "Có lỗi xảy ra trong quá trình nhận diện ngoại tuyến.");
          setIsOcrLoading(false);
        }
      };

      reader.onerror = () => {
        setOcrError("Không thể đọc file ảnh.");
        setIsOcrLoading(false);
      };

      reader.readAsDataURL(file);
    } else {
      // Gemini mode
      setOcrStatus("Đang đọc dữ liệu ảnh...");

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) throw new Error("Không thể đọc file ảnh.");

          const commaIdx = result.indexOf(',');
          const base64Data = result.substring(commaIdx + 1);
          const mimeType = file.type;

          setOcrStatus("Gemini AI đang đọc bảng tọa độ sổ đỏ...");

          const response = await fetch("/api/ocr-coordinates", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-gemini-key": customApiKey || ""
            },
            body: JSON.stringify({
              imageBase64: base64Data,
              mimeType: mimeType
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Gửi yêu cầu phân tích thất bại.");
          }

          setOcrStatus("Đang đồng bộ mốc ranh địa chính VN-2000...");
          const data = await response.json();

          if (!data.points || data.points.length === 0) {
            throw new Error("Không tìm thấy bảng tọa độ VN-2000 hợp lệ trong ảnh. Hãy chắc chắn ảnh chụp rõ nét bảng tọa độ.");
          }

          const detected = autoDetectProvince(data.points);
          let meridianToUse = centralMeridian;
          if (detected) {
            meridianToUse = detected.meridian;
            onProvinceChange(detected.name, detected.meridian);
          }

          const syncedPoints: SyncedPoint[] = data.points.map((p: any, idx: number) => {
            const gps = convertVN2000ToGPS(p.x, p.y, meridianToUse);
            return {
              id: `ocr-${idx}-${Date.now()}`,
              label: p.label || `Mốc ${idx + 1}`,
              x: p.x,
              y: p.y,
              lat: gps.lat,
              lng: gps.lng
            };
          });

          onChangePoints(syncedPoints);
          setOcrStatus("Thành công!");
          setIsOcrLoading(false);
          setShowOcrPanel(false);
        } catch (err: any) {
          console.error(err);
          setOcrError(err?.message || "Có lỗi xảy ra trong quá trình quét ảnh bằng AI.");
          setIsOcrLoading(false);
        }
      };

      reader.onerror = () => {
        setOcrError("Không thể đọc file ảnh.");
        setIsOcrLoading(false);
      };

      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Handle cell edits in table
  const handleEditPoint = (id: string, field: 'x' | 'y' | 'label', val: string) => {
    const updated = points.map(p => {
      if (p.id === id) {
        if (field === 'label') {
          return { ...p, label: val };
        } else {
          const floatVal = parseFloat(val);
          const safeVal = isNaN(floatVal) ? 0 : floatVal;
          const nextPoint = { ...p, [field]: safeVal };
          // Convert the updated VN2000 back to GPS to keep them perfectly in sync!
          const gps = convertVN2000ToGPS(nextPoint.x, nextPoint.y, centralMeridian);
          nextPoint.lat = gps.lat;
          nextPoint.lng = gps.lng;
          return nextPoint;
        }
      }
      return p;
    });
    onChangePoints(updated);
  };

  // Add coordinate row
  const handleAddRow = () => {
    const lastPoint = points[points.length - 1];
    const newX = lastPoint ? lastPoint.x + 10 : 2321542.15;
    const newY = lastPoint ? lastPoint.y : 598314.56;
    const gps = convertVN2000ToGPS(newX, newY, centralMeridian);

    const newPoint: SyncedPoint = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      x: newX,
      y: newY,
      lat: gps.lat,
      lng: gps.lng,
      label: `Mốc ${points.length + 1}`
    };

    onChangePoints([...points, newPoint]);
  };

  // Delete coordinate row
  const handleDeleteRow = (id: string) => {
    const updated = points.filter(p => p.id !== id);
    const relabeled = updated.map((p, idx) => ({
      ...p,
      label: `Mốc ${idx + 1}`
    }));
    onChangePoints(relabeled);
  };

  // Apply a preset
  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    const freshPresetPoints = preset.points.map((p, idx) => {
      const gps = convertVN2000ToGPS(p.x, p.y, centralMeridian);
      return {
        id: `preset-${idx}-${Date.now()}`,
        label: p.label,
        x: p.x,
        y: p.y,
        lat: gps.lat,
        lng: gps.lng
      };
    });
    onChangePoints(freshPresetPoints);
    setShowPresetMenu(false);
  };

  return (
    <div id="vn-table-panel" className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header with White Background and Clean Border */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid className="text-indigo-600 w-5 h-5 shrink-0" />
            <h3 className="font-bold text-slate-800 text-sm tracking-tight font-display">Bảng Nhập Tọa Độ VN-2000 (Sổ Đỏ)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Nhập hoặc quét tọa độ ranh đất từ ảnh bảng tọa độ trên trang Sổ đỏ/Sổ hồng.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* AI Scan Trigger Button */}
          <button
            type="button"
            onClick={() => setShowOcrPanel(!showOcrPanel)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition cursor-pointer ${
              showOcrPanel 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-sm'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Quét ảnh AI</span>
          </button>

          {/* Quick Sample Selector */}
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Mẫu thửa</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showPresetMenu && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
              <p className="px-3 py-1.5 text-[9px] uppercase font-bold text-slate-400 tracking-wider">Chọn nhanh hình mẫu thửa</p>
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyPreset(preset)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-700 transition text-slate-700 font-medium cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Province & Central Meridian Selector Row */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Tỉnh/Thành ranh đất:</span>
          <select
            value={selectedProvince}
            onChange={(e) => {
              const prov = PROVINCES_CM.find(p => p.name === e.target.value);
              if (prov) {
                onProvinceChange(prov.name, prov.meridian);
              }
            }}
            className="bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer font-bold shadow-xs text-xs animate-none"
          >
            {PROVINCES_CM.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Kinh tuyến trục:</span>
          <div className="flex items-center bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 py-1.5">
            <span className="font-mono text-indigo-700 font-bold">{centralMeridian}°00'</span>
          </div>
        </div>

        <div className="ml-auto text-[10px] text-slate-400 font-medium flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
          <span>Tự động định vị vùng khi quét ảnh</span>
        </div>
      </div>

      {/* AI OCR Scan Panel */}
      {showOcrPanel && (
        <div className="p-5 bg-indigo-50/40 border-b border-indigo-100/60 transition-all duration-300">
          {/* Header & Close */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500/20" />
                {ocrMode === 'tesseract' ? 'Quét Tọa Độ Ngoại Tuyến (Offline Tesseract)' : 'Quét Tọa Độ Bằng Gemini AI (Yêu Cầu Mạng)'}
              </h4>
              <p className="text-[10px] text-indigo-600/80 mt-0.5">
                {ocrMode === 'tesseract' 
                  ? 'Xử lý hoàn toàn cục bộ trên máy khách, bảo mật 100%, chạy mượt mà ngay cả khi lưu trữ trên GitHub Pages tĩnh.' 
                  : 'Sử dụng trí tuệ nhân tạo tiên tiến để nhận diện tự động bảng tọa độ ranh đất có độ nghiêng, mờ hoặc chữ viết tay.'}
              </p>
            </div>
            <button 
              type="button"
              onClick={() => setShowOcrPanel(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition"
            >
              Đóng
            </button>
          </div>

          {/* Mode Switcher Tab */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl mb-4 w-fit border border-slate-100">
            <button
              type="button"
              disabled={isOcrLoading}
              onClick={() => { setOcrMode('tesseract'); setOcrError(null); }}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                ocrMode === 'tesseract'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 disabled:opacity-50'
              }`}
            >
              Offline (Tesseract.js)
            </button>
            <button
              type="button"
              disabled={isOcrLoading}
              onClick={() => { setOcrMode('gemini'); setOcrError(null); }}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                ocrMode === 'gemini'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 disabled:opacity-50'
              }`}
            >
              Mạng AI (Gemini API)
            </button>
          </div>

          {/* Custom Gemini API Key Management Row */}
          {ocrMode === 'gemini' && (
            <div className="mb-4 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-xs">
              {(!customApiKey || showKeyInputForm) ? (
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 animate-none" />
                    <span>Cấu hình Gemini API Key cá nhân (Lưu trình duyệt)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">
                    Nhập API Key Gemini của bạn để tăng tốc độ nhận diện và tăng giới hạn hàng ngày. Khóa được lưu trực tiếp trên thiết bị của bạn (Local Storage) và không bao giờ gửi tới bất kỳ bên thứ ba nào.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 grow max-w-md shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveApiKey(apiKeyInput)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer transition text-xs shadow-sm hover:shadow-md"
                    >
                      Lưu Local
                    </button>
                    {customApiKey && (
                      <button
                        type="button"
                        onClick={() => setShowKeyInputForm(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg cursor-pointer transition text-xs"
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 border border-indigo-50 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-semibold text-[11px]">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>✓ Đã cấu hình Gemini API Key cá nhân của bạn</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setApiKeyInput(customApiKey);
                        setShowKeyInputForm(true);
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 font-bold border border-slate-200 rounded-lg cursor-pointer transition"
                    >
                      Đổi Key
                    </button>
                    <button
                      type="button"
                      onClick={handleClearApiKey}
                      className="px-2.5 py-1 text-[11px] bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-600 font-bold border border-slate-200 rounded-lg cursor-pointer transition"
                    >
                      Xóa Key (Dùng mặc định)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDraggingOver 
                ? 'border-indigo-500 bg-indigo-50/80 shadow-inner' 
                : 'border-slate-200 hover:border-indigo-400 bg-white shadow-sm'
            }`}
          >
            {isOcrLoading ? (
              <div className="flex flex-col items-center justify-center py-2">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                <p className="text-xs font-semibold text-indigo-900">{ocrStatus}</p>
                <p className="text-[10px] text-slate-400 mt-1">Vui lòng chờ trong giây lát...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-2 cursor-pointer relative group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-slate-400 mb-2 group-hover:text-indigo-500 transition-colors" />
                <p className="text-xs font-bold text-slate-700">Kéo thả ảnh vào đây hoặc click để chọn ảnh</p>
                <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ PNG, JPG, JPEG (Ảnh chụp trang Sổ Đỏ chứa bảng tọa độ rõ ràng)</p>
              </div>
            )}
          </div>

          {/* Error display */}
          {ocrError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-700 animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold">
                <p>{ocrError}</p>
                <p className="text-[10px] text-red-500 font-medium mt-0.5">
                  {ocrMode === 'tesseract'
                    ? 'Mẹo: Để quét Offline chính xác nhất, bạn hãy căn thẳng ảnh, cắt sát bảng tọa độ X, Y và đảm bảo chữ số rõ nét, không bị nhòe mờ.'
                    : 'Mẹo: Hãy chắc chắn ảnh chụp đủ sáng, rõ nét các cột số hiệu mốc và hệ tọa độ.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coordinate Table Area */}
      <div className="flex-1 overflow-y-auto max-h-[300px] p-5">
        {points.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4">
            <LayoutGrid className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-xs text-slate-500 font-medium">Bảng tọa độ trống</p>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-[240px]">
              Vui lòng nhấn &quot;Thêm điểm mốc&quot; hoặc chọn &quot;Mẫu thửa nhanh&quot; để tự động tạo.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pb-1">
              <span className="col-span-3">Mốc ranh</span>
              <span className="col-span-3">Tọa độ X (m)</span>
              <span className="col-span-3">Tọa độ Y (m)</span>
              <span className="col-span-2 text-center">Bản đồ</span>
              <span className="col-span-1 text-center">Xóa</span>
            </div>

            <div className="space-y-1.5">
              {points.map((point, idx) => (
                <div
                  key={point.id}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-50/50 hover:bg-slate-50 p-2.5 rounded-xl border border-slate-100 transition-colors"
                >
                  {/* Point Label / Identifier */}
                  <div className="col-span-3 flex items-center gap-1.5">
                    <span className="w-5.5 h-5.5 shrink-0 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={point.label}
                      onChange={(e) => handleEditPoint(point.id, 'label', e.target.value)}
                      className="w-full text-xs font-bold bg-transparent border-0 focus:ring-0 outline-none p-0 text-slate-700 focus:bg-white rounded px-1.5 py-0.5 transition"
                    />
                  </div>

                  {/* Coordinates input fields */}
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      value={point.x}
                      onChange={(e) => handleEditPoint(point.id, 'x', e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl px-2.5 py-1.5 font-mono text-slate-800 font-bold shadow-sm"
                    />
                  </div>

                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      value={point.y}
                      onChange={(e) => handleEditPoint(point.id, 'y', e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-xl px-2.5 py-1.5 font-mono text-slate-800 font-bold shadow-sm"
                    />
                  </div>

                  {/* Focus Map to single point */}
                  <div className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => onFocusPoint(point.lat, point.lng)}
                      title="Di chuyển bản đồ đến điểm mốc này"
                      className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Xem</span>
                    </button>
                  </div>

                  {/* Delete Option */}
                  <button
                    type="button"
                    onClick={() => handleDeleteRow(point.id)}
                    className="col-span-1 flex justify-center text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls with Clean White Background */}
      <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
        <button
          type="button"
          onClick={handleAddRow}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-xs font-bold text-slate-600 transition shadow-sm active:scale-98 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-indigo-500" />
          <span>Thêm điểm mốc</span>
        </button>

        {points.length > 0 && (
          <>
            <button
              type="button"
              onClick={onFocusBounds}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-100 transition active:scale-98 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>Xem toàn thửa</span>
            </button>

            <button
              type="button"
              onClick={onClear}
              className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition active:scale-98 cursor-pointer"
            >
              Xóa toàn bộ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
