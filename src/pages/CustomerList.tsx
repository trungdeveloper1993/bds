import { BellRing, Contact, FileSpreadsheet, ListChecks, Plus, Send, Tags, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CustomerRow } from '../components/customer';
import { ChipMultiSelect } from '../components/inputs';
import { BulkMessageModal, BulkTagModal } from '../components/messaging';
import { Button, Card, Checkbox, EmptyState, IconButton, PageHeader, SearchInput, Segmented, Select, TabBar } from '../components/ui';
import {
  ACTIVE_CUSTOMER_STATUSES,
  ACTIVE_PROPERTY_STATUSES,
  CUSTOMER_SOURCE_LABEL,
  CUSTOMER_STATUS,
  CUSTOMER_STATUSES,
  TEMPERATURE,
  TEMPERATURES,
} from '../constants';
import { customersSheet } from '../lib/exports';
import { daysFromToday, fileStamp } from '../lib/format';
import { MATCH_THRESHOLD, matchProperty } from '../lib/match';
import { downloadBlob } from '../lib/media';
import { buildVCard, daysSinceContact, hasTag, isEmail, lastContactAt, STALE_DAYS, tagCounts } from '../lib/messages';
import { navigate, useLocation } from '../lib/router';
import { needsSummary } from '../lib/summary';
import { buildHaystack, digitsOnly, matchesQuery } from '../lib/text';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, CustomerSource, CustomerStatus, Temperature, Transaction } from '../types';

type StatusTab = 'active' | 'all' | CustomerStatus;
type SortKey = 'followup' | 'created' | 'updated' | 'budget' | 'contact';

interface Filters {
  q: string;
  status: StatusTab;
  transaction: Transaction | 'all';
  temperatures: Temperature[];
  source: CustomerSource | '';
  /** Nhãn (khớp một trong các nhãn chọn). */
  tags: string[];
  /** Khách quan tâm dự án này. */
  projectId: string;
  dueOnly: boolean;
  /** Đang chăm sóc nhưng lâu chưa liên hệ. */
  stale: boolean;
  sort: SortKey;
}

const EMPTY_FILTERS: Filters = {
  q: '',
  status: 'active',
  transaction: 'all',
  temperatures: [],
  source: '',
  tags: [],
  projectId: '',
  dueOnly: false,
  stale: false,
  sort: 'followup',
};

let remembered: Filters = EMPTY_FILTERS;

export function CustomerList() {
  const { customers, properties, projects, projectById } = useData();
  const { toast } = useUI();
  const { query } = useLocation();
  const [filters, setFiltersState] = useState<Filters>(() => {
    const q = query.get('q');
    const status = query.get('trang-thai') as StatusTab | null;
    const due = query.get('den-han');
    const tag = query.get('nhan');
    const stale = query.get('lau-chua-lien-he');
    if (q !== null || status || due || tag || stale) {
      remembered = {
        ...EMPTY_FILTERS,
        q: q ?? '',
        status: status ?? (q || tag ? 'all' : 'active'),
        tags: tag ? [tag] : [],
        dueOnly: !!due,
        stale: !!stale,
        sort: stale ? 'contact' : remembered.sort,
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

  // Chọn nhiều khách để gửi tin / gắn nhãn / xuất danh bạ.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<'' | 'message' | 'tags'>('');

  const haystacks = useMemo(
    () =>
      new Map(
        customers.map((c) => [
          c.id,
          buildHaystack([
            c.code,
            c.name,
            c.phone,
            c.phone2,
            c.email,
            c.occupation,
            c.locations.join(' '),
            c.projectIds.map((id) => projectById.get(id)?.name).join(' '),
            c.tags.join(' '),
            c.requirements,
            c.notes,
          ]),
        ]),
      ),
    [customers, projectById],
  );

  const matchCounts = useMemo(() => {
    const active = properties.filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status));
    const map = new Map<string, number>();
    for (const c of customers) {
      if (!ACTIVE_CUSTOMER_STATUSES.includes(c.status)) continue;
      let n = 0;
      for (const p of active) {
        const r = matchProperty(c, p, projectById.get(p.projectId)?.name);
        if (r && r.score >= MATCH_THRESHOLD) n++;
      }
      map.set(c.id, n);
    }
    return map;
  }, [customers, properties, projectById]);

  const tags = useMemo(() => tagCounts(customers), [customers]);
  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) for (const id of c.projectIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return projects.filter((p) => counts.has(p.id) || p.id === filters.projectId).map((p) => ({ project: p, count: counts.get(p.id) ?? 0 }));
  }, [customers, projects, filters.projectId]);

  const isDue = (date: string) => !!date && (daysFromToday(date) ?? 1) <= 0;
  const isStale = (c: Customer) => ACTIVE_CUSTOMER_STATUSES.includes(c.status) && daysSinceContact(c) >= STALE_DAYS;
  const dueCount = customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status) && isDue(c.nextFollowUp)).length;

  const base = useMemo(
    () =>
      customers.filter((c) => {
        if (filters.transaction !== 'all' && c.transaction !== filters.transaction) return false;
        if (filters.temperatures.length && !filters.temperatures.includes(c.temperature)) return false;
        if (filters.source && c.source !== filters.source) return false;
        if (filters.tags.length && !filters.tags.some((t) => hasTag(c, t))) return false;
        if (filters.projectId && !c.projectIds.includes(filters.projectId)) return false;
        if (filters.dueOnly && !isDue(c.nextFollowUp)) return false;
        if (filters.stale && !isStale(c)) return false;
        if (filters.q && !matchesQuery(haystacks.get(c.id) ?? '', filters.q)) return false;
        return true;
      }),
    [customers, filters, haystacks],
  );

  const statusCount = (s: StatusTab) =>
    s === 'all' ? base.length : s === 'active' ? base.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status)).length : base.filter((c) => c.status === s).length;

  const results = useMemo(() => {
    const list = base.filter((c) =>
      filters.status === 'all' ? true : filters.status === 'active' ? ACTIVE_CUSTOMER_STATUSES.includes(c.status) : c.status === filters.status,
    );
    switch (filters.sort) {
      case 'created':
        return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'updated':
        return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      case 'budget':
        return [...list].sort((a, b) => (b.budgetMax ?? b.budgetMin ?? 0) - (a.budgetMax ?? a.budgetMin ?? 0));
      case 'contact':
        return [...list].sort((a, b) => lastContactAt(a).localeCompare(lastContactAt(b)));
      default: {
        // Lịch hẹn gần nhất trước (trễ hẹn lên đầu), khách chưa hẹn xếp sau theo mức độ nóng.
        const tempRank: Record<Temperature, number> = { nong: 0, am: 1, lanh: 2 };
        return [...list].sort((a, b) => {
          if (a.nextFollowUp && b.nextFollowUp) return a.nextFollowUp.localeCompare(b.nextFollowUp);
          if (a.nextFollowUp) return -1;
          if (b.nextFollowUp) return 1;
          return tempRank[a.temperature] - tempRank[b.temperature] || b.updatedAt.localeCompare(a.updatedAt);
        });
      }
    }
  }, [base, filters.status, filters.sort]);

  // Theo thứ tự đang hiển thị, khách đã chọn nhưng bị lọc ẩn xếp sau.
  const chosen = [...results.filter((c) => selected.has(c.id)), ...customers.filter((c) => selected.has(c.id) && !results.includes(c))];
  const allShown = results.length > 0 && results.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const exportContacts = () => {
    const list = chosen.filter((c) => digitsOnly(c.phone) || digitsOnly(c.phone2) || isEmail(c.email));
    if (!list.length) {
      toast('Các khách đã chọn chưa có số điện thoại / email', 'info');
      return;
    }
    const text = buildVCard(list, (c) => needsSummary(c, projectById));
    downloadBlob(new Blob([text], { type: 'text/vcard;charset=utf-8' }), `danh-ba-khach-hang-${fileStamp()}.vcf`);
    const skipped = chosen.length - list.length;
    toast(`Đã tạo danh bạ ${list.length} khách — mở file để thêm vào điện thoại${skipped ? ` (bỏ qua ${skipped} khách chưa có SĐT / email)` : ''}`);
  };

  const exportExcel = (list: Customer[]) => {
    downloadBlob(buildXlsx([customersSheet(list, projectById)]), `khach-hang-${fileStamp()}.xlsx`);
    toast(`Đã xuất ${list.length} khách ra Excel`);
  };

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="Khách hàng" subtitle="Nhu cầu, ngân sách và lịch chăm sóc từng khách" />
        <Card>
          <EmptyState
            icon={Users}
            title="Chưa có khách hàng"
            description="Lưu nhu cầu của khách (loại hình, khu vực, dự án, ngân sách…) để ứng dụng tự gợi ý BĐS phù hợp và nhắc lịch chăm sóc."
            action={
              <Button variant="primary" icon={UserPlus} onClick={() => navigate('/khach/moi')}>
                Thêm khách đầu tiên
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const tabs = [
    { value: 'active' as StatusTab, label: 'Đang chăm sóc', count: statusCount('active') },
    ...CUSTOMER_STATUSES.map((s) => ({ value: s as StatusTab, label: CUSTOMER_STATUS[s].label, count: statusCount(s) })),
    { value: 'all' as StatusTab, label: 'Tất cả', count: statusCount('all') },
  ].filter((t) => t.count > 0 || t.value === filters.status || t.value === 'active');

  return (
    <>
      <PageHeader
        title="Khách hàng"
        subtitle={`${customers.length} khách · ${customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status)).length} đang chăm sóc`}
        actions={
          <>
            <Button icon={FileSpreadsheet} className="hidden sm:inline-flex" onClick={() => exportExcel(results)}>
              Xuất Excel
            </Button>
            <Button icon={selecting ? X : ListChecks} variant={selecting ? 'soft' : 'secondary'} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? 'Xong' : 'Chọn & gửi tin'}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => navigate('/khach/moi')}>
              Thêm khách
            </Button>
          </>
        }
      />

      {dueCount > 0 && !filters.dueOnly && (
        <button
          type="button"
          onClick={() => setFilters({ dueOnly: true, status: 'active' })}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-left ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100"
        >
          <BellRing size={20} className="shrink-0 text-rose-600" />
          <span className="text-sm text-rose-900">
            <b>{dueCount} khách</b> đến hạn hoặc trễ hẹn chăm sóc — bấm để xem
          </span>
        </button>
      )}

      <div className="space-y-3">
        <SearchInput value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Tìm tên, SĐT, mã KH, nhãn, khu vực, ghi chú…" />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={filters.transaction}
            onChange={(transaction) => setFilters({ transaction })}
            options={[
              { value: 'all', label: 'Mua & thuê' },
              { value: 'ban', label: 'Mua' },
              { value: 'cho_thue', label: 'Thuê' },
            ]}
          />
          <ChipMultiSelect
            options={TEMPERATURES.map((t) => ({ value: t, label: TEMPERATURE[t].label }))}
            value={filters.temperatures}
            onChange={(temperatures) => setFilters({ temperatures })}
          />
          <Checkbox checked={filters.dueOnly} onChange={(dueOnly) => setFilters({ dueOnly })} label="Đến hạn chăm sóc" className="ml-1" />
          <Checkbox
            checked={filters.stale}
            onChange={(stale) => setFilters({ stale, ...(stale ? { status: 'active' as StatusTab, sort: 'contact' as SortKey } : {}) })}
            label={`Lâu chưa liên hệ (${STALE_DAYS}+ ngày)`}
            className="ml-1"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Lọc theo nhãn">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nhãn</span>
            <ChipMultiSelect
              options={tags.map(({ tag, count }) => ({ value: tag, label: `${tag} · ${count}` }))}
              value={tags.filter((x) => filters.tags.some((t) => t.toLocaleLowerCase('vi') === x.tag.toLocaleLowerCase('vi'))).map((x) => x.tag)}
              onChange={(next) => setFilters({ tags: next })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:max-w-2xl sm:grid-cols-3">
          <Select value={filters.source} onChange={(e) => setFilters({ source: e.target.value as CustomerSource | '' })} className="h-10 py-2" aria-label="Nguồn khách">
            <option value="">Mọi nguồn khách</option>
            {(Object.keys(CUSTOMER_SOURCE_LABEL) as CustomerSource[]).map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} className="h-10 py-2" aria-label="Sắp xếp">
            <option value="followup">Lịch hẹn gần nhất</option>
            <option value="updated">Mới cập nhật</option>
            <option value="created">Mới thêm</option>
            <option value="budget">Ngân sách cao</option>
            <option value="contact">Lâu chưa liên hệ</option>
          </Select>
          {projectCounts.length > 0 && (
            <div className="col-span-2 sm:col-span-1">
              <Select value={filters.projectId} onChange={(e) => setFilters({ projectId: e.target.value })} className="h-10 py-2" aria-label="Dự án quan tâm">
                <option value="">Mọi dự án quan tâm</option>
                {projectCounts.map(({ project, count }) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({count})
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <TabBar value={filters.status} onChange={(status) => setFilters({ status })} tabs={tabs} />
      </div>

      {selecting && (
        <p className="mt-4 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-brand-900 ring-1 ring-inset ring-brand-200">
          Chạm vào khách để chọn — lọc theo nhãn, dự án, trạng thái rồi <b>Chọn tất cả</b> để gửi tin cả nhóm.
        </p>
      )}

      <Card className="mt-4 overflow-hidden">
        {results.length === 0 ? (
          <EmptyState icon={Users} title="Không có khách phù hợp" description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc." />
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                projectById={projectById}
                matchCount={matchCounts.get(c.id)}
                selecting={selecting}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {selecting && (
        <>
          {/* Chừa chỗ cho thanh thao tác để khách cuối danh sách không bị che. */}
          <div className="h-28 lg:h-20" />
          <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-5 lg:left-64 lg:px-8 print:hidden">
            <div className="mx-auto max-w-3xl animate-slide-up rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl shadow-slate-900/15 backdrop-blur" role="toolbar" aria-label="Thao tác với khách đã chọn">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
                  <span className="whitespace-nowrap text-sm font-bold text-slate-900">{selected.size} đã chọn</span>
                  <button
                    type="button"
                    onClick={() => setSelected(allShown ? new Set([...selected].filter((id) => !results.some((c) => c.id === id))) : new Set([...selected, ...results.map((c) => c.id)]))}
                    className="text-[13px] font-semibold text-brand-700 hover:underline"
                  >
                    {allShown ? 'Bỏ chọn tất cả' : `Chọn tất cả (${results.length})`}
                  </button>
                </div>
                {/* Điện thoại: nút thoát cùng hàng số đã chọn, các thao tác xuống hàng dưới. */}
                <IconButton icon={X} label="Thoát chế độ chọn" size="sm" onClick={stopSelecting} className="sm:order-last" />
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                  <Button size="sm" variant="primary" icon={Send} disabled={!chosen.length} onClick={() => setBulk('message')}>
                    Gửi tin
                  </Button>
                  <Button size="sm" icon={Tags} disabled={!chosen.length} onClick={() => setBulk('tags')}>
                    Gắn nhãn
                  </Button>
                  <Button size="sm" icon={Contact} disabled={!chosen.length} onClick={exportContacts}>
                    Danh bạ
                  </Button>
                  <Button size="sm" icon={FileSpreadsheet} disabled={!chosen.length} onClick={() => exportExcel(chosen)} className="hidden sm:inline-flex">
                    Excel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <BulkMessageModal customers={chosen} open={bulk === 'message'} onClose={() => setBulk('')} />
      <BulkTagModal customerIds={chosen.map((c) => c.id)} open={bulk === 'tags'} onClose={() => setBulk('')} />
    </>
  );
}
