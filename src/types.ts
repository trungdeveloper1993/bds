/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GPSPoint {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g., "Mốc 1", "Mốc 2"
}

export interface VN2000Point {
  id: string;
  x: number; // VN2000 Coordinate X (in meters, typically north-south direction)
  y: number; // VN2000 Coordinate Y (in meters, typically east-west direction)
  label: string; // e.g., "Điểm 1", "Điểm 2"
  note?: string; // Optional descriptive notes
}

export interface SyncedPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
}

export interface MapFocus {
  type: 'point' | 'bounds';
  lat?: number;
  lng?: number;
  timestamp: number;
}

export interface SideInput {
  id: string;
  fromNode: string; // e.g. "1"
  toNode: string;   // e.g. "2"
  length: number;   // in meters
}

export interface LandProperty {
  id: string;
  name: string;
  address: string;
  coordinateType: 'GPS' | 'VN2000';
  gpsPoints: GPSPoint[];
  vn2000Points: VN2000Point[];
  totalArea: number; // in square meters (m²)
  expectedPrice: number; // in VND
  pricePerSqm: number; // in VND/m²
  notes?: string;
  createdAt: string;
}

export interface LandUnit {
  name: string;
  coefficient: number; // multiplier to convert to square meters
  description: string;
  region: 'Bắc Bộ' | 'Trung Bộ' | 'Nam Bộ' | 'Toàn Quốc';
}

export const LAND_UNITS: LandUnit[] = [
  { name: "m²", coefficient: 1, description: "Mét vuông tiêu chuẩn quốc tế", region: "Toàn Quốc" },
  { name: "Sào Bắc Bộ", coefficient: 360, description: "1 sào Bắc Bộ = 360 m²", region: "Bắc Bộ" },
  { name: "Mẫu Bắc Bộ", coefficient: 3600, description: "1 mẫu Bắc Bộ = 10 sào = 3600 m²", region: "Bắc Bộ" },
  { name: "Sào Trung Bộ", coefficient: 500, description: "1 sào Trung Bộ = 500 m²", region: "Trung Bộ" },
  { name: "Mẫu Trung Bộ", coefficient: 5000, description: "1 mẫu Trung Bộ = 10 sào = 5000 m²", region: "Trung Bộ" },
  { name: "Sào Nam Bộ (Công)", coefficient: 1000, description: "1 công đất Nam Bộ = 1000 m²", region: "Nam Bộ" },
  { name: "Công lớn Nam Bộ", coefficient: 1296, description: "1 công tầm lớn = 1296 m²", region: "Nam Bộ" },
  { name: "Mẫu Nam Bộ", coefficient: 10000, description: "1 mẫu Nam Bộ = 10 công = 10,000 m²", region: "Nam Bộ" },
  { name: "Hecta (ha)", coefficient: 10000, description: "1 hecta = 10,000 m²", region: "Toàn Quốc" }
];
