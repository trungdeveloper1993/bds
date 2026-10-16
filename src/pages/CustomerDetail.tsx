import {
  Building2,
  CalendarCheck,
  CalendarClock,
  Check,
  ClipboardList,
  Ellipsis,
  Handshake,
  History,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Printer,
  Send,
  StickyNote,
  Target,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyInteraction } from '../components/customer';
import { PropertyStatusBadge } from '../components/property';
import { ImageView } from '../components/media';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  cn,
  Dropdown,
  EmptyState,
  Field,
  IconButton,
  InfoRow,
  Modal,
  PageHeader,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '../components/ui';
import {
  CUSTOMER_SOURCE_LABEL,
  CUSTOMER_STATUS,
  CUSTOMER_STATUSES,
  CUSTOMER_TRANSACTION_LABEL,
  DIRECTION_LABEL,
  INTERACTION_KIND_LABEL,
  INTEREST_STATUS,
  INTEREST_STATUSES,
  PAYMENT_LABEL,
  PROPERTY_TYPE_LABEL,
  PURPOSE_LABEL,
  TEMPERATURE,
  TEMPERATURES,
} from '../constants';
import {
  formatAreaRange,
  formatBudget,
  formatDate,
  formatDateTime,
  formatPhone,
  formatPrice,
  relativeDay,
  telHref,
  todayStr,
  toDateTimeInput,
  zaloHref,
} from '../lib/format';
import { uid } from '../lib/id';
import { formatAddress } from '../lib/listing';
import { MATCH_THRESHOLD, matchLevel, matchProperty, type MatchResult } from '../lib/match';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, CustomerStatus, Interaction, InteractionKind, InterestStatus, Property, Temperature } from '../types';
import { NotFound } from './NotFound';

export function CustomerDetail({ id }: { id: string }) {
  const { customerById, properties, propertyById, projectById, patchCustomer, deleteCustomer } = useData();
  const { toast, confirm } = useUI();
  const customer = customerById.get(id);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const matches = useMemo(() => {
    if (!customer) return [];
    return properties
      .map((p) => ({ property: p, result: matchProperty(customer, p, projectById.get(p.projectId)?.name) }))
      .filter((m): m is { property: Property; result: MatchResult } => !!m.result && m.result.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.result.score - a.result.score || b.property.updatedAt.localeCompare(a.property.updatedAt));
  }, [customer, properties, projectById]);

  if (!customer) return <NotFound what="khách hàng" backTo="/khach" />;
  const c = customer;
  const interestIds = new Set(c.interests.map((i) => i.propertyId));
  const suggestions = matches.filter((m) => !interestIds.has(m.property.id));
  const shownMatches = showAllMatches ? suggestions : suggestions.slice(0, 5);

  const patch = (fn: (cur: Customer) => Partial<Customer>, message?: string) =>
    patchCustomer(c.id, fn).then(() => message && toast(message));

  const addInterest = (propertyId: string) =>
    patch(
      (cur) =>
        cur.interests.some((i) => i.propertyId === propertyId)
          ? {}
          : { interests: [{ propertyId, status: 'de_xuat', note: '', updatedAt: new Date().toISOString() }, ...cur.interests] },
      'Đã thêm vào danh sách tư vấn',
    );

  const setInterestStatus = (propertyId: string, status: InterestStatus) =>
    patch((cur) => ({
      interests: cur.interests.map((i) => (i.propertyId === propertyId ? { ...i, status, updatedAt: new Date().toISOString() } : i)),
    }));

  const removeInterest = (propertyId: string) =>
    patch((cur) => ({ interests: cur.interests.filter((i) => i.propertyId !== propertyId) }), 'Đã bỏ khỏi danh sách');

  const setFollowUp = (date: string, note?: string) =>
    patch(() => ({ nextFollowUp: date, nextFollowUpNote: note ?? c.nextFollowUpNote }), date ? `Đã hẹn ${relativeDay(date).toLowerCase()}` : 'Đã xoá lịch hẹn');

  const remove = async () => {
    const ok = await confirm({
      title: `Xoá khách ${c.name}?`,
      message: 'Toàn bộ nhu cầu và nhật ký chăm sóc của khách sẽ bị xoá vĩnh viễn. Nếu khách chỉ tạm ngừng, hãy chuyển trạng thái “Ngừng chăm sóc”.',
      confirmLabel: 'Xoá khách',
      danger: true,
    });
    if (!ok) return;
    await deleteCustomer(c.id);
    toast(`Đã xoá ${c.name}`);
    navigate('/khach', { replace: true });
  };

  const needs: Array<[string, string | undefined]> = [
    ['Nhu cầu', CUSTOMER_TRANSACTION_LABEL[c.transaction]],
    ['Loại hình', c.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', ') || undefined],
    ['Tỉnh / thành', c.province || undefined],
    ['Khu vực', c.locations.join(', ') || undefined],
    ['Ngân sách', formatBudget(c.budgetMin, c.budgetMax) || undefined],
    ['Diện tích', formatAreaRange(c.areaMin, c.areaMax) || undefined],
    ['Phòng ngủ', c.bedroomsMin ? `Từ ${c.bedroomsMin} phòng` : undefined],
    ['Hướng', c.directions.map((d) => DIRECTION_LABEL[d]).join(', ') || undefined],
    ['Pháp lý', c.requireLegal ? 'Chỉ nhận sổ riêng' : undefined],
    ['Mục đích', c.purpose ? PURPOSE_LABEL[c.purpose] : undefined],
    ['Thanh toán', c.payment ? PAYMENT_LABEL[c.payment] : undefined],
  ];

  return (
    <>
      <PageHeader
        backTo="/khach"
        meta={
          <>
            <Badge tone="slate" className="font-mono">
              {c.code}
            </Badge>
            <Badge tone={CUSTOMER_STATUS[c.status].tone} dot>
              {CUSTOMER_STATUS[c.status].label}
            </Badge>
            <Badge tone={TEMPERATURE[c.temperature].tone}>Khách {TEMPERATURE[c.temperature].label.toLowerCase()}</Badge>
          </>
        }
        title={c.name}
        subtitle={[c.phone && formatPhone(c.phone), CUSTOMER_SOURCE_LABEL[c.source], `Thêm ngày ${formatDate(c.createdAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {c.phone && (
              <>
                <ButtonLink href={telHref(c.phone)} icon={Phone}>
                  Gọi
                </ButtonLink>
                <ButtonLink href={zaloHref(c.phone)} target="_blank" rel="noopener noreferrer" icon={MessageCircle}>
                  Zalo
                </ButtonLink>
              </>
            )}
            <Button variant="primary" icon={Pencil} onClick={() => navigate(`/khach/${c.id}/sua`)}>
              Sửa
            </Button>
            <Dropdown
              trigger={(toggle) => <Button icon={Ellipsis} onClick={toggle} aria-label="Thêm thao tác" />}
              items={[
                { label: 'Tạo phiếu tư vấn', icon: Printer, onClick: () => setSheetOpen(true) },
                { label: 'Xoá khách hàng', icon: Trash2, onClick: () => void remove(), danger: true },
              ]}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Nhu cầu của khách" icon={ClipboardList} />
            <div className="p-4 sm:p-5">
              {c.projectIds.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Dự án quan tâm:</span>
                  {c.projectIds.map((pid) => {
                    const project = projectById.get(pid);
                    return project ? (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => navigate(`/du-an/${pid}`)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[13px] font-semibold text-brand-800 hover:bg-brand-100"
                      >
                        <Building2 size={13} /> {project.name}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 [&>div]:border-b [&>div]:border-slate-100">
                {needs.map(([label, value]) => (
                  <InfoRow key={label} label={label}>
                    {value}
                  </InfoRow>
                ))}
              </dl>
              {c.requirements && <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{c.requirements}</p>}
            </div>
          </Card>

          <div className="lg:hidden">
            <FollowUpCard customer={c} onSet={setFollowUp} />
          </div>

          <Card>
            <CardHeader
              title={`BĐS đã giới thiệu (${c.interests.length})`}
              icon={Handshake}
              description="Theo dõi phản hồi của khách với từng căn"
              actions={
                c.interests.length > 0 && (
                  <Button size="sm" icon={Printer} onClick={() => setSheetOpen(true)}>
                    Phiếu tư vấn
                  </Button>
                )
              }
            />
            {c.interests.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title="Chưa giới thiệu BĐS nào"
                description="Thêm từ danh sách “BĐS phù hợp” bên dưới, hoặc từ trang chi tiết BĐS."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.interests.map((interest) => {
                  const p = propertyById.get(interest.propertyId);
                  if (!p) {
                    return (
                      <li key={interest.propertyId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-400 sm:px-5">
                        BĐS đã bị xoá
                        <IconButton icon={X} label="Bỏ" size="sm" onClick={() => void removeInterest(interest.propertyId)} />
                      </li>
                    );
                  }
                  return (
                    <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                      <button type="button" onClick={() => navigate(`/bds/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <ImageView id={p.images[0]} className="h-14 w-[72px] shrink-0 rounded-lg" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-slate-400">{p.code}</span>
                            <PropertyStatusBadge property={p} size="sm" />
                          </div>
                          <div className="truncate text-sm font-semibold text-slate-900">{p.title || PROPERTY_TYPE_LABEL[p.type]}</div>
                          <div className="text-xs font-semibold text-brand-800">{formatPrice(p.price, p.transaction)}</div>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Select
                          value={interest.status}
                          onChange={(e) => void setInterestStatus(p.id, e.target.value as InterestStatus)}
                          className={cn('h-9 py-1.5 text-[13px] font-semibold', interest.status === 'quan_tam' && 'text-emerald-700', interest.status === 'khong_hop' && 'text-rose-700')}
                          aria-label="Phản hồi của khách"
                        >
                          {INTEREST_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {INTEREST_STATUS[s].label}
                            </option>
                          ))}
                        </Select>
                        <IconButton icon={X} label="Bỏ khỏi danh sách" size="sm" onClick={() => void removeInterest(p.id)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`BĐS phù hợp (${suggestions.length})`}
              icon={Target}
              description="Tự động ghép theo nhu cầu — chỉ BĐS đang giao dịch"
            />
            {suggestions.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Chưa có BĐS phù hợp"
                description={matches.length ? 'Các BĐS phù hợp đều đã được giới thiệu.' : 'Thử nới rộng nhu cầu (ngân sách, khu vực) hoặc thêm BĐS mới vào giỏ hàng.'}
                className="py-8"
              />
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {shownMatches.map(({ property: p, result }) => {
                    const level = matchLevel(result.score);
                    const project = projectById.get(p.projectId);
                    return (
                      <li key={p.id} className="px-4 py-3 sm:px-5">
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={() => navigate(`/bds/${p.id}`)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                            <ImageView id={p.images[0]} className="h-16 w-20 shrink-0 rounded-lg" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge tone={level.tone} size="sm">
                                  {result.score}% · {level.label}
                                </Badge>
                                <span className="font-mono text-xs text-slate-400">{p.code}</span>
                              </div>
                              <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">{p.title || PROPERTY_TYPE_LABEL[p.type]}</div>
                              <div className="truncate text-xs text-slate-500">
                                {[project?.name, formatAddress(p, { hideNumber: true })].filter(Boolean).join(' · ')}
                              </div>
                              <div className="text-[13px] font-bold text-brand-800">{formatPrice(p.price, p.transaction)}</div>
                            </div>
                          </button>
                          <Button size="sm" icon={Plus} onClick={() => void addInterest(p.id)} className="shrink-0">
                            <span className="hidden sm:inline">Giới thiệu</span>
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.matched.map((m) => (
                            <span key={m} className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                              <Check size={11} strokeWidth={3} /> {m}
                            </span>
                          ))}
                          {result.missed.map((m) => (
                            <span key={m} className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                              <X size={11} strokeWidth={3} /> {m}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {suggestions.length > 5 && (
                  <div className="border-t border-slate-100 p-3 text-center">
                    <Button size="sm" variant="ghost" onClick={() => setShowAllMatches((v) => !v)}>
                      {showAllMatches ? 'Thu gọn' : `Xem thêm ${suggestions.length - 5} BĐS`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          <InteractionLog customer={c} />
        </div>

        <div className="space-y-5">
          <div className="hidden lg:block">
            <FollowUpCard customer={c} onSet={setFollowUp} />
          </div>

          <Card>
            <CardHeader title="Phân loại" icon={Target} />
            <div className="space-y-4 p-4 sm:p-5">
              <Field label="Trạng thái chăm sóc">
                <Select value={c.status} onChange={(e) => void patch(() => ({ status: e.target.value as CustomerStatus }), 'Đã cập nhật trạng thái')}>
                  {CUSTOMER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CUSTOMER_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mức độ tiềm năng">
                <Segmented
                  value={c.temperature}
                  onChange={(temperature: Temperature) => void patch(() => ({ temperature }))}
                  options={TEMPERATURES.map((t) => ({ value: t, label: TEMPERATURE[t].label }))}
                  className="w-full"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Liên hệ" icon={UserRound} />
            <dl className="divide-y divide-slate-100 px-4 sm:px-5">
              <InfoRow label="Điện thoại">{c.phone ? <a href={telHref(c.phone)} className="text-brand-700">{formatPhone(c.phone)}</a> : undefined}</InfoRow>
              <InfoRow label="SĐT khác">{c.phone2 ? <a href={telHref(c.phone2)} className="text-brand-700">{formatPhone(c.phone2)}</a> : undefined}</InfoRow>
              <InfoRow label="Email">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-brand-700">
                    <Mail size={13} /> {c.email}
                  </a>
                ) : undefined}
              </InfoRow>
              <InfoRow label="Nơi ở">{c.address}</InfoRow>
              <InfoRow label="Nghề nghiệp">{c.occupation}</InfoRow>
              <InfoRow label="Năm sinh">{c.birthYear}</InfoRow>
              <InfoRow label="Nguồn khách">{CUSTOMER_SOURCE_LABEL[c.source]}</InfoRow>
            </dl>
          </Card>

          {c.notes && (
            <Card>
              <CardHeader title="Ghi chú" icon={StickyNote} />
              <p className="whitespace-pre-line p-4 text-sm leading-relaxed text-slate-700 sm:p-5">{c.notes}</p>
            </Card>
          )}

          <p className="px-1 text-xs text-slate-400">Cập nhật {formatDateTime(c.updatedAt)}</p>
        </div>
      </div>

      <ClientSheetPicker open={sheetOpen} onClose={() => setSheetOpen(false)} customer={c} />
    </>
  );
}

function FollowUpCard({ customer: c, onSet }: { customer: Customer; onSet: (date: string, note?: string) => Promise<unknown> }) {
  const [note, setNote] = useState(c.nextFollowUpNote);
  const [custom, setCustom] = useState('');
  const quick = [
    { label: 'Ngày mai', days: 1 },
    { label: '3 ngày', days: 3 },
    { label: '1 tuần', days: 7 },
    { label: '2 tuần', days: 14 },
  ];
  return (
    <Card className={cn(c.nextFollowUp && (relativeDay(c.nextFollowUp).startsWith('Trễ') || relativeDay(c.nextFollowUp) === 'Hôm nay') && 'border-amber-300')}>
      <CardHeader title="Lịch chăm sóc tiếp" icon={CalendarClock} />
      <div className="space-y-3 p-4 sm:p-5">
        {c.nextFollowUp ? (
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-lg font-extrabold text-slate-900">{relativeDay(c.nextFollowUp)}</div>
              <div className="text-xs text-slate-500">{formatDate(c.nextFollowUp)}</div>
              {c.nextFollowUpNote && <p className="mt-1 text-sm text-slate-700">{c.nextFollowUpNote}</p>}
            </div>
            <Button size="sm" variant="soft" icon={CalendarCheck} onClick={() => void onSet('', '')}>
              Đã xong
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Chưa hẹn lịch chăm sóc.</p>
        )}
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nội dung hẹn: gọi lại, gửi bảng giá…" />
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <Button key={q.days} size="sm" onClick={() => void onSet(todayStr(q.days), note)}>
              {q.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput type="date" value={custom} min={todayStr()} onChange={(e) => setCustom(e.target.value)} aria-label="Chọn ngày hẹn" />
          <Button size="md" disabled={!custom} onClick={() => void onSet(custom, note).then(() => setCustom(''))}>
            Đặt
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InteractionLog({ customer: c }: { customer: Customer }) {
  const { patchCustomer, propertyById, properties } = useData();
  const { toast, confirm } = useUI();
  const [kind, setKind] = useState<InteractionKind>('goi_dien');
  const [at, setAt] = useState(() => toDateTimeInput());
  const [content, setContent] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  const interestProps = c.interests.map((i) => propertyById.get(i.propertyId)).filter((p): p is Property => !!p);
  const otherProps = properties.filter((p) => !c.interests.some((i) => i.propertyId === p.id)).slice(0, 80);

  const add = async () => {
    if (!content.trim() && kind === 'khac') return;
    setSaving(true);
    const interaction: Interaction = {
      id: uid(),
      at: new Date(at).toISOString(),
      kind,
      content: content.trim(),
      propertyId: propertyId || undefined,
    };
    let changed: string[] = [];
    await patchCustomer(c.id, (cur) => {
      const result = applyInteraction(cur, interaction);
      changed = result.changed;
      return {
        interactions: [interaction, ...cur.interactions].sort((a, b) => b.at.localeCompare(a.at)),
        status: result.status,
        interests: result.interests,
        ...(nextDate ? { nextFollowUp: nextDate } : {}),
      };
    });
    setSaving(false);
    setContent('');
    setPropertyId('');
    setNextDate('');
    setAt(toDateTimeInput());
    toast(`Đã ghi nhật ký${changed.length ? ` · ${changed.join(', ')}` : ''}`);
  };

  const remove = async (item: Interaction) => {
    const ok = await confirm({ title: 'Xoá mục nhật ký này?', confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    await patchCustomer(c.id, (cur) => ({ interactions: cur.interactions.filter((i) => i.id !== item.id) }));
  };

  return (
    <Card>
      <CardHeader title={`Nhật ký chăm sóc (${c.interactions.length})`} icon={History} />
      <div className="space-y-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)} aria-label="Loại chăm sóc">
            {(Object.keys(INTERACTION_KIND_LABEL) as InteractionKind[]).map((k) => (
              <option key={k} value={k}>
                {INTERACTION_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <TextInput type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Thời gian" />
        </div>
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="BĐS liên quan">
          <option value="">— Không gắn BĐS —</option>
          {interestProps.length > 0 && (
            <optgroup label="Đã giới thiệu">
              {interestProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.title || PROPERTY_TYPE_LABEL[p.type]}
                </option>
              ))}
            </optgroup>
          )}
          {otherProps.length > 0 && (
            <optgroup label="BĐS khác">
              {otherProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.title || PROPERTY_TYPE_LABEL[p.type]}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <TextArea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nội dung trao đổi, phản hồi của khách…" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-slate-600">
            Hẹn lại:
            <TextInput type="date" value={nextDate} min={todayStr()} onChange={(e) => setNextDate(e.target.value)} className="h-9 w-auto py-1.5" />
          </label>
          <Button variant="primary" icon={Send} onClick={() => void add()} loading={saving}>
            Ghi nhật ký
          </Button>
        </div>
      </div>
      {c.interactions.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">Chưa có lần chăm sóc nào.</p>
      ) : (
        <ol className="relative space-y-0 px-4 py-3 sm:px-5">
          {c.interactions.map((item) => {
            const p = item.propertyId ? propertyById.get(item.propertyId) : undefined;
            return (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-1">
                <div className="flex flex-col items-center">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-100" />
                  <span className="w-px flex-1 bg-slate-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold text-slate-900">{INTERACTION_KIND_LABEL[item.kind]}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(item.at)}</span>
                  </div>
                  {item.propertyId && (
                    <button
                      type="button"
                      disabled={!p}
                      onClick={() => p && navigate(`/bds/${p.id}`)}
                      className="mt-0.5 text-left text-xs font-semibold text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                    >
                      {p ? `${p.code} · ${p.title || PROPERTY_TYPE_LABEL[p.type]}` : 'BĐS đã bị xoá'}
                    </button>
                  )}
                  {item.content && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.content}</p>}
                </div>
                <IconButton icon={Trash2} label="Xoá" size="sm" onClick={() => void remove(item)} className="opacity-60 hover:opacity-100" />
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Chọn các căn đưa vào phiếu tư vấn gửi khách. */
function ClientSheetPicker({ open, onClose, customer }: { open: boolean; onClose: () => void; customer: Customer }) {
  const { propertyById } = useData();
  const items = customer.interests.map((i) => ({ interest: i, property: propertyById.get(i.propertyId) })).filter((x) => x.property);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSelected(new Set(items.filter((x) => x.interest.status !== 'khong_hop').map((x) => x.interest.propertyId)));
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo phiếu tư vấn"
      description="Chọn BĐS muốn gửi khách. Phiếu chỉ gồm thông tin công khai, có thể in hoặc lưu PDF gửi qua Zalo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            icon={Printer}
            disabled={selected.size === 0}
            onClick={() => {
              onClose();
              navigate(`/tu-van?kh=${customer.id}&bds=${[...selected].join(',')}`);
            }}
          >
            Tạo phiếu ({selected.size})
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Khách chưa có BĐS nào trong danh sách giới thiệu.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ interest, property: p }) => (
            <li key={p!.id} className="rounded-xl border border-slate-200 p-3">
              <Checkbox
                checked={selected.has(p!.id)}
                onChange={(on) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (on) next.add(p!.id);
                    else next.delete(p!.id);
                    return next;
                  })
                }
                label={
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">
                      {p!.code} · {p!.title || PROPERTY_TYPE_LABEL[p!.type]}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatPrice(p!.price, p!.transaction)} · {INTEREST_STATUS[interest.status].label}
                    </span>
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
