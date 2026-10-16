import {
  Building2,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock,
  Eye,
  Files,
  Images,
  House,
  Info,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Scale,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  ACTIVE_PROPERTY_STATUSES,
  LEGAL_CHECKLIST,
  LEGAL_REFERENCE,
  LEGAL_STATUS,
  LEGAL_STATUSES,
  PROJECT_STAGE,
  PROPERTY_TYPE_SHORT,
} from '../constants';
import { useFocusRequest } from '../lib/focus';
import { uid } from '../lib/id';
import { legalProgress, resolveChecklist } from '../lib/legal';
import { formatPriceRange, formatProjectAddress } from '../lib/listing';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { FaqItem, LegalItem, LegalItemStatus, Project, Property, UnitTypeRow } from '../types';
import { DocActions } from './documents';
import { ImageView } from './media';
import { Badge, Button, Card, CardHeader, cn, EmptyState, Field, IconButton, Modal, Select, TextArea, TextInput, Toggle } from './ui';

export function ProjectStageBadge({ project, size = 'md' }: { project: Pick<Project, 'stage'>; size?: 'sm' | 'md' }) {
  const s = PROJECT_STAGE[project.stage];
  return (
    <Badge tone={s.tone} dot size={size}>
      {s.label}
    </Badge>
  );
}

export function ProjectCard({ project, unitCount }: { project: Project; unitCount: number }) {
  const p = project;
  const price = formatPriceRange(p.priceFrom, p.priceTo);
  return (
    <button
      type="button"
      onClick={() => navigate(`/du-an/${p.id}`)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="relative">
        <ImageView id={p.images[0]} placeholderIcon={Building2} className="aspect-[16/9] w-full" />
        <div className="absolute left-2.5 top-2.5">
          <ProjectStageBadge project={p} size="sm" />
        </div>
        {p.featured && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">Trọng tâm</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="text-xs font-semibold text-slate-400">
          <span className="font-mono">{p.code}</span>
          {p.developer && <span> · {p.developer}</span>}
        </div>
        <h3 className="text-base font-extrabold leading-snug text-slate-900 group-hover:text-brand-800">{p.name}</h3>
        <p className="line-clamp-1 text-[13px] text-slate-500">{formatProjectAddress(p) || '—'}</p>
        {p.productTypes.length > 0 && (
          <p className="line-clamp-1 text-[13px] text-slate-600">{p.productTypes.map((t) => PROPERTY_TYPE_SHORT[t]).join(' · ')}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="text-[15px] font-extrabold text-brand-800">{price || p.unitPrice || 'Giá: đang cập nhật'}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60 text-center text-xs text-slate-500">
        <Stat icon={Files} value={p.documents.filter((d) => !d.archived).length} label="tài liệu" />
        <Stat icon={Images} value={p.images.length} label="ảnh" />
        <Stat icon={House} value={unitCount} label="căn đang bán" />
      </div>
    </button>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 px-2 py-2.5">
      <Icon size={14} className="text-slate-400" />
      <b className="font-bold text-slate-700">{value}</b>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

export function activeUnitCount(projectId: string, properties: Property[]): number {
  return properties.filter((p) => p.projectId === projectId && ACTIVE_PROPERTY_STATUSES.includes(p.status)).length;
}

// ---------------------------------------------------------------- Checklist pháp lý

const STATUS_ICON: Record<LegalItemStatus, { icon: LucideIcon; className: string }> = {
  co: { icon: CircleCheck, className: 'text-emerald-600' },
  dang_lam: { icon: Clock, className: 'text-amber-600' },
  chua: { icon: CircleX, className: 'text-rose-600' },
  khong_ap_dung: { icon: CircleMinus, className: 'text-slate-400' },
  chua_ro: { icon: CircleDashed, className: 'text-slate-300' },
};

export { legalProgress, resolveChecklist } from '../lib/legal';

export function LegalChecklist({ project, editable }: { project: Project; editable: boolean }) {
  const { patchProject } = useData();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<LegalItem | null>(null);
  const items = resolveChecklist(project);
  const { done, total } = legalProgress(project);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const saveItem = async (item: LegalItem) => {
    await patchProject(project.id, (cur) => {
      const rest = cur.legalChecklist.filter((i) => i.key !== item.key);
      return { legalChecklist: [...rest, item] };
    });
    setEditing(null);
    toast('Đã cập nhật hồ sơ pháp lý');
  };

  const removeItem = async (item: LegalItem) => {
    const ok = await confirm({ title: 'Xoá hạng mục này?', confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    await patchProject(project.id, (cur) => ({ legalChecklist: cur.legalChecklist.filter((i) => i.key !== item.key) }));
    setEditing(null);
  };

  return (
    <Card id="legal-checklist">
      <CardHeader
        title="Checklist hồ sơ pháp lý"
        icon={Scale}
        description="Theo Luật KDBĐS 2023, Luật Nhà ở 2023, Luật Đất đai 2024"
        actions={
          editable && (
            <Button size="sm" icon={Plus} onClick={() => setEditing({ key: uid(), label: '', status: 'co', note: '', custom: true })}>
              Thêm hạng mục
            </Button>
          )
        }
      />
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            Đã có <b className="text-emerald-700">{done}</b> / {total} hồ sơ
          </span>
          <span className="text-xs text-slate-500">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const st = STATUS_ICON[item.status];
          const doc = item.docId ? project.documents.find((d) => d.id === item.docId) : undefined;
          return (
            <li key={item.key} id={`legal-${item.key}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <st.icon size={20} className={cn('mt-0.5 shrink-0', st.className)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('text-sm font-semibold', item.status === 'khong_ap_dung' ? 'text-slate-400 line-through' : 'text-slate-900')}>
                    {item.label}
                  </span>
                  {'scope' in item && item.scope === 'ch' && (
                    <Badge size="sm" tone="slate">
                      Nhà ở HTTTL
                    </Badge>
                  )}
                  <Badge size="sm" tone={LEGAL_STATUS[item.status].tone}>
                    {LEGAL_STATUS[item.status].label}
                  </Badge>
                </div>
                {item.note && <p className="mt-0.5 text-[13px] text-slate-700">{item.note}</p>}
                {'hint' in item && item.hint && !item.note && <p className="mt-0.5 text-xs text-slate-400">{item.hint}</p>}
                {doc && (
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                    <Files size={13} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{doc.name}</span>
                    <DocActions doc={doc} compact />
                  </div>
                )}
              </div>
              {editable && <IconButton icon={Pencil} label="Cập nhật" size="sm" onClick={() => setEditing(item)} />}
            </li>
          );
        })}
      </ul>

      <LegalItemModal
        item={editing}
        project={project}
        onClose={() => setEditing(null)}
        onSave={(item) => void saveItem(item)}
        onDelete={(item) => void removeItem(item)}
      />
    </Card>
  );
}

function LegalItemModal({
  item,
  project,
  onClose,
  onSave,
  onDelete,
}: {
  item: LegalItem | null;
  project: Project;
  onClose: () => void;
  onSave: (item: LegalItem) => void;
  onDelete: (item: LegalItem) => void;
}) {
  const [draft, setDraft] = useState<LegalItem | null>(item);
  const [lastItem, setLastItem] = useState(item);
  if (item !== lastItem) {
    setLastItem(item);
    setDraft(item);
  }
  if (!item || !draft) return null;
  const def = LEGAL_CHECKLIST.find((d) => d.key === item.key);
  const docs = [...project.documents].sort((a, b) => Number(b.category === 'phap_ly') - Number(a.category === 'phap_ly'));

  return (
    <Modal
      open
      onClose={onClose}
      title={item.custom ? (item.label ? 'Sửa hạng mục' : 'Thêm hạng mục pháp lý') : item.label}
      description={def?.hint}
      footer={
        <>
          {item.custom && item.label && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => onDelete(item)} className="mr-auto">
              Xoá
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => onSave({ ...draft, label: draft.label.trim() || 'Hạng mục khác' })} disabled={!!item.custom && !draft.label.trim()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {item.custom && (
          <Field label="Tên hạng mục" required>
            <TextInput value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="VD: Giấy phép bán hàng" />
          </Field>
        )}
        <Field label="Tình trạng">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEGAL_STATUSES.map((s) => {
              const Icon = STATUS_ICON[s].icon;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition',
                    draft.status === s ? 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-500/20' : 'border-slate-200 text-slate-700 hover:border-slate-300',
                  )}
                >
                  <Icon size={17} className={STATUS_ICON[s].className} />
                  {LEGAL_STATUS[s].label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Số / ngày văn bản, cơ quan cấp, ghi chú">
          <TextArea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="VD: QĐ số 1234/QĐ-UBND ngày 12/03/2024 của UBND TP" />
        </Field>
        <Field label="Gắn tài liệu" hint={docs.length ? undefined : 'Dự án chưa có tài liệu. Tải lên ở mục Tài liệu trước.'}>
          <Select value={draft.docId ?? ''} onChange={(e) => setDraft({ ...draft, docId: e.target.value || undefined })} disabled={!docs.length}>
            <option value="">— Không gắn —</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/** Các ngưỡng pháp lý hay dùng khi tư vấn — kèm ngày cập nhật và cảnh báo sửa luật. */
export function LegalReferenceCard() {
  const [open, setOpen] = useState(false);
  useFocusRequest(
    (a) => a === 'legal-reference',
    () => setOpen(true),
  );
  return (
    <Card id="legal-reference">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5">
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Info size={17} />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-slate-900">Ghi nhớ quy định khi tư vấn</span>
            <span className="block text-xs text-slate-500">Đặt cọc, tiến độ thanh toán, chi phí ngoài giá · cập nhật {LEGAL_REFERENCE.asOf}</span>
          </span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 sm:px-5">
          <dl className="divide-y divide-slate-100">
            {LEGAL_REFERENCE.items.map((it) => (
              <div key={it.title} className="py-2.5">
                <dt className="text-[13px] font-bold text-slate-800">{it.title}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{it.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">Căn cứ: {LEGAL_REFERENCE.basis}.</p>
          <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {LEGAL_REFERENCE.caution}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Bảng loại sản phẩm

export function UnitTypesTable({ rows }: { rows: UnitTypeRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold sm:px-5">Loại sản phẩm</th>
            <th className="px-3 py-2.5 font-semibold">Diện tích</th>
            <th className="px-3 py-2.5 font-semibold">Giá</th>
            <th className="px-3 py-2.5 font-semibold">Số lượng</th>
            <th className="px-3 py-2.5 font-semibold">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} id={`ut-${r.id}`}>
              <td className="px-4 py-2.5 font-semibold text-slate-900 sm:px-5">{r.name}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.area}</td>
              <td className="px-3 py-2.5 font-semibold text-brand-800">{r.price}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.quantity}</td>
              <td className="px-3 py-2.5 text-slate-500">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UnitTypesEditor({ rows, onChange }: { rows: UnitTypeRow[]; onChange: (rows: UnitTypeRow[]) => void }) {
  const set = (id: string, patch: Partial<UnitTypeRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Loại #{i + 1}</span>
            <IconButton icon={Trash2} label="Xoá dòng" size="sm" tone="danger" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} placeholder="Tên: 2PN+1, Shophouse…" aria-label="Tên loại sản phẩm" />
            <TextInput value={r.area} onChange={(e) => set(r.id, { area: e.target.value })} placeholder="DT: 65 – 75 m²" aria-label="Diện tích" />
            <TextInput value={r.price} onChange={(e) => set(r.id, { price: e.target.value })} placeholder="Giá: 3,2 – 3,8 tỷ" aria-label="Giá" />
            <TextInput value={r.quantity} onChange={(e) => set(r.id, { quantity: e.target.value })} placeholder="Số lượng: 420 căn" aria-label="Số lượng" />
            <TextInput
              value={r.note}
              onChange={(e) => set(r.id, { note: e.target.value })}
              placeholder="Ghi chú: view, hướng, PN/WC…"
              aria-label="Ghi chú"
              className="sm:col-span-2 lg:col-span-4"
            />
          </div>
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...rows, { id: uid(), name: '', area: '', price: '', quantity: '', note: '' }])}>
        Thêm loại sản phẩm
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- Hỏi đáp tư vấn

/** Mở hộp thoại thêm / sửa câu hỏi Q&A từ bất kỳ đâu (danh sách Q&A, ô Hỏi nhanh). */
export function useFaqEditor(project: Project): { open: (draft?: Partial<FaqItem>) => void; edit: (item: FaqItem) => void; modal: ReactNode } {
  const { patchProject } = useData();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<FaqItem | null>(null);

  const save = async (item: FaqItem) => {
    await patchProject(project.id, (cur) => {
      const exists = cur.faqs.some((f) => f.id === item.id);
      return { faqs: exists ? cur.faqs.map((f) => (f.id === item.id ? item : f)) : [...cur.faqs, item] };
    });
    setEditing(null);
    toast('Đã lưu câu hỏi');
  };

  const remove = async (item: FaqItem) => {
    const ok = await confirm({ title: 'Xoá câu hỏi này?', confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    await patchProject(project.id, (cur) => ({ faqs: cur.faqs.filter((f) => f.id !== item.id) }));
    setEditing(null);
  };

  return {
    open: (draft) => setEditing({ id: uid(), question: '', answer: '', isPublic: false, ...draft }),
    edit: setEditing,
    modal: (
      <FaqModal
        item={editing}
        isNew={!!editing && !project.faqs.some((f) => f.id === editing.id)}
        onClose={() => setEditing(null)}
        onSave={(f) => void save(f)}
        onDelete={(f) => void remove(f)}
      />
    ),
  };
}

export function FaqList({ project, editable }: { project: Project; editable: boolean }) {
  const editor = useFaqEditor(project);
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusRequest(
    (a) => a.startsWith('faq-'),
    (a) => setOpenId(a.slice(4)),
  );

  return (
    <Card>
      <CardHeader
        title={`Hỏi đáp tư vấn (${project.faqs.length})`}
        icon={MessageCircleQuestion}
        description="Câu hỏi khách hay hỏi & cách trả lời — ô Hỏi nhanh sẽ tìm trong đây trước"
        actions={
          editable && (
            <Button size="sm" icon={Plus} onClick={() => editor.open()}>
              Thêm câu hỏi
            </Button>
          )
        }
      />
      {project.faqs.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="Chưa có câu hỏi nào"
          description="Ghi lại các câu khách hay hỏi (pháp lý, tiến độ, vay ngân hàng…) và câu trả lời chuẩn để tư vấn nhất quán."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {project.faqs.map((f) => {
            const open = openId === f.id;
            return (
              <li key={f.id} id={`faq-${f.id}`}>
                <div className="flex items-start gap-2 px-4 py-3 sm:px-5">
                  <button type="button" onClick={() => setOpenId(open ? null : f.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-expanded={open}>
                    <ChevronDown size={17} className={cn('mt-0.5 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
                    <span className="min-w-0">
                      <span className="text-sm font-semibold text-slate-900">{f.question}</span>
                      {f.isPublic && (
                        <Badge size="sm" tone="emerald" icon={Eye} className="ml-2 align-middle">
                          Khách xem được
                        </Badge>
                      )}
                      {!f.answer.trim() && (
                        <Badge size="sm" tone="amber" className="ml-2 align-middle">
                          Chưa có câu trả lời
                        </Badge>
                      )}
                    </span>
                  </button>
                  {editable && <IconButton icon={Pencil} label="Sửa" size="sm" onClick={() => editor.edit(f)} />}
                </div>
                {open && <p className="whitespace-pre-line px-4 pb-4 pl-11 text-sm leading-relaxed text-slate-600 sm:px-5 sm:pl-12">{f.answer || '—'}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {editor.modal}
    </Card>
  );
}

/** Q&A đã cho khách xem — hiện ở trang Tổng quan khi bật Chế độ khách xem. */
export function PublicFaqCard({ project }: { project: Project }) {
  const faqs = project.faqs.filter((f) => f.isPublic && f.question.trim() && f.answer.trim());
  const [openId, setOpenId] = useState<string | null>(null);
  useFocusRequest(
    (a) => a.startsWith('faq-'),
    (a) => setOpenId(a.slice(4)),
  );
  if (!faqs.length) return null;
  return (
    <Card>
      <CardHeader title="Câu hỏi thường gặp" icon={MessageCircleQuestion} />
      <ul className="divide-y divide-slate-100">
        {faqs.map((f) => {
          const open = openId === f.id;
          return (
            <li key={f.id} id={`faq-${f.id}`}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : f.id)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left sm:px-5"
                aria-expanded={open}
              >
                <ChevronDown size={17} className={cn('mt-0.5 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
                <span className="text-sm font-semibold text-slate-900">{f.question}</span>
              </button>
              {open && <p className="whitespace-pre-line px-4 pb-4 pl-11 text-sm leading-relaxed text-slate-600 sm:px-5 sm:pl-12">{f.answer}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FaqModal({
  item,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  item: FaqItem | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (f: FaqItem) => void;
  onDelete: (f: FaqItem) => void;
}) {
  const [draft, setDraft] = useState<FaqItem | null>(item);
  const [last, setLast] = useState(item);
  if (item !== last) {
    setLast(item);
    setDraft(item);
  }
  if (!item || !draft) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Thêm câu hỏi' : 'Sửa câu hỏi'}
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
          <Button variant="primary" onClick={() => onSave({ ...draft, question: draft.question.trim(), answer: draft.answer.trim() })} disabled={!draft.question.trim()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Câu hỏi" required>
          <TextInput value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="VD: Dự án đã có sổ chưa?" />
        </Field>
        <Field label="Câu trả lời" hint={draft.answer.trim() ? undefined : 'Có thể để trống và bổ sung sau khi hỏi lại CĐT / F1.'}>
          <TextArea rows={6} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
        </Field>
        <Toggle
          checked={draft.isPublic}
          onChange={(v) => setDraft({ ...draft, isPublic: v })}
          label="Cho khách xem câu trả lời này"
          description="Hiện trong ô Hỏi nhanh và trang Tổng quan khi bật Chế độ khách xem. Để tắt với câu trả lời chỉ dùng nội bộ (xử lý từ chối, so sánh đối thủ…)."
        />
      </div>
    </Modal>
  );
}
