/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SideInput } from '../types';
import { Plus, Trash2, Sliders, AlertCircle, Sparkles, HelpCircle } from 'lucide-react';

interface VNSideLengthTableProps {
  sides: SideInput[];
  onChangeSides: (sides: SideInput[]) => void;
  onClear: () => void;
}

export default function VNSideLengthTable({ sides, onChangeSides, onClear }: VNSideLengthTableProps) {
  
  const handleEditLength = (id: string, val: string) => {
    const numVal = parseFloat(val);
    const safeVal = isNaN(numVal) || numVal < 0.1 ? 0.1 : numVal;
    
    const updated = sides.map(s => {
      if (s.id === id) {
        return { ...s, length: parseFloat(safeVal.toFixed(2)) };
      }
      return s;
    });
    onChangeSides(updated);
  };

  const handleAddSide = () => {
    const N = sides.length;
    if (N < 3) {
      // Initialize with a simple triangle
      const initialSides: SideInput[] = [
        { id: 's1', fromNode: '1', toNode: '2', length: 10.0 },
        { id: 's2', fromNode: '2', toNode: '3', length: 10.0 },
        { id: 's3', fromNode: '3', toNode: '1', length: 10.0 },
      ];
      onChangeSides(initialSides);
      return;
    }

    // We have N sides: 1-2, 2-3, ..., N-1.
    // The last side currently is N-1.
    // We want to insert a new node, making it N+1 vertices.
    // The previous last side was (N) -> 1.
    // We will change it to (N) -> (N+1) and add a new side (N+1) -> 1.
    const lastSide = sides[N - 1];
    const newNodeNum = N + 1;
    
    const updatedLastSide = {
      ...lastSide,
      toNode: newNodeNum.toString(),
      length: 10.0 // default
    };

    const newClosingSide: SideInput = {
      id: `side-closing-${Date.now()}`,
      fromNode: newNodeNum.toString(),
      toNode: '1',
      length: 10.0 // default
    };

    const nextSides = [...sides.slice(0, N - 1), updatedLastSide, newClosingSide];
    onChangeSides(nextSides);
  };

  const handleDeleteSide = (indexToDelete: number) => {
    const N = sides.length;
    if (N <= 3) return; // Minimum 3 sides for any polygon

    // If we delete a side, say index i, we can merge the nodes or just re-index them sequentially.
    // The simplest and most stable way to delete a vertex is:
    // Re-create a sequential closed loop of size N-1 with default/copied lengths!
    const newSize = N - 1;
    const newSides: SideInput[] = [];
    
    // Distribute current lengths as much as possible
    for (let i = 0; i < newSize; i++) {
      const from = i + 1;
      const to = i === newSize - 1 ? 1 : i + 2;
      const oldLen = sides[i] ? sides[i].length : 10.0;
      
      newSides.push({
        id: `s-${from}-${to}-${Date.now()}`,
        fromNode: from.toString(),
        toNode: to.toString(),
        length: oldLen
      });
    }

    onChangeSides(newSides);
  };

  const handleResetDefault = () => {
    const defaultSides: SideInput[] = [
      { id: '1', fromNode: '1', toNode: '2', length: 15.0 },
      { id: '2', fromNode: '2', toNode: '3', length: 6.0 },
      { id: '3', fromNode: '3', toNode: '4', length: 14.8 },
      { id: '4', fromNode: '4', toNode: '1', length: 6.2 },
    ];
    onChangeSides(defaultSides);
  };

  // Calculate total perimeter
  const totalPerimeter = sides.reduce((sum, s) => sum + s.length, 0);

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header Panel */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="text-indigo-600 w-5 h-5 shrink-0" />
            <h3 className="font-bold text-slate-800 text-sm tracking-tight font-display">Nhập Chiều Dài Cạnh Ranh (Mốc Thửa)</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Nhập trực tiếp độ dài đo thực tế của các cạnh ranh đất (m). Hệ thống sẽ tự khép góc hình học.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefault}
            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
          >
            Mẫu thửa chuẩn
          </button>
          <button
            type="button"
            onClick={handleAddSide}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm cạnh ranh</span>
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-5 flex-1 overflow-auto">
        {sides.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2 animate-bounce" />
            <p className="text-xs font-bold text-slate-500">Chưa có cạnh ranh đất</p>
            <button
              onClick={handleResetDefault}
              className="mt-3 text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold"
            >
              Tạo thửa mẫu 4 cạnh
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Table layout */}
            <div className="border border-slate-150 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="py-3 px-4">Ký hiệu cạnh</th>
                    <th className="py-3 px-4">Độ dài thực tế (m)</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sides.map((side, idx) => (
                    <tr key={side.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">
                        Cạnh {side.fromNode} - {side.toNode}
                      </td>
                      <td className="py-3 px-4">
                        <div className="relative max-w-[160px]">
                          <input
                            type="number"
                            step="0.01"
                            min="0.1"
                            value={side.length}
                            onChange={(e) => handleEditLength(side.id, e.target.value)}
                            className="w-full pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 bg-white focus:outline-none focus:border-indigo-500 transition"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                            m
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={sides.length <= 3}
                          onClick={() => handleDeleteSide(idx)}
                          title={sides.length <= 3 ? "Không thể xóa (Tối thiểu 3 cạnh)" : "Xóa cạnh"}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Offline & GitHub Page Info Pill */}
            <div className="bg-emerald-50/50 border border-emerald-100/60 p-3.5 rounded-xl flex gap-3">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 fill-emerald-600/10" />
              <div className="text-[11px] text-emerald-800 leading-relaxed">
                <span className="font-bold">Chạy ngoại tuyến & Tải nhanh (100% Offline):</span> Chế độ này xử lý hình học thuần túy trên trình duyệt, không cần bất kỳ kết nối máy chủ hay bản đồ vệ tinh nào. Hoàn hảo để triển khai tĩnh trên <span className="font-bold">GitHub Pages</span>, bảo mật tuyệt đối thông tin thửa đất của khách hàng.
              </div>
            </div>

            {/* Helper Quick Stats */}
            <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                <span>Số lượng cạnh ranh: <strong>{sides.length} cạnh</strong></span>
              </div>
              <div>
                <span>Tổng chu vi: <strong className="font-mono text-indigo-600 font-bold">{totalPerimeter.toFixed(2)} m</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
