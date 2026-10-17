import {
  BROKER_CONTRACT_LABEL,
  CUSTOMER_SOURCE_LABEL,
  CUSTOMER_STATUS,
  DEFAULT_MAP_COLORS,
  DIRECTION_LABEL,
  DOC_CATEGORY_LABEL,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  INTERACTION_KIND_LABEL,
  INTEREST_STATUS,
  INVENTORY_STATUS,
  LEGAL_LABEL,
  LEGAL_STATUS,
  PAYMENT_LABEL,
  PROJECT_STAGE,
  PROPERTY_STATUS,
  PROPERTY_TYPE_LABEL,
  PURPOSE_LABEL,
  SELLER_RELATION_LABEL,
  TEMPERATURE,
  TRANSACTION_LABEL,
  URGENCY,
} from '../constants';
import type {
  Customer,
  DocumentRef,
  FaqItem,
  Installment,
  Interaction,
  Interest,
  InventoryItem,
  LegalItem,
  MapCardFields,
  MapUnit,
  Milestone,
  MilestoneStatus,
  PaymentMethod,
  Project,
  ProjectMap,
  Promotion,
  PromotionKind,
  Property,
  SalesTerms,
  SellerInfo,
  Settings,
  UnitTypeRow,
} from '../types';
import { uid } from './id';

export function emptySeller(): SellerInfo {
  return {
    name: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    relation: 'chinh_chu',
    minPrice: undefined,
    commissionType: 'percent',
    commissionValue: undefined,
    contract: 'chua_ky',
    contractExpiry: '',
    urgency: 'binh_thuong',
    reason: '',
    notes: '',
  };
}

export function emptyProperty(defaults: Partial<Property> = {}): Property {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    title: '',
    transaction: 'ban',
    type: 'nha_rieng',
    status: 'dang_chao',
    featured: false,
    projectId: '',
    street: '',
    ward: '',
    area: '',
    province: '',
    unitCode: '',
    mapUrl: '',
    negotiable: true,
    description: '',
    amenities: [],
    images: [],
    documents: [],
    seller: emptySeller(),
    internalNotes: '',
    createdAt: now,
    updatedAt: now,
    ...defaults,
  };
}

export function emptyProject(defaults: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    legalName: '',
    stage: 'dang_mo_ban',
    productTypes: [],
    featured: false,
    developer: '',
    devPartner: '',
    contractor: '',
    designer: '',
    operator: '',
    distributor: '',
    address: '',
    ward: '',
    area: '',
    province: '',
    mapUrl: '',
    website: '',
    connectivity: '',
    amenities: [],
    nearby: [],
    scale: '',
    unitAreaRange: '',
    unitTypes: [],
    unitPrice: '',
    priceNote: '',
    paymentPlan: '',
    banks: '',
    salesPolicy: '',
    ownership: '',
    legalStatus: '',
    legalChecklist: [],
    startDate: '',
    handover: '',
    construction: '',
    handoverStandard: '',
    managementFee: '',
    parkingFee: '',
    description: '',
    highlights: '',
    cautions: '',
    competitors: '',
    marketInfo: '',
    faqs: [],
    images: [],
    documents: [],
    maps: [],
    inventory: [],
    sales: emptySales(),
    contacts: '',
    commission: '',
    infoSource: '',
    internalNotes: '',
    createdAt: now,
    updatedAt: now,
    ...defaults,
  };
}

export function emptyCustomer(defaults: Partial<Customer> = {}): Customer {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    occupation: '',
    source: 'facebook',
    status: 'moi',
    temperature: 'am',
    transaction: 'ban',
    propertyTypes: [],
    projectIds: [],
    province: '',
    locations: [],
    directions: [],
    requireLegal: false,
    requirements: '',
    interests: [],
    interactions: [],
    nextFollowUp: '',
    nextFollowUpNote: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...defaults,
  };
}

export function defaultSettings(): Settings {
  return {
    agentName: '',
    agentTitle: 'Chuyên viên tư vấn bất động sản',
    agentPhone: '',
    agentEmail: '',
    officeName: '',
    officeAddress: '',
    defaultProvince: '',
    privacyPin: '',
    lastBackupAt: '',
    mapColors: { ...DEFAULT_MAP_COLORS },
    mapCard: { ...DEFAULT_MAP_CARD },
    mapHidePrice: false,
  };
}

const DEFAULT_MAP_CARD: MapCardFields = { image: true, area: true, price: true, unitPrice: true, rooms: true, direction: true, note: true };

type Loose<T> = Partial<Record<keyof T, unknown>>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strings = (v: unknown): string[] => arr<unknown>(v).filter((a): a is string => typeof a === 'string');

/** Chỉ chấp nhận giá trị nằm trong danh mục, ngược lại dùng giá trị dự phòng. */
function oneOf<K extends string>(map: Record<K, unknown>, v: unknown, fallback: K): K;
function oneOf<K extends string>(map: Record<K, unknown>, v: unknown): K | undefined;
function oneOf<K extends string>(map: Record<K, unknown>, v: unknown, fallback?: K): K | undefined {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(map, v) ? (v as K) : fallback;
}
const listOf = <K extends string>(map: Record<K, unknown>, v: unknown): K[] =>
  arr<unknown>(v).filter((x): x is K => oneOf(map, x) !== undefined);

function normalizeDocument(raw: unknown, fallbackVisibility: 'public' | 'internal'): DocumentRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<DocumentRef>;
  if (typeof r.id !== 'string' || !r.id) return null;
  return {
    id: r.id,
    name: str(r.name, 'Tài liệu'),
    category: oneOf(DOC_CATEGORY_LABEL, r.category, 'khac'),
    visibility: r.visibility === 'public' || r.visibility === 'internal' ? r.visibility : fallbackVisibility,
    note: str(r.note),
    effectiveDate: str(r.effectiveDate),
    archived: r.archived === true,
    size: num(r.size) ?? 0,
    type: str(r.type, 'application/octet-stream'),
    createdAt: str(r.createdAt, new Date().toISOString()),
  };
}

const documents = (v: unknown, fallbackVisibility: 'public' | 'internal') =>
  arr<unknown>(v)
    .map((d) => normalizeDocument(d, fallbackVisibility))
    .filter((d): d is DocumentRef => d !== null);

/**
 * Đảm bảo bản ghi đọc từ IndexedDB / file sao lưu có đủ trường hợp lệ,
 * kể cả khi được tạo bởi phiên bản cũ hơn của ứng dụng.
 */
export function normalizeProperty(raw: unknown): Property | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Property>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const base = emptyProperty();
  const s = (r.seller && typeof r.seller === 'object' ? r.seller : {}) as Loose<SellerInfo>;
  const seller: SellerInfo = {
    name: str(s.name),
    phone: str(s.phone),
    phone2: str(s.phone2),
    email: str(s.email),
    address: str(s.address),
    relation: oneOf(SELLER_RELATION_LABEL, s.relation, 'chinh_chu'),
    minPrice: num(s.minPrice),
    commissionType: s.commissionType === 'amount' ? 'amount' : 'percent',
    commissionValue: num(s.commissionValue),
    contract: oneOf(BROKER_CONTRACT_LABEL, s.contract, 'chua_ky'),
    contractExpiry: str(s.contractExpiry),
    urgency: oneOf(URGENCY, s.urgency, 'binh_thuong'),
    reason: str(s.reason),
    notes: str(s.notes),
  };
  return {
    id: r.id,
    code: str(r.code),
    title: str(r.title),
    transaction: oneOf(TRANSACTION_LABEL, r.transaction, 'ban'),
    type: oneOf(PROPERTY_TYPE_LABEL, r.type, 'khac'),
    status: oneOf(PROPERTY_STATUS, r.status, 'dang_chao'),
    featured: r.featured === true,
    projectId: str(r.projectId),
    street: str(r.street),
    ward: str(r.ward),
    area: str(r.area),
    province: str(r.province),
    unitCode: str(r.unitCode),
    frontage: oneOf(FRONTAGE_LABEL, r.frontage),
    roadWidth: num(r.roadWidth),
    mapUrl: str(r.mapUrl),
    landArea: num(r.landArea),
    floorArea: num(r.floorArea),
    width: num(r.width),
    length: num(r.length),
    backWidth: num(r.backWidth),
    floors: num(r.floors),
    bedrooms: num(r.bedrooms),
    bathrooms: num(r.bathrooms),
    direction: oneOf(DIRECTION_LABEL, r.direction),
    balconyDirection: oneOf(DIRECTION_LABEL, r.balconyDirection),
    furnishing: oneOf(FURNISHING_LABEL, r.furnishing),
    yearBuilt: num(r.yearBuilt),
    legal: oneOf(LEGAL_LABEL, r.legal),
    price: num(r.price),
    negotiable: r.negotiable !== false,
    description: str(r.description),
    amenities: strings(r.amenities),
    images: strings(r.images),
    documents: documents(r.documents, 'internal'),
    seller,
    internalNotes: str(r.internalNotes),
    createdAt: str(r.createdAt, base.createdAt),
    updatedAt: str(r.updatedAt, base.updatedAt),
    closedAt: typeof r.closedAt === 'string' ? r.closedAt : undefined,
  };
}

function normalizeLegalItem(raw: unknown): LegalItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<LegalItem>;
  if (typeof r.key !== 'string' || !r.key) return null;
  return {
    key: r.key,
    label: str(r.label),
    status: oneOf(LEGAL_STATUS, r.status, 'chua_ro'),
    note: str(r.note),
    docId: typeof r.docId === 'string' && r.docId ? r.docId : undefined,
    custom: r.custom === true,
  };
}

function normalizeUnitType(raw: unknown): UnitTypeRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<UnitTypeRow>;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    name: str(r.name),
    area: str(r.area),
    price: str(r.price),
    quantity: str(r.quantity),
    note: str(r.note),
    imageId: typeof r.imageId === 'string' && r.imageId ? r.imageId : undefined,
  };
}

const num01 = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -0.5 && v <= 1.5;

function normalizeMapUnit(raw: unknown): MapUnit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<MapUnit>;
  const points = arr<unknown>(r.points);
  if (points.length < 6 || points.length % 2 !== 0 || !points.every(num01)) return null;
  return { id: typeof r.id === 'string' && r.id ? r.id : uid(), points: points as number[], label: str(r.label) };
}

function normalizeMap(raw: unknown): ProjectMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<ProjectMap>;
  if (typeof r.id !== 'string' || !r.id || typeof r.imageId !== 'string' || !r.imageId) return null;
  const f = (r.floors && typeof r.floors === 'object' ? r.floors : null) as Loose<NonNullable<ProjectMap['floors']>> | null;
  const from = num(f?.from);
  const to = num(f?.to);
  const rule = (r.codeRule && typeof r.codeRule === 'object' ? r.codeRule : {}) as Loose<ProjectMap['codeRule']>;
  const now = new Date().toISOString();
  return {
    id: r.id,
    name: str(r.name, 'Mặt bằng'),
    imageId: r.imageId,
    aspect: num(r.aspect) && (r.aspect as number) > 0 ? (r.aspect as number) : 1.5,
    floors:
      from !== undefined && to !== undefined && to >= from
        ? { from: Math.round(from), to: Math.round(to), skip: arr<unknown>(f?.skip).filter((x): x is number => typeof x === 'number') }
        : undefined,
    codeRule: { prefix: str(rule.prefix), sep: str(rule.sep, '-'), padFloor: rule.padFloor !== false },
    colorBy: r.colorBy === 'type' || r.colorBy === 'price' || r.colorBy === 'direction' ? r.colorBy : 'status',
    showLabels: r.showLabels !== false,
    units: listOfObjects(r.units, normalizeMapUnit),
    createdAt: str(r.createdAt, now),
    updatedAt: str(r.updatedAt, now),
  };
}

export function emptySales(): SalesTerms {
  return { methods: [], promotions: [], milestones: [], maintenancePct: 2, vatIncluded: true, compound: true };
}

const pctOf = (v: unknown, fallback = 0) => {
  const n = num(v);
  return n === undefined ? fallback : Math.min(100, Math.max(0, n));
};
const idOf = (v: unknown) => (typeof v === 'string' && v ? v : uid());
const dateOf = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function normalizeInstallment(raw: unknown): Installment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Installment>;
  return { id: idOf(r.id), label: str(r.label), pct: pctOf(r.pct), when: str(r.when), date: dateOf(r.date) };
}

function normalizePaymentMethod(raw: unknown): PaymentMethod | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<PaymentMethod>;
  return {
    id: idOf(r.id),
    name: str(r.name, 'Phương thức thanh toán'),
    discountPct: pctOf(r.discountPct),
    installments: listOfObjects(r.installments, normalizeInstallment),
    note: str(r.note),
  };
}

const PROMOTION_KINDS: Record<PromotionKind, true> = { pct: true, amount: true, gift: true };
const MILESTONE_STATUSES: Record<MilestoneStatus, true> = { done: true, doing: true, planned: true };

function normalizePromotion(raw: unknown): Promotion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Promotion>;
  const kind = oneOf(PROMOTION_KINDS, r.kind, 'pct');
  const value = Math.max(0, num(r.value) ?? 0);
  return {
    id: idOf(r.id),
    name: str(r.name, 'Ưu đãi'),
    kind,
    value: kind === 'pct' ? Math.min(100, value) : value,
    condition: str(r.condition),
    until: dateOf(r.until),
    auto: r.auto === true,
    internal: r.internal === true,
  };
}

function normalizeMilestone(raw: unknown): Milestone | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Milestone>;
  return { id: idOf(r.id), label: str(r.label), time: str(r.time), status: oneOf(MILESTONE_STATUSES, r.status, 'planned'), note: str(r.note) };
}

function normalizeSales(raw: unknown): SalesTerms {
  const base = emptySales();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Loose<SalesTerms>;
  const maintenance = num(r.maintenancePct);
  return {
    methods: listOfObjects(r.methods, normalizePaymentMethod),
    promotions: listOfObjects(r.promotions, normalizePromotion),
    milestones: listOfObjects(r.milestones, normalizeMilestone),
    maintenancePct: maintenance === undefined ? base.maintenancePct : Math.min(10, Math.max(0, maintenance)),
    vatIncluded: r.vatIncluded !== false,
    compound: r.compound !== false,
  };
}

function normalizeInventory(raw: unknown): InventoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<InventoryItem>;
  const code = str(r.code).trim();
  if (!code) return null;
  return {
    code,
    typeId: typeof r.typeId === 'string' && r.typeId ? r.typeId : undefined,
    area: num(r.area),
    price: num(r.price),
    status: oneOf(INVENTORY_STATUS, r.status, 'dang_ban'),
    direction: oneOf(DIRECTION_LABEL, r.direction),
    note: str(r.note),
    updatedAt: str(r.updatedAt, new Date().toISOString()),
  };
}

function normalizeFaq(raw: unknown): FaqItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<FaqItem>;
  if (typeof r.question !== 'string') return null;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    question: r.question,
    answer: str(r.answer),
    isPublic: r.isPublic === true,
  };
}

const listOfObjects = <T>(v: unknown, fn: (x: unknown) => T | null): T[] =>
  arr<unknown>(v)
    .map(fn)
    .filter((x): x is T => x !== null);

export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Project>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const base = emptyProject();
  return {
    id: r.id,
    code: str(r.code),
    name: str(r.name),
    legalName: str(r.legalName),
    stage: oneOf(PROJECT_STAGE, r.stage, 'dang_mo_ban'),
    productTypes: listOf(PROPERTY_TYPE_LABEL, r.productTypes),
    featured: r.featured === true,
    developer: str(r.developer),
    devPartner: str(r.devPartner),
    contractor: str(r.contractor),
    designer: str(r.designer),
    operator: str(r.operator),
    distributor: str(r.distributor),
    address: str(r.address),
    ward: str(r.ward),
    area: str(r.area),
    province: str(r.province),
    mapUrl: str(r.mapUrl),
    website: str(r.website),
    connectivity: str(r.connectivity),
    amenities: strings(r.amenities),
    nearby: strings(r.nearby),
    siteArea: num(r.siteArea),
    density: num(r.density),
    scale: str(r.scale),
    totalUnits: num(r.totalUnits),
    unitAreaRange: str(r.unitAreaRange),
    unitTypes: listOfObjects(r.unitTypes, normalizeUnitType),
    priceFrom: num(r.priceFrom),
    priceTo: num(r.priceTo),
    unitPrice: str(r.unitPrice),
    priceNote: str(r.priceNote),
    paymentPlan: str(r.paymentPlan),
    banks: str(r.banks),
    salesPolicy: str(r.salesPolicy),
    ownership: str(r.ownership),
    legalStatus: str(r.legalStatus),
    legalChecklist: listOfObjects(r.legalChecklist, normalizeLegalItem),
    startDate: str(r.startDate),
    handover: str(r.handover),
    construction: str(r.construction),
    handoverStandard: str(r.handoverStandard),
    managementFee: str(r.managementFee),
    parkingFee: str(r.parkingFee),
    description: str(r.description),
    highlights: str(r.highlights),
    cautions: str(r.cautions),
    competitors: str(r.competitors),
    marketInfo: str(r.marketInfo),
    faqs: listOfObjects(r.faqs, normalizeFaq),
    images: strings(r.images),
    documents: documents(r.documents, 'public'),
    maps: listOfObjects(r.maps, normalizeMap),
    inventory: listOfObjects(r.inventory, normalizeInventory),
    sales: normalizeSales(r.sales),
    contacts: str(r.contacts),
    commission: str(r.commission),
    infoSource: str(r.infoSource),
    internalNotes: str(r.internalNotes),
    createdAt: str(r.createdAt, base.createdAt),
    updatedAt: str(r.updatedAt, base.updatedAt),
  };
}

function normalizeInterest(raw: unknown): Interest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Interest>;
  if (typeof r.propertyId !== 'string') return null;
  return {
    propertyId: r.propertyId,
    status: oneOf(INTEREST_STATUS, r.status, 'de_xuat'),
    note: str(r.note),
    updatedAt: str(r.updatedAt, new Date().toISOString()),
  };
}

function normalizeInteraction(raw: unknown): Interaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Interaction>;
  if (typeof r.id !== 'string' || typeof r.at !== 'string') return null;
  return {
    id: r.id,
    at: r.at,
    kind: oneOf(INTERACTION_KIND_LABEL, r.kind, 'khac'),
    content: str(r.content),
    propertyId: typeof r.propertyId === 'string' && r.propertyId ? r.propertyId : undefined,
  };
}

export function normalizeCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Loose<Customer>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const base = emptyCustomer();
  return {
    id: r.id,
    code: str(r.code),
    name: str(r.name),
    phone: str(r.phone),
    phone2: str(r.phone2),
    email: str(r.email),
    address: str(r.address),
    occupation: str(r.occupation),
    birthYear: num(r.birthYear),
    source: oneOf(CUSTOMER_SOURCE_LABEL, r.source, 'khac'),
    status: oneOf(CUSTOMER_STATUS, r.status, 'moi'),
    temperature: oneOf(TEMPERATURE, r.temperature, 'am'),
    transaction: oneOf(TRANSACTION_LABEL, r.transaction, 'ban'),
    propertyTypes: listOf(PROPERTY_TYPE_LABEL, r.propertyTypes),
    projectIds: strings(r.projectIds),
    province: str(r.province),
    locations: strings(r.locations),
    budgetMin: num(r.budgetMin),
    budgetMax: num(r.budgetMax),
    areaMin: num(r.areaMin),
    areaMax: num(r.areaMax),
    bedroomsMin: num(r.bedroomsMin),
    directions: listOf(DIRECTION_LABEL, r.directions),
    requireLegal: r.requireLegal === true,
    purpose: oneOf(PURPOSE_LABEL, r.purpose),
    payment: oneOf(PAYMENT_LABEL, r.payment),
    requirements: str(r.requirements),
    interests: arr<unknown>(r.interests)
      .map(normalizeInterest)
      .filter((x): x is Interest => x !== null),
    interactions: arr<unknown>(r.interactions)
      .map(normalizeInteraction)
      .filter((x): x is Interaction => x !== null),
    nextFollowUp: str(r.nextFollowUp),
    nextFollowUpNote: str(r.nextFollowUpNote),
    notes: str(r.notes),
    createdAt: str(r.createdAt, base.createdAt),
    updatedAt: str(r.updatedAt, base.updatedAt),
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Loose<Settings>;
  return {
    agentName: str(r.agentName, base.agentName),
    agentTitle: str(r.agentTitle, base.agentTitle),
    agentPhone: str(r.agentPhone),
    agentEmail: str(r.agentEmail),
    officeName: str(r.officeName),
    officeAddress: str(r.officeAddress),
    defaultProvince: str(r.defaultProvince),
    privacyPin: str(r.privacyPin),
    lastBackupAt: str(r.lastBackupAt),
    mapColors: Object.fromEntries(
      Object.entries(base.mapColors).map(([k, v]) => {
        const c = (r.mapColors as Record<string, unknown> | undefined)?.[k];
        return [k, typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : v];
      }),
    ) as Settings['mapColors'],
    mapCard: Object.fromEntries(
      Object.entries(base.mapCard).map(([k, v]) => {
        const c = (r.mapCard as Record<string, unknown> | undefined)?.[k];
        return [k, typeof c === 'boolean' ? c : v];
      }),
    ) as unknown as MapCardFields,
    mapHidePrice: r.mapHidePrice === true,
  };
}
