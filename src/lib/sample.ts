import type { Direction, InventoryItem, InventoryStatus, LayoutAssignment, MapUnit, Project, ProjectMap, SalesTerms, UnitLayout, UnitTypeRow } from '../types';
import { emptyProject } from './defaults';
import { todayStr } from './format';
import { saveImageSized } from './media';

/*
 * Dự án mẫu để xem thử bản đồ mặt bằng & bảng hàng: ảnh mặt bằng, hình mẫu căn và bảng hàng
 * đều do ứng dụng tự vẽ / tự tạo (minh hoạ, không phải dữ liệu thật của dự án nào).
 * Hình mẫu khác nhau theo vị trí: căn góc trái / phải (đảo chiều), căn giữa view sông / view công viên,
 * và căn góc tầng 25 có sân vườn (gắn riêng từng căn).
 */

export const SAMPLE_PROJECT_ID = 'du-an-mau';

const FONT = "'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif";

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Trình duyệt không vẽ được ảnh mẫu.');
  return { c, g };
}

const toJpeg = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh mẫu.'))), 'image/jpeg', 0.9));

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'center') {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

// ---------------------------------------------------------------- Mặt bằng tầng điển hình (1600 × 1000)

const PLAN = { w: 1600, h: 1000, x0: 100, cell: 175, top: [140, 440] as const, bottom: [560, 860] as const };

async function drawFloorPlan(): Promise<Blob> {
  const { c, g } = makeCanvas(PLAN.w, PLAN.h);
  g.fillStyle = '#fbfaf7';
  g.fillRect(0, 0, PLAN.w, PLAN.h);
  text(g, 'MẶT BẰNG TẦNG ĐIỂN HÌNH 5 – 25 · TOÀ A', PLAN.w / 2, 62, 34, 700, '#1e293b');
  text(g, 'Dự án mẫu — bản vẽ minh hoạ, không phải tài liệu của chủ đầu tư', PLAN.w / 2, 98, 19, 400, '#64748b');

  // Hành lang + lõi thang.
  g.fillStyle = '#e2e8f0';
  g.fillRect(PLAN.x0, 440, PLAN.cell * 8, 120);
  text(g, 'HÀNH LANG', PLAN.x0 + 40, 500, 19, 500, '#64748b', 'left');
  g.fillStyle = '#cbd5e1';
  g.fillRect(690, 452, 220, 96);
  g.strokeStyle = '#475569';
  g.lineWidth = 3;
  g.strokeRect(690, 452, 220, 96);
  text(g, 'THANG MÁY · THANG BỘ', 800, 500, 18, 700, '#334155');

  const unit = (x: number, y: number, top: boolean, label: string) => {
    const w = PLAN.cell;
    const h = 300;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, w, h);
    // Vách ngăn phòng bên trong.
    const split = y + (top ? h * 0.45 : h * 0.55);
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, split);
    g.lineTo(x + w, split);
    g.moveTo(x + w / 2, top ? y : split);
    g.lineTo(x + w / 2, top ? split : y + h);
    g.stroke();
    const bedY = top ? y + h * 0.22 : y + h * 0.8;
    const livY = top ? y + h * 0.78 : y + h * 0.22;
    text(g, 'P.NGỦ', x + w * 0.25, bedY, 14, 500, '#64748b');
    text(g, 'P.NGỦ', x + w * 0.75, bedY, 14, 500, '#64748b');
    text(g, 'P.KHÁCH · BẾP', x + w / 2, livY, 14, 500, '#64748b');
    // Ban công.
    const by = top ? y - 26 : y + h;
    g.fillStyle = '#f1f5f9';
    g.fillRect(x + 18, by, w - 36, 26);
    g.strokeStyle = '#64748b';
    g.lineWidth = 2;
    g.strokeRect(x + 18, by, w - 36, 26);
    // Tường bao.
    g.strokeStyle = '#334155';
    g.lineWidth = 5;
    g.strokeRect(x, y, w, h);
    text(g, label, x + w / 2, y + h * 0.5, 30, 800, '#0f172a');
  };
  for (let i = 0; i < 8; i++) unit(PLAN.x0 + i * PLAN.cell, PLAN.top[0], true, String(i + 1).padStart(2, '0'));
  for (let i = 0; i < 8; i++) unit(PLAN.x0 + i * PLAN.cell, PLAN.bottom[0], false, String(i + 9).padStart(2, '0'));

  text(g, 'VIEW SÔNG ↑', PLAN.w - 100, 125, 16, 700, '#0284c7', 'right');
  text(g, 'VIEW CÔNG VIÊN NỘI KHU ↓', PLAN.w - 100, 905, 16, 700, '#16a34a', 'right');
  text(g, 'N ↑', PLAN.w - 70, 960, 20, 600, '#475569');
  return toJpeg(c);
}

// ---------------------------------------------------------------- Hình mẫu căn (1200 × 900)

type Furniture = 'bed' | 'sofa' | 'table' | 'wc' | 'kitchen' | 'desk' | 'plant';
interface Room {
  /** Toạ độ trong khung căn hộ (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  area: string;
  kind: 'bed' | 'living' | 'wet' | 'kitchen' | 'balcony';
  items: Furniture[];
}

const ROOM_FILL: Record<Room['kind'], string> = {
  bed: '#eff6ff',
  living: '#fffbeb',
  wet: '#ecfeff',
  kitchen: '#fff7ed',
  balcony: '#f0fdf4',
};

const LAYOUTS: Record<'1pn' | '2pn' | '3pn', { title: string; rooms: Room[] }> = {
  '1pn': {
    title: 'HÌNH MẪU CĂN 1PN+1 · 52,3 m²',
    rooms: [
      { x: 0, y: 0, w: 0.45, h: 0.55, label: 'P.NGỦ', area: '11,8 m²', kind: 'bed', items: ['bed'] },
      { x: 0.45, y: 0, w: 0.3, h: 0.55, label: 'P.ĐA NĂNG', area: '6,9 m²', kind: 'bed', items: ['desk'] },
      { x: 0.75, y: 0, w: 0.25, h: 0.3, label: 'WC', area: '3,6 m²', kind: 'wet', items: ['wc'] },
      { x: 0.75, y: 0.3, w: 0.25, h: 0.25, label: 'BẾP', area: '4,8 m²', kind: 'kitchen', items: ['kitchen'] },
      { x: 0, y: 0.55, w: 1, h: 0.3, label: 'P.KHÁCH + ĂN', area: '18,2 m²', kind: 'living', items: ['sofa', 'table'] },
      { x: 0.15, y: 0.85, w: 0.7, h: 0.15, label: 'LÔ GIA', area: '3,5 m²', kind: 'balcony', items: ['plant'] },
    ],
  },
  '2pn': {
    title: 'HÌNH MẪU CĂN 2PN · 68,5 m²',
    rooms: [
      { x: 0, y: 0, w: 0.36, h: 0.5, label: 'P.NGỦ 1', area: '12,4 m²', kind: 'bed', items: ['bed'] },
      { x: 0.36, y: 0, w: 0.3, h: 0.5, label: 'P.NGỦ 2', area: '9,8 m²', kind: 'bed', items: ['bed'] },
      { x: 0.66, y: 0, w: 0.17, h: 0.3, label: 'WC 1', area: '3,8 m²', kind: 'wet', items: ['wc'] },
      { x: 0.83, y: 0, w: 0.17, h: 0.3, label: 'WC 2', area: '3,4 m²', kind: 'wet', items: ['wc'] },
      { x: 0.66, y: 0.3, w: 0.34, h: 0.2, label: 'BẾP', area: '6,1 m²', kind: 'kitchen', items: ['kitchen'] },
      { x: 0, y: 0.5, w: 1, h: 0.35, label: 'P.KHÁCH + ĂN', area: '24,6 m²', kind: 'living', items: ['sofa', 'table'] },
      { x: 0.1, y: 0.85, w: 0.8, h: 0.15, label: 'LÔ GIA', area: '4,2 m²', kind: 'balcony', items: ['plant'] },
    ],
  },
  '3pn': {
    title: 'HÌNH MẪU CĂN 3PN · 95,2 m² · CĂN GÓC',
    rooms: [
      { x: 0, y: 0, w: 0.34, h: 0.5, label: 'P.NGỦ MASTER', area: '15,6 m²', kind: 'bed', items: ['bed'] },
      { x: 0.34, y: 0, w: 0.12, h: 0.25, label: 'WC 1', area: '4,1 m²', kind: 'wet', items: ['wc'] },
      { x: 0.34, y: 0.25, w: 0.12, h: 0.25, label: 'WC 2', area: '3,7 m²', kind: 'wet', items: ['wc'] },
      { x: 0.46, y: 0, w: 0.27, h: 0.5, label: 'P.NGỦ 2', area: '11,2 m²', kind: 'bed', items: ['bed'] },
      { x: 0.73, y: 0, w: 0.27, h: 0.5, label: 'P.NGỦ 3', area: '10,9 m²', kind: 'bed', items: ['bed'] },
      { x: 0, y: 0.5, w: 0.6, h: 0.35, label: 'P.KHÁCH', area: '22,8 m²', kind: 'living', items: ['sofa'] },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.35, label: 'BẾP + ĂN', area: '14,3 m²', kind: 'kitchen', items: ['kitchen', 'table'] },
      { x: 0.05, y: 0.85, w: 0.9, h: 0.15, label: 'LÔ GIA', area: '5,6 m²', kind: 'balcony', items: ['plant'] },
    ],
  },
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function furniture(g: CanvasRenderingContext2D, item: Furniture, x: number, y: number, w: number, h: number) {
  g.strokeStyle = '#64748b';
  g.lineWidth = 2;
  g.fillStyle = '#ffffff';
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (item === 'bed') {
    const bw = Math.min(150, w * 0.6);
    const bh = Math.min(190, h * 0.62);
    roundRect(g, cx - bw / 2, cy - bh / 2 + 18, bw, bh, 10);
    g.fill();
    g.stroke();
    for (const dx of [-bw / 4, bw / 4]) {
      roundRect(g, cx + dx - bw / 5, cy - bh / 2 + 28, (bw * 2) / 5, 26, 8);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - bw / 2, cy - bh / 2 + 70);
    g.lineTo(cx + bw / 2, cy - bh / 2 + 70);
    g.stroke();
  } else if (item === 'sofa') {
    const sw = Math.min(260, w * 0.45);
    roundRect(g, x + 40, cy - 10, sw, 60, 12);
    g.fill();
    g.stroke();
    roundRect(g, x + 40, cy - 10, sw, 18, 8);
    g.stroke();
    roundRect(g, x + 40 + sw / 2 - 45, cy - 75, 90, 45, 8);
    g.stroke();
  } else if (item === 'table') {
    const tx = x + w - 170;
    roundRect(g, tx, cy - 30, 110, 60, 6);
    g.fill();
    g.stroke();
    for (const [dx, dy] of [
      [10, -48],
      [70, -48],
      [10, 38],
      [70, 38],
    ]) {
      roundRect(g, tx + dx, cy + dy, 30, 12, 4);
      g.stroke();
    }
  } else if (item === 'wc') {
    g.beginPath();
    g.ellipse(cx, cy + 10, Math.min(22, w * 0.22), 30, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    roundRect(g, cx - Math.min(26, w * 0.26), y + 14, Math.min(52, w * 0.52), 20, 4);
    g.stroke();
  } else if (item === 'kitchen') {
    g.fillStyle = '#e2e8f0';
    g.fillRect(x + 10, y + 10, w - 20, 34);
    g.strokeRect(x + 10, y + 10, w - 20, 34);
    for (const dx of [0.3, 0.45]) {
      g.beginPath();
      g.arc(x + w * dx, y + 27, 10, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (item === 'desk') {
    roundRect(g, cx - 55, y + 30, 110, 46, 6);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(cx, y + 100, 18, 0, Math.PI * 2);
    g.stroke();
  } else if (item === 'plant') {
    for (const dx of [0.2, 0.8]) {
      g.fillStyle = '#bbf7d0';
      g.beginPath();
      g.arc(x + w * dx, cy, 16, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
}

/** Căn góc tầng trên cùng: thu gọn các phòng, thêm sân vườn phía trước. */
function withGarden(rooms: Room[]): Room[] {
  const k = 0.8;
  return [
    ...rooms.filter((r) => r.kind !== 'balcony').map((r) => ({ ...r, y: r.y * k, h: r.h * k })),
    { x: 0, y: 0.8, w: 1, h: 0.2, label: 'SÂN VƯỜN', area: '18,4 m²', kind: 'balcony', items: ['plant'] },
  ];
}

async function drawLayout(kind: keyof typeof LAYOUTS, o: { title: string; sub: string; mirror?: boolean; garden?: boolean; corner?: boolean }): Promise<Blob> {
  const { c, g } = makeCanvas(1200, 900);
  const spec = LAYOUTS[kind];
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1200, 900);
  text(g, o.title, 600, 52, 30, 800, '#0f172a');
  text(g, o.sub, 600, 92, 18, 400, '#64748b');
  const box = { x: 100, y: 140, w: 1000, h: 680 };
  const rooms = o.garden ? withGarden(spec.rooms) : spec.rooms;
  for (const r of rooms) {
    // Đảo chiều: lật trái ↔ phải (chữ vẫn viết xuôi).
    const x = box.x + (o.mirror ? 1 - r.x - r.w : r.x) * box.w;
    const y = box.y + r.y * box.h;
    const w = r.w * box.w;
    const h = r.h * box.h;
    g.fillStyle = ROOM_FILL[r.kind];
    g.fillRect(x, y, w, h);
    for (const item of r.items) furniture(g, item, x, y, w, h);
    g.strokeStyle = r.kind === 'balcony' ? '#64748b' : '#1e293b';
    g.lineWidth = r.kind === 'balcony' ? 3 : 7;
    g.strokeRect(x, y, w, h);
    const small = w < 160;
    text(g, r.label, x + w / 2, y + (r.kind === 'balcony' ? h / 2 - 9 : h - 40), small ? 15 : 19, 800, '#0f172a');
    text(g, r.area, x + w / 2, y + (r.kind === 'balcony' ? h / 2 + 13 : h - 17), small ? 13 : 16, 500, '#475569');
  }
  // Căn góc: mặt thoáng thứ hai (cửa sổ dọc tường ngoài).
  if (o.corner) {
    const wx = o.mirror ? box.x + box.w - 5 : box.x - 5;
    g.fillStyle = '#7dd3fc';
    for (const [from, to] of [
      [0.06, 0.4],
      [0.55, 0.78],
    ])
      g.fillRect(wx, box.y + box.h * from, 10, box.h * (to - from));
    g.save();
    g.translate(o.mirror ? box.x + box.w + 34 : box.x - 34, box.y + box.h * 0.42);
    g.rotate(o.mirror ? Math.PI / 2 : -Math.PI / 2);
    text(g, 'MẶT THOÁNG 2', 0, 0, 15, 700, '#0284c7');
    g.restore();
  }
  // Cửa vào căn hộ (phía hành lang, ngược phía mặt thoáng).
  const doorX = o.mirror ? box.x - 6 : box.x + box.w - 6;
  g.fillStyle = '#ffffff';
  g.fillRect(doorX, box.y + box.h * 0.55, 12, 80);
  text(g, o.mirror ? '← CỬA VÀO' : 'CỬA VÀO →', o.mirror ? box.x - 10 : box.x + box.w + 10, box.y + box.h * 0.55 + 40, 15, 700, '#b45309', o.mirror ? 'right' : 'left');
  return toJpeg(c);
}

// ---------------------------------------------------------------- Bảng hàng mẫu

const CORNERS = [1, 8, 9, 16];
const SMALL = [4, 5, 12, 13];
const FLOORS = { from: 5, to: 25 };

/** Trạng thái giả lập ổn định (không ngẫu nhiên mỗi lần tạo). */
function sampleStatus(floor: number, n: number): InventoryStatus {
  if (floor >= 24) return 'chua_mo';
  const r = (floor * 73 + n * 151 + floor * n * 7) % 100;
  if (r < 36) return 'da_ban';
  if (r < 44) return 'da_coc';
  if (r < 50) return 'giu_cho';
  return 'dang_ban';
}

function sampleInventory(types: { small: string; normal: string; corner: string }): InventoryItem[] {
  const now = new Date().toISOString();
  const items: InventoryItem[] = [];
  for (let floor = FLOORS.from; floor <= FLOORS.to; floor++) {
    for (let n = 1; n <= 16; n++) {
      const corner = CORNERS.includes(n);
      const small = SMALL.includes(n);
      const top = n <= 8;
      const area = corner ? 95.2 : small ? 52.3 : 68.5;
      const base = corner ? 4.85e9 : small ? 2.55e9 : 3.45e9;
      const price = Math.round((base * (1 + 0.006 * (floor - FLOORS.from)) * (top ? 1.03 : 1)) / 1e7) * 1e7;
      const direction: Direction = top ? 'dong_nam' : 'tay_bac';
      items.push({
        code: `A-${String(floor).padStart(2, '0')}-${String(n).padStart(2, '0')}`,
        typeId: corner ? types.corner : small ? types.small : types.normal,
        area,
        price,
        status: sampleStatus(floor, n),
        direction,
        note: corner ? 'Căn góc, 2 mặt thoáng' : top && small ? 'View hồ bơi' : '',
        updatedAt: now,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------- Hình mẫu theo vị trí căn

interface SampleLayout {
  id: string;
  code: string;
  name: string;
  tags: string[];
  kind: keyof typeof LAYOUTS;
  typeId: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  /** Số căn trên mặt bằng tầng dùng hình mẫu này (mọi tầng). */
  positions: number[];
  mirror?: boolean;
  garden?: boolean;
  corner?: boolean;
}

const SAMPLE_LAYOUTS: SampleLayout[] = [
  { id: 'mau-ht-3pn-goc-a', code: '3PN-GOC-A', name: 'Căn góc 3PN', tags: ['Căn góc', '2 mặt thoáng'], kind: '3pn', typeId: 'mau-3pn', area: 95.2, bedrooms: 3, bathrooms: 2, positions: [1, 9], corner: true },
  {
    id: 'mau-ht-3pn-goc-b',
    code: '3PN-GOC-B',
    name: 'Căn góc 3PN (đảo chiều)',
    tags: ['Căn góc', '2 mặt thoáng', 'Đảo chiều'],
    kind: '3pn',
    typeId: 'mau-3pn',
    area: 95.2,
    bedrooms: 3,
    bathrooms: 2,
    positions: [8, 16],
    corner: true,
    mirror: true,
  },
  { id: 'mau-ht-2pn-a', code: '2PN-A', name: 'Căn giữa 2PN view sông', tags: ['Căn giữa', 'View sông'], kind: '2pn', typeId: 'mau-2pn', area: 68.5, bedrooms: 2, bathrooms: 2, positions: [2, 3, 6, 7] },
  {
    id: 'mau-ht-2pn-b',
    code: '2PN-B',
    name: 'Căn giữa 2PN view công viên',
    tags: ['Căn giữa', 'View công viên', 'Đảo chiều'],
    kind: '2pn',
    typeId: 'mau-2pn',
    area: 68.5,
    bedrooms: 2,
    bathrooms: 2,
    positions: [10, 11, 14, 15],
    mirror: true,
  },
  { id: 'mau-ht-1pn', code: '1PN+1', name: 'Căn 1PN + phòng đa năng', tags: ['Căn giữa'], kind: '1pn', typeId: 'mau-1pn', area: 52.3, bedrooms: 1, bathrooms: 1, positions: [4, 5, 12, 13] },
  {
    id: 'mau-ht-3pn-goc-sv',
    code: '3PN-GOC-SV',
    name: 'Căn góc tầng 25 có sân vườn',
    tags: ['Căn góc', 'Có sân vườn'],
    kind: '3pn',
    typeId: 'mau-3pn',
    area: 95.2,
    bedrooms: 3,
    bathrooms: 2,
    positions: [],
    corner: true,
    garden: true,
  },
];

/** Căn gắn riêng hình mẫu (khác các tầng còn lại cùng vị trí). */
const SAMPLE_ASSIGNMENTS: LayoutAssignment[] = [
  { code: 'A-25-01', layoutId: 'mau-ht-3pn-goc-sv' },
  { code: 'A-25-08', layoutId: 'mau-ht-3pn-goc-sv' },
];

function sampleUnits(): MapUnit[] {
  const units: MapUnit[] = [];
  const rows: Array<readonly [number, number]> = [PLAN.top, PLAN.bottom];
  rows.forEach(([y0, y1], row) => {
    for (let i = 0; i < 8; i++) {
      const n = row * 8 + i + 1;
      const x0 = (PLAN.x0 + i * PLAN.cell) / PLAN.w;
      const x1 = (PLAN.x0 + (i + 1) * PLAN.cell) / PLAN.w;
      const top = y0 / PLAN.h;
      const bottom = y1 / PLAN.h;
      units.push({
        id: `mau-${row}-${i}`,
        label: String(n).padStart(2, '0'),
        points: [x0, top, x1, top, x1, bottom, x0, bottom],
        layoutId: SAMPLE_LAYOUTS.find((l) => l.positions.includes(n))?.id,
      });
    }
  });
  return units;
}

/** Tạo dự án mẫu (vẽ ảnh, lưu ảnh vào máy). Chưa lưu dự án — dùng saveProject để lưu. */
export async function createSampleProject(): Promise<Project> {
  await document.fonts?.ready;
  const plan = await drawFloorPlan();
  const mapImage = await saveImageSized(plan, { maxSize: 4000, quality: 0.9 });
  const layouts: UnitLayout[] = [];
  for (const s of SAMPLE_LAYOUTS) {
    const where = s.positions.length ? `Căn ${s.positions.map((n) => String(n).padStart(2, '0')).join(', ')} các tầng` : 'Căn A-25-01, A-25-08';
    const blob = await drawLayout(s.kind, {
      title: `HÌNH MẪU ${s.code} · ${String(s.area).replace('.', ',')} m²`,
      sub: `${s.name} · ${where} · bản vẽ minh hoạ của dự án mẫu`,
      mirror: s.mirror,
      garden: s.garden,
      corner: s.corner,
    });
    const image = await saveImageSized(blob, { maxSize: 2400, quality: 0.86 });
    layouts.push({ id: s.id, code: s.code, name: s.name, tags: s.tags, images: [image.id], typeId: s.typeId, area: s.area, bedrooms: s.bedrooms, bathrooms: s.bathrooms, note: '' });
  }
  const unitTypes: UnitTypeRow[] = [
    { id: 'mau-1pn', name: '1PN+1', area: '52,3 m²', price: '2,5 – 2,9 tỷ', quantity: '84 căn', note: 'Phòng đa năng làm phòng làm việc / phòng trẻ em' },
    { id: 'mau-2pn', name: '2PN', area: '68,5 m²', price: '3,4 – 4,1 tỷ', quantity: '168 căn', note: '2 WC' },
    { id: 'mau-3pn', name: '3PN', area: '95,2 m²', price: '4,8 – 5,7 tỷ', quantity: '84 căn', note: 'Căn góc, 2 mặt thoáng' },
  ];
  const inventory = sampleInventory({ small: 'mau-1pn', normal: 'mau-2pn', corner: 'mau-3pn' });
  const prices = inventory.map((x) => x.price ?? 0);
  const now = new Date().toISOString();
  const map: ProjectMap = {
    id: 'mau-mat-bang',
    name: 'Mặt bằng tầng 5–25 · Toà A',
    imageId: mapImage.id,
    aspect: mapImage.width / mapImage.height,
    floors: { from: FLOORS.from, to: FLOORS.to, skip: [] },
    codeRule: { prefix: 'A-', sep: '-', padFloor: true },
    colorBy: 'status',
    showLabels: true,
    units: sampleUnits(),
    createdAt: now,
    updatedAt: now,
  };
  return emptyProject({
    id: SAMPLE_PROJECT_ID,
    name: 'Dự án mẫu – Toà A (minh hoạ)',
    stage: 'dang_mo_ban',
    productTypes: ['can_ho'],
    developer: 'Chủ đầu tư minh hoạ',
    description:
      'Dự án mẫu để xem thử bản đồ mặt bằng và bảng hàng: vào tab Mặt bằng, chạm vào từng căn để xem đúng hình mẫu của căn đó (căn góc, căn giữa…), giá, diện tích, hướng, còn hay đã bán; thử lọc "2pn dưới 3,8 tỷ còn hàng" hoặc "căn góc", đổi tầng, xem Bảng tầng.\nToàn bộ thông tin là minh hoạ do ứng dụng tạo — có thể xoá dự án này bất cứ lúc nào.',
    highlights:
      'Mặt bằng 16 căn/tầng, tầng 5–25\n3 loại căn: 1PN+1, 2PN, 3PN (căn góc)\n6 hình mẫu theo vị trí: căn góc trái / phải (đảo chiều), căn giữa view sông / view công viên, căn góc tầng 25 có sân vườn\nBảng hàng 336 căn: đang bán, giữ chỗ, đã cọc, đã bán, chưa mở bán',
    scale: '1 toà 25 tầng, 336 căn hộ (minh hoạ)',
    totalUnits: inventory.length,
    unitAreaRange: '52 – 95 m²',
    unitTypes,
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    unitPrice: '48 – 57 triệu/m²',
    handover: 'Quý IV/2027 (minh hoạ)',
    maps: [map],
    inventory,
    layouts,
    layoutAssignments: SAMPLE_ASSIGNMENTS,
    sales: sampleSales(),
    infoSource: 'Dữ liệu minh hoạ do ứng dụng tạo',
  });
}

function sampleSales(): SalesTerms {
  const plan = (rows: Array<[string, number, string]>) => rows.map(([label, pct, when], i) => ({ id: `mau-dot-${i}-${pct}-${label}`, label, pct, when, date: '' }));
  return {
    methods: [
      {
        id: 'mau-tt-chuan',
        name: 'Thanh toán chuẩn theo tiến độ',
        discountPct: 0,
        note: '',
        installments: plan([
          ['Đợt 1', 15, 'Ký hợp đồng mua bán'],
          ['Đợt 2', 10, 'Sau 2 tháng'],
          ['Đợt 3', 10, 'Sau 4 tháng'],
          ['Đợt 4', 10, 'Sau 6 tháng'],
          ['Đợt 5', 10, 'Sau 8 tháng'],
          ['Đợt 6', 40, 'Nhận bàn giao'],
          ['Đợt 7', 5, 'Nhận sổ hồng'],
        ]),
      },
      {
        id: 'mau-tt-som',
        name: 'Thanh toán sớm 95%',
        discountPct: 9,
        note: 'Chiết khấu trừ thẳng vào giá bán (minh hoạ).',
        installments: plan([
          ['Đợt 1', 30, 'Ký hợp đồng mua bán'],
          ['Đợt 2', 65, 'Sau 30 ngày'],
          ['Đợt 3', 5, 'Nhận sổ hồng'],
        ]),
      },
      {
        id: 'mau-tt-vay',
        name: 'Vay ngân hàng 65%',
        discountPct: 0,
        note: 'Hỗ trợ lãi suất 0% trong 18 tháng, ân hạn nợ gốc 24 tháng (minh hoạ).',
        installments: plan([
          ['Đợt 1', 15, 'Ký hợp đồng mua bán'],
          ['Đợt 2', 15, 'Sau 30 ngày'],
          ['Đợt 3', 65, 'Ngân hàng giải ngân'],
          ['Đợt 4', 5, 'Nhận sổ hồng'],
        ]),
      },
    ],
    promotions: [
      { id: 'mau-km-som', name: 'Chiết khấu mua sớm', kind: 'pct', value: 2, condition: 'Ký HĐMB trong đợt mở bán (minh hoạ)', until: todayStr(45), auto: true, internal: false },
      { id: 'mau-km-than-thiet', name: 'Khách hàng thân thiết', kind: 'pct', value: 1, condition: 'Khách đã mua sản phẩm khác của CĐT', until: '', auto: false, internal: false },
      { id: 'mau-km-noi-that', name: 'Tặng gói nội thất', kind: 'gift', value: 80_000_000, condition: 'Áp dụng căn 3PN', until: '', auto: false, internal: false },
      { id: 'mau-km-mg', name: 'Chiết khấu thêm từ môi giới', kind: 'amount', value: 20_000_000, condition: 'Trích từ hoa hồng — chỉ nội bộ', until: '', auto: false, internal: true },
    ],
    milestones: [
      { id: 'mau-ms-1', label: 'Khởi công', time: '03/2024', status: 'done', note: '' },
      { id: 'mau-ms-2', label: 'Hoàn thiện móng', time: '11/2024', status: 'done', note: '' },
      { id: 'mau-ms-3', label: 'Cất nóc', time: '06/2026', status: 'doing', note: 'Đang thi công tầng 22/25 (minh hoạ)' },
      { id: 'mau-ms-4', label: 'Bàn giao', time: 'Quý IV/2027', status: 'planned', note: '' },
      { id: 'mau-ms-5', label: 'Cấp sổ hồng', time: '2028', status: 'planned', note: '' },
    ],
    maintenancePct: 2,
    vatIncluded: true,
    compound: true,
  };
}
