import { FileSpreadsheet, House, LayoutGrid, List, Plus, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ChipMultiSelect, MoneyInput, NumberInput, ProvinceSelect } from '../components/inputs';
import { PropertyCard, PropertyRow } from '../components/property';
import {
  Button,
  Card,
  Checkbox,
  cn,
  EmptyState,
  Field,
  IconButton,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  TabBar,
} from '../components/ui';
import {
  ACTIVE_PROPERTY_STATUSES,
  PROPERTY_STATUS,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
} from '../constants';
import { fileStamp } from '../lib/format';
import { propertiesSheet } from '../lib/exports';
import { formatAddress } from '../lib/listing';
import { mainArea } from '../lib/match';
import { downloadBlob } from '../lib/media';
import { navigate, useLocation } from '../lib/router';
import { buildHaystack, matchesQuery } from '../lib/text';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { PropertyStatus, PropertyType, Transaction } from '../types';

type StatusTab = 'active' | 'all' | PropertyStatus;
type SortKey = 'updated' | 'created' | 'price_asc' | 'price_desc' | 'area_desc' | 'unit_asc';

interface Filters {
  q: string;
  status: StatusTab;
  transaction: Transaction | 'all';
  types: PropertyType[];
  projectId: string;
  province: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  bedrooms: number;
  featured: boolean;
  sort: SortKey;
  view: 'grid' | 'list';
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  status: 'active',
  transaction: 'all',
  types: [],
  projectId: '',
  province: '',
  bedrooms: 0,
  featured: false,
  sort: 'updated',
  view: 'grid',
};

/** Giữ bộ lọc khi chuyển qua lại giữa danh sách và chi tiết. */
let remembered: Filters = DEFAULT_FILTERS;

const SORT_LABEL: Record<SortKey, string> = {
  updated: 'Mới cập nhật',
  created: 'Mới thêm',
  price_asc: 'Giá thấp → cao',
  price_desc: 'Giá cao → thấp',
  area_desc: 'Diện tích lớn nhất',
  unit_asc: 'Giá/m² thấp nhất',
};

const PAGE = 24;

export function PropertyList() {
  const { properties, projects, projectById } = useData();
  const { privacy, toast } = useUI();
  const { query } = useLocation();

  const [filters, setFiltersState] = useState<Filters>(() => {
    const q = query.get('q');
    const projectId = query.get('du-an');
    const type = query.get('loai') as PropertyType | null;
    const status = query.get('trang-thai') as StatusTab | null;
    if (q !== null || projectId !== null || type || status) {
      // Mở từ liên kết có sẵn bộ lọc: bắt đầu từ bộ lọc mặc định để không bị lọc thừa.
      remembered = {
        ...DEFAULT_FILTERS,
        view: remembered.view,
        sort: remembered.sort,
        q: q ?? '',
        projectId: projectId ?? '',
        types: type && PROPERTY_TYPES.includes(type) ? [type] : [],
        status: status ?? (projectId ? 'all' : 'active'),
      };
    }
    return remembered;
  });
  const setFilters = (patch: Partial<Filters>) =>
    setFiltersState((f) => {
      const next = { ...f, ...patch };
      remembered = next;
      return next;
    });
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filters]);

  const haystacks = useMemo(
    () =>
      new Map(
        properties.map((p) => [
          p.id,
          buildHaystack([
            p.code,
            p.title,
            formatAddress(p),
            projectById.get(p.projectId)?.name,
            p.unitCode,
            PROPERTY_TYPE_LABEL[p.type],
            p.description,
            p.amenities.join(' '),
            privacy ? '' : `${p.seller.name} ${p.seller.phone} ${p.seller.phone2} ${p.internalNotes}`,
          ]),
        ]),
      ),
    [properties, projectById, privacy],
  );

  // Lọc mọi thứ trừ trạng thái (để đếm số lượng trên từng tab).
  const base = useMemo(() => {
    const f = filters;
    return properties.filter((p) => {
      if (f.transaction !== 'all' && p.transaction !== f.transaction) return false;
      if (f.types.length && !f.types.includes(p.type)) return false;
      if (f.projectId === '__none' ? p.projectId : f.projectId && p.projectId !== f.projectId) return false;
      if (f.province && p.province !== f.province) return false;
      if (f.priceMin && (!p.price || p.price < f.priceMin)) return false;
      if (f.priceMax && (!p.price || p.price > f.priceMax)) return false;
      const area = mainArea(p);
      if (f.areaMin && (!area || area < f.areaMin)) return false;
      if (f.areaMax && (!area || area > f.areaMax)) return false;
      if (f.bedrooms && (p.bedrooms ?? 0) < f.bedrooms) return false;
      if (f.featured && !p.featured) return false;
      if (f.q && !matchesQuery(haystacks.get(p.id) ?? '', f.q)) return false;
      return true;
    });
  }, [properties, filters, haystacks]);

  const statusCount = (s: StatusTab) =>
    s === 'all' ? base.length : s === 'active' ? base.filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status)).length : base.filter((p) => p.status === s).length;

  const results = useMemo(() => {
    const list = base.filter((p) =>
      filters.status === 'all' ? true : filters.status === 'active' ? ACTIVE_PROPERTY_STATUSES.includes(p.status) : p.status === filters.status,
    );
    const unit = (p: (typeof list)[number]) => (p.price && mainArea(p) ? p.price / mainArea(p)! : Infinity);
    const byNum = (get: (p: (typeof list)[number]) => number | undefined, dir: 1 | -1) => (a: (typeof list)[number], b: (typeof list)[number]) => {
      const x = get(a);
      const y = get(b);
      if (x === undefined && y === undefined) return 0;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (x - y) * dir;
    };
    switch (filters.sort) {
      case 'created':
        return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'price_asc':
        return [...list].sort(byNum((p) => p.price || undefined, 1));
      case 'price_desc':
        return [...list].sort(byNum((p) => p.price || undefined, -1));
      case 'area_desc':
        return [...list].sort(byNum((p) => mainArea(p), -1));
      case 'unit_asc':
        return [...list].sort(byNum((p) => (unit(p) === Infinity ? undefined : unit(p)), 1));
      default:
        return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt));
    }
  }, [base, filters.status, filters.sort]);

  const activeFilterCount = [
    filters.transaction !== 'all',
    filters.types.length > 0,
    !!filters.projectId,
    !!filters.province,
    !!filters.priceMin || !!filters.priceMax,
    !!filters.areaMin || !!filters.areaMax,
    filters.bedrooms > 0,
    filters.featured,
  ].filter(Boolean).length;

  const exportExcel = () => {
    const blob = buildXlsx([propertiesSheet(results, projectById, !privacy)]);
    downloadBlob(blob, `gio-hang-bds-${fileStamp()}.xlsx`);
    toast(`Đã xuất ${results.length} BĐS ra Excel`);
  };

  const tabs: Array<{ value: StatusTab; label: string; count: number }> = [
    { value: 'active', label: 'Đang giao dịch', count: statusCount('active') },
    ...PROPERTY_STATUSES.map((s) => ({
      value: s as StatusTab,
      label: s === 'hoan_tat' ? 'Đã bán / thuê' : PROPERTY_STATUS[s].label,
      count: statusCount(s),
    })),
    { value: 'all', label: 'Tất cả', count: statusCount('all') },
  ];

  if (properties.length === 0) {
    return (
      <>
        <PageHeader title="Giỏ hàng BĐS" subtitle="Các căn / BĐS bạn đang nhận bán hoặc cho thuê" />
        <Card>
          <EmptyState
            icon={House}
            title="Chưa có BĐS nào"
            description="Thêm căn hộ, nhà phố, đất nền… kèm hình ảnh, giấy tờ và thông tin chủ nhà để quản lý và tư vấn cho khách."
            action={
              !privacy && (
                <Button variant="primary" icon={Plus} onClick={() => navigate('/bds/moi')}>
                  Thêm BĐS đầu tiên
                </Button>
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Giỏ hàng BĐS"
        subtitle={`${properties.length} BĐS · ${properties.filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status)).length} đang giao dịch`}
        actions={
          <>
            {!privacy && (
              <Button icon={FileSpreadsheet} onClick={exportExcel} disabled={!results.length} className="hidden sm:inline-flex">
                Xuất Excel
              </Button>
            )}
            {!privacy && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/bds/moi')}>
                Thêm BĐS
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex gap-2">
          <SearchInput
            value={filters.q}
            onChange={(q) => setFilters({ q })}
            placeholder="Tìm mã, tiêu đề, địa chỉ, dự án, chủ nhà…"
            className="flex-1"
          />
          <Button icon={SlidersHorizontal} onClick={() => setShowFilters((v) => !v)} className={cn('relative', showFilters && 'border-brand-400 bg-brand-50')}>
            <span className="hidden sm:inline">Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <Card className="animate-pop-in p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Nhu cầu">
                <Segmented
                  value={filters.transaction}
                  onChange={(transaction) => setFilters({ transaction })}
                  options={[
                    { value: 'all', label: 'Tất cả' },
                    { value: 'ban', label: 'Bán' },
                    { value: 'cho_thue', label: 'Cho thuê' },
                  ]}
                  className="w-full"
                />
              </Field>
              <Field label="Dự án">
                <Select value={filters.projectId} onChange={(e) => setFilters({ projectId: e.target.value })}>
                  <option value="">Tất cả</option>
                  <option value="__none">BĐS lẻ (không thuộc dự án)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tỉnh / thành phố">
                <ProvinceSelect value={filters.province} onChange={(province) => setFilters({ province })} placeholder="Tất cả" />
              </Field>
              <Field label="Phòng ngủ">
                <Select value={filters.bedrooms} onChange={(e) => setFilters({ bedrooms: Number(e.target.value) })}>
                  <option value={0}>Bất kỳ</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Từ {n} phòng
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Giá từ">
                <MoneyInput value={filters.priceMin} onChange={(priceMin) => setFilters({ priceMin })} showPreview={false} placeholder="Tối thiểu" />
              </Field>
              <Field label="Giá đến">
                <MoneyInput value={filters.priceMax} onChange={(priceMax) => setFilters({ priceMax })} showPreview={false} placeholder="Tối đa" />
              </Field>
              <Field label="Diện tích từ">
                <NumberInput value={filters.areaMin} onChange={(areaMin) => setFilters({ areaMin })} suffix="m²" placeholder="Tối thiểu" />
              </Field>
              <Field label="Diện tích đến">
                <NumberInput value={filters.areaMax} onChange={(areaMax) => setFilters({ areaMax })} suffix="m²" placeholder="Tối đa" />
              </Field>
              <Field label="Loại hình" className="sm:col-span-2 lg:col-span-4">
                <ChipMultiSelect
                  options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABEL[t] }))}
                  value={filters.types}
                  onChange={(types) => setFilters({ types })}
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <Checkbox checked={filters.featured} onChange={(featured) => setFilters({ featured })} label={<span className="inline-flex items-center gap-1"><Star size={14} className="text-amber-500" fill="currentColor" /> Chỉ BĐS nổi bật</span>} />
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                onClick={() => setFilters({ ...DEFAULT_FILTERS, q: filters.q, status: filters.status, sort: filters.sort, view: filters.view })}
              >
                Xoá bộ lọc
              </Button>
            </div>
          </Card>
        )}

        <TabBar value={filters.status} onChange={(status) => setFilters({ status })} tabs={tabs.filter((t) => t.count > 0 || t.value === filters.status || t.value === 'active')} />

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            <b className="text-slate-800">{results.length}</b> kết quả
          </p>
          <div className="flex items-center gap-1.5">
            <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} className="h-9 py-1.5 text-sm">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </Select>
            <div className="flex rounded-xl bg-slate-200/60 p-0.5">
              <IconButton icon={LayoutGrid} label="Dạng lưới" size="sm" onClick={() => setFilters({ view: 'grid' })} className={filters.view === 'grid' ? 'bg-white text-slate-900 shadow-sm' : ''} />
              <IconButton icon={List} label="Dạng danh sách" size="sm" onClick={() => setFilters({ view: 'list' })} className={filters.view === 'list' ? 'bg-white text-slate-900 shadow-sm' : ''} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {results.length === 0 ? (
          <Card>
            <EmptyState
              icon={House}
              title="Không có BĐS phù hợp"
              description="Thử bỏ bớt điều kiện lọc hoặc đổi từ khoá tìm kiếm."
              action={
                <Button onClick={() => setFiltersState((remembered = { ...DEFAULT_FILTERS, view: filters.view, sort: filters.sort }))}>
                  Xem tất cả BĐS
                </Button>
              }
            />
          </Card>
        ) : filters.view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.slice(0, limit).map((p) => (
              <PropertyCard key={p.id} property={p} project={projectById.get(p.projectId)} privacy={privacy} />
            ))}
          </div>
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {results.slice(0, limit).map((p) => (
              <PropertyRow key={p.id} property={p} project={projectById.get(p.projectId)} privacy={privacy} />
            ))}
          </Card>
        )}
        {results.length > limit && (
          <div className="mt-5 flex justify-center">
            <Button onClick={() => setLimit((l) => l + PAGE)}>Xem thêm {Math.min(PAGE, results.length - limit)} BĐS</Button>
          </div>
        )}
      </div>
    </>
  );
}
