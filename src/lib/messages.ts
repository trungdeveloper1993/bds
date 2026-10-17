import { PROPERTY_TYPE_SHORT } from '../constants';
import type { Customer, Interaction, Project, Promotion, Settings } from '../types';
import { formatBudget, formatDate, formatMoney, formatPhone, todayStr } from './format';
import { formatPriceRange, formatProjectAddress } from './listing';
import { fmtPct, promotionActive } from './pricing';
import { digitsOnly, normalize } from './text';

/*
 * Gửi tin chăm sóc khách: điền mẫu theo từng khách, tạo link mở ứng dụng mail / Gmail / SMS / Zalo,
 * ghi nhật ký, danh bạ .vcf, sinh nhật. Ứng dụng không có máy chủ nên tin được gửi từ chính
 * ứng dụng mail / Zalo / tin nhắn trên máy của môi giới.
 */

export type Channel = 'email' | 'zalo' | 'sms';

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', zalo: 'Zalo', sms: 'SMS' };

// ---------------------------------------------------------------- Ô điền tự động

export type TokenKey =
  | 'xungho'
  | 'anhchi'
  | 'tenkhach'
  | 'nhucau'
  | 'duan'
  | 'vitriduan'
  | 'giaduan'
  | 'chudautu'
  | 'bangiao'
  | 'uudai'
  | 'moigioi'
  | 'sdtmoigioi'
  | 'emailmoigioi'
  | 'vanphong'
  | 'chuky'
  | 'ngay';

export type TokenGroup = 'Khách' | 'Dự án' | 'Môi giới' | 'Khác';

export interface TokenInfo {
  key: TokenKey;
  /** Cách viết trong mẫu, VD "{xưng hô}". */
  label: string;
  group: TokenGroup;
  hint: string;
}

export const TOKENS: TokenInfo[] = [
  { key: 'xungho', label: '{xưng hô}', group: 'Khách', hint: 'VD “Chị Lan”, “Anh/Chị Minh”' },
  { key: 'anhchi', label: '{anh/chị}', group: 'Khách', hint: 'VD “Chị”, “Anh”, “Anh/Chị”' },
  { key: 'tenkhach', label: '{tên khách}', group: 'Khách', hint: 'Tên khách như đã lưu' },
  { key: 'nhucau', label: '{nhu cầu}', group: 'Khách', hint: 'VD “mua căn hộ 2PN tầm 3 – 4 tỷ tại Quận 7”' },
  { key: 'duan', label: '{dự án}', group: 'Dự án', hint: 'Tên dự án đã chọn' },
  { key: 'vitriduan', label: '{vị trí dự án}', group: 'Dự án', hint: 'Địa chỉ dự án' },
  { key: 'giaduan', label: '{giá dự án}', group: 'Dự án', hint: 'Khoảng giá, đơn giá' },
  { key: 'chudautu', label: '{chủ đầu tư}', group: 'Dự án', hint: '' },
  { key: 'bangiao', label: '{bàn giao}', group: 'Dự án', hint: 'Thời gian bàn giao' },
  { key: 'uudai', label: '{ưu đãi}', group: 'Dự án', hint: 'Ưu đãi còn hạn, không gồm ưu đãi nội bộ' },
  { key: 'moigioi', label: '{môi giới}', group: 'Môi giới', hint: 'Tên của bạn (Cài đặt → Hồ sơ môi giới)' },
  { key: 'sdtmoigioi', label: '{sđt môi giới}', group: 'Môi giới', hint: '' },
  { key: 'emailmoigioi', label: '{email môi giới}', group: 'Môi giới', hint: '' },
  { key: 'vanphong', label: '{văn phòng}', group: 'Môi giới', hint: '' },
  { key: 'chuky', label: '{chữ ký}', group: 'Môi giới', hint: 'Tên, chức danh, SĐT, văn phòng' },
  { key: 'ngay', label: '{ngày}', group: 'Khác', hint: 'Ngày hôm nay' },
];

const TOKEN_LABEL = Object.fromEntries(TOKENS.map((t) => [t.key, t.label])) as Record<TokenKey, string>;
const PROJECT_TOKENS = new Set<TokenKey>(TOKENS.filter((t) => t.group === 'Dự án').map((t) => t.key));

/** Cách gõ khác của cùng một ô: {tên}, {sđt}, {chữ kí}… */
const ALIASES: Record<string, TokenKey> = {
  ten: 'tenkhach',
  khach: 'tenkhach',
  khachhang: 'tenkhach',
  tenkhachhang: 'tenkhach',
  vitri: 'vitriduan',
  diachi: 'vitriduan',
  diachiduan: 'vitriduan',
  gia: 'giaduan',
  cdt: 'chudautu',
  tenmoigioi: 'moigioi',
  sdt: 'sdtmoigioi',
  sodienthoai: 'sdtmoigioi',
  email: 'emailmoigioi',
  chuki: 'chuky',
  homnay: 'ngay',
};

/** "{Xưng hô}", "{xung ho}", "{xưng_hô}" đều là cùng một ô. */
export function tokenKey(raw: string): TokenKey | undefined {
  const k = normalize(raw).replace(/[^a-z0-9]/g, '');
  return k in TOKEN_LABEL ? (k as TokenKey) : ALIASES[k];
}

const TOKEN_RE = /\{([^{}\n]{1,40})\}/g;

/** Các ô có trong văn bản (theo thứ tự xuất hiện, không trùng). */
export function tokensIn(text: string): TokenKey[] {
  const keys: TokenKey[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const key = tokenKey(m[1]);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export const usesProject = (text: string) => tokensIn(text).some((k) => PROJECT_TOKENS.has(k));

// ---------------------------------------------------------------- Giá trị từng ô

export type TokenValues = Record<TokenKey, string>;

export interface MessageContext {
  settings: Settings;
  /** Bỏ trống = gửi chung cho nhiều khách (email BCC): xưng hô chung "Anh/Chị". */
  customer?: Customer;
  project?: Project;
  projectById?: Map<string, Project>;
  /** YYYY-MM-DD, mặc định hôm nay. */
  today?: string;
}

const HONORIFIC: Record<string, string> = {
  anh: 'Anh',
  chị: 'Chị',
  chi: 'Chị',
  cô: 'Cô',
  chú: 'Chú',
  bác: 'Bác',
  ông: 'Ông',
  bà: 'Bà',
  em: 'Em',
  mr: 'Anh',
  mrs: 'Chị',
  ms: 'Chị',
};

/** Tên khách bỏ phần ghi chú: "Chị Lan (Q7)" → "Chị Lan", "Anh Minh - Vinhomes" → "Anh Minh". */
export function cleanName(name: string): string {
  return name
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/\s[-–—|]\s|,/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

const titleCase = (s: string) => (s === s.toLocaleLowerCase('vi') ? s.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('vi')) : s);

/** Cách xưng hô với khách: "Chị Lan" → { pronoun: "Chị", greeting: "Chị Lan" }, "Nguyễn Văn Minh" → "Anh/Chị Minh". */
export function addressOf(name: string): { pronoun: string; greeting: string } {
  const words = cleanName(name).split(' ').filter(Boolean);
  const head = HONORIFIC[(words[0] ?? '').toLocaleLowerCase('vi').replace(/\.$/, '')];
  if (head && words.length > 1) {
    const rest = words.slice(1);
    const given = rest.length <= 2 ? rest.join(' ') : rest[rest.length - 1];
    return { pronoun: head, greeting: `${head} ${titleCase(given)}` };
  }
  // Tên gọi là chữ cuối; bỏ ghi chú dạng mã như "Q7", "0909".
  const given = [...words].reverse().find((w) => !/\d/.test(w)) ?? '';
  return { pronoun: 'Anh/Chị', greeting: given ? `Anh/Chị ${titleCase(given)}` : 'Anh/Chị' };
}

/** Nhu cầu viết thành câu gửi khách: "mua căn hộ 2PN tầm 3 – 4 tỷ tại Aurora, Quận 7". */
export function needPhrase(c: Customer, projectById?: Map<string, Project>): string {
  const types = c.propertyTypes.slice(0, 2).map((t) => PROPERTY_TYPE_SHORT[t]);
  const places = [...c.projectIds.map((id) => projectById?.get(id)?.name).filter((x): x is string => !!x), ...c.locations].slice(0, 2);
  const budget = formatBudget(c.budgetMin, c.budgetMax);
  if (!types.length && !places.length && !budget && !c.bedroomsMin) return '';
  let s = `${c.transaction === 'cho_thue' ? 'thuê' : 'mua'} ${types.length ? types.join(' / ') : 'bất động sản'}`;
  if (c.bedroomsMin) s += ` ${c.bedroomsMin}PN`;
  if (budget) {
    const range = /^(Dưới|Từ) /.test(budget) ? budget.charAt(0).toLowerCase() + budget.slice(1) : `tầm ${budget}`;
    s += ` ${range}${c.transaction === 'cho_thue' ? '/tháng' : ''}`;
  }
  if (places.length) s += ` tại ${places.join(', ')}`;
  else if (c.province) s += ` tại ${c.province}`;
  return s;
}

function promotionLine(p: Promotion): string {
  let s = p.name.trim();
  if (p.kind !== 'gift' && p.value > 0 && !/\d/.test(s)) s += ` giảm ${p.kind === 'pct' ? fmtPct(p.value) : formatMoney(p.value, '')}`;
  if (p.until) s += ` (đến ${formatDate(p.until)})`;
  return s;
}

/** Chữ ký cuối tin: tên, chức danh, SĐT, văn phòng (email đã có ở người gửi; Zalo / SMS không cần). */
export function signature(s: Settings): string {
  if (!s.agentName.trim() && !s.agentPhone.trim() && !s.officeName.trim()) return '';
  return [s.agentName, s.agentTitle, s.agentPhone && `ĐT/Zalo: ${formatPhone(s.agentPhone)}`, s.officeName]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join('\n');
}

export function tokenValues(ctx: MessageContext): TokenValues {
  const { settings: s, customer: c, project: p } = ctx;
  const today = ctx.today ?? todayStr();
  const who = c ? addressOf(c.name) : { pronoun: 'Anh/Chị', greeting: 'Anh/Chị' };
  const range = p ? formatPriceRange(p.priceFrom, p.priceTo) : '';
  const unitPrice = p?.unitPrice.trim() ?? '';
  return {
    xungho: who.greeting,
    anhchi: who.pronoun,
    tenkhach: c ? cleanName(c.name) || c.name.trim() : 'Quý khách',
    nhucau: c ? needPhrase(c, ctx.projectById) : '',
    duan: p?.name.trim() ?? '',
    vitriduan: p ? formatProjectAddress(p) : '',
    giaduan: range && unitPrice ? `${range} (${unitPrice})` : range || unitPrice,
    chudautu: p?.developer.trim() ?? '',
    bangiao: p?.handover.trim() ?? '',
    uudai: p
      ? p.sales.promotions
          .filter((x) => !x.internal && promotionActive(x, today))
          .map(promotionLine)
          .join('; ')
      : '',
    moigioi: s.agentName.trim(),
    sdtmoigioi: s.agentPhone.trim() ? formatPhone(s.agentPhone) : '',
    emailmoigioi: s.agentEmail.trim(),
    vanphong: s.officeName.trim(),
    chuky: signature(s),
    ngay: formatDate(today),
  };
}

// ---------------------------------------------------------------- Điền mẫu

/**
 * Điền các ô {…} trong mẫu. Với nội dung: dòng nào có ô không có dữ liệu thì bỏ cả dòng (VD dự án
 * chưa có ưu đãi thì không có dòng "Ưu đãi:"). Với tiêu đề (multiline = false): chỉ thay bằng rỗng.
 * Ô không nhận ra được giữ nguyên như đã gõ.
 */
export function fillTemplate(text: string, values: Partial<TokenValues>, multiline = true): string {
  const fillLine = (line: string) => {
    let missing = false;
    const out = line.replace(TOKEN_RE, (whole, raw: string) => {
      const key = tokenKey(raw);
      if (!key) return whole;
      const v = values[key] ?? '';
      if (!v.trim()) missing = true;
      return v;
    });
    return { out, missing };
  };
  if (!multiline) {
    return fillLine(text.replace(/\s*\n\s*/g, ' '))
      .out.replace(/\s{2,}/g, ' ')
      .replace(/^[\s,:;–—-]+|[\s,:;–—-]+$/g, '');
  }
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const { out, missing } = fillLine(line);
    if (!missing) lines.push(out.replace(/[ \t]+$/, ''));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Các ô có trong mẫu nhưng chưa có dữ liệu (dòng chứa chúng sẽ bị bỏ). */
export function missingTokens(text: string, values: Partial<TokenValues>): TokenKey[] {
  return tokensIn(text).filter((k) => !(values[k] ?? '').trim());
}

export const tokenLabel = (key: TokenKey) => TOKEN_LABEL[key];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ngược lại với fillTemplate: tin đã soạn cho một khách → mẫu dùng lại cho khách khác
 * ("Chào Chị Lan" → "Chào {xưng hô}"). Giá trị dài thay trước để "Chị Lan" không bị tách thành "{anh/chị} Lan".
 */
export function toTemplate(text: string, values: Partial<TokenValues>): string {
  const pairs = TOKENS.map((t, i) => ({ key: t.key, i, value: (values[t.key] ?? '').trim() }))
    .filter((x) => x.value.length >= 2)
    .sort((a, b) => b.value.length - a.value.length || a.i - b.i);
  const found: string[] = [];
  let out = text;
  for (const x of pairs) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(x.value)}(?![\\p{L}\\p{N}])`, 'gu');
    out = out.replace(re, () => `\u0000${found.push(TOKEN_LABEL[x.key]) - 1}\u0000`);
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => found[+i]);
}

// ---------------------------------------------------------------- Link gửi

export const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s.trim());

const encAddress = (a: string) => encodeURIComponent(a.trim()).replace(/%40/g, '@');

export interface MailDraft {
  to?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
}

/** Mở ứng dụng mail mặc định (điện thoại: Gmail / Mail; máy tính: Outlook, Mail…). */
export function mailtoHref({ to = [], bcc = [], subject = '', body = '' }: MailDraft): string {
  const params: string[] = [];
  if (bcc.length) params.push(`bcc=${bcc.map(encAddress).join(',')}`);
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  // Xuống dòng trong mailto: CRLF (RFC 6068).
  if (body) params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${to.map(encAddress).join(',')}${params.length ? `?${params.join('&')}` : ''}`;
}

/** Soạn thư trên Gmail web (máy tính không cài ứng dụng mail). */
export function gmailHref({ to = [], bcc = [], subject = '', body = '' }: MailDraft): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1' });
  if (to.length) q.set('to', to.join(','));
  if (bcc.length) q.set('bcc', bcc.join(','));
  if (subject) q.set('su', subject);
  if (body) q.set('body', body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** Mở ứng dụng tin nhắn với nội dung soạn sẵn ("?&body=" chạy được cả iPhone và Android). */
export function smsHref(phone: string, body: string): string {
  const d = digitsOnly(phone);
  return `sms:${phone.trim().startsWith('+') ? '+' : ''}${d}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;
}

/** Số ký tự và số tin SMS: có dấu tiếng Việt → 70 ký tự / tin (67 khi ghép), không dấu → 160 (153). */
export function smsInfo(text: string): { length: number; segments: number; unicode: boolean } {
  const unicode = /[^\x00-\x7f]/.test(text);
  const length = unicode ? text.length : [...text].reduce((n, ch) => n + ('^{}\\[~]|'.includes(ch) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { length, segments: length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi), unicode };
}

/** Bỏ dấu để SMS tính theo 160 ký tự / tin (giữ chữ hoa, đổi dấu chấm tròn, gạch dài…). */
export function withoutDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[•·]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .normalize('NFC');
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Số người nhận tối đa trong một email BCC (tránh bị chặn vì gửi hàng loạt, link quá dài). */
export const BCC_BATCH = 40;

// ---------------------------------------------------------------- Nhật ký

const clip = (s: string, max: number) => {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}…`;
};

/** Mục nhật ký chăm sóc khi gửi tin. */
export function sentInteraction(channel: Channel, subject: string, body: string, groupSize = 1): Pick<Interaction, 'kind' | 'content'> {
  const text = clip(body, 400);
  if (channel === 'email') {
    const head = groupSize > 1 ? `Email chung cho ${groupSize} khách (BCC)` : '';
    return { kind: 'gui_email', content: [head, subject.trim() && `Tiêu đề: ${subject.trim()}`, text].filter(Boolean).join('\n') };
  }
  return { kind: 'nhan_tin', content: `Qua ${CHANNEL_LABEL[channel]}: ${text}` };
}

// ---------------------------------------------------------------- Danh bạ, sinh nhật, liên hệ gần nhất

const vEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Danh bạ .vcf (vCard 3.0) — nhập vào điện thoại để tìm khách trên Zalo, gọi đến hiện tên. */
export function buildVCard(customers: Customer[], note?: (c: Customer) => string): string {
  const cards = customers.map((c) => {
    const name = c.name.trim() || c.code;
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vEscape(name)}`, `N:;${vEscape(name)};;;`];
    for (const phone of [c.phone, c.phone2]) {
      const d = digitsOnly(phone);
      if (d) lines.push(`TEL;TYPE=CELL:${phone.trim().startsWith('+') ? '+' : ''}${d}`);
    }
    if (isEmail(c.email)) lines.push(`EMAIL;TYPE=INTERNET:${c.email.trim()}`);
    const b = birthdayParts(c.birthday);
    if (b && c.birthYear) lines.push(`BDAY:${c.birthYear}-${c.birthday}`);
    if (c.tags.length) lines.push(`CATEGORIES:${c.tags.map(vEscape).join(',')}`);
    const text = [c.code, note?.(c)].filter(Boolean).join(' · ');
    if (text) lines.push(`NOTE:${vEscape(text)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  });
  return cards.length ? `${cards.join('\r\n')}\r\n` : '';
}

export function birthdayParts(b: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(b);
  return m ? { month: +m[1], day: +m[2] } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày + tháng → "MM-DD" ('' nếu không hợp lệ; 29/02 hợp lệ). */
export function toBirthday(day: number, month: number): string {
  if (!day || !month || month < 1 || month > 12) return '';
  const max = new Date(2000, month, 0).getDate();
  return day >= 1 && day <= max ? `${pad(month)}-${pad(day)}` : '';
}

export function formatBirthday(b: string, year?: number): string {
  const p = birthdayParts(b);
  if (!p) return '';
  return `${pad(p.day)}/${pad(p.month)}${year ? `/${year}` : ''}`;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Số ngày tới sinh nhật kế tiếp (0 = hôm nay). Sinh 29/02: năm không nhuận tính ngày 28/02. */
export function daysToBirthday(b: string, today = todayStr()): number | null {
  const p = birthdayParts(b);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!p || !t) return null;
  const year = +t[1];
  const start = Date.UTC(year, +t[2] - 1, +t[3]);
  const on = (y: number) => Date.UTC(y, p.month - 1, p.month === 2 && p.day === 29 && !isLeap(y) ? 28 : p.day);
  const next = on(year) >= start ? on(year) : on(year + 1);
  return Math.round((next - start) / 86_400_000);
}

export interface UpcomingBirthday {
  customer: Customer;
  days: number;
  /** Tuổi vào ngày sinh nhật sắp tới (nếu biết năm sinh). */
  age?: number;
}

export function upcomingBirthdays(customers: Customer[], withinDays = 7, today = todayStr()): UpcomingBirthday[] {
  const year = +today.slice(0, 4);
  const out: UpcomingBirthday[] = [];
  for (const c of customers) {
    const days = daysToBirthday(c.birthday, today);
    if (days === null || days > withinDays) continue;
    const p = birthdayParts(c.birthday)!;
    // Sinh nhật sắp tới rơi vào năm sau khi đã qua ngày đó trong năm nay.
    const atYear = `${today.slice(5)}` > `${pad(p.month)}-${pad(p.day)}` ? year + 1 : year;
    out.push({ customer: c, days, age: c.birthYear && c.birthYear < atYear ? atYear - c.birthYear : undefined });
  }
  return out.sort((a, b) => a.days - b.days || a.customer.name.localeCompare(b.customer.name, 'vi'));
}

export const birthdayWhen = (days: number) => (days === 0 ? 'Hôm nay' : days === 1 ? 'Ngày mai' : `Còn ${days} ngày`);

/** Lần liên hệ gần nhất: lần chăm sóc mới nhất trong nhật ký, chưa có thì ngày thêm khách. */
export function lastContactAt(c: Customer): string {
  let last = c.createdAt;
  for (const i of c.interactions) if (i.at > last) last = i.at;
  return last;
}

const localDay = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

export function daysSinceContact(c: Customer, now = new Date()): number {
  const last = new Date(lastContactAt(c));
  return Number.isNaN(last.getTime()) ? 0 : Math.max(0, localDay(now) - localDay(last));
}

/** Khách đang chăm sóc mà quá số ngày này chưa liên hệ thì coi là "lâu chưa liên hệ". */
export const STALE_DAYS = 30;

/** Nhãn đang dùng, nhiều khách nhất trước. */
export function tagCounts(customers: Customer[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const c of customers) {
    for (const tag of c.tags) {
      const key = tag.toLocaleLowerCase('vi');
      const item = counts.get(key);
      if (item) item.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'vi'));
}

export const hasTag = (c: Customer, tag: string) => c.tags.some((t) => t.toLocaleLowerCase('vi') === tag.toLocaleLowerCase('vi'));
