import type { Installment, PaymentMethod, Promotion, SalesTerms } from '../types';
import { daysFromToday, formatDate, formatMoney, formatNumber, todayStr } from './format';
import { uid } from './id';

/*
 * Tính giá & lịch thanh toán cho khách: giá niêm yết → trừ ưu đãi / chiết khấu của phương thức
 * → giá sau chiết khấu, phí bảo trì, số tiền từng đợt.
 */

/** Làm tròn tới nghìn đồng như bảng tính của CĐT. */
const roundK = (n: number) => Math.round(n / 1000) * 1000;

export const fmtPct = (n: number) => `${formatNumber(n, 2)}%`;
export const fmtVnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

/** Ưu đãi còn hạn (chưa có hạn = còn). */
export const promotionActive = (p: Promotion, today = todayStr()) => !p.until || p.until >= today;

/** "còn 5 ngày", "hết hạn" — cho hạn áp dụng ưu đãi. */
export function untilText(until: string): string {
  if (!until) return '';
  const d = daysFromToday(until);
  if (d === null) return '';
  if (d < 0) return `hết hạn ${formatDate(until)}`;
  if (d === 0) return 'hết hạn hôm nay';
  return `đến ${formatDate(until)}${d <= 30 ? ` · còn ${d} ngày` : ''}`;
}

export function promotionValueText(p: Promotion): string {
  if (p.kind === 'pct') return `−${fmtPct(p.value)}`;
  if (p.kind === 'amount') return `−${formatMoney(p.value, '')}`;
  return p.value ? `Quà ${formatMoney(p.value, '')}` : 'Quà tặng';
}

export const installmentTotal = (m: PaymentMethod) => Math.round(m.installments.reduce((a, r) => a + r.pct, 0) * 100) / 100;

export interface QuoteLine {
  label: string;
  /** Số tiền giảm (âm). */
  amount: number;
}

export interface QuoteRow {
  label: string;
  when: string;
  date: string;
  pct: number;
  amount: number;
}

export interface Quote {
  listPrice: number;
  discounts: QuoteLine[];
  netPrice: number;
  /** Phí bảo trì (tính trên giá chưa VAT nếu giá niêm yết đã gồm VAT). */
  maintenance: number;
  total: number;
  rows: QuoteRow[];
  /** Tổng % các đợt của phương thức. */
  pctTotal: number;
  gifts: Promotion[];
}

/**
 * Ưu đãi trừ theo thứ tự trong danh sách, chiết khấu của phương thức thanh toán trừ sau cùng.
 * compound: mỗi khoản % tính trên giá đã giảm; ngược lại cộng các % rồi trừ một lần trên giá niêm yết.
 */
export function computeQuote(listPrice: number, terms: Pick<SalesTerms, 'compound' | 'maintenancePct' | 'vatIncluded'>, method: PaymentMethod | undefined, promotions: Promotion[]): Quote {
  const steps: Array<{ label: string; pct?: number; amount?: number }> = promotions
    .filter((p) => p.kind !== 'gift' && p.value > 0)
    .map((p) => (p.kind === 'pct' ? { label: p.name, pct: p.value } : { label: p.name, amount: p.value }));
  if (method && method.discountPct > 0) steps.push({ label: `Chiết khấu ${method.name}`, pct: method.discountPct });

  const discounts: QuoteLine[] = [];
  let price = listPrice;
  for (const s of steps) {
    const base = terms.compound ? price : listPrice;
    const cut = s.pct !== undefined ? roundK((base * s.pct) / 100) : Math.round(s.amount ?? 0);
    const applied = Math.min(Math.max(0, price), cut);
    price -= applied;
    discounts.push({ label: s.pct !== undefined ? `${s.label} (${fmtPct(s.pct)})` : s.label, amount: -applied });
  }
  const netPrice = Math.max(0, price);
  const maintenance = terms.maintenancePct > 0 ? roundK(((terms.vatIncluded ? netPrice / 1.1 : netPrice) * terms.maintenancePct) / 100) : 0;

  const installments = method?.installments ?? [];
  const pctTotal = method ? installmentTotal(method) : 0;
  const rows: QuoteRow[] = installments.map((r, i) => ({
    label: r.label.trim() || `Đợt ${i + 1}`,
    when: r.when,
    date: r.date,
    pct: r.pct,
    amount: roundK((netPrice * r.pct) / 100),
  }));
  // Đủ 100%: dồn phần lẻ do làm tròn vào đợt cuối để tổng khớp đúng giá.
  if (rows.length && Math.abs(pctTotal - 100) < 0.001) {
    const diff = netPrice - rows.reduce((a, r) => a + r.amount, 0);
    rows[rows.length - 1].amount += diff;
  }
  return {
    listPrice,
    discounts,
    netPrice,
    maintenance,
    total: netPrice + maintenance,
    rows,
    pctTotal,
    gifts: promotions.filter((p) => p.kind === 'gift'),
  };
}

/** Bảng tính gửi khách qua Zalo / Messenger. */
export function quoteText(
  q: Quote,
  info: { project: string; code?: string; unit?: string; method?: PaymentMethod; maintenancePct: number },
): string {
  const lines = [
    `BẢNG TÍNH GIÁ${info.code ? ` CĂN ${info.code}` : ''} – ${info.project}`,
    info.unit ?? '',
    '',
    `Giá niêm yết: ${fmtVnd(q.listPrice)} (${formatMoney(q.listPrice)})`,
    ...q.discounts.map((d) => `– ${d.label}: −${fmtVnd(-d.amount)}`),
    q.discounts.length ? `Giá sau chiết khấu: ${fmtVnd(q.netPrice)} (${formatMoney(q.netPrice)})` : '',
    q.maintenance ? `Phí bảo trì ${fmtPct(info.maintenancePct)} (tạm tính): ${fmtVnd(q.maintenance)}` : '',
    `TỔNG THANH TOÁN: ${fmtVnd(q.total)} (${formatMoney(q.total)})`,
  ];
  if (info.method && q.rows.length) {
    lines.push('', `Phương thức: ${info.method.name}`);
    for (const r of q.rows) lines.push(`• ${r.label} (${fmtPct(r.pct)})${r.when ? ` – ${r.when}` : ''}${r.date ? ` – ${formatDate(r.date)}` : ''}: ${fmtVnd(r.amount)}`);
    if (q.maintenance) lines.push(`• Phí bảo trì – khi nhận bàn giao: ${fmtVnd(q.maintenance)}`);
  }
  if (q.gifts.length) lines.push('', `Quà tặng: ${q.gifts.map((g) => (g.value ? `${g.name} (${formatMoney(g.value, '')})` : g.name)).join('; ')}`);
  lines.push('', '(Bảng tính tham khảo theo chính sách hiện hành, có thể thay đổi theo chủ đầu tư.)');
  return lines
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------- Mẫu phương thức thanh toán

const inst = (label: string, pct: number, when: string): Installment => ({ id: uid(), label, pct, when, date: '' });

/** Khung phương thức hay gặp — điền số liệu theo chính sách của CĐT. */
export const METHOD_TEMPLATES: Array<{ key: string; label: string; make: () => Omit<PaymentMethod, 'id'> }> = [
  {
    key: 'chuan',
    label: 'Chuẩn theo tiến độ',
    make: () => ({
      name: 'Thanh toán chuẩn theo tiến độ',
      discountPct: 0,
      note: '',
      installments: [
        inst('Đợt 1', 15, 'Ký hợp đồng mua bán'),
        inst('Đợt 2', 10, 'Sau 2 tháng'),
        inst('Đợt 3', 10, 'Sau 4 tháng'),
        inst('Đợt 4', 10, 'Sau 6 tháng'),
        inst('Đợt 5', 10, 'Sau 8 tháng'),
        inst('Đợt 6', 40, 'Nhận bàn giao'),
        inst('Đợt 7', 5, 'Nhận sổ hồng'),
      ],
    }),
  },
  {
    key: 'som',
    label: 'Thanh toán sớm',
    make: () => ({
      name: 'Thanh toán sớm 95%',
      discountPct: 0,
      note: '',
      installments: [inst('Đợt 1', 30, 'Ký hợp đồng mua bán'), inst('Đợt 2', 65, 'Sau 30 ngày'), inst('Đợt 3', 5, 'Nhận sổ hồng')],
    }),
  },
  {
    key: 'vay',
    label: 'Vay ngân hàng',
    make: () => ({
      name: 'Vay ngân hàng',
      discountPct: 0,
      note: 'Ngân hàng cho vay theo chính sách của CĐT (tỉ lệ vay, hỗ trợ lãi suất, ân hạn nợ gốc).',
      installments: [
        inst('Đợt 1', 15, 'Ký hợp đồng mua bán'),
        inst('Đợt 2', 15, 'Sau 30 ngày'),
        inst('Đợt 3', 65, 'Ngân hàng giải ngân'),
        inst('Đợt 4', 5, 'Nhận sổ hồng'),
      ],
    }),
  },
];
