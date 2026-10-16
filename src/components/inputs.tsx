import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PROVINCES } from '../constants';
import { formatMoney } from '../lib/format';
import { normalize } from '../lib/text';
import { cn, inputClass, Select } from './ui';

/** "5,5" hoặc "5.5" → 5.5; "1.250,5" → 1250.5 */
export function parseDecimal(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const s = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const toText = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 1e6) / 1e6).replace('.', ','));

/** Đồng bộ chữ đang gõ với giá trị số nhưng không làm mất dấu phẩy khi đang gõ dở. */
function useNumberText(value: number | undefined, factor = 1) {
  const [text, setText] = useState(() => toText(value === undefined ? undefined : value / factor));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(toText(value === undefined ? undefined : value / factor));
    }
  }, [value, factor]);
  return { text, setText, last };
}

export function NumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  integer,
  id,
  className,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  suffix?: string;
  placeholder?: string;
  integer?: boolean;
  id?: string;
  className?: string;
}) {
  const { text, setText, last } = useNumberText(value);
  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const cleaned = e.target.value.replace(integer ? /\D/g : /[^\d.,]/g, '');
          setText(cleaned);
          const parsed = parseDecimal(cleaned);
          const next = parsed === undefined ? undefined : integer ? Math.round(parsed) : parsed;
          last.current = next;
          onChange(next);
        }}
        className={cn(inputClass, suffix && 'pr-12', 'tabular-nums')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>
      )}
    </div>
  );
}

const MONEY_UNITS = [
  { value: 1e9, label: 'tỷ' },
  { value: 1e6, label: 'triệu' },
];

/** Nhập tiền theo đơn vị tỷ / triệu, lưu về số VND. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  defaultUnit = 1e9,
  id,
  showPreview = true,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  defaultUnit?: number;
  id?: string;
  showPreview?: boolean;
}) {
  const [unit, setUnit] = useState(() => (value ? (value >= 1e9 ? 1e9 : 1e6) : defaultUnit));
  const { text, setText, last } = useNumberText(value, unit);

  const emit = (rawText: string, nextUnit: number) => {
    const parsed = parseDecimal(rawText);
    const next = parsed === undefined ? undefined : Math.round(parsed * nextUnit);
    last.current = next;
    onChange(next);
  };

  return (
    <div>
      <div className="flex rounded-xl shadow-xs">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d.,]/g, '');
            setText(cleaned);
            emit(cleaned, unit);
          }}
          className={cn(inputClass, 'rounded-r-none shadow-none tabular-nums')}
        />
        <select
          aria-label="Đơn vị"
          value={unit}
          onChange={(e) => {
            const nextUnit = Number(e.target.value);
            setUnit(nextUnit);
            emit(text, nextUnit);
          }}
          className="-ml-px rounded-r-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        >
          {MONEY_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {showPreview && value ? (
        <p className="mt-1 text-xs font-medium text-slate-500">
          = {value.toLocaleString('vi-VN')} đ ({formatMoney(value)})
        </p>
      ) : null}
    </div>
  );
}

/** Chọn nhiều giá trị cố định dạng nút nhãn. */
export function ChipMultiSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? value.filter((v) => v !== opt.value) : [...value, opt.value])}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition',
              selected
                ? 'bg-brand-700 text-white ring-brand-700'
                : 'bg-white text-slate-600 ring-slate-300 hover:text-slate-900 hover:ring-slate-400',
            )}
          >
            {selected && <Check size={13} strokeWidth={3} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Nhập danh sách từ khoá tự do (Enter để thêm) kèm các gợi ý bấm nhanh. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  id,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
}) {
  const [draft, setDraft] = useState('');
  const has = (t: string) => value.some((v) => normalize(v) === normalize(t));

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').trim();
    if (tag && !has(tag)) onChange([...value, tag]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const q = normalize(draft);
  const remaining = suggestions.filter((s) => !has(s) && (!q || normalize(s).includes(q)));

  return (
    <div>
      <div
        className={cn(
          inputClass,
          'flex min-h-[46px] flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15',
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 py-1 pl-2.5 pr-1 text-[13px] font-semibold text-brand-800">
            {tag}
            <button
              type="button"
              aria-label={`Bỏ ${tag}`}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="flex size-5 items-center justify-center rounded-md text-brand-500 hover:bg-brand-100 hover:text-brand-800"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) add(v);
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          enterKeyHint="enter"
          placeholder={value.length ? '' : placeholder}
          className="min-w-32 flex-1 border-0 bg-transparent px-1.5 py-1 text-base outline-none placeholder:text-slate-400 sm:text-sm"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.slice(0, 24).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-800"
            >
              <Plus size={12} strokeWidth={2.6} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProvinceSelect({
  value,
  onChange,
  id,
  placeholder = '— Chọn tỉnh / thành phố —',
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const known = PROVINCES.includes(value);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {!known && value && <option value={value}>{value}</option>}
      <optgroup label="Thành phố trực thuộc trung ương">
        {PROVINCES.slice(0, 6).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </optgroup>
      <optgroup label="Tỉnh">
        {PROVINCES.slice(6).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

/** Chọn một giá trị từ bảng nhãn; có thể để trống. */
export function EnumSelect<K extends string>({
  value,
  onChange,
  labels,
  placeholder,
  id,
}: {
  value: K | undefined;
  onChange: (value: K | undefined) => void;
  labels: Record<K, string>;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as K | undefined)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {(Object.keys(labels) as K[]).map((k) => (
        <option key={k} value={k}>
          {labels[k]}
        </option>
      ))}
    </Select>
  );
}
