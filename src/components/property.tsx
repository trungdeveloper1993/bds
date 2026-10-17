import { Bath, BedDouble, Building2, Compass, Images, Layers, Maximize2, Phone, Ruler, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DIRECTION_LABEL,
  LEGAL_LABEL,
  PROPERTY_STATUS,
  PROPERTY_TYPE_LABEL,
  isLand,
  propertyStatusLabel,
} from '../constants';
import { formatArea, formatNumber, formatPhone, formatPrice, formatUnitPrice, timeAgo } from '../lib/format';
import { formatAddress } from '../lib/listing';
import { mainArea } from '../lib/match';
import { navigate } from '../lib/router';
import type { Project, Property } from '../types';
import { ImageView } from './media';
import { Badge, cn } from './ui';

export function PropertyStatusBadge({ property, size = 'md' }: { property: Pick<Property, 'status' | 'transaction'>; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={PROPERTY_STATUS[property.status].tone} dot size={size}>
      {propertyStatusLabel(property.status, property.transaction)}
    </Badge>
  );
}

/** Các thông số ngắn gọn: 100 m² · 5x20 · 3PN · 2WC · Đông Nam */
export function SpecLine({ property, className }: { property: Property; className?: string }) {
  const p = property;
  const items: Array<{ icon: typeof Ruler; text: string }> = [];
  const area = mainArea(p);
  if (area) items.push({ icon: Maximize2, text: formatArea(area) });
  if (p.width && p.length) items.push({ icon: Ruler, text: `${formatNumber(p.width, 1)}×${formatNumber(p.length, 1)}` });
  if (!isLand(p.type)) {
    if (p.floors && p.floors > 1) items.push({ icon: Layers, text: `${p.floors} tầng` });
    if (p.bedrooms) items.push({ icon: BedDouble, text: `${p.bedrooms} PN` });
    if (p.bathrooms) items.push({ icon: Bath, text: `${p.bathrooms} WC` });
  }
  if (p.direction) items.push({ icon: Compass, text: DIRECTION_LABEL[p.direction] });
  if (!items.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-600', className)}>
      {items.map(({ icon: Icon, text }) => (
        <span key={text} className="inline-flex items-center gap-1">
          <Icon size={14} className="text-slate-400" />
          {text}
        </span>
      ))}
    </div>
  );
}

export function PropertyCard({
  property,
  project,
  privacy,
  footer,
}: {
  property: Property;
  project?: Project;
  privacy: boolean;
  footer?: ReactNode;
}) {
  const p = property;
  const unitPrice = p.transaction === 'ban' ? formatUnitPrice(p.price, mainArea(p)) : '';
  const done = p.status === 'hoan_tat' || p.status === 'tam_ngung';
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <button type="button" onClick={() => navigate(`/bds/${p.id}`)} className="flex flex-1 flex-col text-left">
        <div className="relative">
          <ImageView id={p.images[0]} className={cn('aspect-[4/3] w-full', done && 'grayscale-[60%]')} />
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            <PropertyStatusBadge property={p} size="sm" />
          </div>
          {p.featured && (
            <span className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow" title="BĐS nổi bật">
              <Star size={14} fill="currentColor" />
            </span>
          )}
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-slate-900/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            {p.transaction === 'ban' ? 'BÁN' : 'CHO THUÊ'}
          </span>
          {p.images.length > 1 && (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-slate-900/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              <Images size={12} /> {p.images.length}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-400">{p.code}</span>
            <span>·</span>
            <span className="truncate">{PROPERTY_TYPE_LABEL[p.type]}</span>
          </div>
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 group-hover:text-brand-800">
            {p.title || PROPERTY_TYPE_LABEL[p.type]}
          </h3>
          {project && (
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-700">
              <Building2 size={14} className="shrink-0" />
              <span className="truncate">
                {project.name}
                {p.unitCode && <span className="font-normal text-slate-500"> · {p.unitCode}</span>}
              </span>
            </div>
          )}
          <p className="line-clamp-1 text-[13px] text-slate-500">{formatAddress(p, { hideNumber: privacy }) || '—'}</p>
          <SpecLine property={p} />
          <div className="mt-auto flex items-end justify-between gap-2 pt-1">
            <div className="min-w-0">
              <div className="text-lg font-extrabold leading-tight text-brand-800">{formatPrice(p.price, p.transaction)}</div>
              {unitPrice && <div className="text-xs text-slate-500">{unitPrice}</div>}
            </div>
            {p.legal && (
              <span className="max-w-[45%] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {LEGAL_LABEL[p.legal]}
              </span>
            )}
          </div>
        </div>
      </button>
      {!privacy && (p.seller.name || p.seller.phone) && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 text-xs">
          <span className="truncate text-slate-500">
            Chủ nhà: <b className="font-semibold text-slate-700">{p.seller.name || '—'}</b>
          </span>
          {p.seller.phone && (
            <a href={`tel:${p.seller.phone.replace(/\D/g, '')}`} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:underline">
              <Phone size={12} /> {formatPhone(p.seller.phone)}
            </a>
          )}
        </div>
      )}
      {footer}
    </article>
  );
}

/** Dòng gọn cho chế độ danh sách và các danh sách nhỏ. */
export function PropertyRow({
  property,
  project,
  privacy,
  trailing,
  onClick,
  id,
}: {
  property: Property;
  project?: Project;
  privacy: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  id?: string;
}) {
  const p = property;
  return (
    <div id={id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/80 sm:px-5">
      <button type="button" onClick={onClick ?? (() => navigate(`/bds/${p.id}`))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ImageView id={p.images[0]} className="h-16 w-20 shrink-0 rounded-xl sm:h-[72px] sm:w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-slate-400">{p.code}</span>
            <PropertyStatusBadge property={p} size="sm" />
            {p.featured && <Star size={13} className="text-amber-500" fill="currentColor" />}
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-slate-900">{p.title || PROPERTY_TYPE_LABEL[p.type]}</div>
          <div className="truncate text-xs text-slate-500">
            {[project?.name, p.unitCode, formatAddress(p, { hideNumber: privacy })].filter(Boolean).join(' · ')}
          </div>
          <SpecLine property={p} className="mt-1 hidden text-xs sm:flex" />
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-[15px] font-extrabold text-brand-800">{formatPrice(p.price, p.transaction)}</div>
          <div className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</div>
        </div>
      </button>
      {trailing ?? (
        <div className="shrink-0 text-right sm:hidden">
          <div className="text-sm font-extrabold text-brand-800">{formatPrice(p.price, p.transaction)}</div>
        </div>
      )}
    </div>
  );
}
