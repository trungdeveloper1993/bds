import type { LayoutAssignment, Project, ProjectMap, UnitLayout, UnitTypeRow } from '../types';
import { uid } from './id';
import { matchUnitType } from './inventory';
import { indexByCode, normCode, positionOf, projectCodes, squashCode } from './maps';
import { bedroomsIn, foldText } from './smartfind';

/*
 * Thư viện hình mẫu căn: mỗi hình mẫu một mã (VD "3PN-GOC"), gắn cho từng căn theo mã căn
 * hoặc cho một ô trên mặt bằng (mặt bằng tầng điển hình: áp dụng mọi tầng).
 */

// ---------------------------------------------------------------- Mã & thẻ từ tên file

// Ảnh chụp màn hình, ảnh Zalo, ảnh máy ảnh… — tên file không phải mã hình mẫu.
const CAMERA_NAME = /^(IMG|DSC|DCIM|PXL|MVIMG|SCREENSHOT|SCREEN-SHOT|ANH-CHUP|CAPTURE|PHOTO|IMAGE|SNAPSHOT|Z\d{5,}|\d{6,})/;
const GENERIC_PREFIX = /^(HINH-MAU|MAU-CAN|MAT-BANG-CAN|MAT-BANG|LAYOUT|CAN-HO|CAN)-/;

/** Mã hình mẫu từ tên file: "Căn 3PN góc.jpg" → "3PN-GOC"; tên ảnh chụp / Zalo → "" (tự đặt MAU-01…). */
export function codeFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  const code = foldText(base)
    .toUpperCase()
    .replace(/[^A-Z0-9+]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!code || CAMERA_NAME.test(code)) return '';
  const short = code.replace(GENERIC_PREFIX, '');
  return short && short.length <= 24 ? short : '';
}

/** Mã chưa dùng: MAU-01, MAU-02… */
export function nextLayoutCode(taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const code = `MAU-${String(i).padStart(2, '0')}`;
    if (!taken.has(normCode(code))) return code;
  }
}

const TAG_RULES: Array<[RegExp, string]> = [
  [/\bgoc\b/, 'Căn góc'],
  [/\bgiua\b/, 'Căn giữa'],
  [/\b(dao|dao chieu|mirror)\b/, 'Đảo chiều'],
  [/\b2 mat thoang\b/, '2 mặt thoáng'],
  [/\b(san vuon|garden)\b/, 'Có sân vườn'],
  [/\bduplex\b/, 'Duplex'],
  [/\b(penthouse|ph)\b/, 'Penthouse'],
  [/\bstudio\b/, 'Studio'],
];

/** Đoán thẻ, số phòng ngủ, loại căn từ mã / tên file ("3PN-GOC" → Căn góc, 3 PN, loại 3PN). */
export function guessLayout(text: string, types: UnitTypeRow[]): { tags: string[]; bedrooms?: number; typeId?: string } {
  const plain = text.replace(/[-_.]+/g, ' ');
  const f = foldText(plain).replace(/[^a-z0-9+]+/g, ' ');
  return {
    tags: TAG_RULES.filter(([re]) => re.test(f)).map(([, tag]) => tag),
    bedrooms: bedroomsIn(plain),
    typeId: matchUnitType(plain, types)?.id,
  };
}

/** Gộp thẻ, không trùng (so không dấu). */
export function mergeTags(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const t of b) if (!out.some((x) => foldText(x) === foldText(t))) out.push(t);
  return out;
}

/**
 * Thêm ảnh vào thư viện: ảnh cùng mã gộp chung một hình mẫu; mã trùng hình mẫu có sẵn thì thêm ảnh vào mẫu đó.
 * ids: hình mẫu nhận từng ảnh (theo thứ tự entries).
 */
export function addLayoutImages(
  layouts: UnitLayout[],
  entries: Array<{ code: string; tags: string[]; imageId: string }>,
  types: UnitTypeRow[],
): { layouts: UnitLayout[]; created: string[]; extended: string[]; ids: string[] } {
  const out = [...layouts];
  const find = layoutFinder(layouts);
  const at = new Map(out.map((l, i) => [l.id, i]));
  const batch = new Map<string, string>();
  const created: string[] = [];
  const extended = new Set<string>();
  const ids: string[] = [];
  for (const e of entries) {
    const code = e.code.trim();
    const key = normCode(code);
    const id = batch.get(key) ?? find(code)?.id;
    if (id !== undefined) {
      const i = at.get(id)!;
      out[i] = { ...out[i], images: [...out[i].images, e.imageId], tags: mergeTags(out[i].tags, e.tags) };
      if (!created.includes(id)) extended.add(id);
      batch.set(key, id);
      ids.push(id);
      continue;
    }
    const guess = guessLayout(code, types);
    const layout: UnitLayout = { id: uid(), code, name: '', tags: e.tags, images: [e.imageId], typeId: guess.typeId, bedrooms: guess.bedrooms, note: '' };
    at.set(layout.id, out.length);
    out.push(layout);
    batch.set(key, layout.id);
    created.push(layout.id);
    ids.push(layout.id);
  }
  return { layouts: out, created, extended: [...extended], ids };
}

// ---------------------------------------------------------------- Tra cứu

/** Tìm hình mẫu theo mã ("3PN-GOC" = "3pn goc" = "3PNGOC") hoặc theo tên. */
export function layoutFinder(layouts: UnitLayout[]): (text: string) => UnitLayout | undefined {
  const byCode = indexByCode(layouts, (l) => l.code);
  const byName = new Map(layouts.filter((l) => l.name.trim()).map((l) => [foldText(l.name).trim(), l]));
  return (text) => (text.trim() ? (byCode.get(text) ?? byName.get(foldText(text).trim())) : undefined);
}

/** Hình mẫu đang áp cho một mã căn: gắn riêng → theo ô trên mặt bằng. */
export function layoutIdOf(project: Project, code: string): { layoutId?: string; from?: 'code' | 'position' } {
  const own = indexByCode(project.layoutAssignments, (a) => a.code).get(code);
  if (own) return { layoutId: own.layoutId, from: 'code' };
  const unit = positionOf(project.maps, code);
  return unit?.layoutId ? { layoutId: unit.layoutId, from: 'position' } : {};
}

export interface LayoutUsage {
  /** Số căn dùng từng hình mẫu. */
  count: Map<string, number>;
  /** Tổng số căn của dự án (trên bản đồ + bảng hàng). */
  total: number;
  /** Số căn chưa có hình mẫu riêng. */
  unassigned: number;
}

export function layoutUsage(project: Project): LayoutUsage {
  const own = indexByCode(project.layoutAssignments, (a) => a.code);
  const known = new Set(project.layouts.map((l) => l.id));
  const count = new Map<string, number>();
  const codes = projectCodes(project);
  let unassigned = 0;
  for (const code of codes) {
    const id = own.get(code)?.layoutId ?? positionOf(project.maps, code)?.layoutId;
    if (id && known.has(id)) count.set(id, (count.get(id) ?? 0) + 1);
    else unassigned++;
  }
  return { count, total: codes.length, unassigned };
}

// ---------------------------------------------------------------- Gắn / bỏ

/** Đổi hình mẫu riêng của nhiều căn cùng lúc (layoutId trống = bỏ, căn dùng lại hình mẫu theo ô). */
export function setAssignments(list: LayoutAssignment[], changes: Array<{ code: string; layoutId?: string }>): LayoutAssignment[] {
  const out: Array<LayoutAssignment | null> = [...list];
  const at = new Map<string, number>();
  out.forEach((a, i) => a && at.set(squashCode(a.code), i));
  for (const c of changes) {
    const key = squashCode(c.code);
    if (!key) continue;
    const i = at.get(key);
    if (i !== undefined && out[i]) {
      out[i] = c.layoutId ? { code: out[i]!.code, layoutId: c.layoutId } : null;
      if (!c.layoutId) at.delete(key);
    } else if (c.layoutId) {
      at.set(key, out.length);
      out.push({ code: c.code.trim(), layoutId: c.layoutId });
    }
  }
  return out.filter((a): a is LayoutAssignment => a !== null);
}

/** Gắn hình mẫu cho các ô trên một bản đồ (mặt bằng tầng điển hình: mọi tầng). */
export function withPositionLayout(maps: ProjectMap[], mapId: string, unitIds: string[], layoutId?: string): ProjectMap[] {
  const ids = new Set(unitIds);
  return maps.map((m) => (m.id === mapId ? { ...m, units: m.units.map((u) => (ids.has(u.id) ? { ...u, layoutId } : u)) } : m));
}

/** Xoá hình mẫu khỏi thư viện và bỏ mọi chỗ đang gắn. */
export function withoutLayout(p: Project, layoutId: string): Pick<Project, 'layouts' | 'layoutAssignments' | 'maps'> {
  return {
    layouts: p.layouts.filter((l) => l.id !== layoutId),
    layoutAssignments: p.layoutAssignments.filter((a) => a.layoutId !== layoutId),
    maps: p.maps.map((m) => (m.units.some((u) => u.layoutId === layoutId) ? { ...m, units: m.units.map((u) => (u.layoutId === layoutId ? { ...u, layoutId: undefined } : u)) } : m)),
  };
}
