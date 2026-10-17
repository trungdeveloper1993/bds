/** Nhu cầu giao dịch. Với BĐS: Bán / Cho thuê. Với khách: Mua / Thuê. */
export type Transaction = 'ban' | 'cho_thue';

export type DocCategory =
  | 'phap_ly'
  | 'bang_gia'
  | 'chinh_sach'
  | 'thanh_toan'
  | 'mat_bang'
  | 'vat_lieu'
  | 'brochure'
  | 'hop_dong'
  | 'tien_do'
  | 'hinh_anh'
  | 'dao_tao'
  | 'khac';

/** Tài liệu gửi được cho khách, hay chỉ dùng nội bộ. */
export type Visibility = 'public' | 'internal';

/** Một file tài liệu đính kèm (nội dung file lưu riêng trong kho 'files'). */
export interface DocumentRef {
  id: string;
  name: string;
  category: DocCategory;
  visibility: Visibility;
  note: string;
  /** Ngày ban hành / áp dụng, YYYY-MM-DD ('' nếu không rõ) — vd bảng giá đợt mới. */
  effectiveDate: string;
  /** Đã hết hiệu lực (bảng giá cũ, chính sách cũ) — vẫn giữ để tra cứu. */
  archived: boolean;
  /** Dung lượng (byte). */
  size: number;
  /** MIME type, ví dụ application/pdf. */
  type: string;
  createdAt: string;
}

export type ProjectStage = 'sap_mo_ban' | 'dang_mo_ban' | 'dang_xay_dung' | 'da_ban_giao' | 'tam_dung';

/** chua_ro = chưa kiểm tra. */
export type LegalItemStatus = 'co' | 'dang_lam' | 'chua' | 'khong_ap_dung' | 'chua_ro';

/** Một hạng mục trong checklist hồ sơ pháp lý dự án. */
export interface LegalItem {
  /** Khoá của hạng mục chuẩn, hoặc id ngẫu nhiên cho hạng mục tự thêm. */
  key: string;
  label: string;
  status: LegalItemStatus;
  /** Số / ngày văn bản, cơ quan cấp, ghi chú. */
  note: string;
  /** Tài liệu đính kèm trong dự án (nếu có). */
  docId?: string;
  custom?: boolean;
}

/** Một dòng trong bảng loại sản phẩm của dự án (vd căn 2PN). */
export interface UnitTypeRow {
  id: string;
  name: string;
  area: string;
  price: string;
  quantity: string;
  note: string;
  /** Hình mẫu (layout) dùng chung cho các căn thuộc loại này. */
  imageId?: string;
}

/** Trạng thái một căn trong bảng hàng của dự án (theo CĐT / đại lý F1). */
export type InventoryStatus = 'dang_ban' | 'giu_cho' | 'da_coc' | 'da_ban' | 'chua_mo';

/** Một căn / lô trong bảng hàng của dự án — tra theo mã căn. */
export interface InventoryItem {
  /** Mã căn, vd "A-12-05", "L-12". */
  code: string;
  /** Loại căn (UnitTypeRow.id) — lấy hình mẫu, số phòng ngủ. */
  typeId?: string;
  area?: number;
  price?: number;
  status: InventoryStatus;
  direction?: Direction;
  /** View, căn góc, ghi chú… (hiện cả khi khách xem). */
  note: string;
  updatedAt: string;
}

/** Một ô (căn / lô) khoanh trên bản đồ. Toạ độ theo tỉ lệ 0–1 của ảnh: [x1, y1, x2, y2, …]. */
export interface MapUnit {
  id: string;
  points: number[];
  /** Số căn trên mặt bằng tầng ("05") hoặc mã đầy đủ ("L-12"). */
  label: string;
}

/** Mã căn của mặt bằng tầng điển hình = tiền tố + tầng + dấu nối + số căn (vd "A-12-05"). */
export interface CodeRule {
  prefix: string;
  sep: string;
  /** Tầng luôn 2 chữ số: 05 thay vì 5. */
  padFloor: boolean;
}

export type MapColorBy = 'status' | 'type' | 'price' | 'direction';

/** Bản đồ tương tác của dự án: mặt bằng tầng, sơ đồ phân lô, phối cảnh 3D… */
export interface ProjectMap {
  id: string;
  name: string;
  /** Ảnh nền (kho ảnh). */
  imageId: string;
  /** Tỉ lệ rộng / cao của ảnh — giữ đúng vị trí các ô khi thay ảnh mới. */
  aspect: number;
  /** Mặt bằng tầng điển hình dùng chung cho nhiều tầng (chung cư). */
  floors?: { from: number; to: number; skip: number[] };
  codeRule: CodeRule;
  colorBy: MapColorBy;
  showLabels: boolean;
  units: MapUnit[];
  createdAt: string;
  updatedAt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Câu trả lời dùng được cả khi đưa máy cho khách xem. */
  isPublic: boolean;
}

export interface Project {
  id: string;
  /** Mã hiển thị, ví dụ DA-0003. */
  code: string;
  /** Tên thương mại. */
  name: string;
  /** Tên pháp lý / tên gọi khác / phân khu. */
  legalName: string;
  stage: ProjectStage;
  productTypes: PropertyType[];
  featured: boolean;

  // Chủ đầu tư & đối tác
  developer: string;
  devPartner: string;
  contractor: string;
  designer: string;
  operator: string;
  distributor: string;

  // Vị trí & kết nối
  address: string;
  ward: string;
  /** Địa chỉ cũ / khu vực quen gọi (trước sáp nhập 07/2025). */
  area: string;
  province: string;
  mapUrl: string;
  website: string;
  connectivity: string;
  /** Tiện ích nội khu. */
  amenities: string[];
  /** Tiện ích ngoại khu (kèm khoảng cách). */
  nearby: string[];

  // Quy mô & sản phẩm
  /** Tổng diện tích đất (ha). */
  siteArea?: number;
  /** Mật độ xây dựng (%). */
  density?: number;
  /** Số tòa / tầng / hầm. */
  scale: string;
  totalUnits?: number;
  /** Diện tích sản phẩm, vd "45 – 120 m²". */
  unitAreaRange: string;
  unitTypes: UnitTypeRow[];

  // Giá & thanh toán
  priceFrom?: number;
  priceTo?: number;
  /** Đơn giá, vd "55 – 65 triệu/m² thông thủy". */
  unitPrice: string;
  /** Giá đã gồm VAT? kinh phí bảo trì? */
  priceNote: string;
  paymentPlan: string;
  /** Ngân hàng bảo lãnh / cho vay, % vay, hỗ trợ lãi suất. */
  banks: string;
  salesPolicy: string;

  // Pháp lý & tiến độ
  /** Hình thức sở hữu, ví dụ "Sổ hồng lâu dài". */
  ownership: string;
  legalStatus: string;
  legalChecklist: LegalItem[];
  startDate: string;
  /** Thời gian bàn giao, ví dụ "Quý IV/2026". */
  handover: string;
  /** Tiến độ hiện tại, ví dụ "Đã cất nóc tòa A". */
  construction: string;
  handoverStandard: string;
  managementFee: string;
  parkingFee: string;

  // Tư vấn
  description: string;
  /** Điểm mạnh / lý do nên mua (gửi khách được). */
  highlights: string;
  /** Điểm cần lưu ý khi tư vấn — nội bộ. */
  cautions: string;
  /** So sánh dự án cạnh tranh — nội bộ. */
  competitors: string;
  /** Giá thứ cấp, giá thuê, tỷ suất cho thuê — nội bộ. */
  marketInfo: string;
  faqs: FaqItem[];

  images: string[];
  documents: DocumentRef[];
  /** Bản đồ tương tác (mặt bằng, sơ đồ phân lô). */
  maps: ProjectMap[];
  /** Bảng hàng: toàn bộ căn của dự án theo mã căn (giá, diện tích, trạng thái). */
  inventory: InventoryItem[];

  // Nội bộ
  /** Danh bạ đầu mối (admin CĐT/F1, ngân hàng). */
  contacts: string;
  commission: string;
  infoSource: string;
  internalNotes: string;

  createdAt: string;
  updatedAt: string;
}

export type PropertyType =
  | 'nha_rieng'
  | 'nha_mat_pho'
  | 'can_ho'
  | 'chung_cu_mini'
  | 'biet_thu'
  | 'shophouse'
  | 'dat_tho_cu'
  | 'dat_nen'
  | 'dat_nong_nghiep'
  | 'condotel'
  | 'kho_xuong'
  | 'van_phong'
  | 'mat_bang'
  | 'phong_tro'
  | 'khac';

export type PropertyStatus = 'dang_chao' | 'dam_phan' | 'da_coc' | 'hoan_tat' | 'tam_ngung';
export type LegalStatus = 'so_rieng' | 'so_chung' | 'hdmb' | 'dang_lam_so' | 'giay_tay' | 'khac';
export type Direction =
  | 'dong'
  | 'tay'
  | 'nam'
  | 'bac'
  | 'dong_bac'
  | 'dong_nam'
  | 'tay_bac'
  | 'tay_nam';
export type Furnishing = 'cao_cap' | 'day_du' | 'co_ban' | 'khong';
export type Frontage = 'mat_tien' | 'hem_oto' | 'hem_xe_may' | 'noi_bo';

export type SellerRelation = 'chinh_chu' | 'nguoi_nha' | 'moi_gioi' | 'khac';
export type BrokerContract = 'chua_ky' | 'thuong' | 'doc_quyen';
export type Urgency = 'binh_thuong' | 'can_ban' | 'gap';
export type CommissionType = 'percent' | 'amount';

/** Thông tin chủ nhà / người bán — NỘI BỘ, không bao giờ hiển thị cho khách. */
export interface SellerInfo {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  relation: SellerRelation;
  /** Giá chốt thấp nhất chủ nhà chấp nhận (VND). */
  minPrice?: number;
  commissionType: CommissionType;
  /** Phần trăm (vd 1.5) hoặc số tiền VND tuỳ commissionType. */
  commissionValue?: number;
  contract: BrokerContract;
  /** Ngày hết hạn hợp đồng môi giới, dạng YYYY-MM-DD ('' nếu không có). */
  contractExpiry: string;
  urgency: Urgency;
  reason: string;
  notes: string;
}

export interface Property {
  id: string;
  /** Mã hiển thị, ví dụ BDS-0012. */
  code: string;
  title: string;
  transaction: Transaction;
  type: PropertyType;
  status: PropertyStatus;
  featured: boolean;

  /** Dự án chứa BĐS này ('' nếu là BĐS lẻ). */
  projectId: string;

  // Vị trí
  street: string;
  ward: string;
  /** Khu vực / quận-huyện cũ — thị trường vẫn quen gọi theo tên cũ. */
  area: string;
  province: string;
  unitCode: string;
  frontage?: Frontage;
  roadWidth?: number;
  mapUrl: string;

  // Diện tích
  landArea?: number;
  floorArea?: number;
  width?: number;
  length?: number;
  backWidth?: number;

  // Kết cấu
  floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  direction?: Direction;
  balconyDirection?: Direction;
  furnishing?: Furnishing;
  yearBuilt?: number;
  legal?: LegalStatus;

  // Giá (VND). Với cho thuê: VND / tháng. Để trống = thoả thuận.
  price?: number;
  negotiable: boolean;

  description: string;
  amenities: string[];
  /** Danh sách id ảnh (lưu trong IndexedDB), ảnh đầu tiên là ảnh bìa. */
  images: string[];
  /** Giấy tờ của căn: sổ, hợp đồng... (mặc định nội bộ). */
  documents: DocumentRef[];

  seller: SellerInfo;
  internalNotes: string;

  createdAt: string;
  updatedAt: string;
  /** Thời điểm chuyển sang "Đã bán / Đã cho thuê". */
  closedAt?: string;
}

export type CustomerStatus = 'moi' | 'dang_tu_van' | 'da_xem' | 'dam_phan' | 'da_chot' | 'ngung';
export type Temperature = 'nong' | 'am' | 'lanh';
export type Purpose = 'o' | 'dau_tu' | 'kinh_doanh' | 'cho_thue_lai';
export type Payment = 'tien_mat' | 'vay_ngan_hang' | 'ket_hop';
export type CustomerSource =
  | 'facebook'
  | 'zalo'
  | 'tiktok'
  | 'tin_dang'
  | 'gioi_thieu'
  | 'khach_cu'
  | 'van_phong'
  | 'khac';
export type InterestStatus = 'de_xuat' | 'da_gui' | 'da_xem' | 'quan_tam' | 'khong_hop';
export type InteractionKind =
  | 'goi_dien'
  | 'nhan_tin'
  | 'gap_mat'
  | 'dan_xem'
  | 'gui_thong_tin'
  | 'dam_phan'
  | 'dat_coc'
  | 'khac';

/** Một BĐS đã giới thiệu cho khách và phản hồi của khách. */
export interface Interest {
  propertyId: string;
  status: InterestStatus;
  note: string;
  updatedAt: string;
}

/** Một lần chăm sóc khách: gọi điện, dẫn xem nhà... */
export interface Interaction {
  id: string;
  /** ISO datetime. */
  at: string;
  kind: InteractionKind;
  content: string;
  propertyId?: string;
}

export interface Customer {
  id: string;
  /** Mã hiển thị, ví dụ KH-0007. */
  code: string;
  name: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  occupation: string;
  birthYear?: number;
  source: CustomerSource;
  status: CustomerStatus;
  temperature: Temperature;

  // Nhu cầu
  transaction: Transaction;
  propertyTypes: PropertyType[];
  /** Dự án khách quan tâm. */
  projectIds: string[];
  province: string;
  /** Từ khoá khu vực / tuyến đường / dự án quan tâm. */
  locations: string[];
  budgetMin?: number;
  budgetMax?: number;
  areaMin?: number;
  areaMax?: number;
  bedroomsMin?: number;
  directions: Direction[];
  /** Chỉ nhận BĐS có sổ riêng. */
  requireLegal: boolean;
  purpose?: Purpose;
  payment?: Payment;
  requirements: string;

  interests: Interest[];
  interactions: Interaction[];
  /** Ngày hẹn chăm sóc tiếp, YYYY-MM-DD ('' nếu chưa hẹn). */
  nextFollowUp: string;
  nextFollowUpNote: string;
  notes: string;

  createdAt: string;
  updatedAt: string;
}

/** Thông tin cá nhân hoá của môi giới, dùng trên phiếu tư vấn và tin đăng. */
export interface Settings {
  agentName: string;
  agentTitle: string;
  agentPhone: string;
  agentEmail: string;
  officeName: string;
  officeAddress: string;
  defaultProvince: string;
  /** Mã PIN để thoát "Chế độ khách xem" ('' = không cần PIN). */
  privacyPin: string;
  lastBackupAt: string;
  /** Màu từng trạng thái trên bản đồ mặt bằng (mã màu #rrggbb). */
  mapColors: Record<InventoryStatus, string>;
  /** Thông tin hiện trên thẻ chi tiết khi chạm vào một căn trên bản đồ. */
  mapCard: MapCardFields;
  /** Ẩn giá trên bản đồ (hiện "Liên hệ"). */
  mapHidePrice: boolean;
}

export interface MapCardFields {
  image: boolean;
  area: boolean;
  price: boolean;
  unitPrice: boolean;
  rooms: boolean;
  direction: boolean;
  note: boolean;
}
