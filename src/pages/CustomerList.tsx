import { BellRing, FileSpreadsheet, Plus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CustomerRow } from '../components/customer';
import { ChipMultiSelect } from '../components/inputs';
import { Button, Card, Checkbox, EmptyState, PageHeader, SearchInput, Segmented, Select, TabBar } from '../components/ui';
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
import { navigate, useLocation } from '../lib/router';
import { buildHaystack, matchesQuery } from '../lib/text';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { CustomerSource, CustomerStatus, Temperature, Transaction } from '../types';

type StatusTab = 'active' | 'all' | CustomerStatus;
type SortKey = 'followup' | 'created' | 'updated' | 'budget';

interface Filters {
  q: string;
  status: StatusTab;
  transaction: Transaction | 'all';
  temperatures: Temperature[];
  source: CustomerSource | '';
  dueOnly: boolean;
  sort: SortKey;
}

let remembered: Filters = { q: '', status: 'active', transaction: 'all', temperatures: [], source: '', dueOnly: false, sort: 'followup' };

export function CustomerList() {
  const { customers, properties, projectById } = useData();
  const { toast } = useUI();
  const { query } = useLocation();
  const [filters, setFiltersState] = useState<Filters>(() => {
    const q = query.get('q');
    const status = query.get('trang-thai') as StatusTab | null;
    const due = query.get('den-han');
    if (q !== null || status || due) {
      remembered = {
        q: q ?? '',
        status: status ?? (q ? 'all' : 'active'),
        transaction: 'all',
        temperatures: [],
        source: '',
        dueOnly: !!due,
        sort: remembered.sort,
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

  const isDue = (date: string) => !!date && (daysFromToday(date) ?? 1) <= 0;
  const dueCount = customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status) && isDue(c.nextFollowUp)).length;

  const base = useMemo(
    () =>
      customers.filter((c) => {
        if (filters.transaction !== 'all' && c.transaction !== filters.transaction) return false;
        if (filters.temperatures.length && !filters.temperatures.includes(c.temperature)) return false;
        if (filters.source && c.source !== filters.source) return false;
        if (filters.dueOnly && !isDue(c.nextFollowUp)) return false;
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
            <Button
              icon={FileSpreadsheet}
              className="hidden sm:inline-flex"
              onClick={() => {
                downloadBlob(buildXlsx([customersSheet(results, projectById)]), `khach-hang-${fileStamp()}.xlsx`);
                toast(`Đã xuất ${results.length} khách ra Excel`);
              }}
            >
              Xuất Excel
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
        <SearchInput value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Tìm tên, SĐT, mã KH, khu vực, ghi chú…" />
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
        </div>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Select value={filters.source} onChange={(e) => setFilters({ source: e.target.value as CustomerSource | '' })} className="h-10 py-2">
            <option value="">Mọi nguồn khách</option>
            {(Object.keys(CUSTOMER_SOURCE_LABEL) as CustomerSource[]).map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} className="h-10 py-2">
            <option value="followup">Lịch hẹn gần nhất</option>
            <option value="updated">Mới cập nhật</option>
            <option value="created">Mới thêm</option>
            <option value="budget">Ngân sách cao</option>
          </Select>
        </div>
        <TabBar value={filters.status} onChange={(status) => setFilters({ status })} tabs={tabs} />
      </div>

      <Card className="mt-4 overflow-hidden">
        {results.length === 0 ? (
          <EmptyState icon={Users} title="Không có khách phù hợp" description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc." />
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map((c) => (
              <CustomerRow key={c.id} customer={c} projectById={projectById} matchCount={matchCounts.get(c.id)} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
