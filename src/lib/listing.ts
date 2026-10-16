import {
  DIRECTION_LABEL,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  LEGAL_LABEL,
  PROJECT_STAGE,
  PROPERTY_TYPE_SHORT,
  TRANSACTION_LABEL,
  isApartment,
  isLand,
} from '../constants';
import type { Project, Property, Settings } from '../types';
import { formatArea, formatMoney, formatNumber, formatPhone, formatPrice, formatUnitPrice } from './format';
import { mainArea } from './match';

/** Bỏ số nhà ở đầu địa chỉ ("123/4A Nguyễn Văn Linh" → "Nguyễn Văn Linh") để khách không tự liên hệ chủ. */
export function hideHouseNumber(street: string): string {
  return street.replace(/^\s*(số\s*)?\d+[\w/.-]*\s*,?\s*/i, '').trim();
}

export function formatAddress(
  p: Pick<Property, 'street' | 'ward' | 'area' | 'province'>,
  options: { hideNumber?: boolean } = {},
): string {
  const street = options.hideNumber ? hideHouseNumber(p.street) : p.street.trim();
  return [street, p.ward.trim(), p.area.trim(), p.province.trim()].filter(Boolean).join(', ');
}

export function formatProjectAddress(p: Pick<Project, 'address' | 'ward' | 'area' | 'province'>): string {
  return [p.address.trim(), p.ward.trim(), p.area.trim(), p.province.trim()].filter(Boolean).join(', ');
}

/** Gợi ý tiêu đề tin: "Bán nhà riêng 5x20m, 3 tầng, hẻm ô tô, Phường An Phú, TP. Hồ Chí Minh". */
export function suggestTitle(p: Property, project?: Project): string {
  const parts: string[] = [];
  let head = `${TRANSACTION_LABEL[p.transaction]} ${PROPERTY_TYPE_SHORT[p.type]}`;
  if (project) head += ` ${project.name}`;
  if (p.width && p.length) head += ` ${formatNumber(p.width, 1)}x${formatNumber(p.length, 1)}m`;
  else if (mainArea(p)) head += ` ${formatArea(mainArea(p))}`;
  parts.push(head);
  if (!isLand(p.type) && p.bedrooms) parts.push(`${p.bedrooms}PN`);
  if (!isLand(p.type) && p.floors && p.floors > 1) parts.push(`${p.floors} tầng`);
  if (p.frontage === 'mat_tien') parts.push('mặt tiền');
  if (p.frontage === 'hem_oto') parts.push('hẻm ô tô');
  const place = [p.ward, p.area || p.province].filter(Boolean).join(', ');
  if (place) parts.push(place);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Nội dung tin đăng để dán lên Zalo / Facebook. Chỉ gồm thông tin công khai. */
export function buildListingText(
  p: Property,
  project: Project | undefined,
  settings: Settings,
  options: { hideNumber: boolean },
): string {
  const lines: string[] = [];
  lines.push(`🏡 ${p.title || suggestTitle(p, project)}`);
  lines.push('');

  const address = formatAddress(p, { hideNumber: options.hideNumber });
  if (address) lines.push(`📍 Vị trí: ${address}`);
  if (project) {
    lines.push(`🏢 Dự án: ${project.name}${project.developer ? ` (CĐT ${project.developer})` : ''}`);
  }
  if (p.unitCode) lines.push(`🔢 Mã căn: ${p.unitCode}`);

  const size: string[] = [];
  if (p.landArea) size.push(`${isLand(p.type) ? 'Diện tích' : 'DT đất'} ${formatArea(p.landArea)}`);
  if (p.width && p.length) {
    size.push(`${formatNumber(p.width, 2)} x ${formatNumber(p.length, 2)} m${p.backWidth ? ` (nở hậu ${formatNumber(p.backWidth, 2)} m)` : ''}`);
  }
  if (p.floorArea) size.push(`${isApartment(p.type) ? 'DT thông thủy' : 'DT sử dụng'} ${formatArea(p.floorArea)}`);
  if (size.length) lines.push(`📐 ${size.join(' · ')}`);

  if (!isLand(p.type)) {
    const structure: string[] = [];
    if (p.floors) structure.push(`${p.floors} tầng`);
    if (p.bedrooms) structure.push(`${p.bedrooms} phòng ngủ`);
    if (p.bathrooms) structure.push(`${p.bathrooms} WC`);
    if (structure.length) lines.push(`🏠 Kết cấu: ${structure.join(' · ')}`);
  }

  const orientation: string[] = [];
  if (p.direction) orientation.push(`Hướng ${DIRECTION_LABEL[p.direction]}`);
  if (p.balconyDirection) orientation.push(`ban công ${DIRECTION_LABEL[p.balconyDirection]}`);
  if (orientation.length) lines.push(`🧭 ${orientation.join(', ')}`);

  if (p.frontage) {
    lines.push(`🛣️ ${FRONTAGE_LABEL[p.frontage]}${p.roadWidth ? ` · đường rộng ${formatNumber(p.roadWidth, 1)} m` : ''}`);
  }
  if (p.legal) lines.push(`📜 Pháp lý: ${LEGAL_LABEL[p.legal]}`);
  if (p.furnishing && !isLand(p.type)) lines.push(`🛋️ ${FURNISHING_LABEL[p.furnishing]}`);
  if (p.amenities.length) lines.push(`✨ ${p.amenities.join(' · ')}`);

  const unitPrice = p.transaction === 'ban' ? formatUnitPrice(p.price, mainArea(p)) : '';
  lines.push(
    `💰 Giá: ${formatPrice(p.price, p.transaction)}${unitPrice ? ` (~${unitPrice})` : ''}${p.price && p.negotiable ? ' – còn thương lượng' : ''}`,
  );

  if (p.description.trim()) {
    lines.push('');
    lines.push(p.description.trim());
  }

  lines.push('');
  const contact = [settings.agentName, settings.agentPhone ? formatPhone(settings.agentPhone) : ''].filter(Boolean).join(' – ');
  if (contact) lines.push(`☎️ Liên hệ: ${contact}`);
  if (p.code) lines.push(`🔖 Mã tin: ${p.code}`);
  return lines.join('\n');
}

/** Tóm tắt dự án để gửi khách qua Zalo. */
export function formatPriceRange(from?: number, to?: number): string {
  const a = formatMoney(from, '');
  const b = formatMoney(to, '');
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (a) return `Từ ${a}`;
  if (b) return `Đến ${b}`;
  return '';
}

export function buildProjectText(project: Project, settings: Settings): string {
  const lines: string[] = [];
  lines.push(`🏙️ DỰ ÁN ${project.name.toUpperCase()}`);
  if (project.legalName) lines.push(`(${project.legalName})`);
  lines.push('');
  if (project.developer) lines.push(`🏢 Chủ đầu tư: ${project.developer}`);
  const address = formatProjectAddress(project);
  if (address) lines.push(`📍 Vị trí: ${address}`);
  const scale = [
    project.siteArea ? `${formatNumber(project.siteArea, 2)} ha` : '',
    project.scale,
    project.totalUnits ? `${project.totalUnits.toLocaleString('vi-VN')} sản phẩm` : '',
  ].filter(Boolean);
  if (scale.length) lines.push(`📐 Quy mô: ${scale.join(' · ')}`);
  if (project.unitAreaRange) lines.push(`📏 Diện tích: ${project.unitAreaRange}`);
  lines.push(`🚧 Tình trạng: ${PROJECT_STAGE[project.stage].label}${project.construction ? ` – ${project.construction}` : ''}`);
  const price = formatPriceRange(project.priceFrom, project.priceTo);
  if (price || project.unitPrice) {
    lines.push(`💰 Giá: ${[price, project.unitPrice].filter(Boolean).join(' · ')}${project.priceNote ? ` (${project.priceNote})` : ''}`);
  }
  if (project.handover) lines.push(`🔑 Bàn giao: ${project.handover}${project.handoverStandard ? ` – ${project.handoverStandard}` : ''}`);
  if (project.ownership) lines.push(`📜 Sở hữu: ${project.ownership}`);
  if (project.banks) lines.push(`🏦 Ngân hàng: ${project.banks.split('\n')[0]}`);
  if (project.amenities.length) lines.push(`✨ Tiện ích: ${project.amenities.join(' · ')}`);
  if (project.highlights.trim()) {
    lines.push('');
    lines.push('🌟 Điểm nổi bật:');
    for (const line of project.highlights.split('\n').map((l) => l.trim()).filter(Boolean)) {
      lines.push(`• ${line.replace(/^[-•*+]\s*/, '')}`);
    }
  } else if (project.description.trim()) {
    lines.push('');
    lines.push(project.description.trim());
  }
  lines.push('');
  const contact = [settings.agentName, settings.agentPhone ? formatPhone(settings.agentPhone) : ''].filter(Boolean).join(' – ');
  if (contact) lines.push(`☎️ Liên hệ tư vấn: ${contact}`);
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // dùng cách dự phòng bên dưới
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
