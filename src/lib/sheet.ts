/*
 * Phiếu gửi khách dạng ảnh PNG / file PDF, vẽ thẳng lên canvas (không qua hộp thoại in của trình duyệt
 * nên không có đường link, ngày giờ ở đầu / cuối trang). PDF tự ghép từ ảnh JPEG từng trang A4.
 */

/** Khổ A4 ở 150 dpi — đơn vị bố cục. */
export const SHEET_W = 1240;
export const SHEET_H = 1754;
const M = 84;
const CW = SHEET_W - M * 2;
const FOOTER = 56;
const FONT = "'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif";

const C = {
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  brand: '#1d4ed8',
  brandDark: '#1e3a8a',
  brandSoft: '#eff6ff',
  green: '#047857',
  violet: '#6d28d9',
};

export type SheetTone = 'green' | 'brand' | 'violet' | 'muted';
const TONE: Record<SheetTone, string> = { green: C.green, brand: C.brand, violet: C.violet, muted: C.muted };

export type SheetBlock =
  /** Thương hiệu môi giới ở đầu phiếu. */
  | { type: 'brand'; name: string; lines: string[]; contact: string[] }
  | { type: 'title'; text: string; sub?: string }
  /** Tên dự án / căn — chữ lớn. */
  | { type: 'h1'; text: string; sub?: string[] }
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string; right?: string; tone?: SheetTone }
  | { type: 'text'; text: string; muted?: boolean }
  | { type: 'rows'; rows: Array<[string, string]> }
  | { type: 'price'; label: string; value: string; sub?: string; side?: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'table'; columns: Array<{ label: string; w: number; align?: 'right' }>; rows: Array<{ cells: string[]; bold?: boolean; tone?: SheetTone }> }
  | { type: 'images'; images: HTMLImageElement[]; layout: 'single' | 'hero' }
  | { type: 'chips'; items: Array<{ text: string; tone: SheetTone }> }
  | { type: 'disclaimer'; text: string };

interface Piece {
  h: number;
  draw: (g: CanvasRenderingContext2D, y: number) => void;
  /** Tiêu đề: không để đứng một mình ở cuối trang. */
  keepNext?: boolean;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Trình duyệt không tạo được ảnh.');
  return { c, g };
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được file — ảnh quá lớn?'))), type, quality));

function font(g: CanvasRenderingContext2D, size: number, weight = 400) {
  g.font = `${weight} ${size}px ${FONT}`;
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
}

/** Ngắt dòng theo bề rộng (từ quá dài thì cắt theo ký tự). */
function wrap(g: CanvasRenderingContext2D, s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (g.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (g.measureText(w).width <= width) {
        line = w;
        continue;
      }
      let part = '';
      for (const ch of w) {
        if (part && g.measureText(part + ch).width > width) {
          out.push(part);
          part = ch;
        } else part += ch;
      }
      line = part;
    }
    out.push(line);
  }
  return out;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Vẽ ảnh lấp đầy khung (cắt bớt phần thừa), bo góc. */
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, contain = false) {
  const ir = img.naturalWidth / img.naturalHeight;
  const r = w / h;
  g.save();
  roundRect(g, x, y, w, h, 14);
  g.clip();
  if (contain) {
    g.fillStyle = '#f8fafc';
    g.fillRect(x, y, w, h);
    const dw = ir > r ? w : h * ir;
    const dh = ir > r ? w / ir : h;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const sw = ir > r ? img.naturalHeight * r : img.naturalWidth;
    const sh = ir > r ? img.naturalHeight : img.naturalWidth / r;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  g.restore();
}

// ---------------------------------------------------------------- Bố cục

function layout(g: CanvasRenderingContext2D, blocks: SheetBlock[]): Piece[] {
  const pieces: Piece[] = [];
  const push = (p: Piece) => pieces.push(p);
  const LH = 34;

  for (const b of blocks) {
    switch (b.type) {
      case 'brand': {
        push({
          h: 118,
          draw: (g, y) => {
            g.fillStyle = C.brand;
            roundRect(g, M, y, 64, 64, 16);
            g.fill();
            font(g, 32, 800);
            text(g, (b.name.trim()[0] ?? 'B').toUpperCase(), M + 32, y + 44, '#ffffff', 'center');
            font(g, 28, 800);
            text(g, b.name, M + 84, y + 30, C.ink);
            font(g, 18, 400);
            b.lines.slice(0, 2).forEach((l, i) => text(g, l, M + 84, y + 56 + i * 24, C.muted));
            b.contact.slice(0, 4).forEach((l, i) => {
              font(g, i === 0 ? 22 : 18, i === 0 ? 700 : 500);
              text(g, l, M + CW, y + 26 + i * 26, i === 1 ? C.brand : i === 0 ? C.ink : C.muted, 'right');
            });
            g.fillStyle = C.brand;
            g.fillRect(M, y + 106, CW, 4);
          },
        });
        break;
      }
      case 'title': {
        push({
          h: b.sub ? 108 : 80,
          draw: (g, y) => {
            font(g, 36, 800);
            text(g, b.text, SHEET_W / 2, y + 56, C.brandDark, 'center');
            if (b.sub) {
              font(g, 20, 400);
              text(g, b.sub, SHEET_W / 2, y + 90, C.muted, 'center');
            }
          },
        });
        break;
      }
      case 'h1': {
        font(g, 40, 800);
        const lines = wrap(g, b.text, CW);
        font(g, 21, 400);
        const sub = (b.sub ?? []).filter(Boolean).flatMap((s) => wrap(g, s, CW));
        push({
          h: 20 + lines.length * 50 + sub.length * 30 + 8,
          draw: (g, y) => {
            font(g, 40, 800);
            lines.forEach((l, i) => text(g, l, M, y + 58 + i * 50, C.ink));
            font(g, 21, 400);
            sub.forEach((l, i) => text(g, l, M, y + 20 + lines.length * 50 + 24 + i * 30, C.muted));
          },
        });
        break;
      }
      case 'heading': {
        push({
          h: 64,
          keepNext: true,
          draw: (g, y) => {
            font(g, 21, 800);
            text(g, b.text.toUpperCase(), M, y + 50, C.brand);
            g.fillStyle = C.line;
            g.fillRect(M, y + 60, CW, 2);
          },
        });
        break;
      }
      case 'subheading': {
        push({
          h: 50,
          keepNext: true,
          draw: (g, y) => {
            font(g, 23, 700);
            text(g, b.text, M, y + 36, C.ink);
            if (b.right) {
              font(g, 20, 700);
              text(g, b.right, M + CW, y + 36, TONE[b.tone ?? 'green'], 'right');
            }
          },
        });
        break;
      }
      case 'text': {
        font(g, 21, 400);
        const lines = wrap(g, b.text, CW);
        lines.forEach((l, i) =>
          push({
            h: LH + (i === 0 ? 8 : 0),
            draw: (g, y) => {
              font(g, 21, 400);
              text(g, l, M, y + (i === 0 ? 8 : 0) + 25, b.muted ? C.muted : C.text);
            },
          }),
        );
        break;
      }
      case 'rows': {
        const LW = 300;
        for (const [label, value] of b.rows) {
          font(g, 21, 600);
          const lines = wrap(g, value, CW - LW - 12);
          push({
            h: 18 + lines.length * 32,
            draw: (g, y) => {
              font(g, 19, 500);
              text(g, label, M, y + 33, C.muted);
              font(g, 21, 600);
              lines.forEach((l, i) => text(g, l, M + LW, y + 33 + i * 32, C.ink));
              g.fillStyle = C.line;
              g.fillRect(M, y + 18 + lines.length * 32 - 1, CW, 1);
            },
          });
        }
        break;
      }
      case 'price': {
        push({
          h: 152,
          draw: (g, y) => {
            g.fillStyle = C.brandSoft;
            roundRect(g, M, y + 16, CW, 124, 18);
            g.fill();
            font(g, 19, 700);
            text(g, b.label, M + 28, y + 54, C.brand);
            font(g, 40, 800);
            text(g, b.value, M + 28, y + 100, C.brandDark);
            if (b.sub) {
              font(g, 18, 500);
              text(g, b.sub, M + 28, y + 128, C.muted);
            }
            (b.side ?? []).slice(0, 3).forEach((s, i) => {
              font(g, 20, i === 0 ? 700 : 500);
              text(g, s, M + CW - 28, y + 58 + i * 30, i === 0 ? C.ink : C.muted, 'right');
            });
          },
        });
        break;
      }
      case 'bullets': {
        font(g, 21, 400);
        for (const item of b.items) {
          const lines = wrap(g, item, CW - 30);
          push({
            h: 8 + lines.length * 32,
            draw: (g, y) => {
              g.fillStyle = C.brand;
              g.beginPath();
              g.arc(M + 8, y + 23, 4.5, 0, Math.PI * 2);
              g.fill();
              font(g, 21, 400);
              lines.forEach((l, i) => text(g, l, M + 30, y + 30 + i * 32, C.text));
            },
          });
        }
        break;
      }
      case 'table': {
        const total = b.columns.reduce((a, c) => a + c.w, 0);
        const widths = b.columns.map((c) => (c.w / total) * CW);
        const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, w) => a + w, 0));
        const cellText = (g: CanvasRenderingContext2D, s: string, i: number, y: number, color: string) => {
          const align = b.columns[i].align === 'right' ? 'right' : 'left';
          text(g, s, align === 'right' ? xs[i] + widths[i] - 10 : xs[i] + 10, y, color, align);
        };
        push({
          h: 46,
          keepNext: true,
          draw: (g, y) => {
            g.fillStyle = '#f1f5f9';
            g.fillRect(M, y + 4, CW, 42);
            font(g, 17, 700);
            b.columns.forEach((c, i) => cellText(g, c.label.toUpperCase(), i, y + 31, C.muted));
          },
        });
        for (const row of b.rows) {
          font(g, 20, row.bold ? 700 : 400);
          const cells = row.cells.map((s, i) => wrap(g, s, widths[i] - 20));
          const n = Math.max(1, ...cells.map((c) => c.length));
          push({
            h: 16 + n * 30,
            draw: (g, y) => {
              font(g, 20, row.bold ? 700 : 400);
              cells.forEach((lines, i) =>
                lines.forEach((l, j) => cellText(g, l, i, y + 31 + j * 30, row.tone ? TONE[row.tone] : i === 0 || row.bold ? C.ink : C.text)),
              );
              g.fillStyle = C.line;
              g.fillRect(M, y + 16 + n * 30 - 1, CW, 1);
            },
          });
        }
        break;
      }
      case 'images': {
        const imgs = b.images.filter((i) => i.naturalWidth > 0);
        if (!imgs.length) break;
        if (b.layout === 'single') {
          const img = imgs[0];
          const h = Math.min(820, (CW * img.naturalHeight) / img.naturalWidth);
          push({ h: h + 24, draw: (g, y) => drawCover(g, img, M, y + 16, CW, h, true) });
          break;
        }
        const heroH = Math.round((CW * 9) / 16);
        push({ h: heroH + 24, draw: (g, y) => drawCover(g, imgs[0], M, y + 16, CW, heroH) });
        const thumbs = imgs.slice(1, 4);
        if (thumbs.length) {
          const gap = 14;
          const tw = (CW - gap * 2) / 3;
          const th = Math.round((tw * 3) / 4);
          push({ h: th + 14, draw: (g, y) => thumbs.forEach((img, i) => drawCover(g, img, M + i * (tw + gap), y + 6, tw, th)) });
        }
        break;
      }
      case 'chips': {
        font(g, 19, 700);
        const rows: Array<Array<{ text: string; w: number; tone: SheetTone }>> = [[]];
        let x = 0;
        for (const item of b.items) {
          const w = Math.min(CW, g.measureText(item.text).width + 32);
          if (x + w > CW && rows[rows.length - 1].length) {
            rows.push([]);
            x = 0;
          }
          rows[rows.length - 1].push({ ...item, w });
          x += w + 10;
        }
        push({
          h: 12 + rows.length * 50,
          draw: (g, y) => {
            font(g, 19, 700);
            rows.forEach((row, r) => {
              let cx = M;
              for (const chip of row) {
                g.fillStyle = chip.tone === 'violet' ? '#f5f3ff' : chip.tone === 'green' ? '#ecfdf5' : '#f1f5f9';
                roundRect(g, cx, y + 12 + r * 50, chip.w, 40, 20);
                g.fill();
                text(g, chip.text, cx + 16, y + 12 + r * 50 + 27, TONE[chip.tone]);
                cx += chip.w + 10;
              }
            });
          },
        });
        break;
      }
      case 'disclaimer': {
        font(g, 18, 400);
        const lines = wrap(g, b.text, CW);
        push({
          h: 40 + lines.length * 27,
          draw: (g, y) => {
            g.fillStyle = C.line;
            g.fillRect(M, y + 20, CW, 2);
            font(g, 18, 400);
            lines.forEach((l, i) => text(g, l, M, y + 52 + i * 27, C.muted));
          },
        });
        break;
      }
    }
  }
  return pieces;
}

// ---------------------------------------------------------------- Xuất file

async function prepare(blocks: SheetBlock[]) {
  await document.fonts?.ready;
  const { g } = makeCanvas(8, 8);
  return layout(g, blocks);
}

/** Một ảnh PNG dài (tiện gửi Zalo, khách lướt xem trên điện thoại). */
export async function renderSheetPng(blocks: SheetBlock[]): Promise<Blob> {
  const pieces = await prepare(blocks);
  const total = Math.ceil(M * 0.6 + pieces.reduce((a, p) => a + p.h, 0) + M);
  // Giới hạn số điểm ảnh của canvas (Safari trên iPhone): tài liệu dài thì thu nhỏ bớt.
  const scale = Math.min(1.25, Math.sqrt(15_000_000 / (SHEET_W * total)));
  const { c, g } = makeCanvas(Math.round(SHEET_W * scale), Math.round(total * scale));
  g.scale(scale, scale);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, SHEET_W, total);
  let y = M * 0.6;
  for (const p of pieces) {
    p.draw(g, y);
    y += p.h;
  }
  return toBlob(c, 'image/png');
}

/** File PDF khổ A4, tự chia trang; chân trang ghi tên / SĐT môi giới và số trang (không có đường link). */
export async function renderSheetPdf(blocks: SheetBlock[], footer: string): Promise<Blob> {
  const pieces = await prepare(blocks);
  const bottom = SHEET_H - M - FOOTER;
  const pages: Array<Array<{ p: Piece; y: number }>> = [];
  let page: Array<{ p: Piece; y: number }> = [];
  let y = M;
  pieces.forEach((p, i) => {
    const need = p.h + (p.keepNext && pieces[i + 1] ? pieces[i + 1].h : 0);
    if (y + need > bottom && page.length) {
      pages.push(page);
      page = [];
      y = M;
    }
    page.push({ p, y });
    y += p.h;
  });
  if (page.length) pages.push(page);

  const scale = 4 / 3; // ~200 dpi: chữ nét khi in
  const jpegs: Array<{ data: Uint8Array; w: number; h: number }> = [];
  for (let i = 0; i < pages.length; i++) {
    const { c, g } = makeCanvas(Math.round(SHEET_W * scale), Math.round(SHEET_H * scale));
    g.scale(scale, scale);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, SHEET_W, SHEET_H);
    for (const { p, y } of pages[i]) p.draw(g, y);
    g.fillStyle = C.line;
    g.fillRect(M, SHEET_H - M - 22, CW, 1);
    font(g, 16, 500);
    text(g, footer, M, SHEET_H - M + 6, C.faint);
    if (pages.length > 1) text(g, `Trang ${i + 1}/${pages.length}`, M + CW, SHEET_H - M + 6, C.faint, 'right');
    const blob = await toBlob(c, 'image/jpeg', 0.9);
    jpegs.push({ data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
  }
  return new Blob([buildPdf(jpegs) as BlobPart], { type: 'application/pdf' });
}

/** PDF tối giản: mỗi trang A4 là một ảnh JPEG phủ kín trang. */
export function buildPdf(pages: Array<{ data: Uint8Array; w: number; h: number }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const push = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    length += b.length;
  };
  const begin = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };
  const W = 595.28;
  const H = 841.89;
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageObj = (i: number) => 3 + i * 3;
  begin(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2);
  push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((pg, i) => {
    const p = pageObj(i);
    begin(p);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>\nendobj\n`);
    const content = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
    begin(p + 1);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    begin(p + 2);
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.data.length} >>\nstream\n`);
    push(pg.data);
    push('\nendstream\nendobj\n');
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Tải ảnh từ đường dẫn (blob: của kho ảnh) để vẽ lên phiếu. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
