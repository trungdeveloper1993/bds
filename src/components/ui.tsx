import { ChevronDown, ChevronLeft, Loader2, Search, X, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import type { Tone } from '../constants';
import { goBack } from '../lib/router';

/** Ghép class Tailwind; class truyền sau ghi đè class xung đột trước đó (py-2.5 → py-1.5...). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

// ---------------------------------------------------------------- Nút bấm

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'dangerSoft';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm shadow-brand-900/15 hover:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-xs hover:border-slate-400 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-200/60',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  dangerSoft: 'text-rose-700 hover:bg-rose-50',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[15px]',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 15, md: 17, lg: 18 };

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

const ICON_ONLY_SIZE: Record<ButtonSize, string> = { sm: 'w-8 px-0', md: 'w-10 px-0', lg: 'w-12 px-0' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, className, children, type = 'button', disabled, ...rest },
  ref,
) {
  // Nút chỉ có biểu tượng: vuông.
  const iconOnly = !children && !!Icon;
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, cn(iconOnly && ICON_ONLY_SIZE[size], className))}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 size={ICON_SIZE[size]} className="animate-spin" />
      ) : (
        Icon && <Icon size={ICON_SIZE[size]} strokeWidth={2.2} />
      )}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon: Icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon size={ICON_SIZE[size]} strokeWidth={2.2} />}
      {children}
    </a>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger' | 'onDark';
}

export function IconButton({ icon: Icon, label, size = 'md', tone = 'default', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        tone === 'danger' && 'text-rose-600 hover:bg-rose-50',
        tone === 'default' && 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-800',
        tone === 'onDark' && 'bg-black/40 text-white backdrop-blur hover:bg-black/60',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 19} strokeWidth={2.1} />
    </button>
  );
}

// ---------------------------------------------------------------- Thẻ

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-xs', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  icon: Icon,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Icon size={17} strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Nhãn

const TONE_CLASS: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

const DOT_CLASS: Record<Tone, string> = {
  slate: 'bg-slate-400',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
};

export function Badge({
  tone = 'slate',
  children,
  icon: Icon,
  dot,
  className,
  size = 'md',
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[tone])} />}
      {Icon && <Icon size={size === 'sm' ? 11 : 13} strokeWidth={2.4} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------- Ô nhập

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm';

export function Field({
  label,
  hint,
  required,
  children,
  className,
  htmlFor,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {(label || aside) && (
        <div className="mb-1.5 flex items-end justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-700">
              {label}
              {required && <span className="ml-0.5 text-rose-500">*</span>}
            </label>
          )}
          {aside}
        </div>
      )}
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(inputClass, 'leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, 'pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          aria-label="Xoá tìm kiếm"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Nhóm nút chọn một giá trị (vd: Bán / Cho thuê). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-200/70 p-1', className)} role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-lg font-semibold transition',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start justify-between gap-4', className)}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] rounded-md border-slate-300 accent-brand-700"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------- Hộp thoại

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Trang phía sau vẽ lại (onClose là hàm mới) không được làm con trỏ nhảy về ô đầu tiên.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    // Đưa con trỏ vào ô nhập đầu tiên (hoặc chính hộp thoại) — trừ khi người dùng đã bấm vào ô khác.
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (panel?.contains(document.activeElement)) return;
      const target = panel?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select');
      (target ?? panel)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:animate-pop-in sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3.5 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>}
          </div>
          {dismissible && <IconButton icon={X} label="Đóng" size="sm" onClick={onClose} className="-mr-1.5 -mt-0.5" />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Menu thả xuống

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

export function Dropdown({ trigger, items, align = 'right' }: { trigger: (toggle: () => void, open: boolean) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((v) => !v), open)}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1.5 min-w-52 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-900/10',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition',
                item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {item.icon && <item.icon size={16} strokeWidth={2.1} className={item.danger ? '' : 'text-slate-400'} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Bố cục trang

export function PageHeader({
  title,
  subtitle,
  backTo,
  actions,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {backTo && (
          <IconButton icon={ChevronLeft} label="Quay lại" onClick={() => goBack(backTo)} className="-ml-2 mt-0.5 print:hidden" />
        )}
        <div className="min-w-0">
          {meta && <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{meta}</div>}
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end print:hidden">{actions}</div>}
    </div>
  );
}

/** Nhãn nút gọn trên điện thoại, đầy đủ trên màn hình lớn. */
export function ResponsiveLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
        <Icon size={26} strokeWidth={1.9} />
      </span>
      <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-brand-600', className)} size={22} />;
}

/** Một dòng thông số: nhãn bên trái, giá trị bên phải. */
export function InfoRow({ label, children, icon: Icon, id }: { label: ReactNode; children: ReactNode; icon?: LucideIcon; id?: string }) {
  if (children === undefined || children === null || children === '' || children === false) return null;
  return (
    <div id={id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="flex shrink-0 items-center gap-2 text-slate-500">
        {Icon && <Icon size={15} className="text-slate-400" />}
        {label}
      </dt>
      <dd className="min-w-0 text-right font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Khối văn bản nhiều dòng; mỗi dòng có id riêng (`${idPrefix}-l${số dòng}`) để
 * "Hỏi nhanh" nhảy tới đúng dòng trả lời.
 */
export function TextLines({ text, idPrefix, className }: { text: string; idPrefix: string; className?: string }) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) =>
        line.trim() ? (
          <span key={i} id={`${idPrefix}-l${i}`} className="block">
            {line}
          </span>
        ) : (
          <span key={i} className="block" aria-hidden>
            {' '}
          </span>
        ),
      )}
    </div>
  );
}

/** Ô thông số nổi bật (diện tích, phòng ngủ...). */
export function Spec({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200/70">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-xs ring-1 ring-slate-200/80">
        <Icon size={17} strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{value}</div>
      </div>
    </div>
  );
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  // "Chị Lan (Q7)" → "L": bỏ ghi chú trong ngoặc, lấy từ cuối có chữ cái.
  const words = name
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  const letter = (words[words.length - 1] ?? name.trim()).charAt(0).toUpperCase() || '?';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        size === 'sm' && 'size-8 text-xs',
        size === 'md' && 'size-10 text-sm',
        size === 'lg' && 'size-14 text-lg',
      )}
    >
      {letter}
    </span>
  );
}

/** Thanh tab có thể cuộn ngang trên điện thoại, kèm số đếm. */
export function TabBar<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: string; count?: number; hidden?: boolean }>;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      {tabs
        .filter((t) => !t.hidden)
        .map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-slate-900 hover:ring-slate-300',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}

/** Tiêu đề nhỏ phân nhóm trong form/chi tiết. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[11px] font-bold uppercase tracking-wider text-slate-400', className)}>{children}</h3>;
}
