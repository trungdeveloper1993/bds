import {
  ACTIVE_PROPERTY_STATUSES,
  DIRECTION_LABEL,
  DOC_CATEGORY,
  FURNISHING_LABEL,
  LEGAL_REFERENCE,
  LEGAL_STATUS,
  PROJECT_STAGE,
  PROPERTY_TYPE_LABEL,
  propertyStatusLabel,
} from '../constants';
import type { DocCategory, Direction, DocumentRef, LegalItemStatus, Project, Property } from '../types';
import { formatArea, formatDate, formatMoney, formatNumber, formatPrice } from './format';
import { legalProgress, resolveChecklist } from './legal';
import { formatPriceRange, formatProjectAddress } from './listing';
import { mainArea } from './match';

/*
 * "Hỏi nhanh" — tìm đúng đoạn thông tin trong hồ sơ dự án cho câu hỏi tự nhiên của khách.
 * Chạy hoàn toàn trên máy, không cần mạng.
 *
 *  1. Hồ sơ được cắt thành các đoạn: từng trường thông tin, từng dòng của khối văn bản,
 *     từng câu Q&A, hạng mục pháp lý, loại sản phẩm, căn trong giỏ hàng, tài liệu, quy định.
 *     Mỗi đoạn gắn chủ đề (giá, thanh toán, vay, pháp lý, bàn giao…) và vị trí để nhảy tới.
 *  2. Câu hỏi được chuẩn hoá: hiểu cả có dấu lẫn không dấu, viết tắt (2pn, cđt, ls, ko, đc…);
 *     khi gõ có dấu thì phân biệt được từ dễ nhầm (giá ≠ gia đình, vay ≠ vậy, sổ ≠ số).
 *  3. Điểm = khớp chủ đề + khớp từ khoá (BM25) + khớp cụm từ + khớp câu Q&A
 *     + điều kiện của khách (số phòng ngủ, tầm giá, diện tích, hướng).
 */

// ======================================================================= Kiểu dữ liệu

export type ProjectTab = 'tong-quan' | 'mat-bang' | 'phap-ly' | 'tai-lieu' | 'hinh-anh' | 'gio-hang' | 'khach' | 'noi-bo';

export type Topic =
  | 'gia'
  | 'thanh_toan'
  | 'vay'
  | 'chinh_sach'
  | 'dat_coc'
  | 'phap_ly'
  | 'so_huu'
  | 'nuoc_ngoai'
  | 'ban_giao'
  | 'noi_that'
  | 'tien_do'
  | 'vi_tri'
  | 'ket_noi'
  | 'tien_ich'
  | 'quy_mo'
  | 'san_pham'
  | 'phi'
  | 'chu_dau_tu'
  | 'gio_hang'
  | 'diem_manh'
  | 'dau_tu'
  | 'doi_thu'
  | 'rui_ro'
  | 'tai_lieu'
  | 'hinh_anh'
  | 'hop_dong'
  | 'tong_quan'
  | 'noi_bo'
  | 'lien_he';

export const TOPIC_LABEL: Record<Topic, string> = {
  gia: 'Giá',
  thanh_toan: 'Thanh toán',
  vay: 'Vay ngân hàng',
  chinh_sach: 'Ưu đãi',
  dat_coc: 'Đặt cọc',
  phap_ly: 'Pháp lý',
  so_huu: 'Sở hữu',
  nuoc_ngoai: 'Người nước ngoài',
  ban_giao: 'Bàn giao',
  noi_that: 'Tiêu chuẩn bàn giao',
  tien_do: 'Tiến độ',
  vi_tri: 'Vị trí',
  ket_noi: 'Kết nối',
  tien_ich: 'Tiện ích',
  quy_mo: 'Quy mô',
  san_pham: 'Sản phẩm',
  phi: 'Phí & thuế',
  chu_dau_tu: 'Chủ đầu tư',
  gio_hang: 'Giỏ hàng',
  diem_manh: 'Điểm nổi bật',
  dau_tu: 'Đầu tư & cho thuê',
  doi_thu: 'So sánh',
  rui_ro: 'Lưu ý',
  tai_lieu: 'Tài liệu',
  hinh_anh: 'Hình ảnh',
  hop_dong: 'Hợp đồng & thủ tục',
  tong_quan: 'Tổng quan',
  noi_bo: 'Nội bộ',
  lien_he: 'Liên hệ',
};

export type Intent = 'when' | 'who' | 'where' | 'howfar' | 'howlong' | 'howmuch' | 'how';

export type ChunkKind = 'fact' | 'line' | 'list' | 'faq' | 'legal' | 'unitType' | 'unit' | 'doc' | 'rule' | 'media';

/** Một từ đã phân tích dấu. */
export interface Word {
  /** Chữ thường, giữ dấu. */
  raw: string;
  /** Bỏ dấu. */
  fold: string;
  /** fold + dấu thanh + dấu mũ/móc — không phụ thuộc vị trí đặt dấu (hoà = hòa). */
  key: string;
  /** Người gõ có dấu thanh hoặc dấu mũ/móc (không tính chữ đ). */
  marked: boolean;
}

export interface Tok extends Word {
  /** Vị trí trong chuỗi gốc (NFC) — dùng để tô sáng. */
  start: number;
  end: number;
  num?: number;
}

/** Một đoạn thông tin trong hồ sơ dự án. */
export interface Chunk {
  id: string;
  kind: ChunkKind;
  /** Các đoạn cùng nhóm (vd các dòng của "Chính sách bán hàng") được gộp khi hiển thị. */
  group: string;
  /** Mục trong hồ sơ, vd "Thanh toán & chính sách". */
  section: string;
  /** Nhãn của đoạn, vd "Chính sách bán hàng", hoặc câu hỏi Q&A. */
  title: string;
  text: string;
  items?: string[];
  topics: Topic[];
  inferred: Set<Topic>;
  /** Ý cụ thể trong chủ đề (vd "#so_can" của Quy mô) — phân biệt các trường cùng chủ đề. */
  aspects: string[];
  /** Ý cụ thể suy ra từ nội dung (vd dòng nhắc "đường nhựa 16m" → #duong). */
  inferredAspects: Set<string>;
  /** Nội dung có mốc thời gian (quý, năm, tháng…) — trả lời được câu "khi nào". */
  timeLike: boolean;
  /** Đoạn gõ không dấu → so khớp nới lỏng dấu. */
  lenient: boolean;
  intents: Intent[];
  /** Thông tin nhạy cảm (hoa hồng, ghi chú, tài liệu nội bộ): không gợi ý gửi khách. */
  internal: boolean;
  tab: ProjectTab;
  /** id phần tử trên trang chi tiết để cuộn tới ('' = đầu tab). */
  anchor: string;
  /** Câu trả lời mẫu (với dòng văn bản: phần mở đầu). */
  reply?: string;
  link?: { href: string; label: string };
  doc?: DocumentRef;
  unit?: Property;
  legal?: { key: string; status: LegalItemStatus; note: string };
  bedrooms?: number;
  priceRange?: [number, number];
  areaRange?: [number, number];
  directions?: Direction[];
  /** Mã căn đã bỏ ký tự đặc biệt — tìm theo mã. */
  codes?: string[];
  weight: number;
  boost: number;
  order: number;
  toks: Word[];
  /** Trọng số từng từ: tiêu đề 2, nội dung 1, phần phụ 0,5. */
  tw: number[];
  titleLen: number;
  textLen: number;
  itemToks?: Word[][];
  byFold: Map<string, number[]>;
  folds: string[];
}

export interface Range {
  min?: number;
  max?: number;
}

export interface Entities {
  bedrooms?: number;
  price?: Range;
  area?: Range;
  directions?: Direction[];
}

export interface ParsedQuery {
  text: string;
  empty: boolean;
  toks: Tok[];
  terms: Word[];
  /** Từ cuối đang gõ dở (tìm theo tiền tố). */
  prefixTerm?: Word;
  bigrams: Array<[Word, Word]>;
  topics: Map<Topic, number>;
  aspects: Set<string>;
  /** Từ khoá nằm trong cụm chủ đề (đã tính ở điểm chủ đề → điểm từ khoá giảm bớt). */
  triggerTerms: Set<string>;
  intents: Intent[];
  yesNo: boolean;
  entities: Entities;
  legalKeys: string[];
  /** Đối tượng được hỏi "có … không" (vd "hồ bơi"). */
  objectTerms: Word[];
  /** Nhóm đồng nghĩa của đối tượng (vd "trường học" ~ "trường quốc tế"). */
  synonyms: Array<{ group: string; ids: string[] }>;
  /** Cụm từ để tô sáng kết quả. */
  marks: Word[][];
  squash: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
  /** Có khớp chủ đề của câu hỏi không. */
  onTopic: boolean;
  /** Có bằng chứng ngoài chủ đề (đúng chữ, đúng ý cụ thể, đúng điều kiện). */
  strong: boolean;
  /** Câu hỏi nhắc đúng tên của đoạn (vd "Shophouse" trong bảng loại sản phẩm). */
  titleHit: boolean;
  /** Khớp điều kiện của khách (số PN, tầm giá, diện tích, hướng). */
  entity: boolean;
  /** Tỷ lệ ý của câu hỏi (từ khoá, theo độ hiếm) có trong đoạn. */
  coverage: number;
}

export interface AnswerGroup {
  key: string;
  kind: ChunkKind;
  section: string;
  title: string;
  top: Chunk;
  /** Các đoạn khớp, theo thứ tự trong hồ sơ. */
  hits: Chunk[];
  /** Số đoạn khớp khác chưa hiển thị. */
  more: number;
  score: number;
  onTopic: boolean;
  /** Đoạn chính khớp điều kiện của khách (số PN, tầm giá…). */
  entity: boolean;
  /** Đoạn chính có bằng chứng ngoài chủ đề (đúng chữ / đúng ý). */
  strong: boolean;
  /** Tỷ lệ ý của câu hỏi có trong đoạn chính. */
  coverage: number;
  internal: boolean;
}

export type VerdictTone = 'yes' | 'no' | 'partial' | 'unknown';

export interface Verdict {
  tone: VerdictTone;
  label: string;
  detail: string;
  tab?: ProjectTab;
  anchor?: string;
}

export interface UnitMatch {
  unit: Property;
  chunk: Chunk;
  score: number;
}

export interface SmartResult {
  query: ParsedQuery;
  verdict?: Verdict;
  best?: AnswerGroup;
  related: AnswerGroup[];
  docs: AnswerGroup[];
  units: UnitMatch[];
  unitTotal: number;
  showUnits: boolean;
  /** Những gì đã hiểu từ câu hỏi: chủ đề, số PN, tầm giá… */
  understood: string[];
  /** Trường thông tin câu hỏi nhắm tới nhưng hồ sơ chưa nhập (vd "Phí quản lý"). */
  missing: string[];
}

// ======================================================================= Chữ & dấu

const TONE_MARKS = '̣̀́̃̉';
const SHAPE_MARKS = '̛̂̆';
const wordCache = new Map<string, Word>();

export function analyzeWord(input: string): Word {
  const raw = input.toLowerCase();
  const cached = wordCache.get(raw);
  if (cached) return cached;
  let fold = '';
  let tones = '';
  let shapes = '';
  for (const ch of raw.normalize('NFD')) {
    if (TONE_MARKS.includes(ch)) tones += ch;
    else if (SHAPE_MARKS.includes(ch)) shapes += ch;
    else if (ch === 'đ') fold += 'd';
    else if (ch < '̀' || ch > 'ͯ') fold += ch;
  }
  const sorted = (s: string) => [...s].sort().join('');
  const word: Word = { raw, fold, key: `${fold}|${sorted(tones)}|${sorted(shapes)}`, marked: tones.length + shapes.length > 0 };
  if (wordCache.size > 20000) wordCache.clear();
  wordCache.set(raw, word);
  return word;
}

export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** Từ trong câu hỏi / từ điển (w) khớp với từ t: có dấu thì phải đúng dấu, không dấu thì khớp mọi dấu. */
function wordMatches(t: Word, w: Word): boolean {
  if (t.fold !== w.fold) return false;
  return w.marked ? !t.marked || t.key === w.key : !t.marked;
}

/**
 * Từ khoá tìm kiếm (term) khớp với từ trong hồ sơ (t). lenient = đoạn hồ sơ gõ không dấu (tên file…):
 * khi đó "thú" vẫn khớp "thu". Đoạn có dấu thì "thu" (nghiệm thu) là chữ khác hẳn "thú".
 */
function lexMatch(t: Word, term: Word, lenient = false): boolean {
  if (t.fold !== term.fold) return false;
  if (!term.marked) return true;
  return t.marked ? t.key === term.key : lenient;
}

/** Văn bản gõ không dấu (hầu như không có từ nào mang dấu). */
function isUnaccented(words: Word[]): boolean {
  const letters = words.filter((w) => /[a-z]/.test(w.fold) && w.fold.length > 1);
  return letters.length > 0 && letters.filter((w) => w.marked).length / letters.length < 0.15;
}

const TOKEN_RE = /[\p{L}\p{M}]+|\d+(?:[.,]\d+)*|%/gu;

function spans(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    let word = m[0];
    let end = start + word.length;
    const prev = out[out.length - 1];
    if (/^m$/i.test(word) && text[end] === '²') {
      word = 'm2';
      end += 1;
    } else if (word === '2' && prev && prev.end === start && /^m$/i.test(prev.text)) {
      prev.text = 'm2';
      prev.end = end;
      continue;
    }
    out.push({ text: word, start, end });
  }
  return out;
}

function parseNum(s: string): number | undefined {
  if (!/^\d/.test(s)) return undefined;
  let n: number;
  if (s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));
  else n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Viết tắt hay gặp khi nhắn tin / ghi chép BĐS. */
const ABBR = new Map<string, string>([
  ['pn', 'phòng ngủ'],
  ['wc', 'vệ sinh'],
  ['toilet', 'vệ sinh'],
  ['cdt', 'chủ đầu tư'],
  ['dvpt', 'đơn vị phát triển'],
  ['hdmb', 'hợp đồng mua bán'],
  ['hdcn', 'hợp đồng chuyển nhượng'],
  ['hd', 'hợp đồng'],
  ['ls', 'lãi suất'],
  ['nh', 'ngân hàng'],
  ['ck', 'chiết khấu'],
  ['csbh', 'chính sách bán hàng'],
  ['cs', 'chính sách'],
  ['gpxd', 'giấy phép xây dựng'],
  ['pccc', 'phòng cháy chữa cháy'],
  ['tttm', 'trung tâm thương mại'],
  ['tphcm', 'thành phố hồ chí minh'],
  ['hcm', 'hồ chí minh'],
  ['tp', 'thành phố'],
  ['sg', 'sài gòn'],
  ['hn', 'hà nội'],
  ['ko', 'không'],
  ['kh', 'không'],
  ['khg', 'không'],
  ['kg', 'không'],
  ['hok', 'không'],
  ['dc', 'được'],
  ['dk', 'điều kiện'],
  ['bn', 'bao nhiêu'],
  ['bnh', 'bao nhiêu'],
  ['bnhieu', 'bao nhiêu'],
  ['ntn', 'như thế nào'],
  ['j', 'gì'],
  ['dt', 'diện tích'],
  ['dtsd', 'diện tích sử dụng'],
  ['ql', 'quản lý'],
  ['pql', 'phí quản lý'],
  ['bg', 'bàn giao'],
  ['nt', 'nội thất'],
  ['ntcb', 'nội thất cơ bản'],
  ['sh', 'sổ hồng'],
  ['shr', 'sổ hồng riêng'],
  ['sd', 'sổ đỏ'],
  ['lk', 'liền kề'],
  ['bt', 'biệt thự'],
  ['kdt', 'khu đô thị'],
  ['kcn', 'khu công nghiệp'],
  ['kdc', 'khu dân cư'],
  ['bv', 'bệnh viện'],
  ['cv', 'công viên'],
  ['mt', 'mặt tiền'],
  ['nn', 'nước ngoài'],
  ['vk', 'việt kiều'],
  ['tg', 'thời gian'],
  ['hs', 'hồ sơ'],
  ['ptt', 'phương thức thanh toán'],
  ['pttt', 'phương thức thanh toán'],
  ['sdt', 'số điện thoại'],
  ['bds', 'bất động sản'],
  ['cc', 'chung cư'],
  ['ccmn', 'chung cư mini'],
  ['qd', 'quyết định'],
  ['qsdd', 'quyền sử dụng đất'],
  ['mn', 'mọi người'],
  ['ae', 'anh em'],
]);

const TAIL_FILLER_FOLDS = new Set(['em', 'a', 'ah', 'ak', 'anh', 'chi', 'ban', 'nhe', 'nha', 'nhi', 'ha', 'vay', 'z', 'v', 'oi', 'ta', 'ne', 'day', 'hen', 'nghe', 'do']);

function isTail(toks: Tok[], i: number): boolean {
  for (let j = i + 1; j < toks.length; j++) if (!TAIL_FILLER_FOLDS.has(toks[j].fold)) return false;
  return true;
}

function expandAbbr(toks: Tok[], i: number): string | undefined {
  const f = toks[i].fold;
  const afterNumber = toks[i - 1]?.num !== undefined;
  const beforeNumber = toks[i + 1]?.num !== undefined;
  switch (f) {
    case 'k':
      return afterNumber ? 'nghìn' : 'không';
    case 't':
    case 'ti':
    case 'toi':
      return afterNumber ? 'tỷ' : undefined;
    case 'ty':
      return 'tỷ';
    case 'tr':
    case 'cu':
      return afterNumber ? 'triệu' : undefined;
    case 'q':
      return beforeNumber ? 'quận' : undefined;
    case 'p':
      return beforeNumber ? 'phường' : undefined;
    case 'v':
    case 'z':
      return beforeNumber ? undefined : 'vậy';
    case 'vs':
      return afterNumber ? 'vệ sinh' : 'với';
    case 'tt': {
      const prev = toks[i - 1]?.fold ?? '';
      return ['cach', 'gan', 've', 'toi', 'den', 'ra', 'vao', 'khu', 'tu'].includes(prev) ? 'trung tâm' : 'thanh toán';
    }
    case 'ch':
      return isTail(toks, i) ? 'chưa' : 'căn hộ';
  }
  return ABBR.get(f);
}

/** Tách từ (giữ vị trí gốc) và mở rộng viết tắt: "2PN" → 2 · phòng · ngủ. */
export function tokenize(text: string): Tok[] {
  const base: Tok[] = spans(text).map((s) => ({ ...analyzeWord(s.text), start: s.start, end: s.end, num: parseNum(s.text) }));
  const out: Tok[] = [];
  base.forEach((t, i) => {
    const exp = t.marked || t.num !== undefined ? undefined : expandAbbr(base, i);
    if (!exp) {
      out.push(t);
      return;
    }
    for (const w of exp.split(' ')) out.push({ ...analyzeWord(w), start: t.start, end: t.end });
  });
  return out;
}

const plainWord = (t: Word): Word => ({ raw: t.raw, fold: t.fold, key: t.key, marked: t.marked });

interface WordSet {
  keys: Set<string>;
  folds: Set<string>;
}

function wordSet(spec: string): WordSet {
  const keys = new Set<string>();
  const folds = new Set<string>();
  for (const w of spec.split(/\s+/).filter(Boolean)) {
    const a = analyzeWord(w);
    keys.add(a.key);
    folds.add(a.fold);
  }
  return { keys, folds };
}

const inSet = (set: WordSet, w: Word) => (w.marked ? set.keys.has(w.key) : set.folds.has(w.fold));

const STOP = wordSet(
  'có không chưa là gì nào thế như sao bao nhiêu mấy khi giờ lúc ở đâu ai của cho với và hay hoặc thì mà này đó kia ấy ' +
    'em anh chị bạn mình tôi tớ ạ à ả nhé nha nhỉ hả ha vậy ơi đi được cần muốn biết hỏi xin giúp nhờ rồi đã đang sẽ thể làm ' +
    'về các những một rất lắm quá nữa thêm hết tất cả mọi từng trong ngoài trên dưới từ đến tới ra vào lên xuống bên phải nên ' +
    'còn cũng vẫn đều chỉ luôn nhất hơn thôi ok oke vâng dạ ừ chứ đúng dự án cái con người ta họ đây kìa theo do bởi vì nếu ' +
    'nhưng thật thực tế ít mỗi qua lại bị hãy xem nghe nói thấy tìm hiểu tư vấn thông tin hông hem nhiêu khoảng tầm cỡ chừng ' +
    'nghìn ngàn z v',
);

/** Từ chung chung, không phải "đối tượng" của câu hỏi có/không. */
const GENERIC = wordSet('khu gần xung quanh nội ngoại tiện ích bên cạnh căn hộ nhà đây chỗ loại sẵn dự án cái mua bán');

const NEGATIONS = wordSet('không chưa chứ hông hem');
const QUESTION_TAILS = wordSet('hả à ha nhỉ chứ hông');
const TAIL_FILLERS = wordSet('ạ à ả nhé nha nhỉ hả ha vậy ơi em anh chị bạn ta đây nè đó a ah ak hen nghe z v');

// ======================================================================= Từ điển chủ đề

interface Trigger {
  words: Word[];
  tags: string[];
  weight: number;
  markedOnly: boolean;
  check?: (toks: Word[], i: number) => boolean;
}

interface Lexicon {
  table: Map<string, Trigger[]>;
  all: Trigger[];
}

/** Mỗi mục: [chủ đề (phân tách bằng dấu phẩy, '-' = cụm chặn), @trọng số tuỳ chọn] + các cụm từ cách nhau bởi '|'. '!' = chỉ khớp khi gõ có dấu. */
function compileLexicon(entries: Array<[string, string]>): Lexicon {
  const table = new Map<string, Trigger[]>();
  const all: Trigger[] = [];
  for (const [head, phrases] of entries) {
    const [tagPart, weightPart] = head.split('@');
    const tags = tagPart === '-' ? [] : tagPart.split(',');
    const weight = weightPart ? Number(weightPart) : 1;
    for (const item of phrases.split('|')) {
      const phrase = item.trim();
      if (!phrase) continue;
      const markedOnly = phrase.startsWith('!');
      const words = tokenize(markedOnly ? phrase.slice(1) : phrase).map(plainWord);
      if (!words.length) continue;
      const trigger: Trigger = { words, tags, weight, markedOnly };
      all.push(trigger);
      const list = table.get(words[0].fold);
      if (list) list.push(trigger);
      else table.set(words[0].fold, [trigger]);
    }
  }
  // Cùng độ dài thì mục khai báo trước được ưu tiên (sort ổn định).
  for (const list of table.values()) list.sort((a, b) => b.words.length - a.words.length);
  return { table, all };
}

const TOPIC_LEXICON = compileLexicon([
  // Cụm dễ nhầm khi gõ không dấu — khớp trước để không hiểu sai.
  [
    '-',
    'gia đình|tham gia|gia hạn|gia lai|gia lâm|quốc gia|chuyên gia|gia cố|gia dụng|gia sư|gia vị|giá trị|hồ chí minh|câu hỏi|hình thức|cách thức|bằng cách|cách nào|cách làm|cách tính|như vậy|vì vậy|vậy thì|cơ sở|hướng dẫn|hỏi thăm',
  ],
  [
    'gia,#gia_ban',
    'giá|giá bán|giá gốc|giá niêm yết|giá bao nhiêu|giá cả|bao nhiêu tiền|nhiêu tiền|mấy tỷ|bao nhiêu tỷ|mấy tỉ|bao nhiêu tỉ|tổng giá|tiền một căn|mức giá|khoảng giá|tầm giá|giá từ',
  ],
  ['gia,#don_gia', 'đơn giá|giá mỗi mét|triệu một mét|bao nhiêu một mét|giá m2|giá trên m2|giá mét vuông'],
  ['gia', '!đắt|!rẻ|thương lượng|ngân sách|tài chính'],
  ['gia,tai_lieu', 'bảng giá|bảng tính giá|bảng tính dòng tiền'],
  ['gia,gio_hang', 'căn rẻ nhất|căn thấp nhất|giá thấp nhất|giá rẻ nhất|giá cao nhất|căn đắt nhất'],
  [
    'thanh_toan',
    'thanh toán|tiến độ thanh toán|phương thức thanh toán|lịch thanh toán|hình thức thanh toán|cách thanh toán|trả góp|góp|trả trước|trả chậm|trả dần|trả theo tiến độ|trả hết|trả thẳng|trả một lần|đóng tiền|đóng bao nhiêu|chia đợt|mấy đợt|bao nhiêu đợt|đợt thanh toán|đợt đầu|thanh toán sớm|thanh toán nhanh|dòng tiền|vốn tự có|vốn ban đầu|bao nhiêu vốn|cần bao nhiêu tiền|tiền mặt|chuyển khoản|giãn thanh toán',
  ],
  [
    'vay',
    'vay|cho vay|vay ngân hàng|ngân hàng|lãi suất|!lãi|hỗ trợ lãi suất|hỗ trợ vay|ân hạn|ân hạn gốc|ân hạn nợ gốc|tỷ lệ vay|tỉ lệ vay|vay tối đa|giải ngân|bank|khoản vay|gói vay|thời hạn vay|cách vay|vay bao lâu|vay mấy năm|vay bao nhiêu|vay được|thu nhập|chứng minh thu nhập|trả nợ|nợ gốc',
  ],
  ['phap_ly,vay', 'bảo lãnh|thư bảo lãnh|ngân hàng bảo lãnh|bảo lãnh ngân hàng'],
  [
    'chinh_sach',
    'chính sách|chính sách bán hàng|ưu đãi|chiết khấu|khuyến mãi|khuyến mại|quà tặng|!tặng|tặng vàng|giảm giá|giảm|voucher|miễn phí|hỗ trợ|quà|bốc thăm|tri ân|chính sách mới|được gì|mua sỉ|mua nhiều căn',
  ],
  ['dat_coc', 'đặt cọc|cọc|tiền cọc|giữ chỗ|đặt chỗ|booking|book|hoàn cọc|mất cọc|lock căn|ráp căn|ký quỹ|tiền thiện chí|phiếu giữ chỗ|giữ căn'],
  [
    'phap_ly',
    'pháp lý|giấy tờ|giấy phép|hồ sơ pháp lý|!sổ|sổ hồng|sổ đỏ|sổ riêng|sổ tổng|ra sổ|làm sổ|cấp sổ|có sổ|có sổ chưa|có sổ không|có sổ hồng|bao giờ có sổ|khi nào có sổ|giấy chứng nhận|gcn|quyền sử dụng đất|quy hoạch|1 500|chủ trương|chủ trương đầu tư|chấp thuận đầu tư|giao đất|thuê đất|tiền sử dụng đất|giấy phép xây dựng|nghiệm thu|đủ điều kiện|được bán|được phép bán|tranh chấp|thế chấp|giải chấp|kê biên|công khai|an toàn|minh bạch|pháp lý sạch|hình thành trong tương lai|phòng cháy chữa cháy|đánh giá tác động môi trường|quyết định|văn bản',
  ],
  ['phap_ly,tien_do,#khoi_cong', 'khởi công|động thổ'],
  ['phap_ly,tien_do', 'móng|nghiệm thu móng'],
  ['hop_dong,phap_ly', 'thủ tục|công chứng|sang tên|ủy quyền'],
  [
    'so_huu,phap_ly',
    'sở hữu|hình thức sở hữu|lâu dài|vĩnh viễn|50 năm|70 năm|thời hạn sở hữu|sở hữu bao lâu|hết hạn sở hữu|sau 50 năm|sổ hồng lâu dài|sở hữu lâu dài',
  ],
  ['so_huu@0.5', 'thời hạn'],
  ['nuoc_ngoai', 'người nước ngoài|nước ngoài|việt kiều|ngoại quốc|quốc tịch|foreigner|kiều bào|room ngoại|room nước ngoài'],
  [
    'ban_giao,#thoi_gian_bg',
    'bàn giao|nhận nhà|giao nhà|nhận bàn giao|ngày bàn giao|thời gian bàn giao|khi nào xong|bao giờ xong|bao giờ hoàn thành|khi nào hoàn thành|hoàn thành|khi nào ở|vào ở|dọn vào|ở được|chậm bàn giao|trễ bàn giao|lấy nhà|nhận căn|nhận nền|giao nền|nhận đất|bàn giao nền|bàn giao đất|nhận lô',
  ],
  [
    'noi_that,ban_giao,#tieu_chuan',
    'tiêu chuẩn bàn giao|bàn giao gì|bàn giao những gì|bàn giao như thế nào|bàn giao thế nào|bàn giao thô|bàn giao hoàn thiện|bàn giao nội thất',
  ],
  [
    'noi_that,#tieu_chuan',
    'nội thất|hoàn thiện|hoàn thiện cơ bản|!thô|full nội thất|nội thất liền tường|thiết bị|vật liệu|thương hiệu|bếp|tủ bếp|máy lạnh|điều hòa|sàn gỗ|gạch|thiết bị vệ sinh|rèm|khóa cửa|khóa thông minh|smarthome|nhà thông minh|máy nước nóng|bồn tắm|lavabo',
  ],
  [
    'tien_do,#tien_do_xd',
    'tiến độ|tiến độ xây dựng|tiến độ dự án|xây đến đâu|xây tới đâu|xây dựng tới đâu|xây dựng đến đâu|đang xây|xây dựng|cất nóc|thi công|xây xong chưa|xây xong|công trường|đã xây|lên tầng|lên tầng mấy|tầng mấy rồi|xây tới tầng mấy|xây đến tầng mấy|đổ móng|xong móng|hiện trạng|chậm tiến độ|đúng tiến độ|tới đâu rồi|đến đâu rồi',
  ],
  ['tien_do,#tien_do_xd@0.7', 'xây|xây tới|xây đến|xây được'],
  ['tien_do,#giai_doan', 'giai đoạn|tình trạng dự án|mở bán chưa|đã mở bán|sắp mở bán|mở bán|khi nào mở bán'],
  ['tong_quan,#ten_phap_ly', 'tên pháp lý|tên gọi khác|tên khác|tên cũ'],
  ['tai_lieu,#website', 'website|web|trang web|trang chủ|link dự án'],
  ['ket_noi,#duong', 'đường rộng|đường rộng bao nhiêu|lộ giới|mặt đường rộng|đường bao nhiêu mét|đường mấy mét|đường nội bộ|đường nhựa'],
  ['vi_tri,#dia_chi', 'khu nào|ở khu nào|thuộc khu nào|khu vực nào'],
  ['tien_ich,ket_noi,#ngoai_khu', 'xung quanh|xung quanh có gì|gần đó có gì|quanh dự án|lân cận|gần đây có gì|ngoại khu|tiện ích ngoại khu|tiện ích xung quanh'],
  ['tien_ich,#noi_khu', 'nội khu|tiện ích nội khu|trong dự án|trong khu'],
  [
    'vi_tri,#dia_chi',
    'vị trí|ở đâu|địa chỉ|nằm ở|nằm ở đâu|chỗ nào|khu vực|nằm đâu|đường nào|phường nào|quận nào|thuộc phường|thuộc quận|bản đồ|google map|map|chỉ đường|định vị|tọa lạc|mặt đường|mặt tiền đường',
  ],
  [
    'ket_noi',
    'kết nối|bao xa|!cách|cách bao xa|cách trung tâm|mấy phút|bao nhiêu phút|mấy km|bao nhiêu km|km|phút|di chuyển|đi lại|trung tâm|sân bay|metro|cao tốc|bến xe|ga metro|nhà ga|quốc lộ|vành đai|đường lớn|!cầu|giao thông|đi làm|ra trung tâm|về trung tâm|vào trung tâm|hạ tầng|cơ sở hạ tầng|đường sắt|xe buýt|bus|phà|cảng',
  ],
  [
    'tien_ich',
    'tiện ích|tiện nghi|hồ bơi|bể bơi|!bơi|gym|phòng gym|thể thao|công viên|cây xanh|không gian xanh|không gian|trường học|!trường|trường mầm non|mầm non|nhà trẻ|trường quốc tế|trường liên cấp|liên cấp|đại học|bệnh viện|phòng khám|y tế|siêu thị|trung tâm thương mại|!chợ|sân chơi|khu vui chơi|vui chơi|bbq|nướng|clubhouse|club house|tennis|pickleball|sân bóng|bóng đá|bóng rổ|cầu lông|yoga|spa|sauna|xông hơi|thư viện|nhà văn hóa|đường dạo|chạy bộ|dạo bộ|hồ điều hòa|hồ cảnh quan|cảnh quan|vườn|vườn treo|!hồ|!sông|!biển|bãi biển|kênh|an ninh|bảo vệ|camera|thang máy|hầm xe|chỗ đậu xe|bãi đậu xe|cafe|cà phê|nhà hàng|khách sạn|coworking|sky bar|rooftop|sân thượng|golf|sân golf',
  ],
  ['tien_ich,san_pham', 'view|view sông|view hồ|view biển|view công viên|view thành phố|tầm nhìn'],
  [
    'quy_mo,#so_can',
    'bao nhiêu căn|mấy căn|tổng số căn|số căn|số lượng căn|bao nhiêu sản phẩm|tổng số sản phẩm|số lượng|dân số|bao nhiêu hộ',
  ],
  [
    'quy_mo,#so_toa',
    'bao nhiêu tòa|mấy tòa|số tòa|bao nhiêu block|mấy block|block|tòa|bao nhiêu tầng|mấy tầng|số tầng|cao bao nhiêu tầng|tầng hầm|mấy hầm|bao nhiêu thang máy|mấy thang máy',
  ],
  ['quy_mo,#dien_tich_da', 'diện tích dự án|tổng diện tích|bao nhiêu ha|mấy ha|hecta|héc ta'],
  ['quy_mo,#mat_do', 'mật độ|mật độ xây dựng'],
  ['quy_mo', 'quy mô|phân khu'],
  [
    'san_pham,#dien_tich_can',
    'diện tích|diện tích căn|m2|mét vuông|thông thủy|tim tường|rộng bao nhiêu|bao nhiêu mét|căn nhỏ nhất|căn lớn nhất',
  ],
  ['san_pham,#loai_hinh', 'loại hình|loại sản phẩm|loại căn|sản phẩm gì|những loại|các loại'],
  ['san_pham,tai_lieu', 'layout|mặt bằng|mặt bằng căn|mặt bằng tầng|mặt bằng tổng thể|sơ đồ mặt bằng|sơ đồ tầng|sơ đồ phân lô|phân lô'],
  [
    'san_pham',
    'sản phẩm|căn hộ|phòng ngủ|vệ sinh|thiết kế|thiết kế căn|hướng|hướng nhà|hướng ban công|hướng cửa|ban công|lô gia|logia|studio|duplex|penthouse|sky villa|shophouse|shop|biệt thự|liền kề|nhà phố|đất nền|lô đất|!nền|!lô|căn góc|officetel|condotel|nhà ở xã hội|tầng cao|tầng thấp|tầng đẹp|căn đẹp|sân vườn|gác lửng|thông tầng|trần cao',
  ],
  ['phi,#phi_ql', 'phí quản lý|phí dịch vụ'],
  ['phi,#phi_xe', 'phí gửi xe|gửi xe|đậu xe|đỗ xe|giữ xe|phí xe|chỗ để xe'],
  [
    'phi,#bao_tri_thue',
    'phí bảo trì|bảo trì|kinh phí bảo trì|quỹ bảo trì|2%|!thuế|thuế vat|vat|gtgt|lệ phí|trước bạ|lệ phí trước bạ|ngoài giá|giá đã gồm|giá chưa gồm|giá bao gồm|đã gồm vat|chưa gồm vat',
  ],
  [
    'phi',
    'phí|chi phí|chi phí khác|phát sinh|chi phí phát sinh|phí sang tên|phí công chứng|phí làm sổ|tiền điện|tiền nước|điện nước|thuế thu nhập|thuế tncn|phí chuyển nhượng',
  ],
  ['chu_dau_tu,#cdt', 'chủ đầu tư|ai làm|của ai|ai xây|tập đoàn|công ty|uy tín|năng lực|hồ sơ năng lực|dự án đã làm|nhà đầu tư'],
  ['chu_dau_tu,#phat_trien', 'đơn vị phát triển|nhà phát triển|ai phát triển|liên doanh|đối tác'],
  ['chu_dau_tu,#tong_thau', 'tổng thầu|nhà thầu|đơn vị thi công|thi công bởi|ai thi công'],
  ['chu_dau_tu,#thiet_ke', 'ai thiết kế|đơn vị thiết kế|kiến trúc sư|thiết kế bởi'],
  ['chu_dau_tu,#van_hanh', 'quản lý vận hành|vận hành|đơn vị vận hành|ai quản lý|đơn vị quản lý'],
  ['chu_dau_tu,#phan_phoi', 'phân phối|đơn vị phân phối|đại lý|f1'],
  [
    'gio_hang',
    'giỏ hàng|còn căn|còn căn nào|còn hàng|còn không|còn bao nhiêu căn|còn mấy căn|căn nào|quỹ căn|căn trống|căn còn lại|hết hàng|bán hết|bán được bao nhiêu|đã bán|tỷ lệ hấp thụ|bán lại|căn bán lại|sang nhượng|ký gửi|căn đang bán|có căn|mã căn|bảng hàng|chọn căn|căn nào đẹp',
  ],
  ['gio_hang,dau_tu', 'thứ cấp|giá thứ cấp|chuyển nhượng|giá chuyển nhượng|căn chuyển nhượng'],
  [
    'diem_manh',
    'điểm mạnh|ưu điểm|nổi bật|điểm nổi bật|có gì hay|có gì đặc biệt|đặc biệt|khác biệt|lợi thế|tại sao nên mua|vì sao nên mua|nên mua không|có nên mua|nên mua|lý do|hấp dẫn|điểm cộng|có tốt không|tốt không|ổn không|có ổn không|đáng mua|đáng tiền|thuyết phục',
  ],
  [
    'dau_tu',
    'đầu tư|tiềm năng|tăng giá|!tăng|gia tăng|sinh lời|lợi nhuận|tỷ suất|tỉ suất|lãi bao nhiêu|lời bao nhiêu|có lời|cho thuê|giá thuê|thuê lại|!thuê|khai thác|thanh khoản|lướt sóng|lướt|thị trường|giá thị trường|chênh lệch|ăn chênh|tích sản|giữ tài sản|cam kết thuê|cam kết lợi nhuận|tiềm năng tăng giá|dòng tiền cho thuê|cho thuê được bao nhiêu',
  ],
  ['doi_thu', 'so sánh|đối thủ|cạnh tranh|khác gì|hơn gì|so với|dự án khác|dự án bên cạnh|dự án lân cận|dự án gần đây|nên chọn|chọn dự án nào|hay hơn|tốt hơn|rẻ hơn|đắt hơn'],
  ['rui_ro', 'quy hoạch treo|dự án treo|bị treo|đắp chiếu|bỏ hoang'],
  [
    'rui_ro',
    'rủi ro|nhược điểm|điểm yếu|điểm trừ|khuyết điểm|hạn chế|lưu ý|cẩn thận|vấn đề|ngập|ngập nước|triều cường|ô nhiễm|tiếng ồn|!ồn|bụi|kẹt xe|ùn tắc|tai tiếng|lừa đảo|có sao không|nghĩa trang|cao thế|đường điện cao thế|bãi rác|xấu',
  ],
  ['tai_lieu', 'tài liệu|brochure|catalogue|catalog|file|pdf|bộ tài liệu|sales kit|slide|ebook|tờ rơi|leaflet|xin file|hợp đồng mẫu|mẫu hợp đồng'],
  ['tai_lieu@0.5', 'gửi|gửi em|gửi anh|gửi chị|gửi khách|gửi giúp|thông tin chi tiết'],
  ['hinh_anh', 'hình ảnh|!ảnh|ảnh thực tế|hình thực tế|hình|phối cảnh|video|clip|flycam|tour 360|360|nhà mẫu|căn mẫu|ảnh nhà mẫu|ảnh tiến độ|hình tiến độ'],
  [
    'hop_dong',
    'hợp đồng|hợp đồng mua bán|ký hợp đồng|khi nào ký|thỏa thuận|điều khoản|phạt|bồi thường|thủ tục mua|quy trình mua|các bước mua|mua như thế nào|quy trình|hồ sơ mua|giấy tờ cần|cần giấy tờ gì',
  ],
  ['tong_quan', 'tổng quan|giới thiệu|thông tin dự án|tổng thể|review|đánh giá|dự án thế nào|dự án ra sao|dự án có tốt không|là dự án gì'],
  ['noi_bo', 'hoa hồng|commission|phí môi giới|!thưởng|thưởng nóng|hỗ trợ sale|chính sách sale|chính sách đại lý|ghi chú|nội bộ|kpi|doanh số|hh'],
  [
    'lien_he',
    'liên hệ|số điện thoại|điện thoại|zalo|admin|đầu mối|hotline|gọi ai|hỏi ai|email|người phụ trách|phụ trách|trưởng phòng|văn phòng|nhà mẫu ở đâu|địa chỉ nhà mẫu',
  ],
]);

const LOAN_PREV = new Set(['cho', 'duoc', 'muon', 'can', 'khoan', 'goi', 'tro', 'the', 'de', 'nen', 'phai', 'dang', 'se', 'co', 'tien', 'suat', 'hang', 'ty', 'le', 'kien', 'han', 'dot', 'lai', 'khi']);
const LOAN_NEXT_FILLER = new Set([...TAIL_FILLER_FOLDS, 'thi', 'la', 'sao', 'ma', 'troi']);

/** Gõ không dấu "vay" ở cuối câu thường là "vậy" ("bao nhiêu vay?"). */
function vayIsLoan(toks: Word[], i: number): boolean {
  const prev = toks[i - 1]?.fold;
  const next = toks[i + 1]?.fold;
  if (prev === 'nhu' || prev === 'vi') return false;
  if (i === 0) return true;
  if (prev && LOAN_PREV.has(prev)) return true;
  return !!next && !LOAN_NEXT_FILLER.has(next);
}

for (const t of TOPIC_LEXICON.all) if (t.words.length === 1 && t.words[0].fold === 'vay') t.check = vayIsLoan;

const INTENT_ORDER: Intent[] = ['when', 'who', 'where', 'howfar', 'howlong', 'howmuch', 'how'];

const INTENT_LEXICON = compileLexicon([
  [
    'when',
    'khi nào|bao giờ|lúc nào|chừng nào|hồi nào|năm nào|tháng nào|quý nào|quý mấy|ngày nào|thời gian nào|thời điểm nào|đến khi nào|tới khi nào|bao lâu nữa|mấy tháng nữa|mấy năm nữa|dự kiến|thời gian',
  ],
  ['who', 'ai|là ai|của ai|công ty nào|đơn vị nào|hãng nào|bên nào|tập đoàn nào|thương hiệu nào'],
  ['where', 'ở đâu|chỗ nào|nơi nào|đường nào|khu nào|phường nào|quận nào|nằm đâu|ở chỗ nào|vị trí|địa chỉ'],
  ['howfar', 'bao xa|mấy km|bao nhiêu km|mấy phút|bao nhiêu phút|cách bao xa|đi bao lâu|mất bao lâu|xa không|gần không|có xa không|có gần không'],
  ['howlong', 'bao lâu|bao nhiêu năm|mấy năm|thời hạn|lâu dài|vĩnh viễn'],
  ['howmuch', 'bao nhiêu|!mấy|nhiêu|bao nhiêu tiền|mức|tỷ lệ|tỉ lệ|%|phần trăm|tối đa|tối thiểu'],
  ['how', 'thế nào|như nào|ra sao|như thế nào|làm sao|quy trình|thủ tục|những gì|gồm gì|gồm những gì|có gì|gì'],
]);

/** Từ khoá → hạng mục trong checklist pháp lý (xem LEGAL_CHECKLIST). */
const LEGAL_LEXICON = compileLexicon([
  ['-', 'quy hoạch treo|dự án treo'],
  ['gpxd', 'giấy phép xây dựng|giấy phép'],
  ['du_dieu_kien', 'đủ điều kiện|đủ điều kiện bán|đủ điều kiện kinh doanh|được bán|được phép bán|được phép kinh doanh|giấy phép bán hàng|huy động vốn|đủ điều kiện mở bán'],
  ['quy_hoach', 'quy hoạch|1 500|tổng mặt bằng|quy hoạch chi tiết'],
  ['chu_truong', 'chủ trương|chủ trương đầu tư|chấp thuận đầu tư|chấp thuận chủ trương'],
  ['giao_dat', 'giao đất|thuê đất|tiền sử dụng đất|nghĩa vụ tài chính|quyết định giao đất'],
  ['gcn', '!sổ|sổ hồng|sổ đỏ|sổ tổng|giấy chứng nhận|gcn|quyền sử dụng đất|có sổ|ra sổ|sổ riêng'],
  ['khoi_cong', 'khởi công|động thổ|thông báo khởi công'],
  ['moi_truong_pccc', 'phòng cháy chữa cháy|phòng cháy|môi trường|đánh giá tác động môi trường|đtm'],
  ['nghiem_thu', 'nghiệm thu|móng|nghiệm thu móng|hạ tầng kỹ thuật'],
  ['bao_lanh', 'bảo lãnh|thư bảo lãnh|bảo lãnh ngân hàng'],
  ['giai_chap', 'thế chấp|giải chấp|tranh chấp|kê biên|cầm cố'],
  ['cong_khai', 'công khai|cổng thông tin|công khai thông tin'],
]);

interface Match {
  at: number;
  len: number;
  trigger: Trigger;
  partial: boolean;
}

function matchAt(toks: Word[], i: number, t: Trigger, skip?: boolean[]): boolean {
  const n = t.words.length;
  if (i + n > toks.length) return false;
  for (let j = 0; j < n; j++) {
    if (skip?.[i + j] || !wordMatches(toks[i + j], t.words[j])) return false;
  }
  if (t.markedOnly && n === 1 && !toks[i].marked) return false;
  return !t.check || t.check(toks, i);
}

/** Đang gõ dở từ cuối: "bàn gi" → "bàn giao", "thanh" → "thanh toán". */
function partialAt(toks: Word[], i: number, lex: Lexicon, skip?: boolean[]): Match | null {
  const n = toks.length;
  const last = toks[n - 1];
  const len = n - i;
  if (skip?.[n - 1] || last.fold.length < (len === 1 ? 3 : 2)) return null;
  // Một từ đứng riêng đã trọn nghĩa ("không", "vậy") thì không đoán là đang gõ dở.
  if (len === 1 && (inSet(STOP, last) || inSet(TAIL_FILLERS, last))) return null;
  const candidates = len === 1 ? lex.all : (lex.table.get(toks[i].fold) ?? []);
  let best: Trigger | null = null;
  for (const t of candidates) {
    if (t.words.length < len || !t.tags.length) continue;
    let ok = true;
    for (let j = 0; j < len - 1 && ok; j++) ok = !skip?.[i + j] && wordMatches(toks[i + j], t.words[j]);
    const w = t.words[len - 1];
    // Chỉ đoán khi từ cuối còn dở ("gi" → "giao"); từ đã gõ trọn thì không đoán từ tiếp theo.
    if (!ok || w.fold.length <= last.fold.length || !w.fold.startsWith(last.fold)) continue;
    if (!best || t.words.length < best.words.length) best = t;
  }
  return best ? { at: i, len, trigger: best, partial: true } : null;
}

function scan(toks: Word[], lex: Lexicon, options: { prefixLast?: boolean; skip?: boolean[] } = {}): Match[] {
  const { prefixLast, skip } = options;
  const found: Match[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (skip?.[i]) continue;
    let m: Match | null = null;
    for (const t of lex.table.get(toks[i].fold) ?? []) {
      if (matchAt(toks, i, t, skip)) {
        m = { at: i, len: t.words.length, trigger: t, partial: false };
        break;
      }
    }
    if (prefixLast && (!m || m.at + m.len < toks.length)) {
      const p = partialAt(toks, i, lex, skip);
      if (p && (!m || p.len > m.len)) m = p;
    }
    if (m) found.push(m);
  }
  // Bỏ khớp nằm gọn trong khớp dài hơn (vd "giá" trong "giá thuê", "gia" trong "gia đình").
  return found.filter((m) => !found.some((o) => o !== m && o.len > m.len && o.at <= m.at && o.at + o.len >= m.at + m.len));
}

const isAspect = (tag: string) => tag.startsWith('#');

function topicsIn(toks: Word[]): Set<Topic> {
  const out = new Set<Topic>();
  for (const m of scan(toks, TOPIC_LEXICON)) for (const t of m.trigger.tags) if (!isAspect(t)) out.add(t as Topic);
  return out;
}

function aspectsIn(toks: Word[]): Set<string> {
  const out = new Set<string>();
  for (const m of scan(toks, TOPIC_LEXICON)) for (const t of m.trigger.tags) if (isAspect(t)) out.add(t);
  return out;
}

const TIME_RE = /\b(quy|thang|nam|ngay|tuan)\b|\b(19|20)\d\d\b|\bq[1-4]\b/;

function intentsIn(toks: Word[]): Intent[] {
  const found = scan(toks, INTENT_LEXICON);
  return INTENT_ORDER.filter((i) => found.some((m) => m.trigger.tags.includes(i)));
}

/** Nhóm đồng nghĩa khi hỏi "có … không": hỏi "trường học" thì "Trường quốc tế ABC" cũng là có. */
const SYNONYM_LEXICON = compileLexicon([
  ['school', 'trường học|trường|trường mầm non|mầm non|nhà trẻ|trường quốc tế|trường liên cấp|liên cấp|tiểu học|trung học|đại học|school'],
  ['pool', 'hồ bơi|bể bơi|pool|hồ bơi tràn bờ'],
  ['gym', 'gym|phòng gym|phòng tập|fitness|thể hình'],
  ['mall', 'siêu thị|trung tâm thương mại|mall|cửa hàng tiện lợi'],
  ['market', 'chợ'],
  ['hospital', 'bệnh viện|phòng khám|y tế|trạm y tế'],
  ['park', 'công viên|cây xanh|không gian xanh|mảng xanh'],
  ['kids', 'sân chơi|khu vui chơi|vui chơi|sân chơi trẻ em|khu trẻ em'],
  ['bbq', 'bbq|nướng|khu nướng'],
  ['parking', 'hầm xe|hầm để xe|bãi đậu xe|chỗ đậu xe|đậu xe|đỗ xe|gửi xe|bãi xe|chỗ để xe'],
  ['security', 'an ninh|bảo vệ|camera'],
  ['river', 'sông|ven sông|view sông|bờ sông'],
  ['aircon', 'máy lạnh|điều hòa'],
  ['metro', 'metro|tàu điện|ga metro'],
  ['loan', 'vay|cho vay|hỗ trợ vay|vay ngân hàng|hỗ trợ lãi suất|lãi suất'],
  ['discount', 'chiết khấu|giảm giá|ưu đãi|khuyến mãi'],
  ['installment', 'trả góp|góp|trả chậm|giãn thanh toán|chia đợt'],
  ['early', 'thanh toán sớm|thanh toán nhanh|trả sớm|trả nhanh|thanh toán trước hạn|trả trước hạn'],
]);

export const termId = (w: Word) => (w.marked ? w.key : `~${w.fold}`);

// ======================================================================= Điều kiện: số PN, giá, diện tích, hướng

const NUM_WORDS = new Map([
  ['mot', 1],
  ['hai', 2],
  ['ba', 3],
  ['bon', 4],
  ['tu', 4],
  ['nam', 5],
  ['sau', 6],
]);

const MONEY_UNIT = new Map([
  ['ty', 1e9],
  ['ti', 1e9],
  ['trieu', 1e6],
]);

const QUALIFIER_LEXICON = compileLexicon([
  ['max', 'dưới|tối đa|không quá|nhỏ hơn|ít hơn|max|trong vòng|tài chính|ngân sách|budget|có|chỉ có|đổ lại|trở xuống|trở lại'],
  ['min', 'trên|hơn|từ|ít nhất|tối thiểu|lớn hơn|cao hơn|trở lên'],
  ['about', 'tầm|khoảng|cỡ|chừng|quanh|xấp xỉ|giá|tầm tầm'],
]);

const DIRECTION_LEXICON = compileLexicon([
  ['dong_nam', 'đông nam'],
  ['dong_bac', 'đông bắc'],
  ['tay_nam', 'tây nam'],
  ['tay_bac', 'tây bắc'],
  ['dong', 'đông'],
  ['tay', 'tây'],
  ['nam', 'nam'],
  ['bac', 'bắc'],
]);

function moneyAt(toks: Tok[], i: number): { value: number; end: number } | null {
  const v = toks[i]?.num;
  if (v === undefined) return null;
  const unit = MONEY_UNIT.get(toks[i + 1]?.fold ?? '');
  if (!unit) return null;
  const after = toks[i + 2];
  // "60 triệu/m²" là đơn giá, không phải ngân sách.
  if (unit === 1e6 && after && (after.fold === 'm2' || after.fold === 'met')) return null;
  let value = v * unit;
  let end = i + 2;
  if (unit === 1e9 && after) {
    const unitAfter = MONEY_UNIT.get(toks[i + 3]?.fold ?? '');
    if (after.num !== undefined && unitAfter === 1e6) {
      value += after.num * 1e6;
      end = i + 4;
    } else if (after.num !== undefined && Number.isInteger(after.num) && after.num < 1000 && !unitAfter && toks[i + 3]?.fold !== 'phong') {
      // "3 tỷ 5" = 3,5 tỷ; "3 tỷ 55" = 3,55 tỷ
      value += after.num * 10 ** (9 - String(after.num).length);
      end = i + 3;
    } else if (after.fold === 'ruoi') {
      value += 5e8;
      end = i + 3;
    }
  }
  return { value, end };
}

function areaAt(toks: Tok[], i: number): { value: number; end: number } | null {
  const v = toks[i]?.num;
  if (v === undefined) return null;
  const u = toks[i + 1];
  if (!u) return null;
  if (u.fold === 'm2') return { value: v, end: i + 2 };
  if (u.fold === 'met' && toks[i + 2]?.fold === 'vuong') return { value: v, end: i + 3 };
  if (u.fold === 'm' && v >= 20 && v < 2000) return { value: v, end: i + 2 };
  return null;
}

function qualifierBefore(toks: Tok[], i: number): string | undefined {
  for (const m of scan(toks, QUALIFIER_LEXICON)) if (m.at + m.len === i) return m.trigger.tags[0];
  return undefined;
}

function qualifierAfter(toks: Tok[], end: number): string | undefined {
  for (const m of scan(toks, QUALIFIER_LEXICON)) if (m.at === end && m.trigger.tags[0] === 'max') return 'max';
  return undefined;
}

function toRange(value: number, q: string | undefined): Range {
  if (q === 'max') return { max: value * 1.03 };
  if (q === 'min') return { min: value * 0.97 };
  return { min: value * 0.85, max: value * 1.15 };
}

function parseEntities(toks: Tok[], skip: boolean[]): { entities: Entities; used: boolean[] } {
  const e: Entities = {};
  const used = toks.map(() => false);
  const mark = (from: number, to: number) => {
    for (let k = from; k < to; k++) used[k] = true;
  };
  for (let i = 0; i < toks.length; i++) {
    if (skip[i]) continue;
    // Số phòng ngủ: "2pn", "hai phòng ngủ"
    if (toks[i + 1]?.fold === 'phong' && toks[i + 2]?.fold === 'ngu') {
      const n = toks[i].num ?? NUM_WORDS.get(toks[i].fold);
      if (n !== undefined && n >= 0 && n <= 9 && Number.isInteger(n)) {
        e.bedrooms = n;
        mark(i, i + 3);
        continue;
      }
    }
    if (toks[i].num === undefined) continue;
    // Khoảng: "từ 3 đến 4 tỷ", "3-4 tỷ", "70-80m2"
    const joiner = toks[i + 1] && ['den', 'toi'].includes(toks[i + 1].fold) ? 2 : toks[i + 1]?.num !== undefined ? 1 : 0;
    if (joiner) {
      const money = moneyAt(toks, i + joiner);
      if (money) {
        const unit = MONEY_UNIT.get(toks[i + joiner + 1].fold) ?? 1e9;
        e.price = { min: toks[i].num! * unit * 0.97, max: money.value * 1.03 };
        mark(i, money.end);
        i = money.end - 1;
        continue;
      }
      const area = areaAt(toks, i + joiner);
      if (area) {
        e.area = { min: toks[i].num! * 0.97, max: area.value * 1.03 };
        mark(i, area.end);
        i = area.end - 1;
        continue;
      }
    }
    const money = moneyAt(toks, i);
    if (money) {
      // "3 tỷ đến 4 tỷ"
      if (toks[money.end] && ['den', 'toi'].includes(toks[money.end].fold)) {
        const to = moneyAt(toks, money.end + 1);
        if (to) {
          e.price = { min: money.value * 0.97, max: to.value * 1.03 };
          mark(i, to.end);
          i = to.end - 1;
          continue;
        }
      }
      e.price = toRange(money.value, qualifierBefore(toks, i) ?? qualifierAfter(toks, money.end));
      mark(i, money.end);
      i = money.end - 1;
      continue;
    }
    const area = areaAt(toks, i);
    if (area) {
      e.area = toRange(area.value, qualifierBefore(toks, i) ?? qualifierAfter(toks, area.end));
      mark(i, area.end);
      i = area.end - 1;
    }
  }
  // Hướng: "hướng đông nam", "ban công tây bắc", hoặc hướng ghép đứng riêng.
  const dirs = new Set<Direction>();
  for (const m of scan(toks, DIRECTION_LEXICON, { skip })) {
    const prev = toks[m.at - 1]?.fold;
    const prev2 = `${toks[m.at - 2]?.fold ?? ''} ${prev ?? ''}`;
    if (m.len === 2 || prev === 'huong' || prev2 === 'ban cong') {
      dirs.add(m.trigger.tags[0] as Direction);
      mark(m.at, m.at + m.len);
      if (prev === 'huong') used[m.at - 1] = true;
    }
  }
  if (dirs.size) e.directions = [...dirs];
  return { entities: e, used };
}

const hasEntities = (e: Entities) => e.bedrooms !== undefined || !!e.price || !!e.area || !!e.directions;

function overlaps(r: [number, number], q: Range): boolean {
  return r[1] >= (q.min ?? 0) && r[0] <= (q.max ?? Infinity);
}

function describeRange(r: Range, fmt: (n: number) => string): string {
  if (r.min !== undefined && r.max !== undefined) {
    const mid = (r.min + r.max) / 2;
    if (Math.abs(r.max / r.min - 1.15 / 0.85) < 0.01) return `~${fmt(mid)}`;
    return `${fmt(r.min / 0.97)} – ${fmt(r.max / 1.03)}`;
  }
  if (r.max !== undefined) return `≤ ${fmt(r.max / 1.03)}`;
  if (r.min !== undefined) return `≥ ${fmt(r.min / 0.97)}`;
  return '';
}

export function describeEntities(e: Entities): string[] {
  const out: string[] = [];
  if (e.bedrooms !== undefined) out.push(`${e.bedrooms}PN`);
  if (e.price) out.push(describeRange(e.price, (n) => formatMoney(n, '')));
  if (e.area) out.push(describeRange(e.area, (n) => `${formatNumber(n, 0)} m²`));
  if (e.directions) out.push(`Hướng ${e.directions.map((d) => DIRECTION_LABEL[d]).join(', ')}`);
  return out;
}

/** "3,2 – 3,8 tỷ" → [3.2e9, 3.8e9]; bỏ qua đơn giá theo m². */
export function parsePriceText(text: string): [number, number] | undefined {
  const toks = tokenize(text);
  if (toks.some((t, i) => t.fold === 'm2' && MONEY_UNIT.get(toks[i - 1]?.fold ?? '') === 1e6)) return undefined;
  const values: number[] = [];
  let unit = 0;
  for (let i = toks.length - 1; i >= 0; i--) {
    const u = MONEY_UNIT.get(toks[i].fold);
    if (u) unit = u;
    else if (toks[i].num !== undefined && unit) values.push(toks[i].num! * unit);
  }
  if (!values.length) return undefined;
  return [Math.min(...values), Math.max(...values)];
}

export function parseAreaText(text: string): [number, number] | undefined {
  const nums = tokenize(text)
    .filter((t) => t.num !== undefined && t.num >= 10 && t.num < 5000)
    .map((t) => t.num!);
  if (!nums.length) return undefined;
  return [Math.min(...nums), Math.max(...nums)];
}

export function bedroomsIn(text: string): number | undefined {
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) {
    if (toks[i + 1]?.fold === 'phong' && toks[i + 2]?.fold === 'ngu') {
      const n = toks[i].num ?? NUM_WORDS.get(toks[i].fold);
      if (n !== undefined && Number.isInteger(n) && n <= 9) return n;
    }
  }
  if (toks.some((t) => t.fold === 'studio')) return 1;
  return undefined;
}

// ======================================================================= Câu hỏi

/** Tên dự án (và tên pháp lý, mã) — bỏ khỏi câu hỏi để không làm nhiễu kết quả. */
function nameVariants(p: Project): Word[][] {
  return [p.name, p.legalName, p.code]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => tokenize(s).map(plainWord));
}

function maskNames(toks: Word[], names: Word[][]): boolean[] {
  const skip = toks.map(() => false);
  for (const words of names) {
    if (!words.length) continue;
    for (let i = 0; i + words.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < words.length && ok; j++) ok = toks[i + j].fold === words[j].fold;
      if (ok) for (let j = 0; j < words.length; j++) skip[i + j] = true;
    }
  }
  return skip;
}

function isContent(t: Tok): boolean {
  if (inSet(STOP, t) || t.fold === '%') return false;
  if (t.num !== undefined) return String(Math.trunc(t.num)).length >= 3;
  return t.fold.length >= 2;
}

/** Chủ đề mà từ khoá chỉ là "câu hỏi" (giá, còn căn…), không phải đối tượng cần tìm. */
const QUESTION_ONLY_TOPICS = new Set<string>(['gia', 'gio_hang', 'quy_mo', 'tong_quan']);

export function parseQuery(input: string, names: Word[][] = []): ParsedQuery {
  const text = input.normalize('NFC');
  const raw = tokenize(text);
  const typing = text.trim().length > 0 && !/\s$/.test(text);
  const skip = maskNames(raw, names);
  const lastIdx = raw.length - 1;

  const topicMatches = scan(raw, TOPIC_LEXICON, { prefixLast: typing, skip });
  // Từ cuối đang gõ dở ("bàn gi") — không coi là một từ hoàn chỉnh như "gì".
  const partialLast = topicMatches.some((m) => m.partial && m.at + m.len - 1 === lastIdx);

  // Khôi phục dấu theo cụm đã nhận ra: "ho boi" → "hồ bơi", "gia" → "giá", "khi nao" → "khi nào".
  const toks: Tok[] = raw.map((t) => ({ ...t }));
  const restore = (matches: Match[]) => {
    for (const m of matches) {
      if (m.partial) continue;
      for (let j = 0; j < m.len; j++) {
        const t = toks[m.at + j];
        const w = m.trigger.words[j];
        if (!t.marked && w.marked) toks[m.at + j] = { ...t, raw: w.raw, fold: w.fold, key: w.key, marked: true };
      }
    }
  };
  restore(topicMatches);
  const intentMatches = scan(toks, INTENT_LEXICON, { skip: partialLast ? skip.map((s, i) => s || i === lastIdx) : skip });
  restore(intentMatches);
  const legalMatches = scan(toks, LEGAL_LEXICON, { skip });
  restore(legalMatches);

  const topics = new Map<Topic, number>();
  const aspects = new Set<string>();
  const inTrigger = toks.map(() => false);
  for (const m of topicMatches) {
    const w = m.trigger.weight * (m.partial ? 0.5 : 1);
    for (const tag of m.trigger.tags) {
      if (isAspect(tag)) aspects.add(tag);
      else topics.set(tag as Topic, Math.max(topics.get(tag as Topic) ?? 0, w));
    }
    if (m.trigger.tags.length) for (let k = m.at; k < m.at + m.len; k++) inTrigger[k] = true;
  }
  const intents = INTENT_ORDER.filter((i) => intentMatches.some((m) => m.trigger.tags.includes(i)));
  const legalKeys = [...new Set(legalMatches.flatMap((m) => m.trigger.tags))];
  const { entities, used } = parseEntities(toks, skip);

  const content = toks.map((t, i) => !skip[i] && !used[i] && (isContent(t) || (i === lastIdx && partialLast && t.fold.length >= 2)));
  const terms: Word[] = [];
  const triggerTerms = new Set<string>();
  const seen = new Set<string>();
  toks.forEach((t, i) => {
    if (!content[i]) return;
    const id = termId(t);
    if (inTrigger[i]) triggerTerms.add(id);
    if (seen.has(id)) return;
    seen.add(id);
    terms.push(plainWord(t));
  });
  const last = toks[lastIdx];
  const prefixTerm = typing && last && content[lastIdx] ? terms.find((w) => termId(w) === termId(last)) : undefined;

  const bigrams: Array<[Word, Word]> = [];
  for (let i = 0; i + 1 < toks.length; i++) {
    if (content[i] && content[i + 1] && toks[i].fold !== toks[i + 1].fold) bigrams.push([toks[i], toks[i + 1]]);
  }

  // Câu hỏi có / không: "… không", "… chưa", "có … hả".
  let end = toks.length - 1;
  while (end > 0 && inSet(TAIL_FILLERS, toks[end]) && !inSet(NEGATIONS, toks[end])) end--;
  const lastCore = toks[end];
  const startsWithCo = toks.length > 1 && toks[0].fold === 'co' && (!toks[0].marked || toks[0].raw === 'có');
  const asksWhat = toks.some((t) => t.fold === 'gi' && (!t.marked || t.raw === 'gì'));
  const yesNo = !asksWhat && !!lastCore && end > 0 && (inSet(NEGATIONS, lastCore) || (startsWithCo && !!last && inSet(QUESTION_TAILS, last)));

  // Đối tượng được hỏi: bỏ từ chung chung, điều kiện, và từ chỉ mang nghĩa câu hỏi.
  const questionOnly = toks.map(() => false);
  for (const m of topicMatches) {
    const topicTags = m.trigger.tags.filter((t) => !isAspect(t));
    if (topicTags.length && topicTags.every((t) => QUESTION_ONLY_TOPICS.has(t))) {
      for (let k = m.at; k < m.at + m.len; k++) questionOnly[k] = true;
    }
  }
  const objectTerms: Word[] = [];
  const isObject = toks.map(
    (t, i) => content[i] && !used[i] && !questionOnly[i] && !inSet(GENERIC, t) && t.num === undefined && !(i === lastIdx && partialLast),
  );
  const seenObj = new Set<string>();
  toks.forEach((t, i) => {
    if (!isObject[i]) return;
    const id = termId(t);
    if (seenObj.has(id)) return;
    seenObj.add(id);
    objectTerms.push(plainWord(t));
  });
  const synonyms: ParsedQuery['synonyms'] = [];
  for (const m of scan(toks, SYNONYM_LEXICON, { skip })) {
    const ids: string[] = [];
    for (let k = m.at; k < m.at + m.len; k++) if (isObject[k]) ids.push(termId(toks[k]));
    if (ids.length) synonyms.push({ group: m.trigger.tags[0], ids });
  }

  const marks: Word[][] = [];
  for (const m of topicMatches) if (m.trigger.tags.length) marks.push(m.trigger.words.slice(0, m.len));
  for (const t of terms) marks.push([t]);
  for (let i = 0; i < toks.length; i++) {
    if (!used[i]) continue;
    let j = i;
    while (j + 1 < toks.length && used[j + 1]) j++;
    marks.push(toks.slice(i, j + 1).map(plainWord));
    i = j;
  }
  marks.sort((a, b) => b.length - a.length);

  return {
    text,
    empty: !terms.length && !topics.size && !hasEntities(entities) && !legalKeys.length,
    toks,
    terms,
    prefixTerm,
    bigrams,
    topics,
    aspects,
    triggerTerms,
    intents,
    yesNo,
    entities,
    legalKeys,
    objectTerms,
    synonyms,
    marks,
    squash: foldText(text).replace(/[^a-z0-9]/g, ''),
  };
}

// ======================================================================= Hồ sơ dự án → các đoạn

interface ChunkInit {
  kind: ChunkKind;
  group: string;
  section: string;
  title: string;
  text: string;
  items?: string[];
  /** Chỉ dùng để tìm, không hiển thị (vd gợi ý của hạng mục pháp lý). */
  extra?: string;
  topics: Topic[];
  aspects?: string[];
  intents?: Intent[];
  internal?: boolean;
  tab: ProjectTab;
  anchor: string;
  reply?: string;
  link?: Chunk['link'];
  doc?: DocumentRef;
  unit?: Property;
  legal?: Chunk['legal'];
  bedrooms?: number;
  priceRange?: [number, number];
  areaRange?: [number, number];
  directions?: Direction[];
  codes?: string[];
  weight?: number;
  boost?: number;
  /** Q&A: chủ đề lấy từ câu hỏi là chủ đề chính. */
  topicsFromTitle?: boolean;
}

function makeChunk(init: ChunkInit, order: number): Chunk {
  const titleToks = tokenize(init.title).map(plainWord);
  const textToks = tokenize(init.text).map(plainWord);
  const extraToks = init.extra ? tokenize(init.extra).map(plainWord) : [];
  const toks = [...titleToks, ...textToks, ...extraToks];
  const tw = [...titleToks.map(() => 2), ...textToks.map(() => 1), ...extraToks.map(() => 0.5)];
  const byFold = new Map<string, number[]>();
  toks.forEach((t, i) => {
    const list = byFold.get(t.fold);
    if (list) list.push(i);
    else byFold.set(t.fold, [i]);
  });
  const topics = new Set<Topic>(init.topics);
  if (init.topicsFromTitle) for (const t of topicsIn(titleToks)) topics.add(t);
  const inferred = topicsIn([...textToks, ...extraToks]);
  for (const t of topics) inferred.delete(t);
  const inferredAspects = aspectsIn([...textToks, ...extraToks]);
  for (const a of init.aspects ?? []) inferredAspects.delete(a);
  return {
    id: `${init.group}:${order}`,
    kind: init.kind,
    group: init.group,
    section: init.section,
    title: init.title,
    text: init.text,
    items: init.items,
    topics: [...topics],
    inferred,
    aspects: init.aspects ?? [],
    inferredAspects,
    timeLike: TIME_RE.test(foldText(`${init.title} ${init.text}`)),
    lenient: isUnaccented(toks),
    intents: init.intents ?? (init.topicsFromTitle ? intentsIn(titleToks) : []),
    internal: !!init.internal,
    tab: init.tab,
    anchor: init.anchor,
    reply: init.reply,
    link: init.link,
    doc: init.doc,
    unit: init.unit,
    legal: init.legal,
    bedrooms: init.bedrooms,
    priceRange: init.priceRange,
    areaRange: init.areaRange,
    directions: init.directions,
    codes: init.codes,
    weight: init.weight ?? 1,
    boost: init.boost ?? 0,
    order,
    toks,
    tw,
    titleLen: titleToks.length,
    textLen: textToks.length,
    itemToks: init.items?.map((it) => tokenize(it).map(plainWord)),
    byFold,
    folds: [...byFold.keys()],
  };
}

/** Các dòng có nội dung của một khối văn bản, kèm số thứ tự dòng gốc (để gắn id cuộn tới). */
export function textLines(text: string): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = [];
  text.split('\n').forEach((line, index) => {
    const t = line
      .trim()
      .replace(/^[-•*+–]\s*/, '')
      .trim();
    if (t) out.push({ text: t, index });
  });
  return out;
}

/** Đoạn văn dài → từng câu (không dùng lookbehind để chạy được trên Safari cũ). */
function sentences(line: string): string[] {
  if (line.length <= 220) return [line];
  const parts: string[] = [];
  const re = /[.!?…;]\s+/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    parts.push(line.slice(from, m.index + 1).trim());
    from = m.index + m[0].length;
  }
  parts.push(line.slice(from).trim());
  const out: string[] = [];
  for (const part of parts.filter(Boolean)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (prev.length < 60 || part.length < 40)) out[out.length - 1] = `${prev} ${part}`;
    else out.push(part);
  }
  return out;
}

type TextField =
  | 'description'
  | 'highlights'
  | 'paymentPlan'
  | 'banks'
  | 'salesPolicy'
  | 'connectivity'
  | 'legalStatus'
  | 'cautions'
  | 'competitors'
  | 'marketInfo'
  | 'commission'
  | 'contacts'
  | 'internalNotes';

interface BlockDef {
  field: TextField;
  label: string;
  section: string;
  tab: ProjectTab;
  topics: Topic[];
  internal?: boolean;
  lead?: (p: Project) => string;
  boost?: number;
}

const BLOCKS: BlockDef[] = [
  { field: 'description', label: 'Giới thiệu', section: 'Giới thiệu dự án', tab: 'tong-quan', topics: ['tong_quan'], lead: (p) => `về dự án ${p.name}` },
  {
    field: 'highlights',
    label: 'Điểm nổi bật',
    section: 'Giới thiệu dự án',
    tab: 'tong-quan',
    topics: ['diem_manh', 'tong_quan'],
    lead: (p) => `điểm nổi bật của dự án ${p.name}`,
  },
  {
    field: 'paymentPlan',
    label: 'Phương thức thanh toán',
    section: 'Thanh toán & chính sách',
    tab: 'tong-quan',
    topics: ['thanh_toan'],
    lead: (p) => `phương thức thanh toán của dự án ${p.name}`,
  },
  {
    field: 'banks',
    label: 'Ngân hàng bảo lãnh / cho vay',
    section: 'Thanh toán & chính sách',
    tab: 'tong-quan',
    topics: ['vay'],
    lead: (p) => `về vay ngân hàng, dự án ${p.name}`,
  },
  {
    field: 'salesPolicy',
    label: 'Chính sách bán hàng',
    section: 'Thanh toán & chính sách',
    tab: 'tong-quan',
    topics: ['chinh_sach'],
    lead: (p) => `chính sách bán hàng hiện tại của dự án ${p.name}`,
  },
  { field: 'connectivity', label: 'Kết nối', section: 'Vị trí & kết nối', tab: 'tong-quan', topics: ['ket_noi', 'vi_tri'], lead: (p) => `về kết nối, dự án ${p.name}` },
  {
    field: 'legalStatus',
    label: 'Tình trạng pháp lý',
    section: 'Tóm tắt pháp lý',
    tab: 'phap-ly',
    topics: ['phap_ly'],
    lead: (p) => `về pháp lý dự án ${p.name}`,
    boost: 1.5,
  },
  { field: 'cautions', label: 'Điểm cần lưu ý khi tư vấn', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['rui_ro'], internal: true },
  { field: 'competitors', label: 'So sánh dự án cạnh tranh', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['doi_thu'], internal: true },
  { field: 'marketInfo', label: 'Thị trường thứ cấp & cho thuê', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['dau_tu'], internal: true },
  { field: 'commission', label: 'Chính sách hoa hồng', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['noi_bo'], internal: true },
  { field: 'contacts', label: 'Danh bạ đầu mối', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['lien_he', 'noi_bo'], internal: true },
  { field: 'internalNotes', label: 'Ghi chú nội bộ', section: 'Nội bộ & Q&A', tab: 'noi-bo', topics: ['noi_bo'], internal: true },
];

interface FactDef {
  key: string;
  label: string;
  section: string;
  tab?: ProjectTab;
  anchor?: string;
  topics: Topic[];
  aspects?: string[];
  intents?: Intent[];
  value: (p: Project) => string | undefined;
  reply?: (v: string, p: Project) => string;
  link?: (p: Project) => Chunk['link'];
  weight?: number;
}

/** Viết thường chữ đầu khi ghép vào câu — trừ chữ viết tắt / tên riêng ("MB Bank", "HĐMB"). */
const lcFirst = (s: string) => (/^\S\p{Lu}/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const VERB_START = /^(đã|đang|dự kiến|bàn giao|hoàn thành|chưa|sẽ|từ|trong|cuối|đầu|giữa)\b/i;

const INFO = 'Thông tin dự án';
const FACTS: FactDef[] = [
  { key: 'legalName', label: 'Tên pháp lý / khác', section: INFO, topics: ['tong_quan'], aspects: ['#ten_phap_ly'], value: (p) => p.legalName, reply: (v, p) => `tên pháp lý của dự án ${p.name} là ${v}` },
  { key: 'stage', label: 'Giai đoạn', section: INFO, topics: ['tien_do'], aspects: ['#giai_doan'], value: (p) => PROJECT_STAGE[p.stage].label, reply: (v, p) => `dự án ${p.name} hiện ${lcFirst(v)}`, weight: 0.8 },
  { key: 'developer', label: 'Chủ đầu tư', section: INFO, topics: ['chu_dau_tu'], aspects: ['#cdt'], intents: ['who'], value: (p) => p.developer, reply: (v, p) => `chủ đầu tư dự án ${p.name} là ${v}` },
  { key: 'devPartner', label: 'Đơn vị phát triển', section: INFO, topics: ['chu_dau_tu'], aspects: ['#phat_trien'], intents: ['who'], value: (p) => p.devPartner, reply: (v) => `đơn vị phát triển dự án là ${v}` },
  { key: 'contractor', label: 'Tổng thầu xây dựng', section: INFO, topics: ['chu_dau_tu', 'tien_do'], aspects: ['#tong_thau'], intents: ['who'], value: (p) => p.contractor, reply: (v) => `tổng thầu xây dựng là ${v}` },
  { key: 'designer', label: 'Thiết kế', section: INFO, topics: ['chu_dau_tu'], aspects: ['#thiet_ke'], intents: ['who'], value: (p) => p.designer, reply: (v) => `đơn vị thiết kế là ${v}` },
  { key: 'operator', label: 'Quản lý vận hành', section: INFO, topics: ['chu_dau_tu', 'phi'], aspects: ['#van_hanh'], intents: ['who'], value: (p) => p.operator, reply: (v) => `đơn vị quản lý vận hành là ${v}` },
  { key: 'distributor', label: 'Đơn vị phân phối', section: INFO, topics: ['chu_dau_tu'], aspects: ['#phan_phoi'], intents: ['who'], value: (p) => p.distributor, reply: (v) => `đơn vị phân phối là ${v}` },
  {
    key: 'siteArea',
    label: 'Tổng diện tích',
    section: INFO,
    topics: ['quy_mo'],
    aspects: ['#dien_tich_da'],
    intents: ['howmuch'],
    value: (p) => (p.siteArea ? `${formatNumber(p.siteArea, 2)} ha` : ''),
    reply: (v, p) => `dự án ${p.name} có tổng diện tích ${v}`,
  },
  {
    key: 'density',
    label: 'Mật độ xây dựng',
    section: INFO,
    topics: ['quy_mo'],
    aspects: ['#mat_do'],
    intents: ['howmuch'],
    value: (p) => (p.density ? `${formatNumber(p.density, 1)}%` : ''),
    reply: (v) => `mật độ xây dựng của dự án là ${v}`,
  },
  { key: 'scale', label: 'Quy mô', section: INFO, topics: ['quy_mo'], aspects: ['#so_toa'], intents: ['howmuch'], value: (p) => p.scale, reply: (v, p) => `quy mô dự án ${p.name}: ${v}` },
  {
    key: 'totalUnits',
    label: 'Tổng số sản phẩm',
    section: INFO,
    topics: ['quy_mo'],
    aspects: ['#so_can'],
    intents: ['howmuch'],
    value: (p) => (p.totalUnits ? p.totalUnits.toLocaleString('vi-VN') : ''),
    reply: (v, p) => `dự án ${p.name} có tổng cộng ${v} sản phẩm`,
  },
  {
    key: 'productTypes',
    label: 'Loại hình',
    section: INFO,
    topics: ['san_pham'],
    aspects: ['#loai_hinh'],
    value: (p) => p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', '),
    reply: (v, p) => `dự án ${p.name} gồm các loại hình: ${v}`,
  },
  { key: 'unitAreaRange', label: 'Diện tích sản phẩm', section: INFO, topics: ['san_pham'], aspects: ['#dien_tich_can'], intents: ['howmuch'], value: (p) => p.unitAreaRange, reply: (v) => `diện tích các sản phẩm: ${v}` },
  { key: 'startDate', label: 'Khởi công', section: INFO, topics: ['tien_do'], aspects: ['#khoi_cong'], intents: ['when'], value: (p) => p.startDate, reply: (v, p) => `dự án ${p.name} khởi công ${v}` },
  {
    key: 'handover',
    label: 'Bàn giao',
    section: INFO,
    topics: ['ban_giao'],
    aspects: ['#thoi_gian_bg'],
    intents: ['when'],
    value: (p) => p.handover,
    reply: (v, p) => (VERB_START.test(v) ? `dự án ${p.name} ${lcFirst(v)}` : `dự án ${p.name} dự kiến bàn giao ${v}`),
  },
  { key: 'construction', label: 'Tiến độ hiện tại', section: INFO, topics: ['tien_do'], aspects: ['#tien_do_xd'], intents: ['how', 'when'], value: (p) => p.construction, reply: (v, p) => `tiến độ hiện tại của dự án ${p.name}: ${v}` },
  {
    key: 'handoverStandard',
    label: 'Tiêu chuẩn bàn giao',
    section: INFO,
    topics: ['noi_that', 'ban_giao'],
    aspects: ['#tieu_chuan'],
    intents: ['how'],
    value: (p) => p.handoverStandard,
    reply: (v, p) => `dự án ${p.name} bàn giao theo tiêu chuẩn: ${v}`,
  },
  { key: 'managementFee', label: 'Phí quản lý', section: INFO, topics: ['phi'], aspects: ['#phi_ql'], intents: ['howmuch'], value: (p) => p.managementFee, reply: (v) => `phí quản lý là ${v}` },
  { key: 'parkingFee', label: 'Phí gửi xe', section: INFO, topics: ['phi'], aspects: ['#phi_xe'], intents: ['howmuch'], value: (p) => p.parkingFee, reply: (v) => `phí gửi xe: ${v}` },
  {
    key: 'price',
    label: 'Giá bán',
    section: 'Sản phẩm & giá',
    anchor: 'pf-price',
    topics: ['gia'],
    aspects: ['#gia_ban'],
    intents: ['howmuch'],
    value: (p) => formatPriceRange(p.priceFrom, p.priceTo),
    reply: (v, p) => `giá bán dự án ${p.name}: ${lcFirst(v)}`,
  },
  {
    key: 'unitPrice',
    label: 'Đơn giá',
    section: 'Sản phẩm & giá',
    anchor: 'pf-price',
    topics: ['gia'],
    aspects: ['#don_gia'],
    intents: ['howmuch'],
    value: (p) => p.unitPrice,
    reply: (v, p) => `đơn giá dự án ${p.name} khoảng ${v}`,
  },
  { key: 'priceNote', label: 'Ghi chú về giá', section: 'Sản phẩm & giá', topics: ['gia', 'phi'], aspects: ['#bao_tri_thue'], value: (p) => p.priceNote, reply: (v) => `về giá: ${v}` },
  {
    key: 'address',
    label: 'Địa chỉ',
    section: 'Vị trí & kết nối',
    topics: ['vi_tri'],
    aspects: ['#dia_chi'],
    intents: ['where'],
    value: (p) => formatProjectAddress(p),
    reply: (v, p) => `dự án ${p.name} nằm tại ${v}`,
    link: (p) => (p.mapUrl ? { href: p.mapUrl, label: 'Google Maps' } : undefined),
  },
  {
    key: 'website',
    label: 'Website dự án',
    section: 'Vị trí & kết nối',
    anchor: 'pf-address',
    topics: [],
    aspects: ['#website'],
    value: (p) => p.website,
    link: (p) => (p.website ? { href: p.website, label: 'Mở website' } : undefined),
    weight: 0.6,
  },
  {
    key: 'ownership',
    label: 'Hình thức sở hữu',
    section: 'Tóm tắt pháp lý',
    tab: 'phap-ly',
    topics: ['so_huu', 'phap_ly'],
    intents: ['howlong', 'how'],
    value: (p) => p.ownership,
    reply: (v, p) => `hình thức sở hữu của dự án ${p.name}: ${v}`,
  },
];

const DOC_TOPICS: Record<DocCategory, Topic[]> = {
  phap_ly: ['phap_ly'],
  bang_gia: ['gia', 'gio_hang'],
  chinh_sach: ['chinh_sach'],
  thanh_toan: ['thanh_toan', 'vay'],
  mat_bang: ['san_pham'],
  vat_lieu: ['noi_that', 'phi'],
  brochure: ['tong_quan', 'chu_dau_tu'],
  hop_dong: ['hop_dong', 'dat_coc'],
  tien_do: ['tien_do', 'hinh_anh'],
  hinh_anh: ['hinh_anh'],
  dao_tao: ['noi_bo'],
  khac: [],
};

const RULE_TOPICS: Array<[string, Topic[]]> = [
  ['dat coc', ['dat_coc']],
  ['thanh toan lan dau', ['thanh_toan', 'dat_coc']],
  ['truoc khi ban giao', ['thanh_toan']],
  ['truoc khi cap so', ['thanh_toan', 'phap_ly']],
  ['hinh thuc thanh toan', ['thanh_toan']],
  ['chi phi ngoai gia', ['phi']],
  ['nguoi nuoc ngoai', ['nuoc_ngoai', 'so_huu']],
];

export interface ProjectIndex {
  project: Project;
  units: Property[];
  privacy: boolean;
  chunks: Chunk[];
  avgLength: number;
  names: Word[][];
}

const squashCode = (s: string) => foldText(s).replace(/[^a-z0-9]/g, '');

/**
 * Cắt hồ sơ dự án thành các đoạn để hỏi đáp. Ở chế độ khách xem, bỏ hẳn thông tin nội bộ
 * (ghi chú, hoa hồng, tài liệu nội bộ, Q&A chưa cho khách xem).
 */
export function buildProjectIndex(project: Project, units: Property[], options: { privacy: boolean }): ProjectIndex {
  const p = project;
  const { privacy } = options;
  const chunks: Chunk[] = [];
  const add = (init: ChunkInit) => chunks.push(makeChunk(init, chunks.length));

  for (const f of FACTS) {
    const value = f.value(p)?.trim();
    if (!value) continue;
    add({
      kind: 'fact',
      group: `pf-${f.key}`,
      section: f.section,
      title: f.label,
      text: value,
      topics: f.topics,
      aspects: f.aspects,
      intents: f.intents,
      tab: f.tab ?? 'tong-quan',
      anchor: f.anchor ?? `pf-${f.key}`,
      reply: f.reply?.(value, p),
      link: f.link?.(p),
      weight: f.weight,
    });
  }

  for (const b of BLOCKS) {
    if (b.internal && privacy) continue;
    for (const line of textLines(p[b.field])) {
      for (const s of sentences(line.text)) {
        add({
          kind: 'line',
          group: `pf-${b.field}`,
          section: b.section,
          title: b.label,
          text: s,
          topics: b.topics,
          internal: b.internal,
          tab: b.tab,
          anchor: `pf-${b.field}-l${line.index}`,
          reply: b.lead?.(p),
          boost: b.boost,
        });
      }
    }
  }

  if (p.amenities.length) {
    add({
      kind: 'list',
      group: 'pf-amenities',
      section: 'Tiện ích',
      title: 'Tiện ích nội khu',
      text: p.amenities.join(' · '),
      items: p.amenities,
      topics: ['tien_ich'],
      aspects: ['#noi_khu'],
      tab: 'tong-quan',
      anchor: 'pf-amenities',
    });
  }
  if (p.nearby.length) {
    add({
      kind: 'list',
      group: 'pf-nearby',
      section: 'Vị trí & kết nối',
      title: 'Tiện ích ngoại khu',
      text: p.nearby.join(' · '),
      items: p.nearby,
      topics: ['tien_ich', 'ket_noi'],
      aspects: ['#ngoai_khu'],
      intents: ['howfar'],
      tab: 'tong-quan',
      anchor: 'pf-nearby',
    });
  }

  p.unitTypes.forEach((r, i) => {
    if (!r.name.trim() && !r.area.trim() && !r.price.trim()) return;
    const name = r.name.trim() || `Loại #${i + 1}`;
    const parts = [r.area && `DT ${r.area}`, r.price && `Giá ${r.price}`, r.quantity && `SL ${r.quantity}`, r.note].filter(Boolean);
    add({
      kind: 'unitType',
      group: 'unitTypes',
      section: 'Sản phẩm & giá',
      title: name,
      text: parts.join(' · '),
      topics: ['san_pham', 'gia'],
      tab: 'tong-quan',
      anchor: `ut-${r.id}`,
      bedrooms: bedroomsIn(`${r.name} ${r.note}`),
      priceRange: parsePriceText(r.price),
      areaRange: parseAreaText(r.area),
    });
  });

  // Pháp lý
  const progress = legalProgress(p);
  if (progress.checked > 0) {
    add({
      kind: 'fact',
      group: 'legal-progress',
      section: 'Checklist hồ sơ pháp lý',
      title: 'Hồ sơ pháp lý',
      text: `Đã có ${progress.done}/${progress.total} hạng mục theo checklist chuẩn`,
      topics: ['phap_ly'],
      tab: 'phap-ly',
      anchor: 'legal-checklist',
      reply: `dự án ${p.name} đã có ${progress.done}/${progress.total} hạng mục hồ sơ pháp lý theo checklist chuẩn`,
      boost: 1,
    });
  }
  for (const item of resolveChecklist(p)) {
    const doc = item.docId ? p.documents.find((d) => d.id === item.docId && !(privacy && d.visibility === 'internal')) : undefined;
    add({
      kind: 'legal',
      group: 'legal',
      section: 'Checklist hồ sơ pháp lý',
      title: item.label,
      text: [LEGAL_STATUS[item.status].label, item.note].filter(Boolean).join(' — '),
      extra: [item.hint, doc?.name].filter(Boolean).join(' '),
      topics: ['phap_ly'],
      tab: 'phap-ly',
      anchor: `legal-${item.key}`,
      legal: { key: item.key, status: item.status, note: item.note },
      doc,
      weight: item.status === 'chua_ro' ? 0.6 : 1,
    });
  }

  for (const f of p.faqs) {
    if (!f.question.trim() || (privacy && !f.isPublic)) continue;
    add({
      kind: 'faq',
      group: `faq-${f.id}`,
      section: 'Hỏi đáp',
      title: f.question.trim(),
      text: f.answer.trim(),
      topics: [],
      topicsFromTitle: true,
      tab: privacy ? 'tong-quan' : 'noi-bo',
      anchor: `faq-${f.id}`,
      weight: f.answer.trim() ? 1 : 0.5,
    });
  }

  for (const u of units) {
    if (!ACTIVE_PROPERTY_STATUSES.includes(u.status)) continue;
    const area = mainArea(u);
    const specs = [
      PROPERTY_TYPE_LABEL[u.type],
      area ? formatArea(area) : '',
      u.bedrooms ? `${u.bedrooms}PN` : '',
      u.bathrooms ? `${u.bathrooms}WC` : '',
      u.direction ? `Hướng ${DIRECTION_LABEL[u.direction]}` : '',
      u.balconyDirection ? `Ban công ${DIRECTION_LABEL[u.balconyDirection]}` : '',
      u.furnishing ? FURNISHING_LABEL[u.furnishing] : '',
    ].filter(Boolean);
    add({
      kind: 'unit',
      group: `unit-${u.id}`,
      section: 'Giỏ hàng',
      title: u.unitCode ? `Căn ${u.unitCode}` : u.title || u.code,
      text: `${specs.join(' · ')} · ${formatPrice(u.price, u.transaction)} · ${propertyStatusLabel(u.status, u.transaction)}`,
      extra: [u.title, u.code, u.description].filter(Boolean).join(' '),
      topics: ['gio_hang'],
      tab: 'gio-hang',
      anchor: `unit-${u.id}`,
      unit: u,
      bedrooms: u.bedrooms,
      priceRange: u.price && u.transaction === 'ban' ? [u.price, u.price] : undefined,
      areaRange: area ? [area, area] : undefined,
      directions: [u.direction, u.balconyDirection].filter((d): d is Direction => !!d),
      codes: [u.unitCode, u.code].map(squashCode).filter((c) => c.length >= 3),
      weight: u.status === 'da_coc' ? 0.6 : 1,
    });
  }

  for (const d of p.documents) {
    if (d.archived || (privacy && d.visibility === 'internal')) continue;
    add({
      kind: 'doc',
      group: `doc-${d.id}`,
      section: 'Tài liệu',
      title: d.name.replace(/\.[a-z0-9]{2,5}$/i, ''),
      text: [DOC_CATEGORY[d.category].label, d.effectiveDate ? `áp dụng ${formatDate(d.effectiveDate)}` : '', d.note].filter(Boolean).join(' · '),
      topics: [...DOC_TOPICS[d.category], 'tai_lieu'],
      internal: d.visibility === 'internal',
      tab: 'tai-lieu',
      anchor: `doc-${d.id}`,
      doc: d,
      weight: 0.9,
    });
  }

  if (p.images.length) {
    add({
      kind: 'media',
      group: 'media',
      section: 'Hình ảnh',
      title: 'Hình ảnh dự án',
      text: `${p.images.length} ảnh phối cảnh, thực tế, tiến độ`,
      topics: ['hinh_anh'],
      tab: 'hinh-anh',
      anchor: '',
    });
  }

  for (const it of LEGAL_REFERENCE.items) {
    const f = foldText(it.title);
    add({
      kind: 'rule',
      group: 'rules',
      section: 'Quy định chung',
      title: it.title,
      text: it.text,
      topics: RULE_TOPICS.find(([k]) => f.startsWith(k))?.[1] ?? [],
      tab: 'phap-ly',
      anchor: 'legal-reference',
      reply: `theo quy định hiện hành (${lcFirst(it.title)}): ${it.text}`,
      weight: 0.7,
    });
  }

  const avgLength = chunks.length ? chunks.reduce((s, c) => s + c.toks.length, 0) / chunks.length : 1;
  return { project, units, privacy, chunks, avgLength: Math.max(1, avgLength), names: nameVariants(p) };
}

// ======================================================================= Chấm điểm

function termFreq(c: Chunk, term: Word, prefix: boolean): number {
  let tf = 0;
  const list = c.byFold.get(term.fold);
  if (list) {
    for (const i of list) {
      const t = c.toks[i];
      const w = term.marked ? (t.marked ? (t.key === term.key ? 1 : 0) : c.lenient ? 0.6 : 0) : 1;
      tf += w * c.tw[i];
    }
  }
  if (!tf && prefix) {
    for (const f of c.folds) {
      if (f.length > term.fold.length && f.startsWith(term.fold)) return 0.6;
    }
  }
  return tf;
}

function hasBigram(c: Chunk, a: Word, b: Word): boolean {
  const list = c.byFold.get(a.fold);
  if (!list) return false;
  return list.some((i) => i + 1 < c.toks.length && lexMatch(c.toks[i], a, c.lenient) && lexMatch(c.toks[i + 1], b, c.lenient));
}

function titleHas(c: Chunk, term: Word): boolean {
  const list = c.byFold.get(term.fold);
  return !!list && list.some((i) => i < c.titleLen && lexMatch(c.toks[i], term, c.lenient));
}

function entityFit(c: Chunk, e: Entities): { bonus: number; factor: number } {
  let bonus = 0;
  let factor = 1;
  if (e.bedrooms !== undefined && c.bedrooms !== undefined) {
    if (c.bedrooms === e.bedrooms) bonus += 8;
    else factor *= 0.35;
  }
  if (e.price && c.priceRange) {
    if (overlaps(c.priceRange, e.price)) bonus += 5;
    else factor *= 0.45;
  }
  if (e.area && c.areaRange) {
    if (overlaps(c.areaRange, e.area)) bonus += 4;
    else factor *= 0.5;
  }
  if (e.directions && c.directions?.length) {
    if (c.directions.some((d) => e.directions!.includes(d))) bonus += 6;
    else factor *= 0.4;
  }
  if (c.kind === 'unitType') {
    if (e.bedrooms !== undefined && c.bedrooms === undefined) factor *= 0.4;
    if (e.price && !c.priceRange) factor *= 0.6;
    if (e.directions) factor *= 0.5; // loại căn không có thông tin hướng
  }
  return { bonus, factor };
}

/** Từ khoá đã được tính qua chủ đề ("nhận nhà" → Bàn giao) chỉ cộng thêm một phần điểm từ khoá. */
const TRIGGER_TERM_WEIGHT = 0.4;
const STRONG_INTENTS = new Set<Intent>(['when', 'who', 'where', 'howfar', 'howlong']);
const COMPATIBLE_INTENTS: Record<Intent, Intent[]> = {
  when: ['howlong'],
  howlong: ['when'],
  where: ['howfar'],
  howfar: ['where'],
  who: [],
  howmuch: [],
  how: [],
};

function scoreChunk(c: Chunk, q: ParsedQuery, idf: Map<string, number>, avgLength: number, trace?: Record<string, number>): number {
  let topical = 0;
  let primary = false;
  for (const [t, w] of q.topics) {
    if (c.topics.includes(t)) {
      topical += 6 * w;
      primary = true;
    } else if (c.inferred.has(t)) topical += 3.5 * w;
  }
  // Đoạn đúng chủ đề chính thì từ khoá của chủ đề (thường trùng nhãn, vd "Quy mô") gần như không cộng thêm.
  const triggerWeight = primary ? 0.15 : TRIGGER_TERM_WEIGHT;
  let lexical = 0;
  let matched = 0;
  let inTitle = 0;
  let idfAll = 0;
  let idfHit = 0;
  for (const term of q.terms) {
    const id = termId(term);
    idfAll += idf.get(id) ?? 0;
    const tf = termFreq(c, term, term === q.prefixTerm);
    if (!tf) continue;
    idfHit += idf.get(id) ?? 0;
    const weight = q.triggerTerms.has(id) ? triggerWeight : 1;
    matched += weight;
    if (titleHas(c, term)) inTitle++;
    const norm = 1.2 * (0.5 + (0.5 * c.toks.length) / avgLength);
    lexical += (weight * (idf.get(id) ?? 0) * tf * 2.2) / (tf + norm);
  }
  if (matched > 1) lexical += (matched - 1) * 1.2;
  let phrase = 0;
  for (const [a, b] of q.bigrams) {
    if (hasBigram(c, a, b)) phrase += q.triggerTerms.has(termId(a)) && q.triggerTerms.has(termId(b)) ? 2 * triggerWeight : 2;
  }
  if (q.topics.size > 0 && topical === 0) {
    lexical *= 0.45;
    phrase *= 0.45;
  }
  let s = topical + lexical + phrase;
  if (c.aspects.some((a) => q.aspects.has(a))) s += 4;
  else if ([...q.aspects].some((a) => c.inferredAspects.has(a))) s += 2;
  if (trace) {
    Object.assign(trace, { topical, lexical, phrase, aspect: s - topical - lexical - phrase, titleHits: inTitle, coverage: idfAll ? idfHit / idfAll : 0 });
  }

  const codeHit = !!c.codes?.some((code) => q.squash.includes(code));
  if (codeHit) s += 15;

  const intent = q.intents[0];
  const intentFit = !intent
    ? 0
    : c.intents.includes(intent)
      ? STRONG_INTENTS.has(intent)
        ? 3
        : 2
      : c.intents.some((i) => COMPATIBLE_INTENTS[intent].includes(i))
        ? 1.5
        : 0;
  // Câu chỉ có từ để hỏi ("ở khu nào", "của ai") vẫn tìm được trường thông tin tương ứng.
  if (s <= 0.5 && !(intentFit >= 3 && !q.topics.size && c.kind === 'fact')) return 0;

  // Câu hỏi giống câu Q&A đã soạn sẵn → ưu tiên câu trả lời chuẩn (độ giống kiểu Dice).
  if (c.kind === 'faq') {
    const faqTerms = new Set(c.toks.slice(0, c.titleLen).filter((t) => !inSet(STOP, t) && t.fold.length >= 2).map(termId)).size;
    const dice = q.terms.length ? (2 * inTitle) / (q.terms.length + Math.max(faqTerms, inTitle)) : 0;
    s += 7 * dice - topical * 0.5 * (1 - dice);
    if (dice >= 0.5) s += 1;
  }
  s += intentFit;
  if (intent && !intentFit) {
    if (c.kind === 'faq' && c.intents.length) s *= 0.7; // Q&A hỏi ý khác ("thế nào" ≠ "bao nhiêu")
    else if ((intent === 'when' || intent === 'howlong') && !c.timeLike) s *= 0.75; // hỏi "khi nào" mà đoạn không có mốc thời gian
  }
  if (c.legal && q.legalKeys.includes(c.legal.key)) s += q.yesNo || !intent ? 8 : 3;

  const fit = entityFit(c, q.entities);
  if (trace) Object.assign(trace, { beforeEntity: s, entityBonus: fit.bonus, entityFactor: fit.factor, boost: c.boost, weight: c.weight });
  s = (s + fit.bonus) * fit.factor;
  s += c.boost;
  return s * c.weight;
}

/** Giải thích điểm của các đoạn trong một nhóm — dùng khi kiểm thử. */
export function explainScores(index: ProjectIndex, input: string, group: string): Array<Record<string, number | string>> {
  const q = parseQuery(input, index.names);
  const idf = new Map<string, number>();
  const n = index.chunks.length || 1;
  for (const term of q.terms) {
    let df = 0;
    for (const c of index.chunks) if (termFreq(c, term, term === q.prefixTerm) > 0) df++;
    idf.set(termId(term), Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }
  return index.chunks
    .filter((c) => c.group === group)
    .map((c) => {
      const trace: Record<string, number> = {};
      const score = scoreChunk(c, q, idf, index.avgLength, trace);
      return { text: c.text.slice(0, 40), score, ...trace };
    });
}

const MAX_LINES = 10;

function toGroups(hits: Hit[], q: ParsedQuery): AnswerGroup[] {
  const byGroup = new Map<string, Hit[]>();
  for (const h of hits) {
    const list = byGroup.get(h.chunk.group);
    if (list) list.push(h);
    else byGroup.set(h.chunk.group, [h]);
  }
  const groups: AnswerGroup[] = [];
  for (const [key, list] of byGroup) {
    list.sort((a, b) => b.score - a.score);
    const top = list[0];
    let keep = list.filter((h) => h.score >= Math.max(1.5, top.score * 0.4));
    if (key === 'legal' && q.legalKeys.length) {
      const asked = keep.filter((h) => h.chunk.legal && q.legalKeys.includes(h.chunk.legal.key));
      if (asked.length) keep = asked;
    }
    // Nhóm gồm nhiều mục khác tên (loại sản phẩm, quy định): hỏi đúng tên mục nào thì chỉ hiện mục đó.
    if (new Set(keep.map((h) => h.chunk.title)).size > 1) {
      const specific = keep.filter((h) => h.titleHit || h.entity);
      if (specific.length) keep = specific;
    }
    // Nhiều dòng cùng nhóm chỉ cộng điểm khi các dòng đó thật sự nhắc tới điều được hỏi.
    const others = keep.slice(1).reduce((s, h) => s + (h.strong ? h.score : 0), 0);
    const factor = key === 'legal' || key === 'rules' ? 0.1 : 0.3;
    const shown = keep.slice(0, MAX_LINES).sort((a, b) => a.chunk.order - b.chunk.order);
    groups.push({
      key,
      kind: top.chunk.kind,
      section: top.chunk.section,
      title: top.chunk.title,
      top: top.chunk,
      hits: shown.map((h) => h.chunk),
      more: keep.length - shown.length,
      score: top.score + factor * Math.min(top.score, others),
      onTopic: top.onTopic,
      entity: top.entity,
      strong: top.strong,
      coverage: top.coverage,
      internal: top.chunk.internal,
    });
  }
  return groups.sort((a, b) => b.score - a.score);
}

// ======================================================================= Có / không

const EXISTENCE_TOPICS = new Set<Topic>(['tien_ich', 'ket_noi', 'noi_that', 'san_pham', 'rui_ro', 'diem_manh', 'tong_quan', 'hinh_anh']);
const SOFT_EXISTENCE_TOPICS = new Set<Topic>(['chinh_sach', 'vay', 'thanh_toan', 'dat_coc', 'phi', 'chu_dau_tu', 'ban_giao', 'tien_do', 'vi_tri']);

function legalVerdict(index: ProjectIndex, q: ParsedQuery): Verdict | undefined {
  for (const key of q.legalKeys) {
    const c = index.chunks.find((x) => x.legal?.key === key);
    if (!c?.legal) continue;
    const st = c.legal.status;
    const tone: VerdictTone = st === 'co' ? 'yes' : st === 'chua' ? 'no' : st === 'dang_lam' ? 'partial' : 'unknown';
    return { tone, label: LEGAL_STATUS[st].label, detail: c.legal.note ? `${c.title} — ${c.legal.note}` : c.title, tab: c.tab, anchor: c.anchor };
  }
  return undefined;
}

function coverage(words: Word[], terms: Word[], lenient = false): number {
  let n = 0;
  for (const t of terms) if (words.some((w) => lexMatch(w, t, lenient))) n++;
  return n;
}

const KIND_RANK: Partial<Record<ChunkKind, number>> = { list: 0, fact: 1, line: 2, unitType: 3 };

interface Evidence {
  /** Tỷ lệ đối tượng được nhắc tới, có trọng số theo độ hiếm của từ (0–1). */
  cov: number;
  /** Số đối tượng có đúng chữ trong đoạn (không tính đồng nghĩa). */
  literal: number;
  all: boolean;
  text: string;
  chunk: Chunk;
}

/** Tìm dòng / mục trong hồ sơ nhắc tới đối tượng được hỏi (tính cả từ đồng nghĩa). */
function findEvidence(index: ProjectIndex, q: ParsedQuery, idf: Map<string, number>): Evidence | undefined {
  const terms = q.objectTerms;
  const weightOf = (t: Word) => idf.get(termId(t)) ?? 1;
  const total = terms.reduce((s, t) => s + weightOf(t), 0) || 1;
  let best: Evidence | undefined;
  for (const c of index.chunks) {
    const rank = KIND_RANK[c.kind];
    if (rank === undefined) continue;
    const title = c.toks.slice(0, c.titleLen);
    const pieces: Array<{ text: string; words: Word[] }> = c.items
      ? c.items.map((text, i) => ({ text, words: [...title, ...c.itemToks![i]] }))
      : [{ text: c.text, words: c.toks.slice(0, c.titleLen + c.textLen) }];
    for (const piece of pieces) {
      const covered = new Set(terms.filter((t) => piece.words.some((w) => lexMatch(w, t, c.lenient))).map(termId));
      const literal = covered.size;
      if (q.synonyms.length) {
        const groups = new Set(scan(piece.words, SYNONYM_LEXICON).flatMap((m) => m.trigger.tags));
        for (const s of q.synonyms) if (groups.has(s.group)) s.ids.forEach((id) => covered.add(id));
      }
      if (!covered.size) continue;
      const cov = terms.filter((t) => covered.has(termId(t))).reduce((s, t) => s + weightOf(t), 0) / total;
      const all = covered.size >= terms.length;
      const better =
        !best ||
        cov > best.cov + 1e-9 ||
        (Math.abs(cov - best.cov) < 1e-9 && (literal > best.literal || (literal === best.literal && rank < (KIND_RANK[best.chunk.kind] ?? 9))));
      if (better) best = { cov, literal, all, text: piece.text, chunk: c };
    }
  }
  return best;
}

function existenceVerdict(index: ProjectIndex, q: ParsedQuery, idf: Map<string, number>): { verdict: Verdict; evidence?: Chunk } | undefined {
  const terms = q.objectTerms;
  if (!terms.length) return undefined;
  const topics = [...q.topics.keys()];
  const strict = topics.every((t) => EXISTENCE_TOPICS.has(t));
  const soft = !strict && topics.every((t) => EXISTENCE_TOPICS.has(t) || SOFT_EXISTENCE_TOPICS.has(t));
  if (!strict && !soft) return undefined;
  const ev = findEvidence(index, q, idf);
  if (ev?.all) {
    return { verdict: { tone: 'yes', label: 'Có', detail: `${ev.chunk.title}: ${ev.text}`, tab: ev.chunk.tab, anchor: ev.chunk.anchor }, evidence: ev.chunk };
  }
  if (ev && terms.length >= 2 && ev.cov >= 0.6) {
    return {
      verdict: { tone: 'partial', label: 'Có thông tin gần đúng', detail: `${ev.chunk.title}: ${ev.text}`, tab: ev.chunk.tab, anchor: ev.chunk.anchor },
      evidence: ev.chunk,
    };
  }
  const objectText = terms.map((t) => t.raw).join(' ');
  if (strict) return { verdict: { tone: 'unknown', label: 'Chưa thấy trong hồ sơ', detail: `Hồ sơ dự án chưa ghi nhận “${objectText}”.` } };
  return undefined;
}

function unitFits(c: Chunk, e: Entities, objects: Word[]): boolean {
  if (e.bedrooms !== undefined && c.bedrooms !== e.bedrooms) return false;
  if (e.price && !(c.priceRange && overlaps(c.priceRange, e.price))) return false;
  if (e.area && !(c.areaRange && overlaps(c.areaRange, e.area))) return false;
  if (e.directions && !c.directions?.some((d) => e.directions!.includes(d))) return false;
  if (objects.length && coverage(c.toks, objects, c.lenient) < objects.length) return false;
  return true;
}

// ======================================================================= Hỏi

function emptyResult(q: ParsedQuery): SmartResult {
  return { query: q, related: [], docs: [], units: [], unitTotal: 0, showUnits: false, understood: [], missing: [] };
}

/** Trả lời một câu hỏi về dự án từ chỉ mục đã dựng. */
export function askProject(index: ProjectIndex, input: string): SmartResult {
  const q = parseQuery(input, index.names);
  if (q.empty) return emptyResult(q);
  const { chunks } = index;

  const idf = new Map<string, number>();
  const n = chunks.length || 1;
  for (const term of q.terms) {
    let df = 0;
    for (const c of chunks) if (termFreq(c, term, term === q.prefixTerm) > 0) df++;
    idf.set(termId(term), Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  const hits: Hit[] = [];
  for (const c of chunks) {
    const trace: Record<string, number> = {};
    const score = scoreChunk(c, q, idf, index.avgLength, trace);
    if (score > 0.5) {
      const evidence = (trace.lexical ?? 0) + (trace.phrase ?? 0) + (trace.aspect ?? 0) + (trace.entityBonus ?? 0);
      hits.push({
        chunk: c,
        score,
        onTopic: (trace.topical ?? 0) > 0,
        strong: evidence > 0.3,
        titleHit: (trace.titleHits ?? 0) > 0,
        entity: (trace.entityBonus ?? 0) > 0,
        coverage: trace.coverage ?? 0,
      });
    }
  }

  // Giỏ hàng: lọc căn theo điều kiện của khách.
  const unitObjects = q.objectTerms.filter((t) => !inSet(GENERIC, t));
  const wantsUnits = q.topics.has('gio_hang') || hasEntities(q.entities);
  const unitHits = hits.filter((h) => h.chunk.kind === 'unit');
  const codeHits = unitHits.filter((h) => h.chunk.codes?.some((code) => q.squash.includes(code)));
  let units: UnitMatch[] = [];
  if (codeHits.length) {
    units = codeHits.map((h) => ({ unit: h.chunk.unit!, chunk: h.chunk, score: h.score }));
  } else if (wantsUnits) {
    const pool = chunks.filter((c) => c.kind === 'unit' && unitFits(c, q.entities, q.topics.has('gio_hang') || hasEntities(q.entities) ? unitObjects : []));
    const scoreOf = new Map(unitHits.map((h) => [h.chunk, h.score]));
    units = pool
      .map((c) => ({ unit: c.unit!, chunk: c, score: scoreOf.get(c) ?? 0 }))
      .sort((a, b) => b.score - a.score || (a.unit.price ?? Infinity) - (b.unit.price ?? Infinity));
  }
  const showUnits = wantsUnits || codeHits.length > 0;

  const groups = toGroups(
    hits.filter((h) => h.chunk.kind !== 'unit'),
    q,
  );
  const top = groups[0]?.score ?? 0;
  const threshold = Math.max(3, top * 0.3);
  // Câu hỏi đã rõ chủ đề: đoạn chỉ trùng chữ mà lệch chủ đề ("hoa hồng" ≠ "sổ hồng") thì bỏ.
  // Đoạn lệch chủ đề chỉ được giữ khi chứa phần lớn ý của câu hỏi (tránh "thú cưng" → "nghiệm thu").
  const passing = groups.filter(
    (g) => g.score >= threshold && (g.onTopic || (q.topics.size ? g.coverage >= 0.75 && g.score >= 6 : g.coverage >= 0.45)),
  );
  const docs = passing.filter((g) => g.kind === 'doc').slice(0, 5);
  const answers = passing.filter((g) => g.kind !== 'doc');

  // Ưu tiên thông tin riêng của dự án hơn quy định chung.
  let best: AnswerGroup | undefined = answers[0];
  if (best?.kind === 'rule') {
    const own = answers.find((g) => g.kind !== 'rule' && g.score >= best!.score * 0.45);
    if (own) best = own;
  }

  let verdict: Verdict | undefined;
  let evidence: Chunk | undefined;
  if (q.yesNo) {
    if (q.legalKeys.length) verdict = legalVerdict(index, q);
    if (!verdict && wantsUnits && !codeHits.length) {
      if (units.length) {
        const list = units
          .slice(0, 3)
          .map((u) => `${u.chunk.title} (${formatPrice(u.unit.price, u.unit.transaction)})`)
          .join(', ');
        verdict = { tone: 'yes', label: `Có ${units.length} căn phù hợp`, detail: `${list}${units.length > 3 ? '…' : ''}`, tab: 'gio-hang', anchor: '' };
      } else {
        const ut = q.entities.bedrooms !== undefined ? chunks.find((c) => c.kind === 'unitType' && c.bedrooms === q.entities.bedrooms) : undefined;
        verdict = ut
          ? { tone: 'partial', label: 'Có loại căn này', detail: `Dự án có loại ${ut.title}${ut.text ? ` (${ut.text})` : ''}; giỏ hàng hiện chưa có căn phù hợp.`, tab: ut.tab, anchor: ut.anchor }
          : { tone: 'unknown', label: 'Chưa có căn phù hợp', detail: 'Giỏ hàng hiện chưa có căn đúng yêu cầu này.', tab: 'gio-hang', anchor: '' };
      }
    }
    if (!verdict) {
      const ex = existenceVerdict(index, q, idf);
      verdict = ex?.verdict;
      if (ex?.verdict.tone === 'yes') evidence = ex.evidence;
    }
  }
  // Hỏi "có … không": đoạn chứng minh là câu trả lời chính.
  if (evidence) {
    const ev = evidence;
    const existing = groups.find((g) => g.key === ev.group);
    const hits = existing ? [...new Set([ev, ...existing.hits])].slice(0, MAX_LINES).sort((a, b) => a.order - b.order) : [ev];
    best = existing
      ? { ...existing, top: ev, hits, more: 0 }
      : { key: ev.group, kind: ev.kind, section: ev.section, title: ev.title, top: ev, hits, more: 0, score: top, onTopic: true, entity: false, strong: true, coverage: 1, internal: ev.internal };
  }
  if (wantsUnits && !codeHits.length && best && !(best.kind === 'unitType' && best.entity) && !evidence) best = undefined;

  // Câu hỏi nhắm đúng một trường thông tin mà hồ sơ còn trống → nhắc bổ sung.
  const missing: string[] = [];
  for (const a of q.aspects) {
    const def = FACTS.find((f) => f.aspects?.includes(a));
    if (def && !def.value(index.project)?.trim() && !missing.includes(def.label)) missing.push(def.label);
  }
  // Không đưa quy định chung / đoạn lạc đề lên làm "câu trả lời" khi hồ sơ thật ra chưa có thông tin.
  if (best && ((missing.length && best.kind === 'rule') || (verdict?.tone === 'unknown' && !best.strong && !best.entity))) best = undefined;
  const related = answers.filter((g) => g.key !== best?.key).slice(0, 5);

  const common = new Set(q.terms.filter((t) => (idf.get(termId(t)) ?? 9) < Math.log(1 + (n - n * 0.1 + 0.5) / (n * 0.1 + 0.5))).map(termId));
  q.marks = q.marks.filter((m) => m.length > 1 || !common.has(termId(m[0])));

  const understood = [
    ...[...q.topics.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => TOPIC_LABEL[t]),
    ...describeEntities(q.entities),
  ];

  return {
    query: q,
    verdict,
    best,
    related,
    docs,
    units: units.slice(0, 6),
    unitTotal: units.length,
    showUnits,
    understood: [...new Set(understood)],
    missing,
  };
}

// ======================================================================= Hiển thị

export interface TextPart {
  text: string;
  hit: boolean;
}

/** Tô sáng các từ / cụm từ khớp câu hỏi trong một đoạn văn bản. */
export function highlightParts(text: string, q: ParsedQuery | undefined): TextPart[] {
  if (!q || !text || !q.marks.length) return [{ text, hit: false }];
  const toks = tokenize(text);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < toks.length; ) {
    let len = 0;
    for (const phrase of q.marks) {
      if (i + phrase.length > toks.length) continue;
      let ok = true;
      for (let j = 0; j < phrase.length && ok; j++) {
        const w = phrase[j];
        const t = toks[i + j];
        const isPrefix = phrase.length === 1 && w === q.prefixTerm;
        ok = isPrefix ? t.fold.startsWith(w.fold) : wordMatches(t, w) || lexMatch(t, w);
      }
      if (ok) {
        len = phrase.length;
        break;
      }
    }
    if (len) {
      ranges.push([toks[i].start, toks[i + len - 1].end]);
      i += len;
    } else i++;
  }
  if (!ranges.length) return [{ text, hit: false }];
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && (r[0] <= prev[1] || /^\s*$/.test(text.slice(prev[1], r[0])))) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const parts: TextPart[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) parts.push({ text: text.slice(at, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

/** Các mục (tiện ích…) khớp câu hỏi. */
export function matchedItems(c: Chunk, q: ParsedQuery): string[] {
  if (!c.items || !c.itemToks) return [];
  const terms = q.objectTerms;
  if (!terms.length) return [];
  return c.items.filter((_, i) => coverage(c.itemToks![i], terms, c.lenient) > 0);
}

const endWith = (s: string) => (/[.!?…:]$/.test(s.trim()) ? '' : ' ạ.');

/** Câu trả lời để copy gửi khách (null với thông tin nội bộ). */
export function replyFor(group: AnswerGroup, project: Project, q?: ParsedQuery): string | null {
  if (group.internal) return null;
  const c = group.top;
  const lines = group.hits.map((h) => h.text).filter(Boolean);
  switch (c.kind) {
    case 'fact':
    case 'rule':
      return c.reply ? `Dạ, ${c.reply}${endWith(c.reply)}` : null;
    case 'faq':
      return c.text || null;
    case 'line': {
      const lead = c.reply ?? lcFirst(c.title);
      if (lines.length === 1) return `Dạ, ${lead}: ${lines[0]}${endWith(lines[0])}`;
      return `Dạ, ${lead}:\n${lines.map((l) => `• ${l}`).join('\n')}`;
    }
    case 'list': {
      const picked = q ? matchedItems(c, q) : [];
      const nearby = c.group === 'pf-nearby';
      if (picked.length) return nearby ? `Dạ, gần dự án ${project.name} có: ${picked.join('; ')} ạ.` : `Dạ, dự án ${project.name} có ${picked.join(', ')} ạ.`;
      return nearby
        ? `Dạ, tiện ích xung quanh dự án ${project.name}: ${c.items?.join('; ')} ạ.`
        : `Dạ, tiện ích nội khu dự án ${project.name} gồm: ${c.items?.join(', ')} ạ.`;
    }
    case 'legal': {
      const rows = group.hits.map((h) => `${h.title}: ${h.text}`);
      if (rows.length === 1) return `Dạ, về ${lcFirst(rows[0])}${endWith(rows[0])}`;
      return `Dạ, hồ sơ pháp lý dự án ${project.name}:\n${rows.map((r) => `• ${r}`).join('\n')}`;
    }
    case 'unitType': {
      const rows = group.hits.map((h) => `${h.title}: ${h.text}`);
      if (rows.length === 1) return `Dạ, loại ${rows[0]}${endWith(rows[0])}`;
      return `Dạ, các loại sản phẩm của dự án ${project.name}:\n${rows.map((r) => `• ${r}`).join('\n')}`;
    }
    default:
      return null;
  }
}

/** Câu hỏi gợi ý — chỉ những câu hồ sơ dự án đã có thông tin để trả lời. */
const QUICK: Array<{ q: string; has: (p: Project, units: number) => boolean }> = [
  { q: 'Giá bao nhiêu?', has: (p) => !!(p.priceFrom || p.priceTo || p.unitPrice.trim() || p.unitTypes.some((u) => u.price.trim())) },
  { q: 'Thanh toán thế nào?', has: (p) => !!p.paymentPlan.trim() },
  { q: 'Vay ngân hàng được bao nhiêu?', has: (p) => !!p.banks.trim() },
  { q: 'Khi nào bàn giao?', has: (p) => !!p.handover.trim() },
  { q: 'Pháp lý thế nào?', has: (p) => !!(p.legalStatus.trim() || p.ownership.trim() || legalProgress(p).checked) },
  { q: 'Đang có ưu đãi gì?', has: (p) => !!p.salesPolicy.trim() },
  { q: 'Dự án ở đâu?', has: (p) => !!formatProjectAddress(p) },
  { q: 'Đi lại, kết nối thế nào?', has: (p) => !!(p.connectivity.trim() || p.nearby.length) },
  { q: 'Có những tiện ích gì?', has: (p) => p.amenities.length > 0 },
  { q: 'Bàn giao nội thất gì?', has: (p) => !!p.handoverStandard.trim() },
  { q: 'Phí quản lý bao nhiêu?', has: (p) => !!p.managementFee.trim() },
  { q: 'Sở hữu bao lâu?', has: (p) => !!p.ownership.trim() },
  { q: 'Chủ đầu tư là ai?', has: (p) => !!p.developer.trim() },
  { q: 'Quy mô bao nhiêu căn?', has: (p) => !!(p.totalUnits || p.scale.trim()) },
  { q: 'Tiến độ xây dựng tới đâu?', has: (p) => !!p.construction.trim() },
  { q: 'Còn căn nào đang bán?', has: (_p, n) => n > 0 },
];

export function quickQuestions(index: ProjectIndex, limit = 9): string[] {
  const p = index.project;
  const active = index.units.filter((u) => ACTIVE_PROPERTY_STATUSES.includes(u.status)).length;
  const base = QUICK.filter((x) => x.has(p, active)).map((x) => x.q);
  const faqs = index.chunks.filter((c) => c.kind === 'faq' && c.text).map((c) => c.title);
  return [...new Set([...base.slice(0, limit), ...faqs.slice(0, 3)])];
}

/** Từ hay gặp trong tên dự án — đứng một mình thì không đủ để nhận ra dự án nào. */
const COMMON_NAME_WORDS = wordSet(
  'the of and city park home homes river riverside garden gardens tower towers plaza residence residences center centre sky view green new star ' +
    'golden gold royal grand villa villas apartment apartments land island bay lake palace heights house square central westgate eastgate ' +
    'khu đô thị dân cư căn hộ chung nhà ở dự án phố mới xanh sông hồ biển cao tầng thành phố',
);

/**
 * Câu hỏi có nhắc tên một dự án không ("aurora bàn giao khi nào") — dùng cho ô tìm kiếm chung.
 * Nhận cả tên rút gọn nếu đủ đặc trưng ("Aurora" của "Aurora Riverside").
 */
export function findProjectMention(input: string, projects: Project[]): { project: Project; rest: string } | null {
  const text = input.normalize('NFC');
  const toks = tokenize(text);
  if (toks.length < 2) return null;
  const variants = projects.map((p) => ({ p, names: nameVariants(p) }));
  // Từ chỉ xuất hiện trong tên đúng một dự án.
  const owners = new Map<string, Set<string>>();
  for (const { p, names } of variants) for (const w of names.flat()) owners.set(w.fold, (owners.get(w.fold) ?? new Set()).add(p.id));

  let best: { project: Project; at: number; len: number; full: boolean } | null = null;
  let tie = false;
  for (const { p, names } of variants) {
    for (const words of names) {
      if (words.map((w) => w.fold).join('').length < 3) continue;
      for (let i = 0; i < toks.length; i++) {
        for (let k = 0; k < words.length; k++) {
          let len = 0;
          while (i + len < toks.length && k + len < words.length && toks[i + len].fold === words[k + len].fold) len++;
          if (!len) continue;
          const full = len === words.length;
          const word = words[k];
          const distinctive =
            full || len >= 2 || (word.fold.length >= 4 && !inSet(COMMON_NAME_WORDS, word) && !inSet(STOP, word) && owners.get(word.fold)?.size === 1);
          if (!distinctive) continue;
          const better = !best || Number(full) > Number(best.full) || (full === best.full && len > best.len);
          if (better) {
            best = { project: p, at: i, len, full };
            tie = false;
          } else if (best && best.project.id !== p.id && full === best.full && len === best.len) tie = true;
        }
      }
    }
  }
  if (!best || tie) return null;
  const start = toks[best.at].start;
  const end = toks[best.at + best.len - 1].end;
  const rest = `${text.slice(0, start)} ${text.slice(end)}`.replace(/\s+/g, ' ').trim();
  return rest ? { project: best.project, rest } : null;
}
