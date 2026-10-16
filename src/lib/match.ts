import { ACTIVE_PROPERTY_STATUSES, DIRECTION_LABEL, isApartment } from '../constants';
import type { Tone } from '../constants';
import type { Customer, Property } from '../types';
import { formatNumber } from './format';
import { normalize } from './text';

export interface MatchResult {
  /** 0–100 */
  score: number;
  matched: string[];
  missed: string[];
}

/** Diện tích dùng để so sánh / tính giá m²: căn hộ dùng diện tích sử dụng, còn lại dùng diện tích đất. */
export function mainArea(p: Pick<Property, 'type' | 'landArea' | 'floorArea'>): number | undefined {
  return isApartment(p.type) ? (p.floorArea ?? p.landArea) : (p.landArea ?? p.floorArea);
}

/**
 * Chấm điểm mức độ phù hợp giữa nhu cầu của khách và một BĐS.
 * Trả về null nếu chắc chắn không phù hợp (khác nhu cầu mua/thuê hoặc BĐS đã giao dịch).
 */
export function matchProperty(c: Customer, p: Property, projectName = ''): MatchResult | null {
  if (c.transaction !== p.transaction) return null;
  if (!ACTIVE_PROPERTY_STATUSES.includes(p.status)) return null;

  let total = 0;
  let got = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  // Loại hình (trọng số 3)
  if (c.propertyTypes.length) {
    total += 3;
    if (c.propertyTypes.includes(p.type)) {
      got += 3;
      matched.push('Đúng loại hình');
    } else {
      missed.push('Khác loại hình');
    }
  }

  // Ngân sách (3)
  if (c.budgetMin || c.budgetMax) {
    total += 3;
    const price = p.price ?? 0;
    if (!price) {
      got += 1.5;
      matched.push('Giá thỏa thuận');
    } else if (c.budgetMax && price > c.budgetMax) {
      const over = Math.round(((price - c.budgetMax) / c.budgetMax) * 100);
      if (over <= 10) got += 1.5;
      missed.push(`Vượt ngân sách ${over}%`);
    } else if (c.budgetMin && price < c.budgetMin * 0.8) {
      got += 1.5;
      matched.push('Thấp hơn ngân sách');
    } else {
      got += 3;
      matched.push('Trong ngân sách');
    }
  }

  // Khu vực / dự án (3)
  if (c.province || c.locations.length || c.projectIds.length) {
    total += 3;
    const haystack = normalize([p.street, p.ward, p.area, p.province, projectName].join(' '));
    const sameProvince = !c.province || normalize(c.province) === normalize(p.province);
    const inProject = !!p.projectId && c.projectIds.includes(p.projectId);
    const hit = c.locations.find((loc) => {
      const n = normalize(loc);
      return n !== '' && haystack.includes(n);
    });
    if (inProject) {
      got += 3;
      matched.push('Thuộc dự án khách quan tâm');
    } else if (hit && sameProvince) {
      got += 3;
      matched.push(`Khu vực: ${hit}`);
    } else if (!c.locations.length && !c.projectIds.length) {
      if (sameProvince) {
        got += 3;
        matched.push('Đúng tỉnh/thành');
      } else {
        missed.push('Khác tỉnh/thành');
      }
    } else if (sameProvince && c.province) {
      got += 1;
      missed.push('Chưa đúng khu vực mong muốn');
    } else {
      missed.push('Khác khu vực');
    }
  }

  // Diện tích (2)
  if (c.areaMin || c.areaMax) {
    total += 2;
    const area = mainArea(p);
    if (!area) {
      got += 1;
    } else {
      const label = `${formatNumber(area, 1)} m²`;
      const tooSmall = c.areaMin ? area < c.areaMin : false;
      const tooBig = c.areaMax ? area > c.areaMax : false;
      const farOff = (c.areaMin && area < c.areaMin * 0.9) || (c.areaMax && area > c.areaMax * 1.1);
      if (farOff) {
        missed.push(`Diện tích ${label}`);
      } else if (tooSmall || tooBig) {
        got += 1;
        matched.push(`Diện tích gần đúng (${label})`);
      } else {
        got += 2;
        matched.push(`Diện tích ${label}`);
      }
    }
  }

  // Phòng ngủ (1)
  if (c.bedroomsMin) {
    total += 1;
    if (p.bedrooms === undefined) {
      got += 0.5;
    } else if (p.bedrooms >= c.bedroomsMin) {
      got += 1;
      matched.push(`${p.bedrooms} phòng ngủ`);
    } else {
      missed.push(`Chỉ ${p.bedrooms} phòng ngủ`);
    }
  }

  // Hướng (1)
  if (c.directions.length) {
    total += 1;
    if (!p.direction) {
      got += 0.5;
    } else if (c.directions.includes(p.direction)) {
      got += 1;
      matched.push(`Hướng ${DIRECTION_LABEL[p.direction]}`);
    } else {
      missed.push(`Hướng ${DIRECTION_LABEL[p.direction]}`);
    }
  }

  // Pháp lý (1)
  if (c.requireLegal) {
    total += 1;
    if (p.legal === 'so_rieng') {
      got += 1;
      matched.push('Sổ riêng');
    } else {
      missed.push('Chưa có sổ riêng');
    }
  }

  const score = total ? Math.round((got / total) * 100) : 60;
  return { score, matched, missed };
}

export const MATCH_THRESHOLD = 50;

export function matchLevel(score: number): { label: string; tone: Tone } {
  if (score >= 80) return { label: 'Rất phù hợp', tone: 'emerald' };
  if (score >= 60) return { label: 'Phù hợp', tone: 'blue' };
  return { label: 'Tham khảo', tone: 'amber' };
}
