import { DIRECTION_LABEL, INVENTORY_STATUS, INVENTORY_STATUSES } from '../constants';
import type { Direction, InventoryItem, InventoryStatus, MapColorBy, MapUnit, Project, ProjectMap, Property, PropertyStatus, UnitTypeRow } from '../types';
import { formatMoney } from './format';
import { mainArea } from './match';
import { bedroomsIn, foldText, parseAreaText, parsePriceText, parseQuery } from './smartfind';

/*
 * Bản đồ tương tác của dự án: ảnh mặt bằng + các ô (căn / lô) khoanh trên ảnh.
 * Dữ liệu từng căn tra theo MÃ CĂN trong bảng hàng của dự án (giá, diện tích, trạng thái),
 * hoặc căn cùng mã trong Giỏ hàng; hình mẫu lấy theo loại căn.
 */

// ---------------------------------------------------------------- Ảnh của dự án

/** Mọi ảnh dự án đang dùng: bộ ảnh, nền bản đồ, hình mẫu loại căn (để dọn rác / xoá cho đúng). */
export function projectImageIds(p: Project): string[] {
  return [...p.images, ...p.maps.map((m) => m.imageId), ...p.unitTypes.map((t) => t.imageId).filter((x): x is string => !!x)];
}

// ---------------------------------------------------------------- Tầng & mã căn

/** Các tầng dùng mặt bằng này, tầng cao nhất trước. */
export function floorList(map: ProjectMap): number[] {
  if (!map.floors) return [];
  const out: number[] = [];
  for (let f = map.floors.to; f >= map.floors.from; f--) if (!map.floors.skip.includes(f)) out.push(f);
  return out;
}

/** Mã căn của một ô: mặt bằng tầng điển hình thì ghép tầng vào (vd "A-12-05"). */
export function unitCode(map: ProjectMap, label: string, floor?: number): string {
  const l = label.trim();
  if (!map.floors || floor === undefined || !l) return l;
  const f = map.codeRule.padFloor ? String(floor).padStart(2, '0') : String(floor);
  return `${map.codeRule.prefix}${f}${map.codeRule.sep}${l}`;
}

/** Chuẩn hoá mã căn: chữ hoa, bỏ khoảng trắng, mọi dấu nối thành "-". */
export const normCode = (code: string) =>
  foldText(code)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[._/\\–—]+/g, '-');
/** Bỏ hết ký tự nối: "A-12-05" ≈ "A1205" — dùng khi bảng hàng ghi mã khác kiểu. */
export const squashCode = (code: string) => normCode(code).replace(/[^A-Z0-9]/g, '');

export interface CodeIndex<T> {
  get(code: string): T | undefined;
}

/** Tra theo mã: khớp chính xác trước, rồi khớp bỏ dấu nối (chỉ khi không bị trùng). */
export function indexByCode<T>(items: T[], codeOf: (x: T) => string): CodeIndex<T> {
  const byNorm = new Map<string, T>();
  const bySquash = new Map<string, T | null>();
  for (const it of items) {
    const code = codeOf(it);
    if (!code.trim()) continue;
    byNorm.set(normCode(code), it);
    const sq = squashCode(code);
    bySquash.set(sq, bySquash.has(sq) && bySquash.get(sq) !== it ? null : it);
  }
  return {
    get(code: string) {
      if (!code.trim()) return undefined;
      return byNorm.get(normCode(code)) ?? bySquash.get(squashCode(code)) ?? undefined;
    },
  };
}

const PROPERTY_STATUS_TO_INVENTORY: Record<PropertyStatus, InventoryStatus> = {
  dang_chao: 'dang_ban',
  dam_phan: 'giu_cho',
  da_coc: 'da_coc',
  hoan_tat: 'da_ban',
  tam_ngung: 'chua_mo',
};

// ---------------------------------------------------------------- Dữ liệu từng ô

export interface ResolvedUnit {
  unit: MapUnit;
  code: string;
  floor?: number;
  item?: InventoryItem;
  /** Căn cùng mã trong Giỏ hàng (BĐS bạn đang chào). */
  property?: Property;
  type?: UnitTypeRow;
  /** undefined = chưa có dữ liệu cho ô này. */
  status?: InventoryStatus;
  price?: number;
  /** Giá theo loại căn khi chưa có giá riêng (vd "3,4 – 3,9 tỷ"). */
  priceText?: string;
  area?: number;
  areaText?: string;
  bedrooms?: number;
  bathrooms?: number;
  direction?: Direction;
  imageId?: string;
  note: string;
}

export interface MapContext {
  inventory: CodeIndex<InventoryItem>;
  properties: CodeIndex<Property>;
  types: Map<string, UnitTypeRow>;
  project: Project;
}

export function mapContext(project: Project, properties: Property[]): MapContext {
  const own = properties.filter((p) => p.projectId === project.id && p.unitCode.trim());
  return {
    inventory: indexByCode(project.inventory, (x) => x.code),
    properties: indexByCode(own, (x) => x.unitCode),
    types: new Map(project.unitTypes.map((t) => [t.id, t])),
    project,
  };
}

/** Loại căn khớp số phòng ngủ (khi chỉ có một loại khớp) — để căn trong Giỏ hàng cũng có hình mẫu. */
function typeForBedrooms(project: Project, bedrooms?: number): UnitTypeRow | undefined {
  if (bedrooms === undefined) return undefined;
  const hits = project.unitTypes.filter((t) => bedroomsIn(`${t.name} ${t.note}`) === bedrooms);
  return hits.length === 1 ? hits[0] : undefined;
}

export function resolveCode(ctx: MapContext, code: string, unit: MapUnit, floor?: number): ResolvedUnit {
  const item = ctx.inventory.get(code);
  const property = ctx.properties.get(code);
  const type = (item?.typeId ? ctx.types.get(item.typeId) : undefined) ?? typeForBedrooms(ctx.project, property?.bedrooms);
  const price = item?.price ?? (property?.transaction === 'ban' ? property.price : undefined);
  const area = item?.area ?? (property ? mainArea(property) : undefined);
  return {
    unit,
    code,
    floor,
    item,
    property,
    type,
    status: item?.status ?? (property ? PROPERTY_STATUS_TO_INVENTORY[property.status] : undefined),
    price,
    priceText: price ? undefined : type?.price.trim() || undefined,
    area,
    areaText: area ? undefined : type?.area.trim() || undefined,
    bedrooms: property?.bedrooms ?? (type ? bedroomsIn(`${type.name} ${type.note}`) : undefined),
    bathrooms: property?.bathrooms,
    direction: item?.direction ?? property?.direction,
    imageId: type?.imageId ?? property?.images[0],
    note: item?.note ?? '',
  };
}

export function resolveUnits(ctx: MapContext, map: ProjectMap, floor?: number): ResolvedUnit[] {
  return map.units.map((u) => resolveCode(ctx, unitCode(map, u.label, floor), u, floor));
}

/** Một dòng bảng hàng (không gắn ô nào trên bản đồ). */
export function resolveItem(ctx: MapContext, code: string): ResolvedUnit {
  return resolveCode(ctx, code, { id: code, points: [], label: code });
}

export interface UnitLocation {
  mapId: string;
  floor?: number;
  unitId: string;
}

/** Tra mã căn → ô trên bản đồ nào, tầng nào (để nhảy từ bảng hàng / Hỏi nhanh tới đúng căn). */
export function buildLocator(maps: ProjectMap[]): CodeIndex<UnitLocation> {
  const entries: Array<{ code: string; loc: UnitLocation }> = [];
  for (const m of maps) {
    const floors = floorList(m);
    for (const u of m.units) {
      if (!u.label.trim()) continue;
      if (floors.length) for (const f of floors) entries.push({ code: unitCode(m, u.label, f), loc: { mapId: m.id, floor: f, unitId: u.id } });
      else entries.push({ code: unitCode(m, u.label), loc: { mapId: m.id, unitId: u.id } });
    }
  }
  const index = indexByCode(entries, (e) => e.code);
  return { get: (code) => index.get(code)?.loc };
}

/** So sánh mã căn tự nhiên: "A-2" trước "A-10". */
export const compareCodes = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }).compare;

// ---------------------------------------------------------------- Màu

export const TYPE_PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#ea580c', '#65a30d'];
export const PRICE_PALETTE = ['#bfdbfe', '#60a5fa', '#2563eb', '#1e40af', '#172554'];
export const DIRECTION_COLORS: Record<Direction, string> = {
  dong: '#f59e0b',
  tay: '#7c3aed',
  nam: '#dc2626',
  bac: '#2563eb',
  dong_nam: '#ea580c',
  dong_bac: '#0891b2',
  tay_nam: '#db2777',
  tay_bac: '#4f46e5',
};

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface Coloring {
  colorOf(r: ResolvedUnit): string | null;
  /** Mục chú thích của căn (để chạm vào chú thích lọc nhanh). */
  keyOf(r: ResolvedUnit): string | null;
  legend: LegendEntry[];
}

/** Ngưỡng chia giá thành tối đa 5 mức (theo phân vị). */
function priceThresholds(values: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 1) return [];
  const bins = Math.min(PRICE_PALETTE.length, sorted.length);
  const out: number[] = [];
  for (let i = 1; i < bins; i++) out.push(sorted[Math.floor((i * sorted.length) / bins)]);
  return [...new Set(out)];
}

export function makeColoring(units: ResolvedUnit[], colorBy: MapColorBy, statusColors: Record<InventoryStatus, string>, types: UnitTypeRow[]): Coloring {
  const count = (pred: (r: ResolvedUnit) => boolean) => units.filter(pred).length;
  if (colorBy === 'type') {
    const color = new Map(types.map((t, i) => [t.id, TYPE_PALETTE[i % TYPE_PALETTE.length]]));
    return {
      colorOf: (r) => (r.type ? (color.get(r.type.id) ?? null) : null),
      keyOf: (r) => r.type?.id ?? null,
      legend: types
        .map((t) => ({ key: t.id, label: t.name || 'Loại chưa đặt tên', color: color.get(t.id)!, count: count((r) => r.type?.id === t.id) }))
        .filter((e) => e.count > 0),
    };
  }
  if (colorBy === 'price') {
    const cuts = priceThresholds(units.map((r) => r.price).filter((p): p is number => !!p));
    const bin = (p: number) => cuts.filter((c) => p >= c).length;
    const labels = [0, ...cuts].map((from, i) => {
      const to = cuts[i];
      return to ? `${formatMoney(from || undefined, 'Dưới')}${from ? ' – ' : ' '}${formatMoney(to, '')}` : `Từ ${formatMoney(from, '')}`;
    });
    return {
      colorOf: (r) => (r.price ? PRICE_PALETTE[bin(r.price) + (PRICE_PALETTE.length - cuts.length - 1)] : null),
      keyOf: (r) => (r.price ? `p${bin(r.price)}` : null),
      legend: labels.map((label, i) => ({
        key: `p${i}`,
        label: cuts.length ? label : 'Có giá',
        color: PRICE_PALETTE[i + (PRICE_PALETTE.length - cuts.length - 1)],
        count: count((r) => !!r.price && bin(r.price) === i),
      })),
    };
  }
  if (colorBy === 'direction') {
    return {
      colorOf: (r) => (r.direction ? DIRECTION_COLORS[r.direction] : null),
      keyOf: (r) => r.direction ?? null,
      legend: (Object.keys(DIRECTION_LABEL) as Direction[])
        .map((d) => ({ key: d, label: DIRECTION_LABEL[d], color: DIRECTION_COLORS[d], count: count((r) => r.direction === d) }))
        .filter((e) => e.count > 0),
    };
  }
  return {
    colorOf: (r) => (r.status ? statusColors[r.status] : null),
    keyOf: (r) => r.status ?? null,
    legend: INVENTORY_STATUSES.map((s) => ({ key: s, label: INVENTORY_STATUS[s].label, color: statusColors[s], count: count((r) => r.status === s) })).filter(
      (e) => e.count > 0,
    ),
  };
}

// ---------------------------------------------------------------- Hình học (toạ độ 0–1)

export interface Pt {
  x: number;
  y: number;
}

export function bbox(points: number[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]);
    x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]);
    y1 = Math.max(y1, points[i + 1]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function polygonArea(points: number[]): number {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return a / 2;
}

/** Trọng tâm đa giác (để đặt nhãn mã căn). */
export function centroid(points: number[]): Pt {
  const a = polygonArea(points);
  if (Math.abs(a) < 1e-9) {
    const b = bbox(points);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = points.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const f = points[i] * points[j + 1] - points[j] * points[i + 1];
    cx += (points[i] + points[j]) * f;
    cy += (points[i + 1] + points[j + 1]) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(x: number, y: number, points: number[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const translatePoints = (points: number[], dx: number, dy: number) => points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));

export function rectPoints(ax: number, ay: number, bx: number, by: number): number[] {
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  return [x0, y0, x1, y0, x1, y1, x0, y1];
}

const clamp01 = (v: number) => Math.min(1.2, Math.max(-0.2, v));
export const clampPoints = (points: number[]) => points.map(clamp01);

/** 4 góc theo thứ tự trên-trái, trên-phải, dưới-phải, dưới-trái (ô tứ giác vẽ theo thứ tự bất kỳ; ô khác dùng khung bao). */
export function quadCorners(points: number[]): Pt[] {
  if (points.length !== 8) {
    const b = bbox(points);
    return [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
    ];
  }
  const pts: Pt[] = [0, 1, 2, 3].map((i) => ({ x: points[i * 2], y: points[i * 2 + 1] }));
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  pts.forEach((p, i) => {
    if (p.x + p.y < pts[start].x + pts[start].y) start = i;
  });
  const ordered = [0, 1, 2, 3].map((i) => pts[(start + i) % 4]);
  if (ordered[1].x < ordered[3].x) [ordered[1], ordered[3]] = [ordered[3], ordered[1]];
  return ordered;
}

/**
 * Chia một ô thành cols × rows ô con đều nhau (khoanh cả dãy căn rồi chia, không bị lệch dần như nhân bản).
 * Nội suy theo 4 góc nên giữ được cả dãy căn nghiêng trong ảnh phối cảnh 3D. Thứ tự: từng hàng, trái sang phải.
 */
export function splitUnit(points: number[], cols: number, rows: number): number[][] {
  const [tl, tr, br, bl] = quadCorners(points);
  const at = (u: number, v: number): Pt => ({
    x: (1 - v) * ((1 - u) * tl.x + u * tr.x) + v * ((1 - u) * bl.x + u * br.x),
    y: (1 - v) * ((1 - u) * tl.y + u * tr.y) + v * ((1 - u) * bl.y + u * br.y),
  });
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at(c / cols, r / rows);
      const b = at((c + 1) / cols, r / rows);
      const d = at((c + 1) / cols, (r + 1) / rows);
      const e = at(c / cols, (r + 1) / rows);
      out.push([a.x, a.y, b.x, b.y, d.x, d.y, e.x, e.y]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Đánh số

/** Số / mã kế tiếp: "05" → "06", "L-09" → "L-10", "A" → "B". */
export function nextLabel(label: string, step = 1): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(label);
  if (m) {
    const n = Math.max(0, Number(m[2]) + step);
    return `${m[1]}${String(n).padStart(m[2].length, '0')}${m[3]}`;
  }
  if (/^[A-Y]$/i.test(label)) return String.fromCharCode(label.charCodeAt(0) + step);
  return label ? `${label}-2` : '01';
}

/** Thứ tự đọc: từng hàng từ trên xuống, trong hàng từ trái sang phải. */
export function readingOrder(units: MapUnit[]): MapUnit[] {
  const items = units.map((u) => ({ u, c: centroid(u.points), h: bbox(u.points).h }));
  const hs = items.map((i) => i.h).sort((a, b) => a - b);
  const tol = (hs[Math.floor(hs.length / 2)] ?? 0.02) * 0.5;
  items.sort((a, b) => a.c.y - b.c.y);
  const rows: Array<typeof items> = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.c.y - row[0].c.y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.c.x - b.c.x).map((i) => i.u));
}

/** Đánh số lại các ô theo thứ tự đọc: tiền tố + số (đủ chữ số); bước 2 để đánh số lẻ / chẵn theo dãy. */
export function renumber(units: MapUnit[], options: { prefix: string; start: number; digits: number; step?: number; ids?: Set<string> }): MapUnit[] {
  const step = options.step ?? 1;
  const target = options.ids?.size ? units.filter((u) => options.ids!.has(u.id)) : units;
  const order = readingOrder(target);
  const labels = new Map(order.map((u, i) => [u.id, `${options.prefix}${String(options.start + i * step).padStart(options.digits, '0')}`]));
  return units.map((u) => (labels.has(u.id) ? { ...u, label: labels.get(u.id)! } : u));
}

// ---------------------------------------------------------------- Lọc căn ("2pn dưới 4 tỷ hướng đông nam")

export interface UnitFilter {
  text: string;
  test(r: ResolvedUnit): boolean;
  /** "tầng 12" trong câu lọc. */
  floor?: number;
  statuses?: InventoryStatus[];
}

const STATUS_WORDS: Array<[RegExp, InventoryStatus]> = [
  [/\b(con hang|con trong|con can|con|dang ban|chua ban|available)\b/, 'dang_ban'],
  [/\b(giu cho|lock|booking|dat cho)\b/, 'giu_cho'],
  [/\b(da coc|coc)\b/, 'da_coc'],
  [/\b(da ban|ban roi|sold|het hang)\b/, 'da_ban'],
  [/\b(chua mo|chua mo ban)\b/, 'chua_mo'],
];

export function parseUnitFilter(text: string, project: Project): UnitFilter | null {
  const raw = text.trim();
  if (!raw) return null;
  const folded = foldText(raw);
  const q = parseQuery(raw);
  const e = q.entities;
  const floorMatch = /\btang\s*(\d{1,3})\b/.exec(folded);
  const statuses = STATUS_WORDS.filter(([re]) => re.test(folded)).map(([, s]) => s);
  const typeHits = project.unitTypes.filter((t) => {
    const name = foldText(t.name).trim();
    return name.length >= 3 && folded.includes(name);
  });
  const sq = squashCode(raw);
  const looksLikeCode = /\d/.test(raw) && !e.price && !e.area && e.bedrooms === undefined && !floorMatch && raw.replace(/[\s.\-_/]/g, '').length <= 10;
  return {
    text: raw,
    floor: floorMatch ? Number(floorMatch[1]) : undefined,
    statuses: statuses.length ? statuses : undefined,
    test(r) {
      if (looksLikeCode) return squashCode(r.code).includes(sq);
      if (e.bedrooms !== undefined && r.bedrooms !== e.bedrooms) return false;
      if (e.price) {
        const range = r.price ? [r.price, r.price] : r.priceText ? parsePriceText(r.priceText) : undefined;
        if (!range || range[1] < (e.price.min ?? 0) || range[0] > (e.price.max ?? Infinity)) return false;
      }
      if (e.area) {
        const range = r.area ? [r.area, r.area] : r.areaText ? parseAreaText(r.areaText) : undefined;
        if (!range || range[1] < (e.area.min ?? 0) || range[0] > (e.area.max ?? Infinity)) return false;
      }
      if (e.directions && !(r.direction && e.directions.includes(r.direction))) return false;
      if (statuses.length && !(r.status && statuses.includes(r.status))) return false;
      if (typeHits.length && !(r.type && typeHits.includes(r.type))) return false;
      return true;
    },
  };
}

/** Lọc có hiệu lực (câu lọc có ít nhất một điều kiện hiểu được). */
export function filterIsActive(f: UnitFilter | null, project: Project): boolean {
  if (!f) return false;
  const q = parseQuery(f.text);
  const e = q.entities;
  const folded = foldText(f.text);
  return (
    e.bedrooms !== undefined ||
    !!e.price ||
    !!e.area ||
    !!e.directions ||
    !!f.statuses ||
    /\d/.test(f.text) ||
    project.unitTypes.some((t) => foldText(t.name).trim().length >= 3 && folded.includes(foldText(t.name).trim()))
  );
}

export interface UnitMatcher {
  test(r: ResolvedUnit): boolean;
  floor?: number;
  /** Hiểu được điều kiện (số PN, giá, hướng…); false = đang tìm theo chữ. */
  structured: boolean;
}

/** Ô lọc gõ tự do: hiểu điều kiện ("2pn dưới 4 tỷ còn hàng"), không thì tìm theo chữ trong mã, loại căn, ghi chú. */
export function unitMatcher(text: string, project: Project): UnitMatcher | null {
  const f = parseUnitFilter(text, project);
  if (!f) return null;
  if (filterIsActive(f, project)) return { test: f.test, floor: f.floor, structured: true };
  const plain = foldText(text).trim();
  return { test: (r) => foldText(`${r.code} ${r.type?.name ?? ''} ${r.note}`).includes(plain), structured: false };
}

// ---------------------------------------------------------------- Văn bản gửi khách

export function unitSummary(r: ResolvedUnit, projectName: string, options: { hidePrice: boolean }): string {
  const parts = [
    r.type?.name,
    r.area ? `${r.area.toLocaleString('vi-VN')} m²` : r.areaText,
    r.bedrooms ? `${r.bedrooms} phòng ngủ` : '',
    r.direction ? `hướng ${DIRECTION_LABEL[r.direction]}` : '',
  ].filter(Boolean);
  const price = options.hidePrice ? 'giá liên hệ' : r.price ? `giá ${formatMoney(r.price, '')}` : r.priceText ? `giá ${r.priceText}` : '';
  const status = r.status ? INVENTORY_STATUS[r.status].label.toLowerCase() : '';
  return [`Căn ${r.code} – ${projectName}`, parts.join(', '), price, status, r.note].filter(Boolean).join(' · ');
}
