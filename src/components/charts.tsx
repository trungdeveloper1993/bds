import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './ui';

/**
 * Ô số liệu (stat tile): nhãn · giá trị · dòng phụ.
 * Giá trị dùng chữ số tỉ lệ (không tabular) cho số lớn đứng riêng.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs sm:p-5',
        onClick && 'transition hover:border-slate-300 hover:shadow-md',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-500">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon size={16} strokeWidth={2.2} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">{value}</div>
      {sub && <div className="mt-1 text-xs leading-relaxed text-slate-500">{sub}</div>}
    </Comp>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  onClick?: () => void;
}

/**
 * Danh sách thanh ngang một màu (so sánh độ lớn giữa các nhóm không có thứ tự màu).
 * Mỗi thanh dày 10px, đầu bo 4px, nhãn giá trị ở đầu thanh bằng màu chữ.
 */
export function BarList({ data, unit, emptyText = 'Chưa có dữ liệu' }: { data: BarDatum[]; unit: string; emptyText?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  if (!data.length || max === 0) return <p className="py-4 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="space-y-1">
      {data.map((d) => {
        const pct = total ? Math.round((d.value / total) * 100) : 0;
        const width = d.value > 0 ? `${Math.max(2, (d.value / max) * 100)}%` : '0%';
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate font-medium text-slate-700">{d.label}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                <b className="font-bold text-slate-900">{d.value}</b> · {pct}%
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full rounded-r-[4px] bg-brand-50">
              <div className="h-full rounded-r-[4px] bg-brand-600 transition-[width] duration-500" style={{ width }} />
            </div>
          </>
        );
        return (
          <li key={d.key} title={`${d.label}: ${d.value} ${unit} (${pct}%)`}>
            {d.onClick ? (
              <button type="button" onClick={d.onClick} className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50">
                {content}
              </button>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
