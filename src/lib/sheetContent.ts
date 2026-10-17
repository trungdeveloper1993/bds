import {
  ACTIVE_PROPERTY_STATUSES,
  DIRECTION_LABEL,
  DOC_CATEGORY,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  INVENTORY_STATUS,
  LEGAL_LABEL,
  MILESTONE_STATUS,
  PROJECT_STAGE,
  PROPERTY_TYPE_LABEL,
  TRANSACTION_LABEL,
  isApartment,
  isLand,
} from '../constants';
import type { Customer, PaymentMethod, Project, Property, Settings } from '../types';
import { formatArea, formatDate, formatMoney, formatNumber, formatPhone, formatPrice, formatUnitPrice } from './format';
import { resolveChecklist } from './legal';
import { formatAddress, formatPriceRange, formatProjectAddress } from './listing';
import type { ResolvedUnit } from './maps';
import { mainArea } from './match';
import { loadImageUrl } from './media';
import { fmtPct, fmtVnd, promotionActive, promotionValueText, untilText, type Quote } from './pricing';
import { loadImage, type SheetBlock } from './sheet';

/*
 * Nội dung phiếu gửi khách (thông tin dự án, phiếu tư vấn BĐS, chi tiết một căn) dưới dạng khối để vẽ ra PNG / PDF.
 * Chỉ dùng thông tin gửi khách được: không có ưu đãi nội bộ, thông tin chủ nhà, ghi chú nội bộ.
 */

/** "Chị Lan" giữ nguyên; "Nguyễn Văn A" → "Anh/Chị Nguyễn Văn A". */
export function salutation(name: string): string {
  const trimmed = name.trim();
  return /^(anh|chị|chi|cô|chú|bác|ông|bà|em|mr\.?|mrs\.?|ms\.?)\s/i.test(trimmed) ? trimmed : `Anh/Chị ${trimmed}`;
}

export function brandBlock(s: Settings): SheetBlock {
  return {
    type: 'brand',
    name: s.officeName || s.agentName || 'Tư vấn bất động sản',
    lines: [s.officeAddress].filter(Boolean),
    // Thứ tự cố định: tên (đậm), số điện thoại (màu thương hiệu), chức danh, email.
    contact: [s.agentName, s.agentPhone ? `ĐT: ${formatPhone(s.agentPhone)}` : '', s.agentTitle, s.agentEmail],
  };
}

/** Chân trang PDF: tên + số điện thoại môi giới (thay cho đường link của trình duyệt). */
export function sheetFooter(s: Settings): string {
  return [s.agentName || s.officeName, s.agentPhone && formatPhone(s.agentPhone), s.officeName && s.agentName ? s.officeName : ''].filter(Boolean).join(' · ') || 'Tư vấn bất động sản';
}

function disclaimer(s: Settings): SheetBlock {
  const who = s.agentName ? `${s.agentName}${s.agentPhone ? ` (${formatPhone(s.agentPhone)})` : ''}` : 'chuyên viên tư vấn';
  return {
    type: 'disclaimer',
    text: `Thông tin mang tính tham khảo tại thời điểm lập phiếu và có thể thay đổi theo chính sách của chủ đầu tư / chủ nhà. Vui lòng liên hệ ${who} để được tư vấn chi tiết và đi xem thực tế.`,
  };
}

const today = () => formatDate(new Date().toISOString());

async function images(ids: string[]): Promise<HTMLImageElement[]> {
  const out = await Promise.all(
    ids.map(async (id) => {
      const url = await loadImageUrl(id, 'full');
      return url ? loadImage(url) : null;
    }),
  );
  return out.filter((x): x is HTMLImageElement => !!x);
}

const rows = (list: Array<[string, string | undefined | false]>): Array<[string, string]> => list.filter((r): r is [string, string] => !!r[1]);

function customerBlocks(customer: Customer | undefined, needs: string): SheetBlock[] {
  if (!customer) return [];
  return [{ type: 'rows', rows: rows([['Kính gửi', salutation(customer.name)], ['Nhu cầu', needs]]) }];
}

// ---------------------------------------------------------------- Thanh toán & ưu đãi (dùng chung)

/** Ưu đãi còn hạn, gửi khách được. */
function promotionBlocks(p: Project): SheetBlock[] {
  const list = p.sales.promotions.filter((x) => !x.internal && promotionActive(x));
  if (!list.length) return [];
  return [
    { type: 'heading', text: 'Ưu đãi & chiết khấu' },
    {
      type: 'bullets',
      items: list.map((x) => [`${promotionValueText(x)} · ${x.name}`, x.condition, x.until && untilText(x.until)].filter(Boolean).join(' — ')),
    },
  ];
}

function methodTable(m: PaymentMethod): SheetBlock {
  return {
    type: 'table',
    columns: [
      { label: 'Đợt', w: 1.2 },
      { label: 'Tỉ lệ', w: 0.9, align: 'right' },
      { label: 'Thời điểm thanh toán', w: 3.6 },
    ],
    rows: m.installments.map((r, i) => ({ cells: [r.label.trim() || `Đợt ${i + 1}`, fmtPct(r.pct), [r.when, r.date && formatDate(r.date)].filter(Boolean).join(' · ')] })),
  };
}

function methodBlocks(p: Project): SheetBlock[] {
  if (!p.sales.methods.length) return [];
  const out: SheetBlock[] = [{ type: 'heading', text: 'Phương thức & tiến độ thanh toán' }];
  for (const m of p.sales.methods) {
    out.push({ type: 'subheading', text: m.name, right: m.discountPct > 0 ? `Chiết khấu ${fmtPct(m.discountPct)}` : undefined });
    if (m.installments.length) out.push(methodTable(m));
    if (m.note) out.push({ type: 'text', text: m.note, muted: true });
  }
  return out;
}

function progressBlocks(p: Project): SheetBlock[] {
  const list = p.sales.milestones.filter((m) => m.label.trim());
  if (!list.length) return [];
  return [
    { type: 'heading', text: 'Tiến độ dự án' },
    { type: 'bullets', items: list.map((m) => `${m.label}${m.time ? ` · ${m.time}` : ''} — ${MILESTONE_STATUS[m.status].label.toLowerCase()}${m.note ? `. ${m.note}` : ''}`) },
  ];
}

// ---------------------------------------------------------------- Thông tin dự án

export async function projectSheetBlocks(
  p: Project,
  o: { settings: Settings; units: Property[]; customer?: Customer; needs?: string; showDescription: boolean },
): Promise<SheetBlock[]> {
  const blocks: SheetBlock[] = [brandBlock(o.settings), { type: 'title', text: 'THÔNG TIN DỰ ÁN', sub: `Ngày ${today()}` }, ...customerBlocks(o.customer, o.needs ?? '')];
  blocks.push({ type: 'h1', text: p.name, sub: [p.legalName, formatProjectAddress(p)] });
  if (p.images.length) blocks.push({ type: 'images', images: await images(p.images.slice(0, 4)), layout: 'hero' });
  const range = formatPriceRange(p.priceFrom, p.priceTo);
  if (range || p.unitPrice) {
    blocks.push({ type: 'price', label: 'Giá tham khảo', value: range || p.unitPrice, sub: p.priceNote || undefined, side: range && p.unitPrice ? [p.unitPrice] : [] });
  }
  blocks.push({
    type: 'rows',
    rows: rows([
      ['Chủ đầu tư', p.developer],
      ['Đơn vị phát triển', p.devPartner],
      ['Tình trạng', `${PROJECT_STAGE[p.stage].label}${p.construction ? ` – ${p.construction}` : ''}`],
      ['Tổng diện tích', p.siteArea ? `${formatNumber(p.siteArea, 2)} ha` : ''],
      ['Mật độ xây dựng', p.density ? `${formatNumber(p.density, 1)}%` : ''],
      ['Quy mô', [p.scale, p.totalUnits ? `${p.totalUnits.toLocaleString('vi-VN')} sản phẩm` : ''].filter(Boolean).join(' · ')],
      ['Loại hình', p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', ')],
      ['Diện tích sản phẩm', p.unitAreaRange],
      ['Hình thức sở hữu', p.ownership],
      ['Bàn giao', [p.handover, p.handoverStandard].filter(Boolean).join(' · ')],
      ['Phí quản lý', p.managementFee],
      ['Ngân hàng', p.banks],
    ]),
  });
  const highlights = p.highlights
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*+]\s*/, ''))
    .filter(Boolean);
  if (highlights.length) blocks.push({ type: 'heading', text: 'Điểm nổi bật' }, { type: 'bullets', items: highlights });
  if (o.showDescription && p.description.trim()) blocks.push({ type: 'heading', text: 'Giới thiệu' }, { type: 'text', text: p.description.trim() });
  if (p.connectivity.trim() || p.amenities.length || p.nearby.length) {
    blocks.push({ type: 'heading', text: 'Vị trí & tiện ích' });
    if (p.connectivity.trim()) blocks.push({ type: 'text', text: p.connectivity.trim() });
    if (p.amenities.length) blocks.push({ type: 'text', text: `Nội khu: ${p.amenities.join(' · ')}` });
    if (p.nearby.length) blocks.push({ type: 'text', text: `Ngoại khu: ${p.nearby.join(' · ')}` });
  }
  if (p.unitTypes.length) {
    blocks.push(
      { type: 'heading', text: 'Sản phẩm & giá' },
      {
        type: 'table',
        columns: [
          { label: 'Loại', w: 1.4 },
          { label: 'Diện tích', w: 1.3 },
          { label: 'Giá', w: 1.4 },
          { label: 'Số lượng', w: 1 },
          { label: 'Ghi chú', w: 1.9 },
        ],
        rows: p.unitTypes.map((t) => ({ cells: [t.name, t.area, t.price, t.quantity, t.note] })),
      },
    );
  }
  blocks.push(...promotionBlocks(p), ...methodBlocks(p));
  if (p.paymentPlan.trim() || p.salesPolicy.trim()) {
    blocks.push({ type: 'heading', text: 'Thanh toán & chính sách' });
    if (p.paymentPlan.trim()) blocks.push({ type: 'text', text: p.paymentPlan.trim() });
    if (p.salesPolicy.trim()) blocks.push({ type: 'text', text: p.salesPolicy.trim() });
  }
  blocks.push(...progressBlocks(p));
  const legalDone = resolveChecklist(p).filter((i) => i.status === 'co');
  if (p.legalStatus.trim() || legalDone.length) {
    blocks.push({ type: 'heading', text: 'Pháp lý' });
    if (p.legalStatus.trim()) blocks.push({ type: 'text', text: p.legalStatus.trim() });
    if (legalDone.length) blocks.push({ type: 'bullets', items: legalDone.map((i) => `${i.label}${i.note ? ` — ${i.note}` : ''}`) });
  }
  const units = o.units.filter((u) => u.projectId === p.id && ACTIVE_PROPERTY_STATUSES.includes(u.status));
  if (units.length) {
    blocks.push(
      { type: 'heading', text: `Căn đang có sẵn (${units.length})` },
      {
        type: 'table',
        columns: [
          { label: 'Căn', w: 2.6 },
          { label: 'Diện tích', w: 1.2 },
          { label: 'Giá', w: 1.3, align: 'right' },
        ],
        rows: units.map((u) => ({
          cells: [
            [u.unitCode, u.bedrooms ? `${u.bedrooms}PN` : '', u.direction ? DIRECTION_LABEL[u.direction] : ''].filter(Boolean).join(' · ') || PROPERTY_TYPE_LABEL[u.type],
            formatArea(mainArea(u)),
            formatPrice(u.price, u.transaction),
          ],
        })),
      },
    );
  }
  const docs = p.documents.filter((d) => d.visibility === 'public' && !d.archived);
  if (docs.length) blocks.push({ type: 'heading', text: 'Tài liệu có thể gửi kèm' }, { type: 'bullets', items: docs.map((d) => `${d.name} (${DOC_CATEGORY[d.category].label})`) });
  blocks.push(disclaimer(o.settings));
  return blocks;
}

// ---------------------------------------------------------------- Phiếu tư vấn nhiều BĐS (giỏ hàng)

export async function propertiesSheetBlocks(
  list: Property[],
  o: { settings: Settings; projectById: Map<string, Project>; customer?: Customer; needs?: string; hideNumber: boolean; showDescription: boolean },
): Promise<SheetBlock[]> {
  const blocks: SheetBlock[] = [brandBlock(o.settings), { type: 'title', text: 'PHIẾU TƯ VẤN BẤT ĐỘNG SẢN', sub: `Ngày ${today()}` }, ...customerBlocks(o.customer, o.needs ?? '')];
  for (const [i, p] of list.entries()) {
    const project = o.projectById.get(p.projectId);
    const area = mainArea(p);
    blocks.push({ type: 'h1', text: `${i + 1}. ${p.title || PROPERTY_TYPE_LABEL[p.type]}`, sub: [[project?.name, p.unitCode, formatAddress(p, { hideNumber: o.hideNumber })].filter(Boolean).join(' · ')] });
    if (p.images.length) blocks.push({ type: 'images', images: await images(p.images.slice(0, 4)), layout: p.images.length > 1 ? 'hero' : 'single' });
    const unitPrice = p.transaction === 'ban' ? formatUnitPrice(p.price, area) : '';
    blocks.push({
      type: 'price',
      label: p.transaction === 'ban' ? 'Giá bán' : 'Giá thuê',
      value: formatPrice(p.price, p.transaction),
      side: [unitPrice && `≈ ${unitPrice}`, p.price ? (p.negotiable ? 'Có thương lượng' : 'Giá cố định') : ''].filter(Boolean),
    });
    blocks.push({
      type: 'rows',
      rows: rows([
        ['Loại hình', `${PROPERTY_TYPE_LABEL[p.type]} · ${TRANSACTION_LABEL[p.transaction]}`],
        [isApartment(p.type) ? 'Diện tích' : 'Diện tích đất', formatArea(area)],
        ['Kích thước', p.width && p.length ? `${formatNumber(p.width, 2)} × ${formatNumber(p.length, 2)} m${p.backWidth ? ` (nở hậu ${formatNumber(p.backWidth, 2)} m)` : ''}` : ''],
        ['Diện tích sử dụng', !isApartment(p.type) ? formatArea(p.floorArea) : ''],
        [
          'Kết cấu',
          !isLand(p.type) ? [p.floors && p.floors > 1 ? `${p.floors} tầng` : '', p.bedrooms ? `${p.bedrooms} phòng ngủ` : '', p.bathrooms ? `${p.bathrooms} WC` : ''].filter(Boolean).join(' · ') : '',
        ],
        ['Hướng', [p.direction ? DIRECTION_LABEL[p.direction] : '', p.balconyDirection ? `ban công ${DIRECTION_LABEL[p.balconyDirection]}` : ''].filter(Boolean).join(', ')],
        ['Vị trí', p.frontage ? `${FRONTAGE_LABEL[p.frontage]}${p.roadWidth ? ` · đường ${formatNumber(p.roadWidth, 1)} m` : ''}` : ''],
        ['Pháp lý', p.legal ? LEGAL_LABEL[p.legal] : ''],
        ['Nội thất', !isLand(p.type) && p.furnishing ? FURNISHING_LABEL[p.furnishing] : ''],
        ['Tiện ích', p.amenities.join(' · ')],
      ]),
    });
    if (o.showDescription && p.description.trim()) blocks.push({ type: 'text', text: p.description.trim() });
  }
  blocks.push(disclaimer(o.settings));
  return blocks;
}

// ---------------------------------------------------------------- Chi tiết một căn (kèm giá sau ưu đãi & dòng tiền)

export async function unitSheetBlocks(o: {
  project: Project;
  unit: ResolvedUnit;
  settings: Settings;
  price?: number;
  quote: Quote | null;
  method?: PaymentMethod;
  hidePrice: boolean;
  includeLayout: boolean;
  includeProgress: boolean;
}): Promise<SheetBlock[]> {
  const { project: p, unit: u, quote } = o;
  const blocks: SheetBlock[] = [
    brandBlock(o.settings),
    { type: 'title', text: u.code ? `THÔNG TIN CĂN ${u.code}` : 'BẢNG TÍNH GIÁ', sub: `${p.name} · Ngày ${today()}` },
  ];
  if (o.includeLayout && u.imageId) {
    const [img] = await images([u.imageId]);
    if (img) blocks.push({ type: 'images', images: [img], layout: 'single' });
  }
  const price = o.price ?? u.price;
  if (o.hidePrice || !price) {
    blocks.push({ type: 'price', label: 'Giá bán', value: o.hidePrice ? 'Liên hệ' : u.priceText || 'Liên hệ', side: u.status ? [INVENTORY_STATUS[u.status].label] : [] });
  } else {
    blocks.push({
      type: 'price',
      label: quote && quote.discounts.length ? 'Giá niêm yết' : 'Giá bán',
      value: formatMoney(price),
      sub: fmtVnd(price),
      side: [u.status ? INVENTORY_STATUS[u.status].label : '', formatUnitPrice(price, u.area) && `≈ ${formatUnitPrice(price, u.area)}`].filter(Boolean),
    });
  }
  blocks.push({
    type: 'rows',
    rows: rows([
      ['Dự án', p.name],
      ['Mã căn', u.code],
      ['Loại căn', u.type?.name],
      ['Tầng', u.floor !== undefined ? String(u.floor) : ''],
      ['Diện tích', u.area ? formatArea(u.area) : u.areaText],
      ['Phòng ngủ', u.bedrooms ? `${u.bedrooms} phòng ngủ${u.bathrooms ? ` · ${u.bathrooms} WC` : ''}` : ''],
      ['Hướng', u.direction ? DIRECTION_LABEL[u.direction] : ''],
      ['Ghi chú', u.note],
      ['Bàn giao', [p.handover, p.handoverStandard].filter(Boolean).join(' · ')],
    ]),
  });
  if (quote && !o.hidePrice) {
    blocks.push(
      { type: 'heading', text: quote.discounts.length ? 'Giá sau ưu đãi' : 'Giá & phí' },
      {
        type: 'table',
        columns: [
          { label: 'Khoản', w: 3 },
          { label: 'Số tiền', w: 2, align: 'right' },
        ],
        rows: [
          { cells: ['Giá niêm yết', fmtVnd(quote.listPrice)] },
          ...quote.discounts.map((d) => ({ cells: [d.label, `−${fmtVnd(-d.amount)}`], tone: 'green' as const })),
          ...(quote.discounts.length ? [{ cells: [`Giá sau chiết khấu (${formatMoney(quote.netPrice)})`, fmtVnd(quote.netPrice)], bold: true }] : []),
          ...(quote.maintenance ? [{ cells: [`Phí bảo trì ${fmtPct(p.sales.maintenancePct)} (tạm tính)`, fmtVnd(quote.maintenance)] }] : []),
          { cells: [`Tổng thanh toán (${formatMoney(quote.total)})`, fmtVnd(quote.total)], bold: true, tone: 'brand' },
        ],
      },
    );
    if (o.method && quote.rows.length) {
      blocks.push(
        { type: 'heading', text: `Dòng tiền thanh toán · ${o.method.name}` },
        {
          type: 'table',
          columns: [
            { label: 'Đợt', w: 1.1 },
            { label: 'Tỉ lệ', w: 0.8, align: 'right' },
            { label: 'Thời điểm', w: 2.4 },
            { label: 'Số tiền', w: 1.7, align: 'right' },
          ],
          rows: [
            ...quote.rows.map((r) => ({ cells: [r.label, fmtPct(r.pct), [r.when, r.date && formatDate(r.date)].filter(Boolean).join(' · '), fmtVnd(r.amount)] })),
            ...(quote.maintenance ? [{ cells: ['Phí bảo trì', '', 'Khi nhận bàn giao', fmtVnd(quote.maintenance)] }] : []),
          ],
        },
      );
      if (o.method.note) blocks.push({ type: 'text', text: o.method.note, muted: true });
    }
    if (quote.gifts.length) {
      blocks.push({ type: 'heading', text: 'Quà tặng' }, { type: 'bullets', items: quote.gifts.map((g) => `${g.name}${g.value ? ` (trị giá ${formatMoney(g.value, '')})` : ''}${g.condition ? ` — ${g.condition}` : ''}`) });
    }
  }
  if (o.includeProgress) blocks.push(...progressBlocks(p));
  blocks.push(disclaimer(o.settings));
  return blocks;
}
