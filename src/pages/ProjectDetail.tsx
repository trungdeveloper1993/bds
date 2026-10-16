import {
  Banknote,
  Building2,
  CalendarClock,
  Copy,
  Ellipsis,
  ExternalLink,
  FileText,
  Globe,
  HandCoins,
  House,
  ImagePlus,
  Images,
  KeyRound,
  Landmark,
  Lightbulb,
  Lock,
  Map,
  MapPin,
  Pencil,
  Plus,
  Printer,
  Route,
  Scale,
  Sparkles,
  StickyNote,
  Swords,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DocActions, DocumentManager, FileTypeIcon } from '../components/documents';
import { DropZone, Gallery, ImageManager, ImageView, Lightbox, useImageUpload } from '../components/media';
import { FaqList, LegalChecklist, LegalReferenceCard, legalProgress, ProjectStageBadge, UnitTypesTable } from '../components/project';
import { PropertyRow } from '../components/property';
import { ShareTextModal } from '../components/share';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Dropdown,
  EmptyState,
  InfoRow,
  PageHeader,
  ResponsiveLabel,
  Spec,
  TabBar,
} from '../components/ui';
import {
  ACTIVE_PROPERTY_STATUSES,
  CUSTOMER_STATUS,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  TEMPERATURE,
  propertyStatusLabel,
} from '../constants';
import { formatDateTime, formatNumber, relativeDay } from '../lib/format';
import { buildProjectText, formatPriceRange, formatProjectAddress } from '../lib/listing';
import { navigate, useLocation } from '../lib/router';
import { needsSummary } from '../lib/summary';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Project } from '../types';
import { NotFound } from './NotFound';

type TabKey = 'tong-quan' | 'phap-ly' | 'tai-lieu' | 'hinh-anh' | 'gio-hang' | 'khach' | 'noi-bo';

export function ProjectDetail({ id }: { id: string }) {
  const { projectById, properties, customers, settings, deleteProject } = useData();
  const { privacy, toast, confirm } = useUI();
  const { query } = useLocation();
  const project = projectById.get(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const owner = useMemo(() => ({ kind: 'project' as const, id }), [id]);

  const units = useMemo(() => properties.filter((p) => p.projectId === id), [properties, id]);
  const interestedCustomers = useMemo(() => {
    const unitIds = new Set(units.map((u) => u.id));
    return customers.filter((c) => c.projectIds.includes(id) || c.interests.some((i) => unitIds.has(i.propertyId)));
  }, [customers, units, id]);

  if (!project) return <NotFound what="dự án" backTo="/du-an" />;

  const p = project;
  const requested = (query.get('tab') as TabKey | null) ?? 'tong-quan';
  const tab: TabKey = privacy && (requested === 'khach' || requested === 'noi-bo') ? 'tong-quan' : requested;
  const setTab = (t: TabKey) => navigate(`/du-an/${id}${t === 'tong-quan' ? '' : `?tab=${t}`}`, { replace: true });

  const editable = !privacy;
  const legal = legalProgress(p);
  const activeUnits = units.filter((u) => ACTIVE_PROPERTY_STATUSES.includes(u.status));
  const visibleDocs = p.documents.filter((d) => !(privacy && d.visibility === 'internal'));
  const price = formatPriceRange(p.priceFrom, p.priceTo);

  const remove = async () => {
    const heavy = p.documents.length + p.images.length > 0;
    const ok = await confirm({
      title: `Xoá dự án ${p.name}?`,
      message: (
        <>
          Toàn bộ <b>{p.documents.length} tài liệu</b> và <b>{p.images.length} ảnh</b> của dự án sẽ bị xoá vĩnh viễn.
          {units.length > 0 && <> {units.length} BĐS thuộc dự án vẫn được giữ lại (chuyển thành BĐS lẻ).</>}
        </>
      ),
      confirmLabel: 'Xoá dự án',
      danger: true,
      requireText: heavy ? 'XOA' : undefined,
    });
    if (!ok) return;
    await deleteProject(p.id);
    toast(`Đã xoá dự án ${p.name}`);
    navigate('/du-an', { replace: true });
  };

  const tabs: Array<{ value: TabKey; label: string; count?: number; hidden?: boolean }> = [
    { value: 'tong-quan', label: 'Tổng quan' },
    { value: 'phap-ly', label: 'Pháp lý', count: legal.done },
    { value: 'tai-lieu', label: 'Tài liệu', count: visibleDocs.filter((d) => !d.archived).length },
    { value: 'hinh-anh', label: 'Hình ảnh', count: p.images.length },
    { value: 'gio-hang', label: 'Giỏ hàng', count: activeUnits.length },
    { value: 'khach', label: 'Khách quan tâm', count: interestedCustomers.length, hidden: privacy },
    { value: 'noi-bo', label: 'Nội bộ & Q&A', hidden: privacy },
  ];

  return (
    <>
      <PageHeader
        backTo="/du-an"
        meta={
          <>
            <Badge tone="slate" className="font-mono">
              {p.code}
            </Badge>
            <ProjectStageBadge project={p} />
            {p.featured && (
              <Badge tone="amber" icon={Sparkles}>
                Trọng tâm
              </Badge>
            )}
          </>
        }
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {p.developer && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={14} /> CĐT: <b className="font-semibold text-slate-700">{p.developer}</b>
              </span>
            )}
            {formatProjectAddress(p) && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} /> {formatProjectAddress(p)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button icon={Copy} onClick={() => setShareOpen(true)}>
              <ResponsiveLabel short="Copy" full="Copy giới thiệu" />
            </Button>
            <Button icon={Printer} onClick={() => navigate(`/tu-van?da=${p.id}`)}>
              <ResponsiveLabel short="Phiếu" full="Phiếu tư vấn" />
            </Button>
            {editable && (
              <>
                <Button variant="primary" icon={Pencil} onClick={() => navigate(`/du-an/${p.id}/sua`)}>
                  Sửa
                </Button>
                <Dropdown
                  trigger={(toggle) => <Button icon={Ellipsis} onClick={toggle} aria-label="Thêm thao tác" />}
                  items={[
                    { label: 'Thêm căn vào dự án', icon: Plus, onClick: () => navigate(`/bds/moi?du-an=${p.id}`) },
                    { label: 'Quản lý hình ảnh', icon: Images, onClick: () => setImagesOpen(true) },
                    { label: 'Xoá dự án', icon: Trash2, onClick: () => void remove(), danger: true },
                  ]}
                />
              </>
            )}
          </>
        }
      />

      {p.images.length > 0 && (
        <div className="mb-4">
          <Gallery images={p.images} placeholderIcon={Building2} aspect="aspect-[16/9] lg:aspect-[21/8]" />
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Spec icon={Banknote} label="Giá" value={price || p.unitPrice || 'Đang cập nhật'} />
        <Spec icon={TrendingUp} label="Đơn giá" value={p.unitPrice || '—'} />
        <Spec icon={KeyRound} label="Bàn giao" value={p.handover || '—'} />
        <Spec icon={Landmark} label="Sở hữu" value={p.ownership || '—'} />
        <Spec icon={Scale} label="Hồ sơ pháp lý" value={`${legal.done}/${legal.total} đã có`} />
        <Spec icon={House} label="Giỏ hàng" value={`${activeUnits.length} căn đang bán`} />
      </div>

      <TabBar value={tab} onChange={setTab} tabs={tabs} className="mb-5" />

      {tab === 'tong-quan' && (
        <OverviewTab project={p} editable={editable} privacy={privacy} onAddImages={() => setTab('hinh-anh')} />
      )}

      {tab === 'phap-ly' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <LegalChecklist project={p} editable={editable} />
          </div>
          <div className="space-y-5">
            {(p.legalStatus || p.ownership) && (
              <Card>
                <CardHeader title="Tóm tắt pháp lý" icon={Scale} />
                <div className="space-y-2 p-4 sm:p-5">
                  {p.ownership && (
                    <p className="text-sm">
                      <span className="text-slate-500">Hình thức sở hữu: </span>
                      <b className="text-slate-800">{p.ownership}</b>
                    </p>
                  )}
                  {p.legalStatus && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.legalStatus}</p>}
                </div>
              </Card>
            )}
            <LegalDocsCard project={p} privacy={privacy} onAll={() => setTab('tai-lieu')} />
            <LegalReferenceCard />
          </div>
        </div>
      )}

      {tab === 'tai-lieu' && (
        <DocumentManager
          owner={owner}
          documents={p.documents}
          editable={editable}
          privacy={privacy}
          title="Tài liệu dự án"
          description="Bộ tài liệu bán hàng: pháp lý, bảng giá, chính sách, mặt bằng, hợp đồng mẫu…"
        />
      )}

      {tab === 'hinh-anh' && <ImagesTab project={p} editable={editable} onManage={() => setImagesOpen(true)} />}

      {tab === 'gio-hang' && (
        <Card>
          <CardHeader
            title={`Giỏ hàng của dự án (${units.length})`}
            icon={House}
            description={PROPERTY_STATUSES.filter((s) => units.some((u) => u.status === s))
              .map((s) => `${units.filter((u) => u.status === s).length} ${propertyStatusLabel(s, 'ban').toLowerCase()}`)
              .join(' · ')}
            actions={
              <>
                {units.length > 0 && (
                  <Button size="sm" onClick={() => navigate(`/bds?du-an=${p.id}`)}>
                    Lọc trong giỏ hàng
                  </Button>
                )}
                {editable && (
                  <Button size="sm" variant="primary" icon={Plus} onClick={() => navigate(`/bds/moi?du-an=${p.id}`)}>
                    Thêm căn
                  </Button>
                )}
              </>
            }
          />
          {units.length === 0 ? (
            <EmptyState icon={House} title="Chưa có căn nào" description="Thêm các căn chủ nhà gửi bán / cho thuê trong dự án này để quản lý và ghép khách." />
          ) : (
            <div className="divide-y divide-slate-100">
              {[...units]
                .sort((a, b) => Number(!ACTIVE_PROPERTY_STATUSES.includes(a.status)) - Number(!ACTIVE_PROPERTY_STATUSES.includes(b.status)) || b.updatedAt.localeCompare(a.updatedAt))
                .map((u) => (
                  <PropertyRow key={u.id} property={u} project={p} privacy={privacy} />
                ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'khach' && !privacy && (
        <Card>
          <CardHeader title={`Khách quan tâm dự án (${interestedCustomers.length})`} icon={Users} description="Khách chọn dự án này trong nhu cầu, hoặc đã được giới thiệu căn trong dự án" />
          {interestedCustomers.length === 0 ? (
            <EmptyState icon={Users} title="Chưa có khách quan tâm" description="Khi tạo khách hàng, chọn dự án này ở mục “Dự án quan tâm”." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {interestedCustomers.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => navigate(`/khach/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <Badge tone={TEMPERATURE[c.temperature].tone} size="sm">
                          {TEMPERATURE[c.temperature].label}
                        </Badge>
                        <Badge tone={CUSTOMER_STATUS[c.status].tone} size="sm">
                          {CUSTOMER_STATUS[c.status].label}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-slate-500">{needsSummary(c, projectById)}</div>
                    </div>
                    {c.nextFollowUp && <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:block">{relativeDay(c.nextFollowUp)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'noi-bo' && !privacy && <InternalTab project={p} />}

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={13} /> Cập nhật {formatDateTime(p.updatedAt)}
        </span>
        {p.infoSource && !privacy && <span>Nguồn: {p.infoSource}</span>}
      </div>

      <ShareTextModal open={shareOpen} onClose={() => setShareOpen(false)} title="Giới thiệu dự án" build={() => buildProjectText(p, settings)} />
      {editable && <ImageManager owner={owner} images={p.images} open={imagesOpen} onClose={() => setImagesOpen(false)} />}
    </>
  );
}

function TextBlock({ title, icon, children, tone }: { title: string; icon: LucideIcon; children: ReactNode; tone?: 'internal' }) {
  return (
    <Card className={tone === 'internal' ? 'border-amber-200/80' : ''}>
      <CardHeader title={title} icon={icon} className={tone === 'internal' ? 'bg-amber-50/60' : ''} />
      <div className="whitespace-pre-line p-4 text-sm leading-relaxed text-slate-700 sm:p-5">{children}</div>
    </Card>
  );
}

function bulletLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*+]\s*/, ''))
    .filter(Boolean);
}

function OverviewTab({ project: p, editable, privacy, onAddImages }: { project: Project; editable: boolean; privacy: boolean; onAddImages: () => void }) {
  const highlights = bulletLines(p.highlights);
  const hasFacts =
    p.legalName || p.devPartner || p.contractor || p.designer || p.operator || p.distributor || p.siteArea || p.density || p.scale || p.totalUnits || p.unitAreaRange;
  const empty = !p.description && !highlights.length && !hasFacts && !p.unitTypes.length && !p.paymentPlan && !p.banks && !p.salesPolicy;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {editable && p.images.length === 0 && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <ImagePlus size={20} />
              </span>
              <div>
                <div className="text-sm font-bold text-slate-900">Dự án chưa có hình ảnh</div>
                <div className="text-xs text-slate-500">Thêm phối cảnh, ảnh thực tế để giới thiệu khách.</div>
              </div>
            </div>
            <Button size="sm" icon={ImagePlus} onClick={onAddImages}>
              Thêm ảnh
            </Button>
          </Card>
        )}

        {empty && (
          <Card>
            <EmptyState
              icon={FileText}
              title="Hồ sơ dự án còn trống"
              description="Bổ sung tổng quan, quy mô, giá, thanh toán… để tư vấn khách đầy đủ."
              action={
                editable && (
                  <Button variant="primary" icon={Pencil} onClick={() => navigate(`/du-an/${p.id}/sua`)}>
                    Bổ sung thông tin
                  </Button>
                )
              }
            />
          </Card>
        )}

        {(p.description || highlights.length > 0) && (
          <Card>
            <CardHeader title="Giới thiệu dự án" icon={FileText} />
            <div className="space-y-4 p-4 sm:p-5">
              {p.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{p.description}</p>}
              {highlights.length > 0 && (
                <div className="rounded-xl bg-brand-50/60 p-4">
                  <h3 className="mb-2 text-sm font-bold text-brand-900">Điểm nổi bật</h3>
                  <ul className="space-y-1.5">
                    {highlights.map((h) => (
                      <li key={h} className="flex gap-2 text-sm text-slate-700">
                        <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-600" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        {hasFacts && (
          <Card>
            <CardHeader title="Thông tin dự án" icon={Building2} />
            <dl className="grid grid-cols-1 gap-x-8 px-4 py-2 sm:grid-cols-2 sm:px-5 [&>div]:border-b [&>div]:border-slate-100">
              <InfoRow label="Tên thương mại">{p.name}</InfoRow>
              <InfoRow label="Tên pháp lý / khác">{p.legalName}</InfoRow>
              <InfoRow label="Chủ đầu tư">{p.developer}</InfoRow>
              <InfoRow label="Đơn vị phát triển">{p.devPartner}</InfoRow>
              <InfoRow label="Tổng thầu xây dựng">{p.contractor}</InfoRow>
              <InfoRow label="Thiết kế">{p.designer}</InfoRow>
              <InfoRow label="Quản lý vận hành">{p.operator}</InfoRow>
              <InfoRow label="Đơn vị phân phối">{p.distributor}</InfoRow>
              <InfoRow label="Tổng diện tích">{p.siteArea ? `${formatNumber(p.siteArea, 2)} ha` : undefined}</InfoRow>
              <InfoRow label="Mật độ xây dựng">{p.density ? `${formatNumber(p.density, 1)}%` : undefined}</InfoRow>
              <InfoRow label="Quy mô">{p.scale}</InfoRow>
              <InfoRow label="Tổng số sản phẩm">{p.totalUnits ? p.totalUnits.toLocaleString('vi-VN') : undefined}</InfoRow>
              <InfoRow label="Loại hình">{p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', ') || undefined}</InfoRow>
              <InfoRow label="Diện tích sản phẩm">{p.unitAreaRange}</InfoRow>
              <InfoRow label="Khởi công">{p.startDate}</InfoRow>
              <InfoRow label="Bàn giao">{p.handover}</InfoRow>
              <InfoRow label="Tiến độ hiện tại">{p.construction}</InfoRow>
              <InfoRow label="Tiêu chuẩn bàn giao">{p.handoverStandard}</InfoRow>
              <InfoRow label="Phí quản lý">{p.managementFee}</InfoRow>
              <InfoRow label="Phí gửi xe">{p.parkingFee}</InfoRow>
            </dl>
          </Card>
        )}

        {(p.priceFrom || p.priceTo || p.unitPrice || p.unitTypes.length > 0) && (
          <Card>
            <CardHeader
              title="Sản phẩm & giá"
              icon={Banknote}
              description={[formatPriceRange(p.priceFrom, p.priceTo), p.unitPrice].filter(Boolean).join(' · ') || undefined}
            />
            {p.priceNote && <p className="border-b border-slate-100 px-4 py-2.5 text-[13px] text-slate-600 sm:px-5">{p.priceNote}</p>}
            <UnitTypesTable rows={p.unitTypes} />
          </Card>
        )}

        {(p.paymentPlan || p.banks || p.salesPolicy) && (
          <Card>
            <CardHeader title="Thanh toán & chính sách" icon={HandCoins} />
            <div className="divide-y divide-slate-100">
              {p.paymentPlan && <TextRow label="Phương thức thanh toán" text={p.paymentPlan} />}
              {p.banks && <TextRow label="Ngân hàng bảo lãnh / cho vay" text={p.banks} />}
              {p.salesPolicy && <TextRow label="Chính sách bán hàng" text={p.salesPolicy} />}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        {(formatProjectAddress(p) || p.connectivity || p.nearby.length > 0 || p.mapUrl) && (
          <Card>
            <CardHeader title="Vị trí & kết nối" icon={Route} />
            <div className="space-y-3 p-4 sm:p-5">
              {formatProjectAddress(p) && (
                <p className="flex gap-2 text-sm text-slate-700">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  {formatProjectAddress(p)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {p.mapUrl && (
                  <a href={p.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100">
                    <Map size={13} /> Google Maps
                  </a>
                )}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Globe size={13} /> Website <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {p.connectivity && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.connectivity}</p>}
              {p.nearby.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Tiện ích ngoại khu</h3>
                  <ul className="space-y-1">
                    {p.nearby.map((n) => (
                      <li key={n} className="text-sm text-slate-700">
                        • {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}
        {p.amenities.length > 0 && (
          <Card>
            <CardHeader title="Tiện ích nội khu" icon={Sparkles} />
            <div className="flex flex-wrap gap-2 p-4 sm:p-5">
              {p.amenities.map((a) => (
                <Badge key={a} tone="sky">
                  {a}
                </Badge>
              ))}
            </div>
          </Card>
        )}
        {!privacy && (p.cautions || p.commission) && (
          <Card className="border-amber-200/80">
            <CardHeader title="Lưu ý nội bộ" icon={Lock} className="bg-amber-50/60" />
            <div className="space-y-3 p-4 text-sm sm:p-5">
              {p.cautions && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-900">
                    <TriangleAlert size={14} /> Điểm cần lưu ý
                  </div>
                  <p className="whitespace-pre-line text-slate-700">{p.cautions}</p>
                </div>
              )}
              {p.commission && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-900">
                    <HandCoins size={14} /> Hoa hồng
                  </div>
                  <p className="whitespace-pre-line text-slate-700">{p.commission}</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function TextRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}

function LegalDocsCard({ project, privacy, onAll }: { project: Project; privacy: boolean; onAll: () => void }) {
  const docs = project.documents.filter((d) => d.category === 'phap_ly' && !d.archived && !(privacy && d.visibility === 'internal'));
  return (
    <Card>
      <CardHeader
        title={`Văn bản pháp lý (${docs.length})`}
        icon={FileText}
        actions={
          <button type="button" onClick={onAll} className="text-xs font-semibold text-brand-700 hover:underline">
            Tất cả tài liệu
          </button>
        }
      />
      {docs.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500 sm:px-5">Chưa có văn bản pháp lý. Tải lên ở tab Tài liệu, nhóm “Pháp lý dự án”.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-4 py-2.5 sm:px-5">
              <FileTypeIcon type={d.type} name={d.name} className="size-8 rounded-lg [&_svg]:size-4" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{d.name}</span>
              <DocActions doc={d} compact />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ImagesTab({ project, editable, onManage }: { project: Project; editable: boolean; onManage: () => void }) {
  const owner = useMemo(() => ({ kind: 'project' as const, id: project.id }), [project.id]);
  const uploader = useImageUpload(owner);
  const [index, setIndex] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader
        title={`Hình ảnh dự án (${project.images.length})`}
        icon={Images}
        description="Phối cảnh, ảnh thực tế, nhà mẫu, tiến độ… Ảnh gốc độ phân giải cao nên tải ở mục Tài liệu."
        actions={
          editable && (
            <>
              {project.images.length > 1 && (
                <Button size="sm" variant="ghost" onClick={onManage}>
                  Sắp xếp / xoá
                </Button>
              )}
              <Button size="sm" variant="primary" icon={ImagePlus} onClick={uploader.pick} loading={!!uploader.progress}>
                {uploader.progress ? `Đang xử lý ${uploader.progress.done}/${uploader.progress.total}` : 'Thêm ảnh'}
              </Button>
            </>
          )
        }
      />
      {uploader.input}
      {project.images.length === 0 ? (
        editable ? (
          <div className="p-4 sm:p-5">
            <DropZone onFiles={uploader.upload} onPick={uploader.pick} busy={!!uploader.progress} />
          </div>
        ) : (
          <EmptyState icon={Images} title="Chưa có hình ảnh" />
        )
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4">
          {project.images.map((imgId, i) => (
            <button key={imgId} type="button" onClick={() => setIndex(i)} className="overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:opacity-90">
              <ImageView id={imgId} placeholderIcon={Building2} className="aspect-[4/3] w-full" />
            </button>
          ))}
        </div>
      )}
      {index !== null && <Lightbox images={project.images} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />}
    </Card>
  );
}

function InternalTab({ project: p }: { project: Project }) {
  const blocks: Array<{ title: string; icon: LucideIcon; text: string }> = [
    { title: 'Điểm cần lưu ý khi tư vấn', icon: TriangleAlert, text: p.cautions },
    { title: 'So sánh dự án cạnh tranh', icon: Swords, text: p.competitors },
    { title: 'Thị trường thứ cấp & cho thuê', icon: TrendingUp, text: p.marketInfo },
    { title: 'Chính sách hoa hồng', icon: HandCoins, text: p.commission },
    { title: 'Danh bạ đầu mối', icon: Users, text: p.contacts },
    { title: 'Ghi chú nội bộ', icon: StickyNote, text: p.internalNotes },
  ].filter((b) => b.text.trim());
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <FaqList project={p} editable />
      </div>
      <div className="space-y-5">
        {blocks.length === 0 ? (
          <Card>
            <EmptyState
              icon={Lightbulb}
              title="Chưa có ghi chú nội bộ"
              description="Ghi điểm cần lưu ý, đối thủ, giá thứ cấp, hoa hồng, đầu mối liên hệ… trong phần Sửa dự án."
              action={
                <Button icon={Pencil} onClick={() => navigate(`/du-an/${p.id}/sua`)}>
                  Bổ sung
                </Button>
              }
            />
          </Card>
        ) : (
          blocks.map((b) => (
            <TextBlock key={b.title} title={b.title} icon={b.icon} tone="internal">
              {b.text}
            </TextBlock>
          ))
        )}
      </div>
    </div>
  );
}
