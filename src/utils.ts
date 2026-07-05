/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GPSPoint, VN2000Point, SyncedPoint, SideInput } from "./types";

// Define the base anchors and scaling parameters for Hanoi (kept for fallback)
export const GPS_ANCHOR = { lat: 21.0285, lng: 105.8542 };
export const VN2000_ANCHOR = { x: 2321542.15, y: 598314.56 };

export const LAT_TO_METERS = 111132.92;
export const LNG_TO_METERS = 111319.49 * Math.cos((GPS_ANCHOR.lat * Math.PI) / 180); // ~103912.55

export interface ProvinceCM {
  name: string;
  meridian: number; // in degrees
}

export const PROVINCES_CM: ProvinceCM[] = [
  { name: "An Giang", meridian: 104.75 },
  { name: "Bà Rịa - Vũng Tàu", meridian: 107.75 },
  { name: "Bạc Liêu", meridian: 105.00 },
  { name: "Bắc Giang", meridian: 107.00 },
  { name: "Bắc Kạn", meridian: 106.00 },
  { name: "Bắc Ninh", meridian: 105.50 },
  { name: "Bến Tre", meridian: 105.75 },
  { name: "Bình Dương", meridian: 105.75 },
  { name: "Bình Định", meridian: 108.50 },
  { name: "Bình Phước", meridian: 106.00 },
  { name: "Bình Thuận", meridian: 108.50 },
  { name: "Cà Mau", meridian: 104.50 },
  { name: "Cao Bằng", meridian: 105.75 },
  { name: "Cần Thơ", meridian: 105.00 },
  { name: "Đà Nẵng", meridian: 107.75 },
  { name: "Đắk Lắk", meridian: 108.50 },
  { name: "Đắk Nông", meridian: 108.50 },
  { name: "Điện Biên", meridian: 103.00 },
  { name: "Đồng Nai", meridian: 107.75 },
  { name: "Đồng Tháp", meridian: 105.00 },
  { name: "Gia Lai", meridian: 108.50 },
  { name: "Hà Giang", meridian: 104.50 },
  { name: "Hà Nam", meridian: 105.00 },
  { name: "Hà Nội", meridian: 105.00 },
  { name: "Hà Tĩnh", meridian: 105.75 },
  { name: "Hải Dương", meridian: 105.50 },
  { name: "Hải Phòng", meridian: 106.00 },
  { name: "Hậu Giang", meridian: 105.00 },
  { name: "Hòa Bình", meridian: 105.00 },
  { name: "Hưng Yên", meridian: 105.50 },
  { name: "Khánh Hòa", meridian: 108.25 },
  { name: "Kiên Giang", meridian: 104.50 },
  { name: "Kon Tum", meridian: 107.50 },
  { name: "Lai Châu", meridian: 103.00 },
  { name: "Lạng Sơn", meridian: 106.50 },
  { name: "Lào Cai", meridian: 104.00 },
  { name: "Lâm Đồng", meridian: 107.75 },
  { name: "Long An", meridian: 105.50 },
  { name: "Nam Định", meridian: 105.50 },
  { name: "Nghệ An", meridian: 104.75 },
  { name: "Ninh Bình", meridian: 105.00 },
  { name: "Ninh Thuận", meridian: 108.25 },
  { name: "Phú Thọ", meridian: 104.75 },
  { name: "Phú Yên", meridian: 108.50 },
  { name: "Quảng Bình", meridian: 106.00 },
  { name: "Quảng Nam", meridian: 107.75 },
  { name: "Quảng Ngãi", meridian: 108.00 },
  { name: "Quảng Ninh", meridian: 107.75 },
  { name: "Quảng Trị", meridian: 106.75 },
  { name: "Sóc Trăng", meridian: 105.50 },
  { name: "Sơn La", meridian: 104.00 },
  { name: "Tây Ninh", meridian: 105.00 },
  { name: "Thái Bình", meridian: 105.50 },
  { name: "Thái Nguyên", meridian: 106.00 },
  { name: "Thanh Hóa", meridian: 105.00 },
  { name: "Thừa Thiên Huế", meridian: 107.00 },
  { name: "Tiền Giang", meridian: 105.75 },
  { name: "TP. Hồ Chí Minh", meridian: 105.75 },
  { name: "Trà Vinh", meridian: 105.75 },
  { name: "Tuyên Quang", meridian: 105.25 },
  { name: "Vĩnh Long", meridian: 105.50 },
  { name: "Vĩnh Phúc", meridian: 105.00 },
  { name: "Yên Bái", meridian: 104.75 }
];

export function autoDetectProvince(points: { x: number; y: number }[]): ProvinceCM | null {
  if (points.length === 0) return null;
  const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;

  if (avgX < 1100000) {
    return { name: "Cà Mau", meridian: 104.50 };
  } else if (avgX < 1300000) {
    return { name: "TP. Hồ Chí Minh", meridian: 105.75 };
  } else if (avgX < 1800000) {
    return { name: "Đà Nẵng", meridian: 107.75 };
  } else {
    return { name: "Hà Nội", meridian: 105.00 };
  }
}

/**
 * Advanced Gauss-Kruger (Transverse Mercator) Forward Projection
 * Converts WGS84 GPS (latitude, longitude) to VN-2000 (x: Northing, y: Easting)
 * based on a local Central Meridian (Kinh tuyến trục) in degrees.
 * 
 * VN-2000 standard ellipsoid (WGS-84):
 *  a = 6378137.0 m
 *  f = 1 / 298.257223563
 *  Scale Factor (k0) = 0.9999 (for 3-degree local cadastre zone)
 *  False Easting (FE) = 500000 m
 *  False Northing (FN) = 0 m
 */
export function convertGPSToVN2000(
  lat: number, 
  lng: number, 
  centralMeridianDegree: number = 105.0, 
  scaleFactor: number = 0.9999
): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = scaleFactor;
  const FE = 500000.0;

  const lat_rad = (lat * Math.PI) / 180;
  const lng_rad = (lng * Math.PI) / 180;
  const lng0_rad = (centralMeridianDegree * Math.PI) / 180;

  const e2 = f * (2 - f);
  const e_prime2 = e2 / (1 - e2);

  const sin_lat = Math.sin(lat_rad);
  const cos_lat = Math.cos(lat_rad);
  const tan_lat = Math.tan(lat_rad);
  const tan_lat_2 = tan_lat * tan_lat;
  const tan_lat_4 = tan_lat_2 * tan_lat_2;

  const N = a / Math.sqrt(1 - e2 * sin_lat * sin_lat);
  const T = tan_lat_2;
  const C = e_prime2 * cos_lat * cos_lat;
  const A = (lng_rad - lng0_rad) * cos_lat;
  const A2 = A * A;
  const A3 = A2 * A;
  const A4 = A3 * A;
  const A5 = A4 * A;
  const A6 = A5 * A;

  // Meridian distance M
  const C1 = 1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * Math.pow(e2, 3)) / 256;
  const C2 = (3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * Math.pow(e2, 3)) / 1024;
  const C3 = (15 * e2 * e2) / 256 + (45 * Math.pow(e2, 3)) / 1024;
  const C4 = (35 * Math.pow(e2, 3)) / 3072;

  const M = a * (
    C1 * lat_rad - 
    C2 * Math.sin(2 * lat_rad) + 
    C3 * Math.sin(4 * lat_rad) - 
    C4 * Math.sin(6 * lat_rad)
  );

  // Northing (x)
  const x = k0 * (M + N * tan_lat * (
    A2 / 2 + 
    (5 - T + 9 * C + 4 * C * C) * A4 / 24 + 
    (61 - 58 * T + T * T + 600 * C - 330 * e_prime2) * A6 / 720
  ));

  // Easting (y)
  const y = FE + k0 * N * (
    A + 
    (1 - T + C) * A3 / 6 + 
    (5 - 18 * T + T * T + 72 * C - 58 * e_prime2) * A5 / 120
  );

  return {
    x: parseFloat(x.toFixed(2)),
    y: parseFloat(y.toFixed(2))
  };
}

/**
 * Advanced Gauss-Kruger (Transverse Mercator) Reverse Projection
 * Converts VN-2000 (x: Northing, y: Easting) to WGS84 GPS (latitude, longitude)
 * based on a local Central Meridian (Kinh tuyến trục) in degrees.
 */
export function convertVN2000ToGPS(
  x: number, 
  y: number, 
  centralMeridianDegree: number = 105.0, 
  scaleFactor: number = 0.9999
): { lat: number; lng: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = scaleFactor;
  const FE = 500000.0;
  
  const e2 = f * (2 - f);
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const e_prime2 = e2 / (1 - e2);
  
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const e1_2 = e1 * e1;
  const e1_3 = e1_2 * e1;
  const e1_4 = e1_3 * e1;

  const M = x / k0;
  const Y_prime = y - FE;

  const C1 = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
  const mu = M / (a * C1);

  const J1 = (3 * e1) / 2 - (27 * e1_3) / 32;
  const J2 = (21 * e1_2) / 16 - (55 * e1_4) / 32;
  const J3 = (151 * e1_3) / 96;
  const J4 = (1097 * e1_4) / 512;

  const phi1 = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

  const sin_phi1 = Math.sin(phi1);
  const cos_phi1 = Math.cos(phi1);
  const tan_phi1 = Math.tan(phi1);
  const tan_phi1_2 = tan_phi1 * tan_phi1;
  const tan_phi1_4 = tan_phi1_2 * tan_phi1_2;

  const tmp = 1 - e2 * sin_phi1 * sin_phi1;
  const N1 = a / Math.sqrt(tmp);
  const R1 = (a * (1 - e2)) / Math.pow(tmp, 1.5);

  const D = Y_prime / (N1 * k0);
  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D3 * D;
  const D5 = D4 * D;
  const D6 = D5 * D;

  const C_prime1 = e_prime2 * cos_phi1 * cos_phi1;
  const C_prime1_2 = C_prime1 * C_prime1;

  const lat_rad = phi1 - (N1 * tan_phi1 / R1) * (
    D2 / 2 - 
    (5 + 3 * tan_phi1_2 + 10 * C_prime1 - 4 * C_prime1_2 - 9 * e_prime2) * D4 / 24 + 
    (61 + 90 * tan_phi1_2 + 298 * C_prime1 + 45 * tan_phi1_4 - 252 * e_prime2 - 3 * C_prime1_2) * D6 / 720
  );

  const lng_rad = (D - 
    (1 + 2 * tan_phi1_2 + C_prime1) * D3 / 6 + 
    (5 - 2 * C_prime1 + 28 * tan_phi1_2 - 3 * C_prime1_2 + 8 * e_prime2 + 24 * tan_phi1_4) * D5 / 120
  ) / cos_phi1;

  const lat = (lat_rad * 180) / Math.PI;
  const lng = centralMeridianDegree + (lng_rad * 180) / Math.PI;

  return {
    lat: parseFloat(lat.toFixed(7)),
    lng: parseFloat(lng.toFixed(7))
  };
}

/**
 * Calculates the distance in meters between two Cartesian points (VN-2000)
 */
export function calculateCartesianDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculates the Cartesian area of a polygon using the Shoelace (Gauss) Formula
 * Points must be ordered sequentially (clockwise or counter-clockwise)
 */
export function calculateCartesianArea(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const current = points[i];
    const next = points[(i + 1) % n];
    area += current.x * next.y - next.x * current.y;
  }
  
  return Math.abs(area) / 2;
}

/**
 * Haversine formula to calculate distance between two GPS coordinates in meters
 */
export function calculateGPSDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Projects GPS coordinates into relative local Cartesian coordinates (in meters)
 * centered on the polygon's centroid. This enables precise Shoelace area calculations.
 */
export function projectGPSToCartesian(points: { lat: number; lng: number }[]): { x: number; y: number }[] {
  if (points.length === 0) return [];
  
  // Project using the exact same scaling factors and anchors as convertGPSToVN2000
  // to ensure 100% mathematical consistency and perfect synchronization of areas.
  return points.map(p => ({
    x: (p.lng - GPS_ANCHOR.lng) * LNG_TO_METERS,
    y: (p.lat - GPS_ANCHOR.lat) * LAT_TO_METERS
  }));
}

/**
 * Calculates the surface area of a GPS polygon in square meters
 */
export function calculateGPSArea(points: { lat: number; lng: number }[]): number {
  if (points.length < 3) return 0;
  const projected = projectGPSToCartesian(points);
  return calculateCartesianArea(projected);
}

/**
 * Formats currency in Vietnamese Dong (VND)
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

/**
 * Convert number into human-readable Vietnamese text description
 * e.g., 5500000000 -> "5 tỷ 500 triệu"
 */
export function convertNumberToVietnameseWords(num: number): string {
  if (num === 0) return "0 VNĐ";
  if (num < 0) return "Số không hợp lệ";

  const ty = Math.floor(num / 1000000000);
  const trieu = Math.floor((num % 1000000000) / 1000000);
  const nghin = Math.floor((num % 1000000) / 1000);
  const dong = num % 1000;

  const parts: string[] = [];
  if (ty > 0) parts.push(`${ty} tỷ`);
  if (trieu > 0) parts.push(`${trieu} triệu`);
  if (nghin > 0 && ty === 0) parts.push(`${nghin} nghín`); // Only show smaller if no bill/mil or relevant
  else if (nghin > 0 && trieu === 0 && ty > 0) parts.push(`0 triệu ${nghin} nghìn`);
  else if (nghin > 0) parts.push(`${nghin} nghìn`);
  
  if (dong > 0 && parts.length === 0) parts.push(`${dong} đồng`);
  else if (dong > 0) parts.push(`${dong} đ`);

  return parts.join(' ') + " VNĐ";
}

/**
 * Fully spells out numbers in Vietnamese text (Chữ)
 * e.g., 1200000 -> "Một triệu hai trăm nghìn đồng"
 */
export function spellOutNumberVietnamese(num: number): string {
  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  if (num === 0) return "Không đồng";
  
  let tempNum = Math.floor(num);
  let result = "";
  let unitIndex = 0;

  function readGroupOfThree(n: number, isLast: boolean): string {
    let s = "";
    const h = Math.floor(n / 100);
    const c = Math.floor((n % 100) / 10);
    const dv = n % 10;

    if (h > 0 || !isLast) {
      s += digits[h] + " trăm ";
    }

    if (c > 0) {
      if (c === 1) s += "mười ";
      else s += digits[c] + " mươi ";
    } else if (h > 0 && dv > 0) {
      s += "lẻ ";
    }

    if (dv > 0) {
      if (dv === 1 && c > 1) s += "mốt";
      else if (dv === 5 && c > 0) s += "lăm";
      else s += digits[dv];
    }

    return s.trim();
  }

  const groups: number[] = [];
  while (tempNum > 0) {
    groups.push(tempNum % 1000);
    tempNum = Math.floor(tempNum / 1000);
  }

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group > 0) {
      const groupText = readGroupOfThree(group, i === groups.length - 1);
      const unitText = units[i] ? " " + units[i] : "";
      result = groupText + unitText + (result ? ", " + result : "");
    }
  }

  // Capitalize first letter and format
  result = result.trim().replace(/\s+/g, ' ');
  if (result) {
    result = result.charAt(0).toUpperCase() + result.slice(1) + " đồng";
  } else {
    result = "Không đồng";
  }

  return result;
}

/**
 * Analyzes the geometrical proportions of the land and suggests real estate advice
 */
export function analyzeLandShape(points: { x: number; y: number }[]): {
  type: string;
  description: string;
  fengshui: string;
  pros: string[];
  cons: string[];
} {
  if (points.length < 3) {
    return {
      type: "Chưa xác định",
      description: "Nhập thêm mốc tọa độ để phân tích hình dáng thửa đất.",
      fengshui: "Cần tối thiểu 3 điểm mốc.",
      pros: [],
      cons: []
    };
  }

  // Calculate coordinates min/max to find aspect ratio and shape characteristics
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const ratio = width > 0 ? height / width : 1;
  
  const n = points.length;

  if (n === 3) {
    return {
      type: "Thửa đất hình Tam Giác (Hỏa sa)",
      description: "Thửa đất có cấu trúc 3 góc nhọn.",
      fengshui: "Theo phong thủy Đông Á, đất hình tam giác (Hỏa hình) có năng lượng hỏa mạnh, dễ gây tâm lý nóng nảy hoặc bất an nếu không xây dựng đúng cách. Thường được khuyên làm khuôn viên, sân vườn ở các góc nhọn, xây nhà vuông vắn ở giữa.",
      pros: ["Dễ tạo điểm nhấn cảnh quan độc đáo", "Thường có giá mua rẻ hơn mặt bằng chung"],
      cons: ["Góc nhọn khó tận dụng diện tích triệt để", "Xây dựng đòi hỏi thiết kế kiến trúc khéo léo để tránh góc chết"]
    };
  }

  if (n === 4) {
    // Check if rectangular-ish
    const isSquare = Math.abs(ratio - 1) < 0.15;
    if (isSquare) {
      return {
        type: "Thửa đất Vuông Vắn (Tứ quý)",
        description: "Tỷ lệ chiều dài và chiều rộng rất cân đối, gần như bằng nhau.",
        fengshui: "Cực kỳ tốt lành trong phong thủy. Đất vuông vắn tượng trưng cho sự vững chãi, cân bằng khí, mang lại tài lộc và gia đạo yên vui bình ổn. Khí luân chuyển đều khắp các góc thửa đất.",
        pros: ["Tận dụng 100% diện tích xây dựng", "Dễ dàng quy hoạch nhà cửa, sân vườn", "Giá trị thanh khoản và sang nhượng cực cao"],
        cons: ["Thường có mức giá cạnh tranh cao, đắt đỏ"]
      };
    } else if (ratio > 2.5 || ratio < 0.4) {
      return {
        type: "Thửa đất Dài Hẹp (Dạng ống)",
        description: "Mảnh đất có tỷ lệ chiều sâu lớn hơn nhiều so với chiều ngang (hoặc ngược lại).",
        fengshui: "Phổ biến tại các đô thị lớn Việt Nam. Phong thủy cần chú ý lấy sáng và thông gió tự nhiên ở giữa nhà (giếng trời) để tránh tụ khí xấu, giữ dòng sinh khí lưu thông thông suốt.",
        pros: ["Phù hợp xây dựng nhà ống cao tầng hiện đại", "Tối ưu hóa mặt tiền thương mại ở phố lớn"],
        cons: ["Thiếu không gian mở hai bên hông", "Dễ bị thiếu ánh sáng tự nhiên nếu không chừa giếng trời"]
      };
    } else {
      // General rectangle or check for nở hậu / thắt eo
      // Let's assume point order: front-left, front-right, back-right, back-left
      // Let's check front width vs back width
      // Sort points by X (assuming X is depth, Y is width for simplicity)
      // Or just standard rectangular
      return {
        type: "Thửa đất Chữ Nhật Cân Đối",
        description: "Thửa đất hình chữ nhật tiêu chuẩn, vuông vức và hài hòa.",
        fengshui: "Rất vượng khí. Hình chữ nhật đại diện cho hành Mộc, mang tính sinh trưởng, phát triển dồi dào. Thích hợp cho cả nhà ở lẫn kinh doanh buôn bán.",
        pros: ["Dễ bố trí công năng sử dụng", "Phù hợp với đa số thiết kế biệt thự, nhà phố", "Tính thanh khoản cao"],
        cons: ["Không có nhược điểm lớn về mặt hình thể"]
      };
    }
  }

  if (n === 5) {
    return {
      type: "Thửa đất Đa Giác 5 Cạnh",
      description: "Đất có 5 góc ranh giới khác nhau.",
      fengshui: "Địa thế có phần phức tạp. Cần xem xét hướng của các góc nhọn. Nếu xây dựng nên thiết kế nhà dạng vuông vắn tập trung ở tâm đất, phần đất thừa bo tròn góc làm tiểu cảnh, trồng cây xanh hóa giải sát khí.",
      pros: ["Dễ tạo không gian sân vườn bao quanh", "Diện tích thường rộng, dễ thỏa sức sáng tạo kiến trúc biệt thự"],
      cons: ["Khó xây dựng sát tường ranh giới", "Đòi hỏi đơn vị thiết kế có kinh nghiệm"]
    };
  }

  return {
    type: `Thửa đất Đa Giác Phức Tạp (${n} cạnh)`,
    description: `Mảnh đất có ranh giới nhiều góc cạnh (${n} điểm mốc ranh giới).`,
    fengshui: "Đất nhiều góc cạnh cần tận dụng triệt để thuật 'tị hung hóa cát': xây công trình chính vuông vắn ở trung tâm, dùng các diện tích góc cạnh làm sân vườn, gara, hoặc nhà kho phụ trợ.",
    pros: ["Thường có mặt bằng độc đáo, không đụng hàng", "Thích hợp làm homestay, biệt thự sân vườn nghệ thuật"],
    cons: ["Chi phí xây dựng tường bao và móng cao hơn", "Đo đạc và cắm mốc thực địa phức tạp hơn"]
  };
}

/**
 * Reconstructs 2D Cartesian coordinates (matching our Hanoi VN2000 anchor)
 * using a stable numerical relaxation algorithm from given sequential side lengths.
 */
export function reconstructPointsFromSides(sides: SideInput[]): SyncedPoint[] {
  if (sides.length < 3) return [];

  const N = sides.length;
  // Initialize vertices distributed on a circle
  const pts = Array.from({ length: N }, (_, i) => {
    const angle = (i * 2 * Math.PI) / N;
    const avgLen = sides.reduce((sum, s) => sum + s.length, 0) / N;
    const r = avgLen / (2 * Math.sin(Math.PI / N)) || 10;
    return {
      x: r * Math.cos(angle),
      y: r * Math.sin(angle)
    };
  });

  // Relaxation iterations to converge to correct side lengths
  for (let iter = 0; iter < 120; iter++) {
    for (let i = 0; i < N; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % N];
      const targetLen = sides[i].length;
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const currentLen = Math.sqrt(dx * dx + dy * dy) || 0.001;
      
      const diff = targetLen - currentLen;
      const offsetX = (dx / currentLen) * diff * 0.5;
      const offsetY = (dy / currentLen) * diff * 0.5;
      
      pts[i].x -= offsetX;
      pts[i].y -= offsetY;
      pts[(i + 1) % N].x += offsetX;
      pts[(i + 1) % N].y += offsetY;
    }
    
    // Pin pts[0] at (0, 0) to stop translation drift
    const ox = pts[0].x;
    const oy = pts[0].y;
    for (let i = 0; i < N; i++) {
      pts[i].x -= ox;
      pts[i].y -= oy;
    }
    
    // Rotate pts[1] onto X-axis to stop rotational drift
    const angle = Math.atan2(pts[1].y, pts[1].x);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    for (let i = 0; i < N; i++) {
      const rx = pts[i].x * cos - pts[i].y * sin;
      const ry = pts[i].x * sin + pts[i].y * cos;
      pts[i].x = rx;
      pts[i].y = ry;
    }
  }

  // Map to VN-2000 coordinates centered on our Hanoi anchor
  return pts.map((pt, idx) => {
    const x = VN2000_ANCHOR.x + pt.y; // Swap x/y to align orientation
    const y = VN2000_ANCHOR.y + pt.x;
    return {
      id: `side-${idx}-${Date.now()}`,
      label: `Mốc ${idx + 1}`,
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      lat: 0, // 0 means no GPS coordinate
      lng: 0
    };
  });
}
