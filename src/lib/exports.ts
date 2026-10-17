import {
  BROKER_CONTRACT_LABEL,
  CUSTOMER_SOURCE_LABEL,
  CUSTOMER_STATUS,
  CUSTOMER_TRANSACTION_LABEL,
  DIRECTION_LABEL,
  DOC_CATEGORY,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  LEGAL_LABEL,
  PAYMENT_LABEL,
  PROJECT_STAGE,
  PROPERTY_TYPE_LABEL,
  PURPOSE_LABEL,
  SELLER_RELATION_LABEL,
  TEMPERATURE,
  TRANSACTION_LABEL,
  URGENCY,
  VISIBILITY,
  propertyStatusLabel,
} from '../constants';
import type { Customer, Project, Property } from '../types';
import { formatDate } from './format';
import { formatAddress, formatProjectAddress } from './listing';
import { formatBirthday, lastContactAt } from './messages';
import { mainArea } from './match';
import { formatBytes } from './media';
import type { Sheet } from './xlsx';

export function projectsSheet(projects: Project[]): Sheet {
  return {
    name: 'Dự án',
    columns: [
      { header: 'Mã', width: 10 },
      { header: 'Tên dự án', width: 32 },
      { header: 'Chủ đầu tư', width: 26 },
      { header: 'Tình trạng', width: 16 },
      { header: 'Loại hình', width: 28 },
      { header: 'Địa chỉ', width: 40 },
      { header: 'Tỉnh/TP', width: 18 },
      { header: 'Quy mô', width: 28 },
      { header: 'Giá từ (đ)', width: 16, money: true },
      { header: 'Giá đến (đ)', width: 16, money: true },
      { header: 'Bàn giao', width: 16 },
      { header: 'Sở hữu', width: 18 },
      { header: 'Số tài liệu', width: 12 },
      { header: 'Số ảnh', width: 10 },
      { header: 'Cập nhật', width: 12 },
    ],
    rows: projects.map((p) => [
      p.code,
      p.name,
      p.developer,
      PROJECT_STAGE[p.stage].label,
      p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', '),
      formatProjectAddress(p),
      p.province,
      p.scale,
      p.priceFrom,
      p.priceTo,
      p.handover,
      p.ownership,
      p.documents.length,
      p.images.length,
      formatDate(p.updatedAt),
    ]),
  };
}

export function propertiesSheet(properties: Property[], projectById: Map<string, Project>, includeInternal = true): Sheet {
  const base: Sheet['columns'] = [
    { header: 'Mã', width: 11 },
    { header: 'Tiêu đề', width: 40 },
    { header: 'Nhu cầu', width: 10 },
    { header: 'Loại hình', width: 22 },
    { header: 'Trạng thái', width: 14 },
    { header: 'Dự án', width: 24 },
    { header: 'Mã căn', width: 12 },
    { header: 'Địa chỉ', width: 44 },
    { header: 'Tỉnh/TP', width: 18 },
    { header: 'Vị trí', width: 18 },
    { header: 'Diện tích (m²)', width: 14 },
    { header: 'DT sử dụng (m²)', width: 15 },
    { header: 'Ngang (m)', width: 10 },
    { header: 'Dài (m)', width: 10 },
    { header: 'Số tầng', width: 9 },
    { header: 'Phòng ngủ', width: 10 },
    { header: 'WC', width: 7 },
    { header: 'Hướng', width: 11 },
    { header: 'Pháp lý', width: 22 },
    { header: 'Nội thất', width: 22 },
    { header: 'Giá (đ)', width: 17, money: true },
    { header: 'Giá/m² (đ)', width: 15, money: true },
    { header: 'Thương lượng', width: 12 },
    { header: 'Tiện ích', width: 30 },
    { header: 'Mô tả', width: 50 },
  ];
  const internal: Sheet['columns'] = [
    { header: 'Chủ nhà', width: 20 },
    { header: 'SĐT chủ nhà', width: 15 },
    { header: 'SĐT 2', width: 15 },
    { header: 'Quan hệ', width: 14 },
    { header: 'Giá chốt tối thiểu (đ)', width: 19, money: true },
    { header: 'Hoa hồng', width: 14 },
    { header: 'Hợp đồng MG', width: 18 },
    { header: 'Hết hạn HĐ', width: 12 },
    { header: 'Mức độ gấp', width: 12 },
    { header: 'Lý do bán', width: 24 },
    { header: 'Ghi chú nội bộ', width: 40 },
  ];
  return {
    name: 'Giỏ hàng BĐS',
    columns: includeInternal ? [...base, ...internal, { header: 'Cập nhật', width: 12 }] : [...base, { header: 'Cập nhật', width: 12 }],
    rows: properties.map((p) => {
      const area = mainArea(p);
      const row = [
        p.code,
        p.title,
        TRANSACTION_LABEL[p.transaction],
        PROPERTY_TYPE_LABEL[p.type],
        propertyStatusLabel(p.status, p.transaction),
        projectById.get(p.projectId)?.name ?? '',
        p.unitCode,
        formatAddress(p, { hideNumber: !includeInternal }),
        p.province,
        p.frontage ? FRONTAGE_LABEL[p.frontage] : '',
        p.landArea,
        p.floorArea,
        p.width,
        p.length,
        p.floors,
        p.bedrooms,
        p.bathrooms,
        p.direction ? DIRECTION_LABEL[p.direction] : '',
        p.legal ? LEGAL_LABEL[p.legal] : '',
        p.furnishing ? FURNISHING_LABEL[p.furnishing] : '',
        p.price,
        p.price && area && p.transaction === 'ban' ? Math.round(p.price / area) : undefined,
        p.negotiable ? 'Có' : 'Không',
        p.amenities.join(', '),
        p.description,
      ];
      if (includeInternal) {
        const s = p.seller;
        row.push(
          s.name,
          s.phone,
          s.phone2,
          SELLER_RELATION_LABEL[s.relation],
          s.minPrice,
          s.commissionValue ? (s.commissionType === 'percent' ? `${s.commissionValue}%` : s.commissionValue.toLocaleString('vi-VN')) : '',
          BROKER_CONTRACT_LABEL[s.contract],
          formatDate(s.contractExpiry),
          URGENCY[s.urgency].label,
          s.reason,
          [s.notes, p.internalNotes].filter(Boolean).join('\n'),
        );
      }
      row.push(formatDate(p.updatedAt));
      return row;
    }),
  };
}

export function customersSheet(customers: Customer[], projectById: Map<string, Project>): Sheet {
  return {
    name: 'Khách hàng',
    columns: [
      { header: 'Mã', width: 10 },
      { header: 'Họ tên', width: 24 },
      { header: 'SĐT', width: 14 },
      { header: 'SĐT 2', width: 14 },
      { header: 'Email', width: 24 },
      { header: 'Sinh nhật', width: 11 },
      { header: 'Nguồn', width: 18 },
      { header: 'Trạng thái', width: 16 },
      { header: 'Mức độ', width: 9 },
      { header: 'Nhãn', width: 22 },
      { header: 'Nhu cầu', width: 9 },
      { header: 'Loại hình', width: 30 },
      { header: 'Dự án quan tâm', width: 28 },
      { header: 'Tỉnh/TP', width: 18 },
      { header: 'Khu vực', width: 26 },
      { header: 'Ngân sách từ (đ)', width: 16, money: true },
      { header: 'Ngân sách đến (đ)', width: 16, money: true },
      { header: 'DT từ (m²)', width: 10 },
      { header: 'DT đến (m²)', width: 10 },
      { header: 'PN tối thiểu', width: 11 },
      { header: 'Hướng', width: 20 },
      { header: 'Mục đích', width: 14 },
      { header: 'Thanh toán', width: 14 },
      { header: 'Yêu cầu khác', width: 34 },
      { header: 'Hẹn chăm sóc', width: 13 },
      { header: 'Nội dung hẹn', width: 28 },
      { header: 'Số lần chăm sóc', width: 14 },
      { header: 'Liên hệ gần nhất', width: 14 },
      { header: 'Ghi chú', width: 34 },
      { header: 'Ngày tạo', width: 12 },
    ],
    rows: customers.map((c) => [
      c.code,
      c.name,
      c.phone,
      c.phone2,
      c.email,
      formatBirthday(c.birthday, c.birthYear) || (c.birthYear ? String(c.birthYear) : ''),
      CUSTOMER_SOURCE_LABEL[c.source],
      CUSTOMER_STATUS[c.status].label,
      TEMPERATURE[c.temperature].label,
      c.tags.join(', '),
      CUSTOMER_TRANSACTION_LABEL[c.transaction],
      c.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', '),
      c.projectIds.map((id) => projectById.get(id)?.name).filter(Boolean).join(', '),
      c.province,
      c.locations.join(', '),
      c.budgetMin,
      c.budgetMax,
      c.areaMin,
      c.areaMax,
      c.bedroomsMin,
      c.directions.map((d) => DIRECTION_LABEL[d]).join(', '),
      c.purpose ? PURPOSE_LABEL[c.purpose] : '',
      c.payment ? PAYMENT_LABEL[c.payment] : '',
      c.requirements,
      formatDate(c.nextFollowUp),
      c.nextFollowUpNote,
      c.interactions.length,
      formatDate(lastContactAt(c)),
      c.notes,
      formatDate(c.createdAt),
    ]),
  };
}

export function documentsSheet(projects: Project[], properties: Property[]): Sheet {
  const rows: Sheet['rows'] = [];
  for (const p of projects) {
    for (const d of p.documents) {
      rows.push([p.name, DOC_CATEGORY[d.category].label, d.name, VISIBILITY[d.visibility].label, d.archived ? 'Hết hiệu lực' : 'Còn hiệu lực', formatDate(d.effectiveDate), formatBytes(d.size), d.note, formatDate(d.createdAt)]);
    }
  }
  for (const p of properties) {
    for (const d of p.documents) {
      rows.push([`${p.code} ${p.title}`.trim(), DOC_CATEGORY[d.category].label, d.name, VISIBILITY[d.visibility].label, d.archived ? 'Hết hiệu lực' : 'Còn hiệu lực', formatDate(d.effectiveDate), formatBytes(d.size), d.note, formatDate(d.createdAt)]);
    }
  }
  return {
    name: 'Tài liệu',
    columns: [
      { header: 'Thuộc', width: 32 },
      { header: 'Nhóm', width: 22 },
      { header: 'Tên tài liệu', width: 44 },
      { header: 'Quyền xem', width: 14 },
      { header: 'Hiệu lực', width: 13 },
      { header: 'Ngày áp dụng', width: 13 },
      { header: 'Dung lượng', width: 11 },
      { header: 'Ghi chú', width: 30 },
      { header: 'Ngày tải lên', width: 13 },
    ],
    rows,
  };
}
