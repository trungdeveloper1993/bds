import { digitsOnly } from './text';

const formatters = new Map<number, Intl.NumberFormat>();
function nf(maxFractionDigits: number): Intl.NumberFormat {
  let f = formatters.get(maxFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: maxFractionDigits });
    formatters.set(maxFractionDigits, f);
  }
  return f;
}

export function formatNumber(value: number | undefined, maxFractionDigits = 2): string {
  if (value === undefined || Number.isNaN(value)) return '';
  return nf(maxFractionDigits).format(value);
}

/** 8_500_000_000 → "8,5 tỷ"; 850_000_000 → "850 triệu". */
export function formatMoney(value: number | undefined, empty = 'Thỏa thuận'): string {
  if (!value || value <= 0) return empty;
  if (value >= 1e9) return `${nf(2).format(value / 1e9)} tỷ`;
  if (value >= 1e6) return `${nf(1).format(value / 1e6)} triệu`;
  if (value >= 1e3) return `${nf(0).format(value / 1e3)} nghìn`;
  return `${nf(0).format(value)} đ`;
}

/** Giá theo nhu cầu: cho thuê thêm "/tháng". */
export function formatPrice(value: number | undefined, transaction: 'ban' | 'cho_thue'): string {
  const text = formatMoney(value);
  return value && value > 0 && transaction === 'cho_thue' ? `${text}/tháng` : text;
}

export function formatUnitPrice(price: number | undefined, area: number | undefined): string {
  if (!price || !area || area <= 0) return '';
  const perM2 = price / area;
  if (perM2 >= 1e6) return `${nf(1).format(perM2 / 1e6)} triệu/m²`;
  return `${nf(0).format(perM2 / 1e3)} nghìn/m²`;
}

export function formatArea(value: number | undefined): string {
  if (!value) return '';
  return `${nf(1).format(value)} m²`;
}

export function formatBudget(min?: number, max?: number): string {
  if (min && max) return `${formatMoney(min, '')} – ${formatMoney(max, '')}`;
  if (max) return `Dưới ${formatMoney(max, '')}`;
  if (min) return `Từ ${formatMoney(min, '')}`;
  return '';
}

export function formatAreaRange(min?: number, max?: number): string {
  if (min && max) return `${formatNumber(min, 1)} – ${formatNumber(max, 1)} m²`;
  if (max) return `Dưới ${formatNumber(max, 1)} m²`;
  if (min) return `Từ ${formatNumber(min, 1)} m²`;
  return '';
}

/** 0909123456 → "0909 123 456". */
export function formatPhone(phone: string): string {
  const d = digitsOnly(phone);
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 11) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return phone.trim();
}

export const telHref = (phone: string) => `tel:${digitsOnly(phone)}`;
export const zaloHref = (phone: string) => `https://zalo.me/${digitsOnly(phone)}`;

// ---------- Ngày giờ ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD. */
export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Giá trị cho <input type="datetime-local">. */
export function toDateTimeInput(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  // YYYY-MM-DD hiểu theo giờ địa phương (không phải UTC).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | undefined): string {
  const d = value ? parseDate(value) : null;
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | undefined): string {
  const d = value ? parseDate(value) : null;
  if (!d) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${formatDate(value)}`;
}

/** Số ngày từ hôm nay tới ngày cho trước (âm = đã qua). */
export function daysFromToday(value: string): number | null {
  const d = parseDate(value);
  if (!d) return null;
  const start = parseDate(todayStr())!;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** "Hôm nay", "Ngày mai", "Trễ 3 ngày", "Còn 5 ngày"... */
export function relativeDay(value: string): string {
  const diff = daysFromToday(value);
  if (diff === null) return '';
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  if (diff < 0) return `Trễ ${-diff} ngày`;
  if (diff <= 30) return `Còn ${diff} ngày`;
  return formatDate(value);
}

export function timeAgo(value: string | undefined): string {
  const d = value ? parseDate(value) : null;
  if (!d) return '';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(value);
}

export function fileStamp(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
