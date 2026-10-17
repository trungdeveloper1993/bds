import {
  ArrowDown,
  ArrowUp,
  BadgePercent,
  Calculator,
  Circle,
  CircleCheck,
  CircleDot,
  Copy,
  Gift,
  HardHat,
  Lock,
  Pencil,
  Plus,
  Share2,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { INVENTORY_STATUS, MILESTONE_STATUS, MILESTONE_SUGGESTIONS, PROMOTION_KIND_LABEL } from '../constants';
import { requestFocus } from '../lib/focus';
import { formatArea, formatDate, formatMoney } from '../lib/format';
import { uid } from '../lib/id';
import { copyText } from '../lib/listing';
import { compareCodes, mapContext, resolveItem, squashCode } from '../lib/maps';
import {
  computeQuote,
  fmtPct,
  fmtVnd,
  installmentTotal,
  METHOD_TEMPLATES,
  promotionActive,
  promotionValueText,
  quoteText,
  untilText,
} from '../lib/pricing';
import { useLocation } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Installment, Milestone, MilestoneStatus, PaymentMethod, Project, Promotion, PromotionKind, Property, SalesTerms } from '../types';
import { MoneyInput, NumberInput } from './inputs';
import { Badge, Button, Card, CardHeader, Checkbox, cn, EmptyState, Field, IconButton, Modal, Segmented, TextArea, TextInput, Toggle } from './ui';

/*
 * Tab "Thanh toán & ưu đãi": phương thức & tiến độ thanh toán, ưu đãi / chiết khấu, tiến độ dự án,
 * và bảng tính giá — dòng tiền từng đợt cho một căn cụ thể để gửi khách.
 */

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

function useSalesPatch(project: Project) {
  const { patchProject } = useData();
  return useCallback(
    (fn: (s: SalesTerms) => Partial<SalesTerms>) => patchProject(project.id, (cur) => ({ sales: { ...cur.sales, ...fn(cur.sales) } })),
    [patchProject, project.id],
  );
}

function NoteBlock({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

export function SalesTab({ project, units, editable, privacy }: { project: Project; units: Property[]; editable: boolean; privacy: boolean }) {
  const { query } = useLocation();
  const requested = query.get('tinh') ?? '';
  // Mở từ thẻ căn trên bản đồ ("Tính dòng tiền"): cuộn tới bảng tính.
  useEffect(() => {
    if (requested) requestFocus('sales-quote', undefined, { flash: false });
  }, [requested]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <PromotionsCard project={project} editable={editable} privacy={privacy} />
        <MethodsCard project={project} editable={editable} />
      </div>
      <div className="space-y-5 lg:col-span-2">
        <QuoteCard key={requested} project={project} units={units} editable={editable} privacy={privacy} initialCode={requested} />
        <MilestonesCard project={project} editable={editable} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Ưu đãi & chiết khấu

const newPromotion = (): Promotion => ({ id: uid(), name: '', kind: 'pct', value: 0, condition: '', until: '', auto: false, internal: false });

function PromotionBadge({ p }: { p: Promotion }) {
  return (
    <span
      className={cn(
        'flex h-10 min-w-16 shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-sm font-extrabold tabular-nums',
        p.kind === 'gift' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700',
      )}
    >
      {p.kind === 'gift' && <Gift size={15} />}
      {p.kind === 'gift' ? (p.value ? formatMoney(p.value, '') : 'Quà') : promotionValueText(p)}
    </span>
  );
}

function PromotionsCard({ project, editable, privacy }: { project: Project; editable: boolean; privacy: boolean }) {
  const save = useSalesPatch(project);
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const list = project.sales.promotions.filter((p) => !(privacy && p.internal));
  const isNew = !!editing && !project.sales.promotions.some((p) => p.id === editing.id);

  const onSave = async (p: Promotion) => {
    await save((s) => ({ promotions: upsert(s.promotions, p) }));
    setEditing(null);
    toast('Đã lưu ưu đãi');
  };
  const onDelete = async (p: Promotion) => {
    if (!(await confirm({ title: `Xoá ưu đãi “${p.name}”?`, confirmLabel: 'Xoá', danger: true }))) return;
    await save((s) => ({ promotions: s.promotions.filter((x) => x.id !== p.id) }));
    setEditing(null);
  };

  return (
    <Card id="sales-promotions">
      <CardHeader
        title={`Ưu đãi & chiết khấu (${list.filter((p) => promotionActive(p)).length})`}
        icon={BadgePercent}
        description="Chiết khấu %, giảm tiền, quà tặng — kèm điều kiện và hạn áp dụng"
        actions={
          editable && (
            <Button size="sm" icon={Plus} onClick={() => setEditing(newPromotion())}>
              Thêm ưu đãi
            </Button>
          )
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="Chưa có ưu đãi"
          description={editable ? 'Thêm chiết khấu, quà tặng, hỗ trợ của CĐT để tính giá cho khách và trả lời nhanh khi khách hỏi “có ưu đãi gì?”.' : undefined}
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((p) => {
            const active = promotionActive(p);
            return (
              <li key={p.id} id={`promo-${p.id}`} className={cn('flex items-start gap-3 px-4 py-3 sm:px-5', !active && 'opacity-60')}>
                <PromotionBadge p={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                    {p.internal && (
                      <Badge size="sm" tone="amber" icon={Lock}>
                        Nội bộ
                      </Badge>
                    )}
                    {!active && (
                      <Badge size="sm" tone="rose">
                        Hết hạn
                      </Badge>
                    )}
                    {p.auto && active && (
                      <Badge size="sm" tone="sky">
                        Mọi khách
                      </Badge>
                    )}
                  </div>
                  {p.condition && <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{p.condition}</p>}
                  {p.until && <p className={cn('mt-0.5 text-xs font-medium', active ? 'text-slate-500' : 'text-rose-600')}>Hạn áp dụng: {untilText(p.until)}</p>}
                </div>
                {editable && <IconButton icon={Pencil} label="Sửa ưu đãi" size="sm" onClick={() => setEditing(p)} />}
              </li>
            );
          })}
        </ul>
      )}
      <NoteBlock title="Chính sách bán hàng (ghi chú trong hồ sơ)" text={project.salesPolicy} />
      {editing && <PromotionModal key={editing.id} item={editing} isNew={isNew} onClose={() => setEditing(null)} onSave={(p) => void onSave(p)} onDelete={(p) => void onDelete(p)} />}
    </Card>
  );
}

function PromotionModal({ item, isNew, onClose, onSave, onDelete }: { item: Promotion; isNew: boolean; onClose: () => void; onSave: (p: Promotion) => void; onDelete: (p: Promotion) => void }) {
  const [d, setD] = useState(item);
  const set = (patch: Partial<Promotion>) => setD((x) => ({ ...x, ...patch }));
  const valid = d.name.trim() && (d.kind === 'gift' || d.value > 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Thêm ưu đãi' : 'Sửa ưu đãi'}
      footer={
        <>
          {!isNew && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => onDelete(item)} className="mr-auto">
              Xoá
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...d, name: d.name.trim(), condition: d.condition.trim() })}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tên ưu đãi" required>
          <TextInput value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Chiết khấu mua sớm, Tặng gói nội thất" />
        </Field>
        <Field label="Loại">
          <Segmented
            value={d.kind}
            onChange={(kind: PromotionKind) => set({ kind, value: kind === 'pct' && d.value > 100 ? 0 : d.value })}
            options={(Object.keys(PROMOTION_KIND_LABEL) as PromotionKind[]).map((k) => ({ value: k, label: PROMOTION_KIND_LABEL[k] }))}
          />
        </Field>
        {d.kind === 'pct' ? (
          <Field label="Mức chiết khấu" required>
            <NumberInput value={d.value || undefined} onChange={(v) => set({ value: Math.min(100, v ?? 0) })} suffix="%" placeholder="VD: 3" />
          </Field>
        ) : (
          <Field label={d.kind === 'gift' ? 'Giá trị quà (tham khảo, không trừ vào giá)' : 'Số tiền giảm'} required={d.kind === 'amount'}>
            <MoneyInput value={d.value || undefined} onChange={(v) => set({ value: v ?? 0 })} defaultUnit={1e6} placeholder={d.kind === 'gift' ? 'VD: 80' : 'VD: 50'} />
          </Field>
        )}
        <Field label="Điều kiện áp dụng">
          <TextArea rows={2} value={d.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="VD: Ký HĐMB trước 30/11, áp dụng căn 2PN – 3PN" />
        </Field>
        <Field label="Hạn áp dụng" hint="Để trống nếu chưa có hạn. Hết hạn sẽ tự đánh dấu và không tự chọn khi tính giá.">
          <TextInput type="date" value={d.until} onChange={(e) => set({ until: e.target.value })} />
        </Field>
        <Toggle checked={d.auto} onChange={(auto) => set({ auto })} label="Khách nào cũng được" description="Tự chọn sẵn khi tính giá cho khách." />
        <Toggle
          checked={d.internal}
          onChange={(internal) => set({ internal })}
          label="Chỉ nội bộ"
          description="VD chiết khấu thêm trích từ hoa hồng — ẩn khi bật Chế độ khách xem."
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Phương thức & tiến độ thanh toán

const INSTALLMENT_COLORS = ['bg-brand-600', 'bg-sky-400', 'bg-brand-800', 'bg-sky-600', 'bg-indigo-400', 'bg-brand-400'];

function ScheduleBar({ items }: { items: Installment[] }) {
  const total = items.reduce((a, r) => a + r.pct, 0);
  if (!total) return null;
  return (
    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {items.map((r, i) => (
        <span key={r.id} className={cn('h-full border-r border-white last:border-r-0', INSTALLMENT_COLORS[i % INSTALLMENT_COLORS.length])} style={{ width: `${(r.pct / Math.max(100, total)) * 100}%` }} />
      ))}
    </div>
  );
}

function TotalHint({ total }: { total: number }) {
  if (Math.abs(total - 100) < 0.001) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-amber-700">
      <TriangleAlert size={14} />
      Tổng các đợt {fmtPct(total)} — {total < 100 ? `còn thiếu ${fmtPct(100 - total)}` : `vượt ${fmtPct(total - 100)}`}
    </p>
  );
}

function MethodsCard({ project, editable }: { project: Project; editable: boolean }) {
  const save = useSalesPatch(project);
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const methods = project.sales.methods;
  const isNew = !!editing && !methods.some((m) => m.id === editing.id);

  const onSave = async (m: PaymentMethod) => {
    await save((s) => ({ methods: upsert(s.methods, m) }));
    setEditing(null);
    toast('Đã lưu phương thức thanh toán');
  };
  const onDelete = async (m: PaymentMethod) => {
    if (!(await confirm({ title: `Xoá phương thức “${m.name}”?`, confirmLabel: 'Xoá', danger: true }))) return;
    await save((s) => ({ methods: s.methods.filter((x) => x.id !== m.id) }));
    setEditing(null);
  };
  const fromTemplate = (key: string) => {
    const t = METHOD_TEMPLATES.find((x) => x.key === key);
    if (t) setEditing({ id: uid(), ...t.make() });
  };

  return (
    <Card id="sales-methods">
      <CardHeader
        title={`Phương thức & tiến độ thanh toán (${methods.length})`}
        icon={Wallet}
        description="Các đợt thanh toán theo % giá trị căn, chiết khấu riêng của từng phương thức"
        actions={
          editable && (
            <Button size="sm" icon={Plus} onClick={() => setEditing({ id: uid(), name: '', discountPct: 0, note: '', installments: [] })}>
              Thêm phương thức
            </Button>
          )
        }
      />
      {methods.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Chưa có phương thức thanh toán"
          description={editable ? 'Bắt đầu từ khung hay gặp rồi sửa theo chính sách của CĐT:' : undefined}
          action={
            editable &&
            METHOD_TEMPLATES.map((t) => (
              <Button key={t.key} size="sm" onClick={() => fromTemplate(t.key)}>
                {t.label}
              </Button>
            ))
          }
          className="py-8"
        />
      ) : (
        methods.map((m) => {
          const total = installmentTotal(m);
          return (
            <div key={m.id} id={`pm-${m.id}`} className="border-t border-slate-100 px-4 py-3.5 first:border-t-0 sm:px-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-bold text-slate-900">{m.name}</h3>
                  {m.discountPct > 0 && <Badge tone="emerald">Chiết khấu {fmtPct(m.discountPct)}</Badge>}
                </div>
                {editable && <IconButton icon={Pencil} label="Sửa phương thức" size="sm" onClick={() => setEditing(m)} />}
              </div>
              <ScheduleBar items={m.installments} />
              {m.installments.length > 0 && (
                <table className="mt-2 w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {m.installments.map((r, i) => (
                      <tr key={r.id}>
                        <td className="w-24 py-1.5 pr-2 font-semibold text-slate-800">{r.label.trim() || `Đợt ${i + 1}`}</td>
                        <td className="w-16 py-1.5 pr-3 text-right font-bold tabular-nums text-brand-800">{fmtPct(r.pct)}</td>
                        <td className="py-1.5 text-slate-600">
                          {r.when}
                          {r.date && <span className="text-slate-400"> · {formatDate(r.date)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <TotalHint total={total} />
              {m.note && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-600">{m.note}</p>}
            </div>
          );
        })
      )}
      <NoteBlock title="Phương thức thanh toán (ghi chú trong hồ sơ)" text={project.paymentPlan} />
      <NoteBlock title="Ngân hàng bảo lãnh / cho vay" text={project.banks} />
      {editing && <MethodModal key={editing.id} item={editing} isNew={isNew} onClose={() => setEditing(null)} onSave={(m) => void onSave(m)} onDelete={(m) => void onDelete(m)} />}
    </Card>
  );
}

function MethodModal({
  item,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  item: PaymentMethod;
  isNew: boolean;
  onClose: () => void;
  onSave: (m: PaymentMethod) => void;
  onDelete: (m: PaymentMethod) => void;
}) {
  const [d, setD] = useState(item);
  const set = (patch: Partial<PaymentMethod>) => setD((x) => ({ ...x, ...patch }));
  const setRow = (id: string, patch: Partial<Installment>) => set({ installments: d.installments.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const move = (i: number, to: number) => {
    if (to < 0 || to >= d.installments.length) return;
    const next = [...d.installments];
    const [row] = next.splice(i, 1);
    next.splice(to, 0, row);
    set({ installments: next });
  };
  const total = installmentTotal(d);
  const remaining = Math.max(0, Math.round((100 - total) * 100) / 100);
  const addRow = () => set({ installments: [...d.installments, { id: uid(), label: `Đợt ${d.installments.length + 1}`, pct: remaining, when: '', date: '' }] });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Thêm phương thức thanh toán' : 'Sửa phương thức thanh toán'}
      footer={
        <>
          {!isNew && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => onDelete(item)} className="mr-auto">
              Xoá
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            disabled={!d.name.trim()}
            onClick={() => onSave({ ...d, name: d.name.trim(), note: d.note.trim(), installments: d.installments.filter((r) => r.pct > 0 || r.when.trim()) })}
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isNew && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Bắt đầu từ khung:</span>
            {METHOD_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setD({ ...t.make(), id: d.id })}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Tên phương thức" required>
            <TextInput value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Thanh toán sớm 95%, Vay ngân hàng 70%" />
          </Field>
          <Field label="Chiết khấu riêng">
            <NumberInput value={d.discountPct || undefined} onChange={(v) => set({ discountPct: Math.min(100, v ?? 0) })} suffix="%" placeholder="VD: 9" />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-700">Các đợt thanh toán</span>
            <span className={cn('text-xs font-bold tabular-nums', Math.abs(total - 100) < 0.001 ? 'text-emerald-700' : 'text-amber-700')}>Tổng {fmtPct(total)}</span>
          </div>
          <div className="space-y-2">
            {d.installments.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[1fr_96px_auto] gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:grid-cols-[96px_96px_1fr_150px_auto]">
                <TextInput value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} placeholder={`Đợt ${i + 1}`} aria-label="Tên đợt" className="px-2.5" />
                <NumberInput value={r.pct || undefined} onChange={(v) => setRow(r.id, { pct: Math.min(100, v ?? 0) })} suffix="%" placeholder="%" />
                <div className="flex items-center sm:order-last">
                  <IconButton icon={ArrowUp} label="Lên trên" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} />
                  <IconButton icon={ArrowDown} label="Xuống dưới" size="sm" disabled={i === d.installments.length - 1} onClick={() => move(i, i + 1)} />
                  <IconButton icon={X} label="Xoá đợt" size="sm" tone="danger" onClick={() => set({ installments: d.installments.filter((x) => x.id !== r.id) })} />
                </div>
                <TextInput
                  value={r.when}
                  onChange={(e) => setRow(r.id, { when: e.target.value })}
                  placeholder="Thời điểm: ký HĐMB, sau 30 ngày, nhận nhà…"
                  aria-label="Thời điểm thanh toán"
                  className="col-span-3 sm:col-span-1"
                />
                <TextInput type="date" value={r.date} onChange={(e) => setRow(r.id, { date: e.target.value })} aria-label="Ngày cụ thể" className="col-span-3 sm:col-span-1" />
              </div>
            ))}
          </div>
          <Button size="sm" icon={Plus} className="mt-2" onClick={addRow}>
            Thêm đợt{remaining > 0 && d.installments.length ? ` (còn ${fmtPct(remaining)})` : ''}
          </Button>
          <TotalHint total={total} />
          {d.installments.length > 1 && d.installments[d.installments.length - 1].pct < 5 && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Thường giữ lại 5% đến khi nhận sổ hồng (Luật KDBĐS 2023: thu tối đa 95% trước khi cấp giấy chứng nhận).</p>
          )}
        </div>

        <Field label="Ghi chú" hint="Điều kiện, ngân hàng cho vay, hỗ trợ lãi suất, ân hạn nợ gốc…">
          <TextArea rows={3} value={d.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Tính giá & dòng tiền

function QuoteCard({ project, units, editable, privacy, initialCode }: { project: Project; units: Property[]; editable: boolean; privacy: boolean; initialCode: string }) {
  const { settings } = useData();
  const { toast } = useUI();
  const save = useSalesPatch(project);
  const sales = project.sales;
  const ctx = useMemo(() => mapContext(project, units), [project, units]);
  const promos = useMemo(() => sales.promotions.filter((p) => !(privacy && p.internal)), [sales.promotions, privacy]);
  const [code, setCode] = useState(initialCode);
  const [manual, setManual] = useState<number | undefined>(undefined);
  const [methodId, setMethodId] = useState(() => sales.methods[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>(() => promos.filter((p) => p.auto && promotionActive(p)).map((p) => p.id));
  const [focused, setFocused] = useState(false);

  const codes = useMemo(
    () => [...new Set([...project.inventory.map((x) => x.code), ...units.filter((u) => u.projectId === project.id && u.unitCode.trim()).map((u) => u.unitCode.trim())])].sort(compareCodes),
    [project.inventory, project.id, units],
  );
  const unit = code.trim() ? resolveItem(ctx, code.trim()) : null;
  const found = !!(unit && (unit.item || unit.property));
  const suggestions = focused && code.trim() && !found ? codes.filter((c) => squashCode(c).includes(squashCode(code))).slice(0, 8) : [];
  const method = sales.methods.find((m) => m.id === methodId) ?? sales.methods[0];
  const listPrice = manual ?? unit?.price;
  const chosen = promos.filter((p) => picked.includes(p.id));
  const quote = listPrice ? computeQuote(listPrice, sales, method, chosen) : null;

  if (privacy && settings.mapHidePrice) {
    return (
      <Card id="sales-quote">
        <CardHeader title="Tính giá & dòng tiền" icon={Calculator} />
        <p className="px-4 py-5 text-sm text-slate-500 sm:px-5">Giá đang ẩn ở chế độ khách xem — vui lòng liên hệ để có bảng tính chi tiết.</p>
      </Card>
    );
  }

  const unitInfo = unit && found ? [unit.type?.name, unit.area ? formatArea(unit.area) : '', unit.floor !== undefined ? `tầng ${unit.floor}` : ''].filter(Boolean).join(' · ') : '';

  const copy = async () => {
    if (!quote) return;
    const ok = await copyText(quoteText(quote, { project: project.name, code: found ? unit!.code : undefined, unit: unitInfo, method, maintenancePct: sales.maintenancePct }));
    toast(ok ? 'Đã sao chép bảng tính — dán vào Zalo gửi khách' : 'Không sao chép được', ok ? 'success' : 'error');
  };
  const share = () => {
    if (!quote) return;
    navigator.share?.({ text: quoteText(quote, { project: project.name, code: found ? unit!.code : undefined, unit: unitInfo, method, maintenancePct: sales.maintenancePct }) }).catch(() => undefined);
  };

  return (
    <Card id="sales-quote" className="scroll-mt-24">
      <CardHeader title="Tính giá & dòng tiền" icon={Calculator} description="Giá sau chiết khấu và số tiền từng đợt cho một căn — copy gửi khách" />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="relative">
          <Field label="Căn">
            <TextInput
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setManual(undefined);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 150)}
              placeholder={codes.length ? `Mã căn, VD ${codes[0]}` : 'Mã căn (không bắt buộc)'}
              aria-label="Mã căn"
            />
          </Field>
          {suggestions.length > 0 && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCode(c);
                    setManual(undefined);
                    setFocused(false);
                  }}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {found && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {unitInfo}
              {unit?.status && (
                <Badge size="sm" tone={INVENTORY_STATUS[unit.status].tone}>
                  {INVENTORY_STATUS[unit.status].label}
                </Badge>
              )}
            </p>
          )}
          {code.trim() && !found && !suggestions.length && <p className="mt-1.5 text-xs text-slate-500">Không có căn này trong bảng hàng — nhập giá bên dưới.</p>}
        </div>
        <Field label="Giá niêm yết" hint={unit?.price && manual === undefined ? 'Theo bảng hàng.' : undefined}>
          <MoneyInput value={listPrice} onChange={setManual} placeholder="VD: 3,6" showPreview={false} />
        </Field>
        {sales.methods.length > 0 && (
          <Field label="Phương thức thanh toán">
            <div className="flex flex-wrap gap-1.5">
              {sales.methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethodId(m.id)}
                  aria-pressed={method?.id === m.id}
                  className={cn(
                    'rounded-xl border px-3 py-1.5 text-left text-[13px] font-semibold transition',
                    method?.id === m.id ? 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-500/20' : 'border-slate-200 text-slate-700 hover:border-slate-300',
                  )}
                >
                  {m.name}
                  {m.discountPct > 0 && <span className="ml-1 text-emerald-700">−{fmtPct(m.discountPct)}</span>}
                </button>
              ))}
            </div>
          </Field>
        )}
        {promos.length > 0 && (
          <Field label="Ưu đãi áp dụng">
            <div className="space-y-2">
              {promos.map((p) => {
                const active = promotionActive(p);
                return (
                  <Checkbox
                    key={p.id}
                    checked={picked.includes(p.id)}
                    onChange={(on) => setPicked((s) => (on ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                    label={
                      <span className={cn('flex flex-wrap items-center gap-1.5', !active && 'text-slate-400 line-through')}>
                        <span className={cn('font-bold tabular-nums', p.kind === 'gift' ? 'text-violet-700' : 'text-emerald-700')}>{promotionValueText(p)}</span>
                        {p.name}
                        {!active && <span className="text-xs font-semibold text-rose-600 no-underline">(hết hạn)</span>}
                        {p.internal && <Lock size={12} className="text-amber-600" />}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </Field>
        )}

        {quote ? (
          <div className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200/80">
            <dl className="space-y-1.5 text-sm">
              <QuoteRow label="Giá niêm yết" value={fmtVnd(quote.listPrice)} />
              {quote.discounts.map((d, i) => (
                <QuoteRow key={i} label={d.label} value={`−${fmtVnd(-d.amount)}`} tone="discount" />
              ))}
              {quote.discounts.length > 0 && <QuoteRow label="Giá sau chiết khấu" value={fmtVnd(quote.netPrice)} sub={formatMoney(quote.netPrice)} strong />}
              {quote.maintenance > 0 && <QuoteRow label={`Phí bảo trì ${fmtPct(sales.maintenancePct)} (tạm tính)`} value={fmtVnd(quote.maintenance)} />}
              <QuoteRow label="Tổng thanh toán" value={fmtVnd(quote.total)} sub={formatMoney(quote.total)} strong brand />
            </dl>
            {method && quote.rows.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Dòng tiền · {method.name}</div>
                <ol className="space-y-1.5 text-sm">
                  {quote.rows.map((r, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-slate-700">
                        <b className="font-semibold text-slate-900">{r.label}</b> · {fmtPct(r.pct)}
                        {r.when && <span className="text-slate-500"> · {r.when}</span>}
                        {r.date && <span className="text-slate-400"> · {formatDate(r.date)}</span>}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">{fmtVnd(r.amount)}</span>
                    </li>
                  ))}
                  {quote.maintenance > 0 && (
                    <li className="flex items-start justify-between gap-3 text-slate-600">
                      <span>Phí bảo trì · khi nhận bàn giao</span>
                      <span className="shrink-0 tabular-nums">{fmtVnd(quote.maintenance)}</span>
                    </li>
                  )}
                </ol>
                <TotalHint total={quote.pctTotal} />
              </div>
            )}
            {quote.gifts.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 border-t border-slate-200 pt-3 text-[13px] text-violet-800">
                <Gift size={15} className="mt-0.5 shrink-0" />
                Quà tặng: {quote.gifts.map((g) => (g.value ? `${g.name} (${formatMoney(g.value, '')})` : g.name)).join('; ')}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Copy} onClick={() => void copy()}>
                Copy gửi khách
              </Button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <Button size="sm" icon={Share2} onClick={share}>
                  Chia sẻ
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] text-slate-500">
            {sales.methods.length || promos.length ? 'Chọn căn trong bảng hàng hoặc nhập giá để tính.' : 'Thêm phương thức thanh toán và ưu đãi để tính dòng tiền cho khách.'}
          </p>
        )}

        {editable && (
          <details className="group rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none text-[13px] font-semibold text-slate-600">Cách tính</summary>
            <div className="mt-2 space-y-3 pb-1">
              <Checkbox checked={sales.vatIncluded} onChange={(v) => void save(() => ({ vatIncluded: v }))} label="Giá niêm yết đã gồm VAT" />
              <Checkbox checked={sales.compound} onChange={(v) => void save(() => ({ compound: v }))} label="Chiết khấu sau tính trên giá đã giảm" />
              <Field label="Phí bảo trì" hint="Tính trên giá chưa VAT, đóng khi nhận bàn giao. Nhập 0 nếu không tính.">
                <NumberInput value={sales.maintenancePct} onChange={(v) => void save(() => ({ maintenancePct: Math.min(10, Math.max(0, v ?? 0)) }))} suffix="%" />
              </Field>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

function QuoteRow({ label, value, sub, strong, brand, tone }: { label: ReactNode; value: string; sub?: string; strong?: boolean; brand?: boolean; tone?: 'discount' }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', strong && 'border-t border-slate-200 pt-1.5')}>
      <dt className={cn('min-w-0', strong ? 'font-bold text-slate-900' : 'text-slate-600', tone === 'discount' && 'text-emerald-700')}>{label}</dt>
      <dd className={cn('shrink-0 text-right tabular-nums', strong ? 'font-extrabold' : 'font-semibold', brand ? 'text-brand-800' : tone === 'discount' ? 'text-emerald-700' : 'text-slate-900')}>
        {value}
        {sub && <span className="block text-xs font-medium text-slate-500">{sub}</span>}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------- Tiến độ dự án

const MILESTONE_ICON: Record<MilestoneStatus, ReactNode> = {
  done: <CircleCheck size={22} className="text-emerald-600" fill="#d1fae5" />,
  doing: <CircleDot size={22} className="text-amber-600" fill="#fef3c7" />,
  planned: <Circle size={22} className="text-slate-300" fill="#ffffff" />,
};

function MilestonesCard({ project, editable }: { project: Project; editable: boolean }) {
  const save = useSalesPatch(project);
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<Milestone | null>(null);
  const list = project.sales.milestones;
  const isNew = !!editing && !list.some((m) => m.id === editing.id);
  const add = (label = '') => setEditing({ id: uid(), label, time: '', status: 'planned', note: '' });

  const onSave = async (m: Milestone) => {
    await save((s) => ({ milestones: upsert(s.milestones, m) }));
    setEditing(null);
    toast('Đã lưu mốc tiến độ');
  };
  const onDelete = async (m: Milestone) => {
    if (!(await confirm({ title: `Xoá mốc “${m.label}”?`, confirmLabel: 'Xoá', danger: true }))) return;
    await save((s) => ({ milestones: s.milestones.filter((x) => x.id !== m.id) }));
    setEditing(null);
  };
  const extra = [project.startDate && `Khởi công: ${project.startDate}`, project.construction && `Hiện tại: ${project.construction}`, project.handover && `Bàn giao: ${project.handover}`]
    .filter(Boolean)
    .join('\n');
  const missing = MILESTONE_SUGGESTIONS.filter((s) => !list.some((m) => m.label.trim().toLowerCase() === s.toLowerCase()));

  return (
    <Card id="sales-progress">
      <CardHeader
        title="Tiến độ dự án"
        icon={HardHat}
        description="Các mốc xây dựng, bàn giao, cấp sổ"
        actions={
          editable && (
            <Button size="sm" icon={Plus} onClick={() => add()}>
              Thêm mốc
            </Button>
          )
        }
      />
      {list.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500 sm:px-5">Chưa có mốc tiến độ.</p>
      ) : (
        <ol className="px-4 py-3 sm:px-5">
          {list.map((m, i) => (
            <li key={m.id} id={`ms-${m.id}`} className="relative flex gap-3 pb-4 last:pb-0">
              {i < list.length - 1 && <span className="absolute left-[10px] top-6 h-[calc(100%-1rem)] w-0.5 bg-slate-200" aria-hidden />}
              <span className="relative shrink-0">{MILESTONE_ICON[m.status]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                  <span className="text-[13px] font-semibold text-slate-500">{m.time}</span>
                </div>
                <div className={cn('text-xs font-semibold', m.status === 'done' ? 'text-emerald-700' : m.status === 'doing' ? 'text-amber-700' : 'text-slate-400')}>
                  {MILESTONE_STATUS[m.status].label}
                </div>
                {m.note && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{m.note}</p>}
              </div>
              {editable && <IconButton icon={Pencil} label="Sửa mốc" size="sm" onClick={() => setEditing(m)} />}
            </li>
          ))}
        </ol>
      )}
      {editable && missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-3 sm:px-5">
          <span className="text-xs font-semibold text-slate-500">Thêm nhanh:</span>
          {missing.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800">
              + {s}
            </button>
          ))}
        </div>
      )}
      <NoteBlock title="Trong hồ sơ dự án" text={extra} />
      {editing && <MilestoneModal key={editing.id} item={editing} isNew={isNew} onClose={() => setEditing(null)} onSave={(m) => void onSave(m)} onDelete={(m) => void onDelete(m)} />}
    </Card>
  );
}

function MilestoneModal({ item, isNew, onClose, onSave, onDelete }: { item: Milestone; isNew: boolean; onClose: () => void; onSave: (m: Milestone) => void; onDelete: (m: Milestone) => void }) {
  const [d, setD] = useState(item);
  const set = (patch: Partial<Milestone>) => setD((x) => ({ ...x, ...patch }));
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Thêm mốc tiến độ' : 'Sửa mốc tiến độ'}
      footer={
        <>
          {!isNew && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => onDelete(item)} className="mr-auto">
              Xoá
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!d.label.trim()} onClick={() => onSave({ ...d, label: d.label.trim(), time: d.time.trim(), note: d.note.trim() })}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Mốc" required>
            <TextInput value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="VD: Cất nóc toà A" />
          </Field>
          <Field label="Thời gian">
            <TextInput value={d.time} onChange={(e) => set({ time: e.target.value })} placeholder="VD: 03/2026, Quý IV/2027" />
          </Field>
        </div>
        <Field label="Trạng thái">
          <Segmented
            value={d.status}
            onChange={(status: MilestoneStatus) => set({ status })}
            options={(Object.keys(MILESTONE_STATUS) as MilestoneStatus[]).map((k) => ({ value: k, label: MILESTONE_STATUS[k].label }))}
          />
        </Field>
        <Field label="Ghi chú">
          <TextArea rows={2} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="VD: Đã thi công tới tầng 18" />
        </Field>
      </div>
    </Modal>
  );
}
