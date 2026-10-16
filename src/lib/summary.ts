import { CUSTOMER_TRANSACTION_LABEL, PROPERTY_TYPE_SHORT } from '../constants';
import type { Customer, Project, Property } from '../types';
import { formatAreaRange, formatBudget, formatMoney } from './format';

/** "Mua căn hộ, nhà riêng · 3 – 5 tỷ · Vinhomes Grand Park, Quận 9" */
export function needsSummary(c: Customer, projectById?: Map<string, Project>): string {
  const parts: string[] = [];
  const types = c.propertyTypes.slice(0, 3).map((t) => PROPERTY_TYPE_SHORT[t]);
  parts.push(`${CUSTOMER_TRANSACTION_LABEL[c.transaction]} ${types.length ? types.join(', ') : 'BĐS'}`);
  const budget = formatBudget(c.budgetMin, c.budgetMax);
  if (budget) parts.push(budget);
  const area = formatAreaRange(c.areaMin, c.areaMax);
  if (area) parts.push(area);
  const places = [
    ...c.projectIds.map((id) => projectById?.get(id)?.name).filter((x): x is string => !!x),
    ...c.locations,
  ];
  if (places.length) parts.push(places.slice(0, 3).join(', '));
  else if (c.province) parts.push(c.province);
  return parts.join(' · ');
}

/** Tiền hoa hồng dự kiến (VND) từ thoả thuận với chủ nhà. */
export function commissionAmount(p: Property): number | undefined {
  const s = p.seller;
  if (!s.commissionValue) return undefined;
  if (s.commissionType === 'amount') return s.commissionValue;
  if (!p.price) return undefined;
  return Math.round((p.price * s.commissionValue) / 100);
}

export function commissionText(p: Property): string {
  const s = p.seller;
  if (!s.commissionValue) return '';
  const amount = commissionAmount(p);
  if (s.commissionType === 'percent') {
    return `${s.commissionValue.toLocaleString('vi-VN')}%${amount ? ` (≈ ${formatMoney(amount)})` : ''}`;
  }
  return formatMoney(s.commissionValue);
}
