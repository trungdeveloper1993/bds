import { strFromU8, unzip, type Unzipped } from 'fflate';
import type { Direction, InventoryItem, InventoryStatus, UnitTypeRow } from '../types';
import { indexByCode, normCode, squashCode } from './maps';
import { bedroomsIn, foldText } from './smartfind';

/*
 * Bảng hàng: danh sách căn của dự án theo mã căn (giá, diện tích, trạng thái…).
 * Nhập bằng cách dán từ Excel / Google Sheets hoặc mở file .xlsx / .csv mà CĐT, F1 gửi.
 */

// ---------------------------------------------------------------- Đọc bảng

/** Tách bảng từ văn bản dán vào (tab của Excel/Sheets, hoặc CSV dấu phẩy / chấm phẩy). */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!clean.trim()) return [];
  const firstLines = clean.split('\n').slice(0, 5).join('\n');
  const delimiter = firstLines.includes('\t') ? '\t' : (firstLines.match(/;/g)?.length ?? 0) > (firstLines.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c));
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => unzip(data, (err, files) => (err ? reject(err) : resolve(files))));
}

/** Cột Excel "AB" → số thứ tự 0-based. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Đọc trang tính đầu tiên của file .xlsx (không cần thư viện ngoài). */
async function readXlsx(data: Uint8Array): Promise<string[][]> {
  const files = await unzipAsync(data);
  const xml = (path: string) => (files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null);
  const shared: string[] = [];
  const sst = xml('xl/sharedStrings.xml');
  if (sst) {
    for (const si of Array.from(sst.getElementsByTagName('si'))) {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
    }
  }
  // Trang tính đầu tiên theo thứ tự trong workbook.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const firstSheet = wb?.getElementsByTagName('sheet')[0];
  const rid = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('Không tìm thấy trang tính trong file Excel.');
  const rows: string[][] = [];
  for (const r of Array.from(sheet.getElementsByTagName('row'))) {
    const out: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const idx = columnIndex(c.getAttribute('r') ?? '');
      const type = c.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') value = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      else {
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        value = type === 's' ? (shared[Number(v)] ?? '') : v;
      }
      out[idx] = value.trim();
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((c) => c));
}

/** Mở file bảng hàng: .xlsx, .csv hoặc .txt. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (data[0] === 0x50 && data[1] === 0x4b) return readXlsx(data);
  if (/\.xls$/i.test(file.name)) throw new Error('File .xls (Excel đời cũ) chưa đọc được — hãy lưu lại thành .xlsx hoặc copy rồi dán vào ô bên dưới.');
  return parseTable(new TextDecoder('utf-8').decode(data));
}

// ---------------------------------------------------------------- Nhận cột

export type InventoryField = 'code' | 'type' | 'layout' | 'area' | 'price' | 'status' | 'direction' | 'note';

export const FIELD_LABEL: Record<InventoryField, string> = {
  code: 'Mã căn',
  type: 'Loại căn',
  layout: 'Mẫu căn (hình mẫu)',
  area: 'Diện tích',
  price: 'Giá',
  status: 'Trạng thái',
  direction: 'Hướng',
  note: 'Ghi chú',
};

// Thứ tự quan trọng: "Giá căn" là cột giá, "Loại căn" là cột loại, "Mẫu căn" là cột hình mẫu — cột mã căn xét sau cùng.
const HEADER_RULES: Array<[InventoryField, RegExp]> = [
  ['price', /\b(gia|tong gia|gia ban|thanh tien|gia tri|price)\b/],
  ['area', /\b(dien tich|dt|dtsd|thong thuy|tim tuong|m2|area|s)\b/],
  ['status', /\b(trang thai|tinh trang|tt|status|hien trang)\b/],
  ['direction', /\b(huong|huong cua|huong ban cong|direction)\b/],
  ['type', /\b(loai|loai can|loai hinh|phong ngu|pn|type)\b/],
  ['layout', /\b(mau|mau can|ma mau|hinh mau|thiet ke|mau thiet ke|kieu can|layout|mat bang can)\b/],
  ['note', /\b(ghi chu|view|vi tri|note|mo ta)\b/],
  ['code', /\b(ma can|ma lo|ma nen|ma sp|ma san pham|ma|can so|so can|lo so|so lo|unit|code|can ho|can|lo|nen)\b/],
];

export type ColumnMap = Partial<Record<InventoryField, number>>;

/** Đoán cột theo dòng tiêu đề; trả về cả vị trí dòng tiêu đề (-1 = không có). */
export function detectColumns(rows: string[][]): { map: ColumnMap; headerRow: number } {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const map: ColumnMap = {};
    rows[r].forEach((cell, i) => {
      const f = foldText(cell).trim();
      if (!f || f.length > 40) return;
      for (const [field, re] of HEADER_RULES) {
        if (map[field] === undefined && re.test(f)) {
          map[field] = i;
          break;
        }
      }
    });
    if (map.code !== undefined && Object.keys(map).length >= 2) return { map, headerRow: r };
  }
  // Không có tiêu đề: cột đầu là mã căn, đoán các cột còn lại theo nội dung.
  const map: ColumnMap = { code: 0 };
  const sample = rows.slice(0, 20);
  const width = Math.max(...sample.map((r) => r.length));
  for (let i = 1; i < width; i++) {
    const values = sample.map((r) => r[i] ?? '').filter(Boolean);
    if (!values.length) continue;
    const isArea = (v: string) => {
      const a = parseArea(v);
      return a !== undefined && a >= 15 && a < 800;
    };
    if (map.status === undefined && values.some((v) => parseStatus(v))) map.status = i;
    else if (map.area === undefined && values.every(isArea)) map.area = i;
    else if (map.price === undefined && values.every((v) => (parseMoney(v, '') ?? 0) >= 1e8)) map.price = i;
    else if (map.direction === undefined && values.some((v) => parseDirection(v))) map.direction = i;
  }
  return { map, headerRow: -1 };
}

// ---------------------------------------------------------------- Giá trị

function toNumber(text: string): number | undefined {
  const t = text.replace(/\s/g, '');
  const m = /-?\d[\d.,]*/.exec(t);
  if (!m) return undefined;
  let s = m[0];
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // Dấu xuất hiện sau cùng là dấu thập phân: 3.612.000,5 hoặc 3,612,000.5
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(s) && !/^0\./.test(s))) {
    s = s.replace(/\./g, '');
  } else if (commas > 1 || (commas === 1 && /,\d{3}$/.test(s) && !/^0,/.test(s))) {
    s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "3,6 tỷ", "3.612.000.000", "3600 triệu", "3,6" (cột "Giá (tỷ)") → VND. */
export function parseMoney(text: string, header = ''): number | undefined {
  const f = foldText(text);
  const n = toNumber(f.replace(/ty|ti|trieu|tr|vnd|d\b/g, (m) => ` ${m} `));
  if (n === undefined || n <= 0) return undefined;
  const ty = /\b(ty|ti)\b/.test(f);
  const trieu = /\b(trieu|tr)\b/.test(f);
  if (ty) {
    // "3 tỷ 600" = 3,6 tỷ
    const extra = /\b(?:ty|ti)\s*(\d{1,3})\b/.exec(f);
    return n * 1e9 + (extra ? Number(extra[1]) * 10 ** (9 - extra[1].length) : 0);
  }
  if (trieu) return n * 1e6;
  if (n >= 1e7) return n;
  const h = foldText(header);
  if (/\bty\b/.test(h)) return (n >= 1000 ? n / 1000 : n) * 1e9; // "3.612" trong cột "Giá (tỷ)" là 3,612 tỷ
  if (/\btrieu\b/.test(h)) return n * 1e6;
  if (n < 200) return n * 1e9;
  if (n < 1e6) return n * 1e6;
  return n;
}

export function parseArea(text: string): number | undefined {
  const n = toNumber(text);
  return n !== undefined && n > 0 ? n : undefined;
}

const STATUS_TEXT: Array<[RegExp, InventoryStatus]> = [
  [/\b(chua mo|chua mo ban|khoa|tam ngung|chua ban ra|cdt giu)\b/, 'chua_mo'],
  [/\b(giu cho|lock|lok|booking|book|dat cho|cho duyet|dang giu)\b/, 'giu_cho'],
  [/\b(da coc|coc|dat coc)\b/, 'da_coc'],
  [/\b(da ban|ban roi|sold|het|da ky|hdmb|da giao dich)\b/, 'da_ban'],
  [/\b(con|trong|dang ban|available|mo ban|san sang|chua ban|ok)\b/, 'dang_ban'],
];

export function parseStatus(text: string): InventoryStatus | undefined {
  const f = foldText(text).trim();
  if (!f) return undefined;
  for (const [re, s] of STATUS_TEXT) if (re.test(f)) return s;
  return undefined;
}

const DIRECTION_TEXT: Array<[RegExp, Direction]> = [
  [/\b(dong nam|dn)\b/, 'dong_nam'],
  [/\b(dong bac|db)\b/, 'dong_bac'],
  [/\b(tay nam|tn)\b/, 'tay_nam'],
  [/\b(tay bac|tb)\b/, 'tay_bac'],
  [/\b(dong|d|east|e)\b/, 'dong'],
  [/\b(tay|t|west|w)\b/, 'tay'],
  [/\b(nam|n|south|s)\b/, 'nam'],
  [/\b(bac|b|north)\b/, 'bac'],
];

export function parseDirection(text: string): Direction | undefined {
  const f = foldText(text).replace(/[^a-z]+/g, ' ').trim();
  if (!f || f.length > 20) return undefined;
  for (const [re, d] of DIRECTION_TEXT) if (re.test(f)) return d;
  return undefined;
}

/** Loại căn theo tên ("2PN", "Shophouse") hoặc theo số phòng ngủ. */
export function matchUnitType(text: string, types: UnitTypeRow[]): UnitTypeRow | undefined {
  const f = foldText(text).replace(/\s+/g, '');
  if (!f) return undefined;
  const exact = types.find((t) => foldText(t.name).replace(/\s+/g, '') === f);
  if (exact) return exact;
  const br = bedroomsIn(text);
  if (br !== undefined) {
    const hits = types.filter((t) => bedroomsIn(`${t.name} ${t.note}`) === br);
    if (hits.length === 1) return hits[0];
  }
  return types.find((t) => {
    const n = foldText(t.name).replace(/\s+/g, '');
    return n.length >= 3 && (f.includes(n) || n.includes(f));
  });
}

// ---------------------------------------------------------------- Gộp vào bảng hàng

export interface ImportRow {
  code: string;
  item: Partial<Omit<InventoryItem, 'code' | 'updatedAt'>>;
  /** Mã hình mẫu ghi trong bảng (cột "Mẫu căn"), chưa đối chiếu với thư viện hình mẫu. */
  layout?: string;
  /** Ô có chữ nhưng không hiểu (vd trạng thái lạ) — báo để người dùng kiểm tra. */
  warnings: string[];
}

export function rowsToItems(rows: string[][], map: ColumnMap, headerRow: number, types: UnitTypeRow[]): ImportRow[] {
  const header = headerRow >= 0 ? rows[headerRow] : [];
  const out: ImportRow[] = [];
  rows.forEach((row, r) => {
    if (r <= headerRow || map.code === undefined) return;
    const code = (row[map.code] ?? '').trim();
    if (!code || code.length > 30) return;
    const cell = (f: InventoryField) => (map[f] !== undefined ? (row[map[f]!] ?? '').trim() : '');
    const warnings: string[] = [];
    const item: ImportRow['item'] = {};
    if (cell('area')) {
      const a = parseArea(cell('area'));
      if (a !== undefined) item.area = a;
      else warnings.push(`diện tích "${cell('area')}"`);
    }
    if (cell('price')) {
      const p = parseMoney(cell('price'), header[map.price ?? -1] ?? '');
      if (p !== undefined) item.price = p;
      else warnings.push(`giá "${cell('price')}"`);
    }
    if (cell('status')) {
      const s = parseStatus(cell('status'));
      if (s) item.status = s;
      else warnings.push(`trạng thái "${cell('status')}"`);
    }
    if (cell('direction')) {
      const d = parseDirection(cell('direction'));
      if (d) item.direction = d;
      else warnings.push(`hướng "${cell('direction')}"`);
    }
    if (cell('type')) {
      const t = matchUnitType(cell('type'), types);
      if (t) item.typeId = t.id;
      else warnings.push(`loại "${cell('type')}"`);
    }
    if (cell('note')) item.note = cell('note');
    const layout = cell('layout').length <= 40 ? cell('layout') : '';
    out.push({ code, item, ...(layout ? { layout } : {}), warnings });
  });
  return out;
}

/**
 * Gộp các dòng nhập vào bảng hàng hiện có: trùng mã thì cập nhật, mới thì thêm.
 * Mã khác cách ghi ("A-12-05" / "A1205") vẫn nhận là một căn. touched: mã các căn có trong lần nhập này.
 */
export function mergeInventory(
  existing: InventoryItem[],
  rows: ImportRow[],
): { items: InventoryItem[]; added: number; updated: number; touched: Set<string> } {
  const now = new Date().toISOString();
  const items = [...existing];
  const byNorm = new Map<string, number>();
  const bySquash = new Map<string, number | null>();
  const remember = (code: string, i: number) => {
    byNorm.set(normCode(code), i);
    const sq = squashCode(code);
    bySquash.set(sq, bySquash.has(sq) && bySquash.get(sq) !== i ? null : i);
  };
  items.forEach((x, i) => remember(x.code, i));
  const touched = new Set<string>();
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const at = byNorm.get(normCode(row.code)) ?? bySquash.get(squashCode(row.code)) ?? undefined;
    if (at !== undefined) {
      items[at] = { ...items[at], ...row.item, code: items[at].code, updatedAt: now };
      touched.add(items[at].code);
      updated++;
    } else {
      remember(row.code, items.length);
      items.push({ code: row.code, status: 'dang_ban', note: '', ...row.item, updatedAt: now });
      touched.add(row.code);
      added++;
    }
  }
  return { items, added, updated, touched };
}

/** Thêm / sửa một căn theo mã (dùng khi chạm vào căn trên bản đồ để đổi trạng thái). */
export function upsertItem(existing: InventoryItem[], code: string, patch: Partial<Omit<InventoryItem, 'code' | 'updatedAt'>>): InventoryItem[] {
  const now = new Date().toISOString();
  const found = indexByCode(existing, (x) => x.code).get(code);
  if (found) return existing.map((x) => (x === found ? { ...x, ...patch, updatedAt: now } : x));
  return [...existing, { code, status: 'dang_ban', note: '', ...patch, updatedAt: now }];
}
