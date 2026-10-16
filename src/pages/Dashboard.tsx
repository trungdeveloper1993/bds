import {
  BellRing,
  Building2,
  CalendarClock,
  CircleCheck,
  FileClock,
  Files,
  Filter,
  Flame,
  Handshake,
  House,
  Phone,
  Plus,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { BarList, StatTile } from '../components/charts';
import { DocActions, FileTypeIcon } from '../components/documents';
import { ImageView } from '../components/media';
import { ProjectStageBadge } from '../components/project';
import { PropertyRow } from '../components/property';
import { Avatar, Badge, Button, Card, CardHeader, cn } from '../components/ui';
import {
  ACTIVE_CUSTOMER_STATUSES,
  ACTIVE_PROPERTY_STATUSES,
  CUSTOMER_PIPELINE,
  CUSTOMER_STATUS,
  DOC_CATEGORY,
  PROPERTY_TYPE_LABEL,
} from '../constants';
import { daysFromToday, formatDate, formatMoney, relativeDay, telHref, timeAgo } from '../lib/format';
import { formatPriceRange } from '../lib/listing';
import { navigate } from '../lib/router';
import { useData } from '../store/data';
import type { Customer, PropertyType } from '../types';

function todayLabel(): string {
  const text = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Dashboard() {
  const { projects, properties, customers, settings, projectById } = useData();

  const stats = useMemo(() => {
    const active = properties.filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status));
    const forSale = active.filter((p) => p.transaction === 'ban');
    const activeCustomers = customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status));
    const now = new Date();
    const closedAll = properties.filter((p) => p.status === 'hoan_tat');
    const closedMonth = closedAll.filter((p) => {
      if (!p.closedAt) return false;
      const d = new Date(p.closedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    return {
      active,
      saleValue: forSale.reduce((n, p) => n + (p.price ?? 0), 0),
      forSaleCount: forSale.length,
      activeCustomers,
      hot: activeCustomers.filter((c) => c.temperature === 'nong').length,
      closedAll: closedAll.length,
      closedMonth: closedMonth.length,
      counts: {
        dang_chao: active.filter((p) => p.status === 'dang_chao').length,
        dam_phan: active.filter((p) => p.status === 'dam_phan').length,
        da_coc: active.filter((p) => p.status === 'da_coc').length,
      },
    };
  }, [properties, customers]);

  const agenda = useMemo(() => {
    const items = customers
      .filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status) && c.nextFollowUp)
      .map((c) => ({ customer: c, diff: daysFromToday(c.nextFollowUp) ?? 99 }))
      .filter((x) => x.diff <= 7)
      .sort((a, b) => a.diff - b.diff);
    return items;
  }, [customers]);

  const recentDocs = useMemo(
    () =>
      projects
        .flatMap((p) => p.documents.map((d) => ({ doc: d, project: p })))
        .filter((x) => !x.doc.archived)
        .sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt))
        .slice(0, 6),
    [projects],
  );

  const expiring = useMemo(
    () =>
      properties
        .filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status) && p.seller.contract !== 'chua_ky' && p.seller.contractExpiry)
        .map((p) => ({ property: p, diff: daysFromToday(p.seller.contractExpiry) ?? 99 }))
        .filter((x) => x.diff <= 14)
        .sort((a, b) => a.diff - b.diff),
    [properties],
  );

  const deposited = properties.filter((p) => p.status === 'da_coc');

  const typeBars = useMemo(() => {
    const counts = new Map<PropertyType, number>();
    for (const p of stats.active) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, value]) => ({ key: type, label: PROPERTY_TYPE_LABEL[type], value, onClick: () => navigate(`/bds?loai=${type}`) }));
  }, [stats.active]);

  const funnel = CUSTOMER_PIPELINE.map((s) => ({
    key: s,
    label: CUSTOMER_STATUS[s].label,
    value: customers.filter((c) => c.status === s).length,
    onClick: () => navigate(`/khach?trang-thai=${s}`),
  }));

  const featuredProjects = [...projects].sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const isEmpty = projects.length + properties.length + customers.length === 0;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{todayLabel()}</p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
            Xin chào{settings.agentName ? `, ${settings.agentName}` : ''} 👋
          </h1>
        </div>
        <div className="hidden flex-wrap gap-2 sm:flex">
          <Button icon={Building2} onClick={() => navigate('/du-an/moi')}>
            Thêm dự án
          </Button>
          <Button icon={House} onClick={() => navigate('/bds/moi')}>
            Thêm BĐS
          </Button>
          <Button variant="primary" icon={UserPlus} onClick={() => navigate('/khach/moi')}>
            Thêm khách
          </Button>
        </div>
      </div>

      {isEmpty && <GettingStarted hasProfile={!!settings.agentName} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="BĐS đang giao dịch"
          icon={House}
          value={stats.active.length}
          sub={`${stats.counts.dang_chao} đang chào · ${stats.counts.dam_phan} đàm phán · ${stats.counts.da_coc} đã cọc`}
          onClick={() => navigate('/bds')}
        />
        <StatTile
          label="Giá trị giỏ hàng bán"
          icon={Wallet}
          value={stats.saleValue ? formatMoney(stats.saleValue) : '0'}
          sub={`Tổng giá chào của ${stats.forSaleCount} BĐS bán`}
        />
        <StatTile
          label="Khách đang chăm sóc"
          icon={Users}
          value={stats.activeCustomers.length}
          sub={
            <span className="inline-flex items-center gap-1">
              <Flame size={12} className="text-rose-500" /> {stats.hot} khách nóng
            </span>
          }
          onClick={() => navigate('/khach')}
        />
        <StatTile
          label="Giao dịch thành công"
          icon={Handshake}
          value={stats.closedMonth}
          sub={`Trong tháng này · tổng cộng ${stats.closedAll}`}
          onClick={() => navigate('/bds?trang-thai=hoan_tat')}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Lịch chăm sóc khách"
              icon={CalendarClock}
              description="Trễ hẹn, hôm nay và 7 ngày tới"
              actions={
                agenda.some((a) => a.diff <= 0) && (
                  <Button size="sm" variant="soft" icon={BellRing} onClick={() => navigate('/khach?den-han=1')}>
                    {agenda.filter((a) => a.diff <= 0).length} cần gọi
                  </Button>
                )
              }
            />
            {agenda.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Không có lịch hẹn nào trong 7 ngày tới.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {agenda.slice(0, 8).map(({ customer: c, diff }) => (
                  <AgendaRow key={c.id} customer={c} diff={diff} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Tài liệu dự án mới cập nhật"
              icon={FileClock}
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigate('/du-an')}>
                  Tất cả dự án
                </Button>
              }
            />
            {recentDocs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Chưa có tài liệu. Mở một dự án → tab Tài liệu để tải lên.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentDocs.map(({ doc, project }) => (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <FileTypeIcon type={doc.type} name={doc.name} className="size-9" />
                    <button type="button" onClick={() => navigate(`/du-an/${project.id}?tab=tai-lieu`)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold text-slate-900">{doc.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {project.name} · {DOC_CATEGORY[doc.category].label} · {timeAgo(doc.createdAt)}
                      </div>
                    </button>
                    <DocActions doc={doc} compact />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="BĐS mới cập nhật"
              icon={House}
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigate('/bds')}>
                  Giỏ hàng
                </Button>
              }
            />
            {properties.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Chưa có BĐS nào.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {properties.slice(0, 5).map((p) => (
                  <PropertyRow key={p.id} property={p} project={projectById.get(p.projectId)} privacy={false} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {(expiring.length > 0 || deposited.length > 0) && (
            <Card className="border-amber-200">
              <CardHeader title="Cần chú ý" icon={TriangleAlert} className="bg-amber-50/60" />
              <ul className="divide-y divide-slate-100">
                {expiring.map(({ property: p, diff }) => (
                  <li key={`exp-${p.id}`}>
                    <button type="button" onClick={() => navigate(`/bds/${p.id}`)} className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
                      <FileClock size={17} className={cn('mt-0.5 shrink-0', diff < 0 ? 'text-rose-600' : 'text-amber-600')} />
                      <span className="min-w-0 text-[13px]">
                        <b className="text-slate-900">HĐ môi giới {p.code}</b>{' '}
                        <span className={diff < 0 ? 'text-rose-600' : 'text-amber-700'}>
                          {diff < 0 ? `đã hết hạn ${-diff} ngày` : diff === 0 ? 'hết hạn hôm nay' : `còn ${diff} ngày (${formatDate(p.seller.contractExpiry)})`}
                        </span>
                        <span className="block truncate text-slate-500">{p.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {deposited.map((p) => (
                  <li key={`dep-${p.id}`}>
                    <button type="button" onClick={() => navigate(`/bds/${p.id}`)} className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
                      <CircleCheck size={17} className="mt-0.5 shrink-0 text-violet-600" />
                      <span className="min-w-0 text-[13px]">
                        <b className="text-slate-900">{p.code} đã đặt cọc</b> <span className="text-slate-500">— theo dõi đến khi hoàn tất</span>
                        <span className="block truncate text-slate-500">{p.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Giỏ hàng theo loại hình" icon={Filter} description="BĐS đang giao dịch" />
            <div className="p-3 sm:p-4">
              <BarList data={typeBars} unit="BĐS" emptyText="Chưa có BĐS đang giao dịch" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Phễu khách hàng" icon={UserRound} description="Số khách ở từng bước" />
            <div className="p-3 sm:p-4">
              <BarList data={funnel} unit="khách" emptyText="Chưa có khách hàng" />
            </div>
          </Card>

          {featuredProjects.length > 0 && (
            <Card>
              <CardHeader
                title="Dự án"
                icon={Building2}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => navigate('/du-an')}>
                    Tất cả
                  </Button>
                }
              />
              <ul className="divide-y divide-slate-100">
                {featuredProjects.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => navigate(`/du-an/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
                      <ImageView id={p.images[0]} placeholderIcon={Building2} className="size-12 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900">{p.name}</div>
                        <div className="truncate text-xs text-slate-500">{formatPriceRange(p.priceFrom, p.priceTo) || p.developer || p.province}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <ProjectStageBadge project={p} size="sm" />
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                            <Files size={11} /> {p.documents.length}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function AgendaRow({ customer: c, diff }: { customer: Customer; diff: number }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button type="button" onClick={() => navigate(`/khach/${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={c.name} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-slate-900">{c.name}</span>
            {c.temperature === 'nong' && <Flame size={14} className="shrink-0 text-rose-500" />}
          </div>
          <div className="truncate text-xs text-slate-500">{c.nextFollowUpNote || CUSTOMER_STATUS[c.status].label}</div>
        </div>
      </button>
      <Badge tone={diff < 0 ? 'rose' : diff === 0 ? 'amber' : 'slate'} size="sm">
        {relativeDay(c.nextFollowUp)}
      </Badge>
      {c.phone && (
        <a href={telHref(c.phone)} aria-label={`Gọi ${c.name}`} className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100">
          <Phone size={16} />
        </a>
      )}
    </li>
  );
}

function GettingStarted({ hasProfile }: { hasProfile: boolean }) {
  const steps = [
    { done: hasProfile, title: 'Cập nhật hồ sơ môi giới', text: 'Tên, SĐT hiển thị trên phiếu tư vấn & tin đăng.', to: '/cai-dat', icon: UserRound },
    { done: false, title: 'Tạo hồ sơ dự án', text: 'Tải bảng giá, pháp lý, mặt bằng, hình ảnh.', to: '/du-an/moi', icon: Building2 },
    { done: false, title: 'Thêm BĐS / căn', text: 'Kèm thông tin chủ nhà (nội bộ).', to: '/bds/moi', icon: House },
    { done: false, title: 'Thêm khách hàng', text: 'Nhu cầu, ngân sách — app tự ghép BĐS.', to: '/khach/moi', icon: UserPlus },
  ];
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-5 text-white">
        <h2 className="text-lg font-extrabold">Bắt đầu với Quản Lý BĐS</h2>
        <p className="mt-1 text-sm text-brand-100">
          Dữ liệu được lưu ngay trên thiết bị này, dùng được cả khi không có mạng. Nhớ sao lưu định kỳ trong Cài đặt.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <button key={s.to} type="button" onClick={() => navigate(s.to)} className="flex items-start gap-3 bg-white p-4 text-left transition hover:bg-brand-50/40">
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', s.done ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-700')}>
              {s.done ? <CircleCheck size={18} /> : <s.icon size={18} />}
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-900">
                {i + 1}. {s.title}
              </span>
              <span className="block text-xs text-slate-500">{s.text}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-4 py-2.5">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => navigate('/du-an/moi')}>
          Tạo dự án đầu tiên
        </Button>
      </div>
    </Card>
  );
}
