import { Save, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { goBack, releaseNavigationGuard, useUnsavedChangesGuard } from '../lib/router';
import { useUI } from '../store/ui';
import { Button, Card, cn } from './ui';

export function FormSection({
  title,
  icon: Icon,
  description,
  children,
  tone = 'default',
  aside,
}: {
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'internal';
  aside?: ReactNode;
}) {
  return (
    <Card className={cn(tone === 'internal' && 'border-amber-200 bg-amber-50/30')}>
      <div className={cn('flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-6', tone === 'internal' ? 'border-amber-100' : 'border-slate-100')}>
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
              tone === 'internal' ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700',
            )}
          >
            <Icon size={17} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </Card>
  );
}

/** Lưới trường nhập 1 → 2 → 3 cột theo kích thước màn hình. */
export function FieldGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', cols === 3 && 'lg:grid-cols-3')}>{children}</div>;
}

/** Bản nháp của form + cờ "đã sửa" để cảnh báo khi rời trang. */
export function useDraft<T>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);
  const update = useCallback((patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch })), []);
  /** Đặt lại bản nháp và coi đó là trạng thái "đã lưu". */
  const reset = useCallback((value: T) => {
    setBaseline(JSON.stringify(value));
    setDraft(value);
  }, []);
  return { draft, setDraft, update, dirty, reset };
}

/**
 * Thanh Lưu / Huỷ dính ở đáy màn hình. Tự chặn rời trang khi có thay đổi,
 * hỗ trợ Ctrl/⌘ + S để lưu.
 */
export function FormFooter({
  dirty,
  saving,
  onSave,
  cancelTo,
  saveLabel = 'Lưu',
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  cancelTo: string;
  saveLabel?: string;
  extra?: ReactNode;
}) {
  const { confirm } = useUI();
  useUnsavedChangesGuard(dirty && !saving);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cancel = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Bỏ các thay đổi?', message: 'Những gì bạn vừa nhập sẽ không được lưu.', confirmLabel: 'Bỏ thay đổi', danger: true });
      if (!ok) return;
    }
    releaseNavigationGuard();
    goBack(cancelTo);
  };

  return (
    <div className="pb-safe sticky bottom-0 z-20 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="hidden text-xs text-slate-500 sm:block">
          {dirty ? 'Có thay đổi chưa lưu · Ctrl + S để lưu nhanh' : 'Chưa có thay đổi'}
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          {extra}
          <Button variant="ghost" onClick={() => void cancel()} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" icon={Save} onClick={onSave} loading={saving} className="min-w-28">
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
