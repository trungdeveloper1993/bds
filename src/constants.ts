import type {
  BrokerContract,
  CustomerSource,
  CustomerStatus,
  Direction,
  DocCategory,
  LegalItemStatus,
  ProjectStage,
  Visibility,
  Frontage,
  Furnishing,
  InteractionKind,
  InventoryStatus,
  MapCardFields,
  MilestoneStatus,
  PromotionKind,
  InterestStatus,
  LegalStatus,
  Payment,
  PropertyStatus,
  PropertyType,
  Purpose,
  SellerRelation,
  Temperature,
  Transaction,
  Urgency,
} from './types';

/** Bảng màu dùng chung cho nhãn trạng thái (xem Badge). */
export type Tone = 'slate' | 'emerald' | 'amber' | 'violet' | 'sky' | 'blue' | 'rose' | 'orange';

export interface LabelTone {
  label: string;
  tone: Tone;
}

export const PROJECT_STAGE: Record<ProjectStage, LabelTone> = {
  sap_mo_ban: { label: 'Sắp mở bán', tone: 'sky' },
  dang_mo_ban: { label: 'Đang mở bán', tone: 'emerald' },
  dang_xay_dung: { label: 'Đang xây dựng', tone: 'amber' },
  da_ban_giao: { label: 'Đã bàn giao', tone: 'violet' },
  tam_dung: { label: 'Tạm dừng', tone: 'slate' },
};
export const PROJECT_STAGES = Object.keys(PROJECT_STAGE) as ProjectStage[];

/** Nhóm tài liệu theo chuẩn "bộ tài liệu bán hàng" (sales kit) của một dự án. */
export const DOC_CATEGORY: Record<DocCategory, { label: string; examples: string }> = {
  phap_ly: {
    label: 'Pháp lý dự án',
    examples: 'Chủ trương đầu tư, QĐ giao đất, sổ đỏ tổng, QH 1/500, GPXD, nghiệm thu móng, bảo lãnh NH, văn bản đủ điều kiện bán',
  },
  bang_gia: {
    label: 'Bảng giá & Giỏ hàng',
    examples: 'Bảng giá theo đợt, giỏ hàng / bảng hàng (trạng thái căn), bảng tính giá theo phương thức thanh toán',
  },
  chinh_sach: {
    label: 'Chính sách bán hàng',
    examples: 'CSBH từng đợt (chiết khấu, quà tặng), quy trình booking → cọc → HĐMB; chính sách hoa hồng nên để Nội bộ',
  },
  thanh_toan: {
    label: 'Thanh toán & Vay ngân hàng',
    examples: 'Tiến độ thanh toán (chuẩn / sớm / vay), chính sách vay, hỗ trợ lãi suất, ân hạn gốc, bảng tính dòng tiền',
  },
  mat_bang: { label: 'Mặt bằng & Thiết kế', examples: 'Mặt bằng tổng thể, tầng điển hình, layout căn 2D/3D, sơ đồ phân lô' },
  vat_lieu: {
    label: 'Bàn giao & Vận hành',
    examples: 'Danh mục vật liệu bàn giao, nội quy quản lý sử dụng nhà chung cư, biểu phí quản lý, phí gửi xe',
  },
  brochure: { label: 'Giới thiệu dự án & CĐT', examples: 'Brochure, e-catalogue, slide thuyết trình, hồ sơ năng lực chủ đầu tư' },
  hop_dong: {
    label: 'Hợp đồng & Biểu mẫu',
    examples: 'Thoả thuận đặt chỗ, thoả thuận đặt cọc, HĐMB mẫu (Phụ lục I NĐ 96/2024), mẫu chuyển nhượng HĐ',
  },
  tien_do: { label: 'Tiến độ xây dựng', examples: 'Báo cáo & ảnh tiến độ định kỳ, mốc móng / cất nóc, thông báo bàn giao' },
  hinh_anh: { label: 'Hình ảnh & Video', examples: 'Phối cảnh 3D, ảnh thực tế, nhà mẫu, flycam, tour 360°' },
  dao_tao: { label: 'Đào tạo & Q&A', examples: 'Tài liệu đào tạo, bộ câu hỏi thường gặp, xử lý từ chối, so sánh đối thủ' },
  khac: { label: 'Tài liệu khác', examples: 'Các tài liệu chưa phân loại' },
};
export const DOC_CATEGORY_LABEL = Object.fromEntries(
  Object.entries(DOC_CATEGORY).map(([k, v]) => [k, v.label]),
) as Record<DocCategory, string>;
export const DOC_CATEGORIES = Object.keys(DOC_CATEGORY) as DocCategory[];

/** Đoán nhóm tài liệu từ tên file, giúp tải lên nhanh. */
export function guessDocCategory(fileName: string, mimeType: string): DocCategory {
  const n = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ');
  const rules: Array<[DocCategory, RegExp]> = [
    ['bang_gia', /bang gia|price ?list|gio hang|bang tinh/],
    ['thanh_toan', /thanh toan|tien do tt|ptt|vay|ngan hang|lai suat|payment/],
    ['chinh_sach', /chinh sach|cs ban hang|uu dai|chiet khau|booking|policy/],
    ['phap_ly', /phap ly|giay phep|gpxd|quyet dinh|qd |chu truong|1 ?500|so do|so hong|gcn|bao lanh|nghiem thu|du dieu kien|legal/],
    ['mat_bang', /mat bang|layout|thiet ke|master ?plan|phoi canh|mb tang|floor ?plan/],
    ['vat_lieu', /vat lieu|ban giao|hoan thien|thiet bi/],
    ['hop_dong', /hop dong|hdmb|hd mua ban|dat coc|phieu|bieu mau|mau don|quy che|contract/],
    ['tien_do', /tien do|cong truong|thi cong|construction/],
    ['brochure', /brochure|catalog|leaflet|gioi thieu|profile|ebook/],
    ['dao_tao', /dao tao|q ?& ?a|qa|faq|cau hoi|training|doi thu/],
  ];
  for (const [category, re] of rules) if (re.test(n)) return category;
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'hinh_anh';
  return 'khac';
}

/**
 * Các ngưỡng pháp lý môi giới hay phải giải thích cho khách.
 * Hiển thị kèm ngày cập nhật vì luật có thể được sửa đổi.
 */
export const LEGAL_REFERENCE = {
  asOf: '16/10/2026',
  basis: 'Luật Kinh doanh BĐS 2023 (số 29/2023/QH15, hiệu lực 01/08/2024) và Luật Nhà ở 2023',
  items: [
    { title: 'Đặt cọc', text: 'Tối đa 5% giá bán, chỉ được thu khi dự án đã đủ điều kiện đưa vào kinh doanh (Điều 23).' },
    { title: 'Thanh toán lần đầu', text: 'Không quá 30% giá trị hợp đồng, đã bao gồm tiền đặt cọc (Điều 25).' },
    {
      title: 'Trước khi bàn giao',
      text: 'Tổng cộng không quá 70% giá trị hợp đồng; không quá 50% nếu bên bán là tổ chức có vốn đầu tư nước ngoài (Điều 25).',
    },
    { title: 'Trước khi cấp sổ', text: 'Không quá 95%; 5% còn lại thanh toán khi bên mua được cấp Giấy chứng nhận (Điều 25).' },
    { title: 'Hình thức thanh toán', text: 'Tiền mua nhà trả cho chủ đầu tư phải qua tài khoản ngân hàng (Điều 48).' },
    {
      title: 'Chi phí ngoài giá',
      text: 'Kinh phí bảo trì 2% (căn hộ chung cư), thuế GTGT nếu giá chưa gồm, lệ phí trước bạ 0,5% khi làm sổ.',
    },
    {
      title: 'Người nước ngoài',
      text: 'Tối đa 30% số căn mỗi tòa chung cư; tối đa 250 nhà ở riêng lẻ trên khu vực có dân số tương đương một phường.',
    },
  ],
  caution:
    'Quốc hội khoá XVI đang xem xét sửa đổi Luật KDBĐS, Luật Nhà ở và Luật Đất đai tại kỳ họp thứ 2 (17/10 – 20/11/2026); một số ngưỡng trên có thể thay đổi. Hãy kiểm tra văn bản mới nhất trước khi tư vấn.',
};

/** Tài liệu về hoa hồng / chính sách cho sales thường chỉ dùng nội bộ. */
export function looksInternal(fileName: string): boolean {
  const n = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
  return /hoa hong|hoa_hong|commission|noi bo|noi_bo|internal|dao tao|dao_tao|training/.test(n);
}

export const LEGAL_STATUS: Record<LegalItemStatus, LabelTone> = {
  co: { label: 'Đã có', tone: 'emerald' },
  dang_lam: { label: 'Đang hoàn thiện', tone: 'amber' },
  chua: { label: 'Chưa có', tone: 'rose' },
  khong_ap_dung: { label: 'Không áp dụng', tone: 'slate' },
  chua_ro: { label: 'Chưa kiểm tra', tone: 'slate' },
};
export const LEGAL_STATUSES: LegalItemStatus[] = ['co', 'dang_lam', 'chua', 'khong_ap_dung', 'chua_ro'];

/**
 * Checklist hồ sơ pháp lý dự án theo Luật Kinh doanh BĐS 2023 (hiệu lực 01/08/2024),
 * Luật Nhà ở 2023 và Luật Đất đai 2024. scope: 'ch' = nhà ở / căn hộ hình thành trong
 * tương lai, 'dn' = đất nền, 'all' = cả hai.
 */
export const LEGAL_CHECKLIST: Array<{ key: string; label: string; hint: string; scope: 'all' | 'ch' | 'dn' }> = [
  {
    key: 'chu_truong',
    label: 'Quyết định chấp thuận chủ trương đầu tư',
    hint: 'Đồng thời chấp thuận nhà đầu tư, hoặc kết quả đấu giá / đấu thầu.',
    scope: 'all',
  },
  {
    key: 'giao_dat',
    label: 'Quyết định giao đất / cho thuê đất',
    hint: 'Kèm chứng từ hoàn thành nghĩa vụ tài chính về đất (tiền sử dụng đất).',
    scope: 'all',
  },
  {
    key: 'gcn',
    label: 'Giấy chứng nhận quyền sử dụng đất (sổ tổng)',
    hint: 'Bắt buộc với đất nền; với căn hộ HTTTL chỉ cần một trong các giấy tờ về đất.',
    scope: 'all',
  },
  {
    key: 'quy_hoach',
    label: 'Quy hoạch chi tiết 1/500 (hoặc tổng mặt bằng)',
    hint: 'Xác định bố cục, mật độ xây dựng, số lượng căn / lô.',
    scope: 'all',
  },
  {
    key: 'gpxd',
    label: 'Giấy phép xây dựng',
    hint: 'Hoặc thuộc diện miễn giấy phép theo quy định mới về xây dựng.',
    scope: 'all',
  },
  { key: 'khoi_cong', label: 'Thông báo khởi công', hint: 'Công trình phải đã khởi công.', scope: 'ch' },
  {
    key: 'moi_truong_pccc',
    label: 'ĐTM / Giấy phép môi trường & thẩm duyệt PCCC',
    hint: 'Trước bàn giao kiểm tra thêm văn bản chấp thuận kết quả nghiệm thu (công trình, PCCC).',
    scope: 'all',
  },
  {
    key: 'nghiem_thu',
    label: 'Biên bản nghiệm thu móng / hạ tầng kỹ thuật',
    hint: 'Nghiệm thu móng với chung cư, tòa hỗn hợp; nghiệm thu hạ tầng theo tiến độ với thấp tầng, đất nền.',
    scope: 'all',
  },
  {
    key: 'du_dieu_kien',
    label: 'Văn bản Sở Xây dựng: đủ điều kiện bán nhà ở HTTTL',
    hint: 'Điều 24 Luật KDBĐS 2023. Với đất nền: thông báo đủ điều kiện chuyển nhượng (Điều 31).',
    scope: 'all',
  },
  {
    key: 'bao_lanh',
    label: 'Thoả thuận cấp bảo lãnh & thư bảo lãnh ngân hàng',
    hint: 'Điều 26 Luật KDBĐS 2023 — áp dụng với nhà ở hình thành trong tương lai.',
    scope: 'ch',
  },
  {
    key: 'giai_chap',
    label: 'Giải chấp, không tranh chấp / kê biên',
    hint: 'Dự án thế chấp phải giải chấp trước khi ký HĐMB (Điều 183 Luật Nhà ở 2023), trừ khi có thoả thuận.',
    scope: 'all',
  },
  {
    key: 'cong_khai',
    label: 'Công khai thông tin dự án',
    hint: 'Trên hệ thống thông tin quốc gia về nhà ở & thị trường BĐS và website CĐT (Điều 6 Luật KDBĐS 2023).',
    scope: 'all',
  },
];

/** Trạng thái căn trong bảng hàng — màu mặc định theo quy ước bảng hàng (xanh còn, vàng giữ chỗ, đỏ đã bán). */
export const INVENTORY_STATUS: Record<InventoryStatus, LabelTone & { color: string }> = {
  dang_ban: { label: 'Đang bán', tone: 'emerald', color: '#16a34a' },
  giu_cho: { label: 'Đang giữ chỗ', tone: 'amber', color: '#f59e0b' },
  da_coc: { label: 'Đã cọc', tone: 'orange', color: '#ea580c' },
  da_ban: { label: 'Đã bán', tone: 'rose', color: '#dc2626' },
  chua_mo: { label: 'Chưa mở bán', tone: 'slate', color: '#94a3b8' },
};
export const INVENTORY_STATUSES: InventoryStatus[] = ['dang_ban', 'giu_cho', 'da_coc', 'da_ban', 'chua_mo'];

export const DEFAULT_MAP_COLORS = Object.fromEntries(INVENTORY_STATUSES.map((s) => [s, INVENTORY_STATUS[s].color])) as Record<InventoryStatus, string>;

export const PROMOTION_KIND_LABEL: Record<PromotionKind, string> = { pct: 'Giảm %', amount: 'Giảm tiền', gift: 'Quà tặng' };

export const MILESTONE_STATUS: Record<MilestoneStatus, LabelTone> = {
  done: { label: 'Đã xong', tone: 'emerald' },
  doing: { label: 'Đang thực hiện', tone: 'amber' },
  planned: { label: 'Sắp tới', tone: 'slate' },
};
export const MILESTONE_SUGGESTIONS = ['Khởi công', 'Hoàn thiện móng', 'Cất nóc', 'Bàn giao', 'Cấp sổ hồng'];

/** Thẻ hay dùng cho hình mẫu căn. */
export const LAYOUT_TAG_SUGGESTIONS = [
  'Căn góc',
  'Căn giữa',
  '2 mặt thoáng',
  'Đảo chiều',
  'View sông',
  'View hồ bơi',
  'View công viên',
  'Có sân vườn',
  'Duplex',
  'Penthouse',
  'Studio',
];

export const MAP_CARD_FIELDS: Array<{ key: keyof MapCardFields; label: string }> = [
  { key: 'image', label: 'Hình mẫu căn' },
  { key: 'area', label: 'Diện tích' },
  { key: 'price', label: 'Giá' },
  { key: 'unitPrice', label: 'Giá / m²' },
  { key: 'rooms', label: 'Phòng ngủ' },
  { key: 'direction', label: 'Hướng' },
  { key: 'note', label: 'Ghi chú (view, căn góc…)' },
];

export const VISIBILITY: Record<Visibility, LabelTone> = {
  public: { label: 'Gửi khách được', tone: 'emerald' },
  internal: { label: 'Nội bộ', tone: 'rose' },
};

export const TRANSACTION_LABEL: Record<Transaction, string> = {
  ban: 'Bán',
  cho_thue: 'Cho thuê',
};

/** Nhu cầu nhìn từ phía khách hàng. */
export const CUSTOMER_TRANSACTION_LABEL: Record<Transaction, string> = {
  ban: 'Mua',
  cho_thue: 'Thuê',
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  nha_rieng: 'Nhà riêng (hẻm/ngõ)',
  nha_mat_pho: 'Nhà mặt phố',
  can_ho: 'Căn hộ chung cư',
  chung_cu_mini: 'Chung cư mini / CHDV',
  biet_thu: 'Biệt thự / Liền kề',
  shophouse: 'Shophouse / Nhà phố TM',
  dat_tho_cu: 'Đất thổ cư',
  dat_nen: 'Đất nền dự án',
  dat_nong_nghiep: 'Đất nông nghiệp / Vườn',
  condotel: 'Condotel / Nghỉ dưỡng',
  kho_xuong: 'Kho / Nhà xưởng',
  van_phong: 'Văn phòng',
  mat_bang: 'Mặt bằng / Cửa hàng',
  phong_tro: 'Phòng trọ',
  khac: 'Loại khác',
};

/** Tên ngắn dùng trong tiêu đề và tin đăng. */
export const PROPERTY_TYPE_SHORT: Record<PropertyType, string> = {
  nha_rieng: 'nhà riêng',
  nha_mat_pho: 'nhà mặt phố',
  can_ho: 'căn hộ',
  chung_cu_mini: 'chung cư mini',
  biet_thu: 'biệt thự',
  shophouse: 'shophouse',
  dat_tho_cu: 'đất thổ cư',
  dat_nen: 'đất nền',
  dat_nong_nghiep: 'đất vườn',
  condotel: 'condotel',
  kho_xuong: 'kho xưởng',
  van_phong: 'văn phòng',
  mat_bang: 'mặt bằng',
  phong_tro: 'phòng trọ',
  khac: 'bất động sản',
};

export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];

/** Đất: không có tầng, phòng ngủ, nội thất. */
export const LAND_TYPES: PropertyType[] = ['dat_tho_cu', 'dat_nen', 'dat_nong_nghiep'];
/** Căn hộ: diện tích chính là diện tích sử dụng, không có mặt tiền/hẻm. */
export const APARTMENT_TYPES: PropertyType[] = ['can_ho', 'chung_cu_mini', 'condotel'];
/** Các loại thường có mã căn / tòa / tầng. */
export const UNIT_TYPES: PropertyType[] = ['can_ho', 'chung_cu_mini', 'condotel', 'shophouse', 'van_phong', 'biet_thu'];

export const isLand = (t: PropertyType) => LAND_TYPES.includes(t);
export const isApartment = (t: PropertyType) => APARTMENT_TYPES.includes(t);

export const PROPERTY_STATUS: Record<PropertyStatus, LabelTone> = {
  dang_chao: { label: 'Đang chào', tone: 'emerald' },
  dam_phan: { label: 'Đang đàm phán', tone: 'amber' },
  da_coc: { label: 'Đã đặt cọc', tone: 'violet' },
  hoan_tat: { label: 'Đã giao dịch', tone: 'sky' },
  tam_ngung: { label: 'Tạm ngưng', tone: 'slate' },
};

export const PROPERTY_STATUSES = Object.keys(PROPERTY_STATUS) as PropertyStatus[];
/** Trạng thái còn có thể giới thiệu cho khách. */
export const ACTIVE_PROPERTY_STATUSES: PropertyStatus[] = ['dang_chao', 'dam_phan', 'da_coc'];

export function propertyStatusLabel(status: PropertyStatus, transaction: Transaction): string {
  if (status === 'hoan_tat') return transaction === 'ban' ? 'Đã bán' : 'Đã cho thuê';
  return PROPERTY_STATUS[status].label;
}

export const LEGAL_LABEL: Record<LegalStatus, string> = {
  so_rieng: 'Sổ hồng / Sổ đỏ riêng',
  so_chung: 'Sổ chung / Vi bằng',
  hdmb: 'Hợp đồng mua bán',
  dang_lam_so: 'Đang chờ ra sổ',
  giay_tay: 'Giấy tay',
  khac: 'Pháp lý khác',
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  dong: 'Đông',
  tay: 'Tây',
  nam: 'Nam',
  bac: 'Bắc',
  dong_bac: 'Đông Bắc',
  dong_nam: 'Đông Nam',
  tay_bac: 'Tây Bắc',
  tay_nam: 'Tây Nam',
};
export const DIRECTIONS = Object.keys(DIRECTION_LABEL) as Direction[];

export const FURNISHING_LABEL: Record<Furnishing, string> = {
  cao_cap: 'Nội thất cao cấp',
  day_du: 'Nội thất đầy đủ',
  co_ban: 'Nội thất cơ bản',
  khong: 'Không nội thất / Bàn giao thô',
};

export const FRONTAGE_LABEL: Record<Frontage, string> = {
  mat_tien: 'Mặt tiền đường',
  hem_oto: 'Hẻm / ngõ ô tô',
  hem_xe_may: 'Hẻm / ngõ xe máy',
  noi_bo: 'Đường nội bộ / KDC',
};

export const SELLER_RELATION_LABEL: Record<SellerRelation, string> = {
  chinh_chu: 'Chính chủ',
  nguoi_nha: 'Người nhà chủ',
  moi_gioi: 'Môi giới khác',
  khac: 'Khác',
};

export const BROKER_CONTRACT_LABEL: Record<BrokerContract, string> = {
  chua_ky: 'Chưa ký hợp đồng',
  thuong: 'HĐ môi giới thường',
  doc_quyen: 'HĐ độc quyền',
};

export const URGENCY: Record<Urgency, LabelTone> = {
  binh_thuong: { label: 'Bình thường', tone: 'slate' },
  can_ban: { label: 'Cần bán', tone: 'amber' },
  gap: { label: 'Rất gấp', tone: 'rose' },
};

export const CUSTOMER_STATUS: Record<CustomerStatus, LabelTone> = {
  moi: { label: 'Khách mới', tone: 'sky' },
  dang_tu_van: { label: 'Đang tư vấn', tone: 'blue' },
  da_xem: { label: 'Đã dẫn xem', tone: 'violet' },
  dam_phan: { label: 'Đang đàm phán', tone: 'amber' },
  da_chot: { label: 'Đã chốt', tone: 'emerald' },
  ngung: { label: 'Ngừng chăm sóc', tone: 'slate' },
};
export const CUSTOMER_STATUSES = Object.keys(CUSTOMER_STATUS) as CustomerStatus[];
/** Thứ tự trong phễu bán hàng, dùng để tự động nâng trạng thái. */
export const CUSTOMER_PIPELINE: CustomerStatus[] = ['moi', 'dang_tu_van', 'da_xem', 'dam_phan', 'da_chot'];
export const ACTIVE_CUSTOMER_STATUSES: CustomerStatus[] = ['moi', 'dang_tu_van', 'da_xem', 'dam_phan'];

export const TEMPERATURE: Record<Temperature, LabelTone> = {
  nong: { label: 'Nóng', tone: 'rose' },
  am: { label: 'Ấm', tone: 'amber' },
  lanh: { label: 'Lạnh', tone: 'sky' },
};
export const TEMPERATURES = Object.keys(TEMPERATURE) as Temperature[];

export const CUSTOMER_SOURCE_LABEL: Record<CustomerSource, string> = {
  facebook: 'Facebook',
  zalo: 'Zalo',
  tiktok: 'TikTok',
  tin_dang: 'Tin đăng / Website',
  gioi_thieu: 'Người quen giới thiệu',
  khach_cu: 'Khách cũ',
  van_phong: 'Khách vãng lai / Biển bảng',
  khac: 'Nguồn khác',
};

/** Nhãn / nhóm khách hay dùng. */
export const CUSTOMER_TAG_SUGGESTIONS = ['VIP', 'Nhà đầu tư', 'Mua để ở', 'Khách cũ', 'Khách giới thiệu', 'Cần vay ngân hàng', 'Việt kiều'];

export const PURPOSE_LABEL: Record<Purpose, string> = {
  o: 'Để ở',
  dau_tu: 'Đầu tư',
  kinh_doanh: 'Kinh doanh',
  cho_thue_lai: 'Mua cho thuê lại',
};

export const PAYMENT_LABEL: Record<Payment, string> = {
  tien_mat: 'Tiền mặt',
  vay_ngan_hang: 'Vay ngân hàng',
  ket_hop: 'Tiền mặt + vay',
};

export const INTEREST_STATUS: Record<InterestStatus, LabelTone> = {
  de_xuat: { label: 'Đề xuất', tone: 'slate' },
  da_gui: { label: 'Đã gửi thông tin', tone: 'sky' },
  da_xem: { label: 'Đã đi xem', tone: 'violet' },
  quan_tam: { label: 'Rất quan tâm', tone: 'emerald' },
  khong_hop: { label: 'Không phù hợp', tone: 'rose' },
};
export const INTEREST_STATUSES = Object.keys(INTEREST_STATUS) as InterestStatus[];

export const INTERACTION_KIND_LABEL: Record<InteractionKind, string> = {
  goi_dien: 'Gọi điện',
  nhan_tin: 'Nhắn tin Zalo/SMS',
  gui_email: 'Gửi email',
  gap_mat: 'Gặp mặt',
  dan_xem: 'Dẫn đi xem BĐS',
  gui_thong_tin: 'Gửi thông tin BĐS',
  dam_phan: 'Đàm phán giá',
  dat_coc: 'Đặt cọc',
  khac: 'Khác',
};

/**
 * 34 đơn vị hành chính cấp tỉnh từ 01/07/2025 (Nghị quyết 202/2025/QH15):
 * 6 thành phố trực thuộc trung ương trước, sau đó 28 tỉnh theo ABC.
 */
export const PROVINCES = [
  'TP. Hồ Chí Minh',
  'Hà Nội',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Huế',
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cao Bằng',
  'Đắk Lắk',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Tĩnh',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Tuyên Quang',
  'Vĩnh Long',
];

export const PROJECT_AMENITY_SUGGESTIONS = [
  'Hồ bơi',
  'Phòng gym',
  'Công viên nội khu',
  'Clubhouse',
  'Khu BBQ',
  'Sân chơi trẻ em',
  'Trường mầm non',
  'Trường liên cấp',
  'Siêu thị / TTTM',
  'Phòng khám',
  'Sân tennis / pickleball',
  'Sân bóng',
  'Đường dạo bộ',
  'Hầm để xe',
  'Bảo vệ 24/7',
  'Khu thương mại',
];

export const OWNERSHIP_SUGGESTIONS = ['Sở hữu lâu dài (sổ hồng)', 'Sở hữu 50 năm', 'Sổ đỏ từng nền', 'Hợp đồng mua bán'];
export const HANDOVER_STANDARD_SUGGESTIONS = ['Bàn giao thô', 'Hoàn thiện cơ bản', 'Hoàn thiện nội thất liền tường', 'Full nội thất'];

export const AMENITY_SUGGESTIONS = [
  'Gần chợ',
  'Gần trường học',
  'Gần bệnh viện',
  'Gần siêu thị / TTTM',
  'Gần công viên',
  'Khu dân trí cao',
  'An ninh tốt',
  'Không ngập nước',
  'Kinh doanh tốt',
  'Đang có dòng tiền thuê',
  'Chỗ để ô tô',
  'Thang máy',
  'Sân vườn',
  'Sân thượng',
  'Hồ bơi',
  'Phòng gym',
  'View sông / hồ',
  'View thành phố',
  'Hầm để xe',
  'Bảo vệ 24/7',
];
