import {
  Bath,
  BedDouble,
  Building2,
  CalendarClock,
  ClipboardList,
  Compass,
  Copy,
  CopyPlus,
  Ellipsis,
  FileText,
  Handshake,
  House,
  ImagePlus,
  Images,
  Layers,
  Lock,
  Map,
  MapPin,
  Maximize2,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Ruler,
  Sparkles,
  StickyNote,
  Target,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DocumentManager } from '../components/documents';
import { DropZone, Gallery, ImageManager, useImageUpload } from '../components/media';
import { PropertyStatusBadge } from '../components/property';
import { ShareTextModal } from '../components/share';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  cn,
  Dropdown,
  EmptyState,
  InfoRow,
  PageHeader,
  ResponsiveLabel,
  Select,
  Spec,
} from '../components/ui';
import {
  ACTIVE_CUSTOMER_STATUSES,
  BROKER_CONTRACT_LABEL,
  DIRECTION_LABEL,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  INTEREST_STATUS,
  LEGAL_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  SELLER_RELATION_LABEL,
  TEMPERATURE,
  TRANSACTION_LABEL,
  URGENCY,
  isApartment,
  isLand,
  propertyStatusLabel,
} from '../constants';
import {
  daysFromToday,
  formatArea,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPhone,
  formatPrice,
  formatUnitPrice,
  relativeDay,
  telHref,
  zaloHref,
} from '../lib/format';
import { buildListingText, formatAddress } from '../lib/listing';
import { MATCH_THRESHOLD, mainArea, matchLevel, matchProperty } from '../lib/match';
import { navigate } from '../lib/router';
import { commissionText, needsSummary } from '../lib/summary';
import { digitsOnly } from '../lib/text';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, PropertyStatus } from '../types';
import { NotFound } from './NotFound';

export function PropertyDetail({ id }: { id: string }) {
  const data = useData();
  const { properties, projectById, customers, settings, patchProperty, deleteProperty, duplicateProperty, patchCustomer } = data;
  const { privacy, toast, confirm } = useUI();
  const property = data.propertyById.get(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const owner = useMemo(() => ({ kind: 'property' as const, id }), [id]);
  const uploader = useImageUpload(owner);

  const matches = useMemo(() => {
    if (!property || privacy) return [];
    const projectName = projectById.get(property.projectId)?.name ?? '';
    return customers
      .filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status))
      .map((c) => ({ customer: c, result: matchProperty(c, property, projectName) }))
      .filter((m): m is { customer: Customer; result: NonNullable<ReturnType<typeof matchProperty>> } => !!m.result && m.result.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.result.score - a.result.score)
      .slice(0, 8);
  }, [property, customers, projectById, privacy]);

  const interested = useMemo(
    () =>
      property
        ? customers
            .map((c) => ({ customer: c, interest: c.interests.find((i) => i.propertyId === property.id) }))
            .filter((x) => x.interest)
        : [],
    [customers, property],
  );

  const sameOwner = useMemo(() => {
    if (!property || !digitsOnly(property.seller.phone)) return [];
    const phone = digitsOnly(property.seller.phone);
    return properties.filter((p) => p.id !== property.id && digitsOnly(p.seller.phone) === phone);
  }, [properties, property]);

  if (!property) return <NotFound what="BĐS" backTo="/bds" />;

  const p = property;
  const project = projectById.get(p.projectId);
  const area = mainArea(p);
  const unitPrice = p.transaction === 'ban' ? formatUnitPrice(p.price, area) : '';
  const s = p.seller;
  const contractDays = s.contractExpiry ? daysFromToday(s.contractExpiry) : null;
  const editable = !privacy;

  const setStatus = async (status: PropertyStatus) => {
    await patchProperty(p.id, () => ({ status }));
    toast(`Đã chuyển sang “${propertyStatusLabel(status, p.transaction)}”`);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Xoá ${p.code}?`,
      message: 'BĐS cùng toàn bộ ảnh và giấy tờ đính kèm sẽ bị xoá vĩnh viễn. Nếu chỉ tạm dừng, hãy chuyển trạng thái sang “Tạm ngưng”.',
      confirmLabel: 'Xoá vĩnh viễn',
      danger: true,
    });
    if (!ok) return;
    await deleteProperty(p.id);
    toast(`Đã xoá ${p.code}`);
    navigate('/bds', { replace: true });
  };

  const duplicate = async () => {
    const copy = await duplicateProperty(p.id);
    toast(`Đã tạo bản sao ${copy.code}`);
    navigate(`/bds/${copy.id}/sua`);
  };

  const attachToCustomer = async (c: Customer) => {
    await patchCustomer(c.id, (cur) =>
      cur.interests.some((i) => i.propertyId === p.id)
        ? {}
        : { interests: [{ propertyId: p.id, status: 'de_xuat', note: '', updatedAt: new Date().toISOString() }, ...cur.interests] },
    );
    toast(`Đã thêm vào danh sách tư vấn của ${c.name}`);
  };

  const summary = (
    <>
      <Card className="p-4 sm:p-5">
        <div className="text-[13px] font-semibold text-slate-500">{p.transaction === 'ban' ? 'Giá bán' : 'Giá thuê'}</div>
        <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-brand-800">{formatPrice(p.price, p.transaction)}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-slate-500">
          {unitPrice && <span>≈ {unitPrice}</span>}
          {!!p.price && <span>{p.negotiable ? 'Còn thương lượng' : 'Giá cố định'}</span>}
        </div>
        {editable && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="mb-1.5 block text-[13px] font-semibold text-slate-700">Trạng thái giao dịch</label>
            <Select aria-label="Trạng thái giao dịch" value={p.status} onChange={(e) => void setStatus(e.target.value as PropertyStatus)}>
              {PROPERTY_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {propertyStatusLabel(st, p.transaction)}
                </option>
              ))}
            </Select>
            {p.closedAt && <p className="mt-1.5 text-xs text-slate-500">Chốt giao dịch: {formatDate(p.closedAt)}</p>}
          </div>
        )}
      </Card>

      {!privacy && (
        <Card className="border-amber-200/80">
          <CardHeader
            title="Chủ nhà"
            icon={Lock}
            description="Nội bộ — không hiển thị cho khách"
            className="bg-amber-50/60"
            actions={
              <Badge tone={URGENCY[s.urgency].tone} size="sm">
                {URGENCY[s.urgency].label}
              </Badge>
            }
          />
          {!s.name && !s.phone ? (
            <div className="p-4 text-sm text-slate-500">
              Chưa có thông tin chủ nhà.{' '}
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => navigate(`/bds/${p.id}/sua`)}>
                Bổ sung
              </button>
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Avatar name={s.name || '?'} />
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-900">{s.name || 'Chưa có tên'}</div>
                  <div className="text-xs text-slate-500">{SELLER_RELATION_LABEL[s.relation]}</div>
                </div>
              </div>
              {s.phone && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ButtonLink href={telHref(s.phone)} variant="primary" size="sm" icon={Phone}>
                    {formatPhone(s.phone)}
                  </ButtonLink>
                  <ButtonLink href={zaloHref(s.phone)} target="_blank" rel="noopener noreferrer" size="sm" icon={MessageCircle}>
                    Zalo
                  </ButtonLink>
                </div>
              )}
              <dl className="mt-3 divide-y divide-slate-100">
                <InfoRow label="SĐT khác">{s.phone2 ? <a href={telHref(s.phone2)} className="text-brand-700">{formatPhone(s.phone2)}</a> : undefined}</InfoRow>
                <InfoRow label="Email">{s.email}</InfoRow>
                <InfoRow label="Địa chỉ">{s.address}</InfoRow>
                <InfoRow label="Giá chốt tối thiểu">{s.minPrice ? formatMoney(s.minPrice) : undefined}</InfoRow>
                <InfoRow label="Hoa hồng">{commissionText(p) || undefined}</InfoRow>
                <InfoRow label="Hợp đồng MG">{BROKER_CONTRACT_LABEL[s.contract]}</InfoRow>
                <InfoRow label="Hết hạn HĐ">
                  {s.contractExpiry ? (
                    <span className={cn(contractDays !== null && contractDays < 0 ? 'text-rose-600' : contractDays !== null && contractDays <= 14 ? 'text-amber-700' : '')}>
                      {formatDate(s.contractExpiry)} · {relativeDay(s.contractExpiry)}
                    </span>
                  ) : undefined}
                </InfoRow>
                <InfoRow label="Lý do bán">{s.reason}</InfoRow>
              </dl>
              {s.notes && <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{s.notes}</p>}
              {sameOwner.length > 0 && (
                <div className="mt-3 rounded-xl bg-brand-50/70 p-3 text-[13px]">
                  <div className="font-semibold text-brand-900">Chủ nhà này còn {sameOwner.length} BĐS khác:</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {sameOwner.map((o) => (
                      <button key={o.id} type="button" onClick={() => navigate(`/bds/${o.id}`)} className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                        {o.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        backTo="/bds"
        meta={
          <>
            <Badge tone="slate" className="font-mono">
              {p.code}
            </Badge>
            <PropertyStatusBadge property={p} />
            <Badge tone="blue">{TRANSACTION_LABEL[p.transaction]}</Badge>
            {p.featured && (
              <Badge tone="amber" icon={Sparkles}>
                Nổi bật
              </Badge>
            )}
          </>
        }
        title={p.title || PROPERTY_TYPE_LABEL[p.type]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {formatAddress(p, { hideNumber: privacy }) && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} /> {formatAddress(p, { hideNumber: privacy })}
              </span>
            )}
            {project && (
              <button type="button" onClick={() => navigate(`/du-an/${project.id}`)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                <Building2 size={14} /> {project.name}
                {p.unitCode && <span className="font-normal text-slate-500">· {p.unitCode}</span>}
              </button>
            )}
          </span>
        }
        actions={
          <>
            <Button icon={Copy} onClick={() => setShareOpen(true)}>
              <ResponsiveLabel short="Copy" full="Copy tin đăng" />
            </Button>
            <Button icon={Printer} onClick={() => navigate(`/tu-van?bds=${p.id}`)}>
              <ResponsiveLabel short="Phiếu" full="Phiếu tư vấn" />
            </Button>
            {editable && (
              <>
                <Button variant="primary" icon={Pencil} onClick={() => navigate(`/bds/${p.id}/sua`)}>
                  Sửa
                </Button>
                <Dropdown
                  trigger={(toggle) => <Button icon={Ellipsis} onClick={toggle} aria-label="Thêm thao tác" />}
                  items={[
                    { label: 'Nhân bản (tạo căn tương tự)', icon: CopyPlus, onClick: () => void duplicate() },
                    { label: 'Quản lý hình ảnh', icon: Images, onClick: () => setImagesOpen(true) },
                    { label: 'Xoá BĐS', icon: Trash2, onClick: () => void remove(), danger: true },
                  ]}
                />
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Hình ảnh */}
          {p.images.length === 0 && editable ? (
            <Card className="p-4">
              {uploader.input}
              <DropZone onFiles={uploader.upload} onPick={uploader.pick} busy={!!uploader.progress} title="Thêm ảnh cho BĐS này" />
            </Card>
          ) : (
            <div>
              <Gallery images={p.images} />
              {editable && (
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {uploader.input}
                  <Button size="sm" icon={ImagePlus} onClick={uploader.pick} loading={!!uploader.progress}>
                    {uploader.progress ? `Đang xử lý ${uploader.progress.done}/${uploader.progress.total}` : 'Thêm ảnh'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={Images} onClick={() => setImagesOpen(true)}>
                    Sắp xếp / xoá ảnh
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-5 lg:hidden">{summary}</div>

          {/* Thông số */}
          <Card>
            <CardHeader title="Thông tin chi tiết" icon={ClipboardList} />
            <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 sm:p-5">
              <Spec icon={Maximize2} label={isApartment(p.type) ? 'Diện tích' : 'Diện tích đất'} value={formatArea(area)} />
              <Spec
                icon={Ruler}
                label="Kích thước"
                value={p.width && p.length ? `${formatNumber(p.width, 2)} × ${formatNumber(p.length, 2)} m` : undefined}
              />
              {!isLand(p.type) && <Spec icon={Layers} label="Số tầng" value={p.floors ? `${p.floors} tầng` : undefined} />}
              {!isLand(p.type) && <Spec icon={BedDouble} label="Phòng ngủ" value={p.bedrooms ? `${p.bedrooms} phòng` : undefined} />}
              {!isLand(p.type) && <Spec icon={Bath} label="Phòng tắm / WC" value={p.bathrooms ? `${p.bathrooms} phòng` : undefined} />}
              <Spec icon={Compass} label="Hướng" value={p.direction ? DIRECTION_LABEL[p.direction] : undefined} />
            </div>
            <dl className="grid grid-cols-1 gap-x-8 border-t border-slate-100 px-4 py-2 sm:grid-cols-2 sm:px-5 [&>div]:border-b [&>div]:border-slate-100 [&>div:last-child]:border-0">
              <InfoRow label="Loại hình">{PROPERTY_TYPE_LABEL[p.type]}</InfoRow>
              <InfoRow label="Nhu cầu">{TRANSACTION_LABEL[p.transaction]}</InfoRow>
              <InfoRow label="Pháp lý">{p.legal ? LEGAL_LABEL[p.legal] : undefined}</InfoRow>
              <InfoRow label="Vị trí">
                {p.frontage ? `${FRONTAGE_LABEL[p.frontage]}${p.roadWidth ? ` · đường ${formatNumber(p.roadWidth, 1)} m` : ''}` : undefined}
              </InfoRow>
              <InfoRow label="Diện tích đất">{formatArea(p.landArea)}</InfoRow>
              <InfoRow label={isApartment(p.type) ? 'DT thông thủy / sử dụng' : 'Diện tích sử dụng'}>{formatArea(p.floorArea)}</InfoRow>
              <InfoRow label="Nở hậu">{p.backWidth ? `${formatNumber(p.backWidth, 2)} m` : undefined}</InfoRow>
              <InfoRow label="Hướng ban công">{p.balconyDirection ? DIRECTION_LABEL[p.balconyDirection] : undefined}</InfoRow>
              {!isLand(p.type) && <InfoRow label="Nội thất">{p.furnishing ? FURNISHING_LABEL[p.furnishing] : undefined}</InfoRow>}
              {!isLand(p.type) && <InfoRow label="Năm xây dựng">{p.yearBuilt}</InfoRow>}
              <InfoRow label="Mã căn / Tòa">{p.unitCode}</InfoRow>
              <InfoRow label="Bản đồ">
                {p.mapUrl ? (
                  <a href={p.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    <Map size={14} /> Mở Google Maps
                  </a>
                ) : undefined}
              </InfoRow>
            </dl>
          </Card>

          {(p.description || p.amenities.length > 0) && (
            <Card>
              <CardHeader title="Mô tả" icon={FileText} />
              <div className="space-y-4 p-4 sm:p-5">
                {p.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{p.description}</p>}
                {p.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {p.amenities.map((a) => (
                      <Badge key={a} tone="sky">
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          <DocumentManager
            owner={owner}
            documents={p.documents}
            editable={editable}
            privacy={privacy}
            title="Giấy tờ & tài liệu"
            description={editable ? 'Sổ, hợp đồng, bản vẽ… Mặc định là Nội bộ — chỉ bạn xem được.' : undefined}
          />
        </div>

        {/* Cột phải */}
        <div className="space-y-5">
          <div className="hidden space-y-5 lg:block">{summary}</div>

          {!privacy && p.internalNotes && (
            <Card>
              <CardHeader title="Ghi chú nội bộ" icon={StickyNote} />
              <p className="whitespace-pre-line p-4 text-sm leading-relaxed text-slate-700 sm:p-5">{p.internalNotes}</p>
            </Card>
          )}

          {!privacy && (
            <Card>
              <CardHeader title="Khách hàng phù hợp" icon={Target} description="Tự động ghép theo nhu cầu của khách" />
              {matches.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Chưa có khách phù hợp"
                  description="Khi có khách cùng nhu cầu, họ sẽ hiện ở đây."
                  action={
                    <Button size="sm" icon={UserPlus} onClick={() => navigate('/khach/moi')}>
                      Thêm khách
                    </Button>
                  }
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {matches.map(({ customer: c, result }) => {
                    const level = matchLevel(result.score);
                    const linked = c.interests.some((i) => i.propertyId === p.id);
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <button type="button" onClick={() => navigate(`/khach/${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar name={c.name} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-slate-900">{c.name}</span>
                              <Badge tone={TEMPERATURE[c.temperature].tone} size="sm">
                                {TEMPERATURE[c.temperature].label}
                              </Badge>
                            </div>
                            <div className="truncate text-xs text-slate-500">{needsSummary(c, projectById)}</div>
                          </div>
                        </button>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone={level.tone} size="sm">
                            {result.score}%
                          </Badge>
                          {linked ? (
                            <span className="text-[11px] font-semibold text-emerald-700">Đã gắn</span>
                          ) : (
                            <button type="button" onClick={() => void attachToCustomer(c)} className="text-[11px] font-semibold text-brand-700 hover:underline">
                              + Gắn tư vấn
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {!privacy && interested.length > 0 && (
            <Card>
              <CardHeader title={`Khách đã giới thiệu (${interested.length})`} icon={Handshake} />
              <ul className="divide-y divide-slate-100">
                {interested.map(({ customer: c, interest }) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => navigate(`/khach/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
                      <Avatar name={c.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{c.name}</span>
                      <Badge tone={INTEREST_STATUS[interest!.status].tone} size="sm">
                        {INTEREST_STATUS[interest!.status].label}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="space-y-1 px-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <House size={13} /> Tạo lúc {formatDateTime(p.createdAt)}
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarClock size={13} /> Cập nhật {formatDateTime(p.updatedAt)}
            </div>
          </div>
        </div>
      </div>

      <ShareTextModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Nội dung tin đăng"
        allowHideNumber
        build={(hideNumber) => buildListingText(p, project, settings, { hideNumber })}
      />
      {editable && <ImageManager owner={owner} images={p.images} open={imagesOpen} onClose={() => setImagesOpen(false)} />}
    </>
  );
}
