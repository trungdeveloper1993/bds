import { CalendarClock, MessageCircle, Phone } from 'lucide-react';
import { CUSTOMER_PIPELINE, CUSTOMER_STATUS, TEMPERATURE } from '../constants';
import { daysFromToday, formatPhone, relativeDay, telHref, zaloHref } from '../lib/format';
import { navigate } from '../lib/router';
import { needsSummary } from '../lib/summary';
import type { Customer, CustomerStatus, Interaction, Interest, InterestStatus, Project } from '../types';
import { Avatar, Badge, cn } from './ui';

export function FollowUpChip({ date, note, className }: { date: string; note?: string; className?: string }) {
  if (!date) return null;
  const diff = daysFromToday(date) ?? 0;
  const tone = diff < 0 ? 'bg-rose-50 text-rose-700 ring-rose-200' : diff === 0 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tone, className)} title={note}>
      <CalendarClock size={12} className="shrink-0" />
      <span className="truncate">
        {relativeDay(date)}
        {note ? ` · ${note}` : ''}
      </span>
    </span>
  );
}

export function CustomerRow({
  customer: c,
  projectById,
  matchCount,
}: {
  customer: Customer;
  projectById: Map<string, Project>;
  matchCount?: number;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-slate-50/80 sm:px-5">
      <button type="button" onClick={() => navigate(`/khach/${c.id}`)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <Avatar name={c.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-bold text-slate-900">{c.name}</span>
            <Badge tone={TEMPERATURE[c.temperature].tone} size="sm">
              {TEMPERATURE[c.temperature].label}
            </Badge>
            <Badge tone={CUSTOMER_STATUS[c.status].tone} size="sm" dot>
              {CUSTOMER_STATUS[c.status].label}
            </Badge>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-slate-600">{needsSummary(c, projectById)}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-slate-400">{c.code}</span>
            {c.phone && <span className="text-xs text-slate-500">{formatPhone(c.phone)}</span>}
            {c.nextFollowUp && <FollowUpChip date={c.nextFollowUp} note={c.nextFollowUpNote} />}
            {!!matchCount && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                {matchCount} BĐS phù hợp
              </span>
            )}
          </div>
        </div>
      </button>
      {c.phone && (
        <div className="flex shrink-0 gap-1">
          <a href={telHref(c.phone)} aria-label={`Gọi ${c.name}`} className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition hover:bg-brand-100">
            <Phone size={16} />
          </a>
          <a
            href={zaloHref(c.phone)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Nhắn Zalo ${c.name}`}
            className="hidden size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700 transition hover:bg-sky-100 sm:flex"
          >
            <MessageCircle size={16} />
          </a>
        </div>
      )}
    </div>
  );
}

const INTEREST_ORDER: InterestStatus[] = ['de_xuat', 'da_gui', 'da_xem', 'quan_tam'];

/**
 * Khi ghi một lần chăm sóc: tự nâng trạng thái khách trong phễu
 * và trạng thái của căn liên quan (không bao giờ hạ cấp).
 */
export function applyInteraction(c: Customer, interaction: Interaction): { status: CustomerStatus; interests: Interest[]; changed: string[] } {
  const changed: string[] = [];
  let status = c.status;
  const rank = (s: CustomerStatus) => CUSTOMER_PIPELINE.indexOf(s);
  const raise = (to: CustomerStatus) => {
    if (status === 'ngung' || rank(to) <= rank(status)) return;
    status = to;
  };
  raise('dang_tu_van');
  if (interaction.kind === 'dan_xem') raise('da_xem');
  if (interaction.kind === 'dam_phan') raise('dam_phan');
  if (interaction.kind === 'dat_coc') raise('da_chot');
  if (status !== c.status) changed.push(`khách → ${CUSTOMER_STATUS[status].label}`);

  let interests = c.interests;
  if (interaction.propertyId) {
    const target: InterestStatus | null =
      interaction.kind === 'dan_xem' ? 'da_xem' : interaction.kind === 'gui_thong_tin' || interaction.kind === 'nhan_tin' ? 'da_gui' : interaction.kind === 'dam_phan' || interaction.kind === 'dat_coc' ? 'quan_tam' : null;
    const existing = interests.find((i) => i.propertyId === interaction.propertyId);
    const now = new Date().toISOString();
    if (!existing) {
      interests = [{ propertyId: interaction.propertyId, status: target ?? 'de_xuat', note: '', updatedAt: now }, ...interests];
    } else if (target && existing.status !== 'khong_hop' && INTEREST_ORDER.indexOf(target) > INTEREST_ORDER.indexOf(existing.status)) {
      interests = interests.map((i) => (i.propertyId === interaction.propertyId ? { ...i, status: target, updatedAt: now } : i));
    }
  }
  return { status, interests, changed };
}
