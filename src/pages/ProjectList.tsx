import { Building2, FileSpreadsheet, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProvinceSelect } from '../components/inputs';
import { activeUnitCount, ProjectCard } from '../components/project';
import { Button, Card, EmptyState, PageHeader, SearchInput, Select, TabBar } from '../components/ui';
import { PROJECT_STAGE, PROJECT_STAGES, PROPERTY_TYPE_LABEL, PROPERTY_TYPES } from '../constants';
import { projectsSheet } from '../lib/exports';
import { fileStamp } from '../lib/format';
import { formatProjectAddress } from '../lib/listing';
import { downloadBlob } from '../lib/media';
import { navigate, useLocation } from '../lib/router';
import { buildHaystack, matchesQuery } from '../lib/text';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { ProjectStage, PropertyType } from '../types';

type SortKey = 'updated' | 'name' | 'price';

interface Filters {
  q: string;
  stage: ProjectStage | 'all';
  province: string;
  type: PropertyType | '';
  sort: SortKey;
}

let remembered: Filters = { q: '', stage: 'all', province: '', type: '', sort: 'updated' };

export function ProjectList() {
  const { projects, properties } = useData();
  const { privacy, toast } = useUI();
  const { query } = useLocation();
  const [filters, setFiltersState] = useState<Filters>(() => {
    const q = query.get('q');
    if (q !== null) remembered = { q, stage: 'all', province: '', type: '', sort: remembered.sort };
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
        projects.map((p) => [
          p.id,
          buildHaystack([
            p.code,
            p.name,
            p.legalName,
            p.developer,
            p.devPartner,
            p.distributor,
            formatProjectAddress(p),
            p.scale,
            p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(' '),
            p.amenities.join(' '),
            p.description,
            p.documents.map((d) => d.name).join(' '),
          ]),
        ]),
      ),
    [projects],
  );

  const base = useMemo(
    () =>
      projects.filter((p) => {
        if (filters.province && p.province !== filters.province) return false;
        if (filters.type && !p.productTypes.includes(filters.type)) return false;
        if (filters.q && !matchesQuery(haystacks.get(p.id) ?? '', filters.q)) return false;
        return true;
      }),
    [projects, filters.province, filters.type, filters.q, haystacks],
  );

  const results = useMemo(() => {
    const list = base.filter((p) => filters.stage === 'all' || p.stage === filters.stage);
    if (filters.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (filters.sort === 'price')
      return [...list].sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt));
  }, [base, filters.stage, filters.sort]);

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Dự án" subtitle="Hồ sơ đầy đủ của từng dự án: tổng quan, pháp lý, tài liệu, hình ảnh, giỏ hàng" />
        <Card>
          <EmptyState
            icon={Building2}
            title="Chưa có dự án nào"
            description="Tạo hồ sơ dự án để gom toàn bộ bảng giá, chính sách, pháp lý, mặt bằng, hình ảnh… vào một chỗ — tìm là thấy ngay."
            action={
              !privacy && (
                <Button variant="primary" icon={Plus} onClick={() => navigate('/du-an/moi')}>
                  Tạo dự án đầu tiên
                </Button>
              )
            }
          />
        </Card>
      </>
    );
  }

  const tabs = [
    { value: 'all' as const, label: 'Tất cả', count: base.length },
    ...PROJECT_STAGES.map((s) => ({ value: s, label: PROJECT_STAGE[s].label, count: base.filter((p) => p.stage === s).length })),
  ].filter((t) => t.value === 'all' || t.count > 0 || t.value === filters.stage);

  return (
    <>
      <PageHeader
        title="Dự án"
        subtitle={`${projects.length} dự án · ${projects.reduce((n, p) => n + p.documents.length, 0)} tài liệu`}
        actions={
          <>
            {!privacy && (
              <Button
                icon={FileSpreadsheet}
                className="hidden sm:inline-flex"
                onClick={() => {
                  downloadBlob(buildXlsx([projectsSheet(results)]), `du-an-${fileStamp()}.xlsx`);
                  toast(`Đã xuất ${results.length} dự án ra Excel`);
                }}
              >
                Xuất Excel
              </Button>
            )}
            {!privacy && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/du-an/moi')}>
                Thêm dự án
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-3">
        <SearchInput value={filters.q} onChange={(q) => setFilters({ q })} placeholder="Tìm tên dự án, chủ đầu tư, khu vực, tên tài liệu…" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ProvinceSelect value={filters.province} onChange={(province) => setFilters({ province })} placeholder="Mọi tỉnh / thành" />
          <Select value={filters.type} onChange={(e) => setFilters({ type: e.target.value as PropertyType | '' })}>
            <option value="">Mọi loại hình</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} className="col-span-2 sm:col-span-1">
            <option value="updated">Mới cập nhật</option>
            <option value="name">Tên A → Z</option>
            <option value="price">Giá thấp → cao</option>
          </Select>
        </div>
        <TabBar value={filters.stage} onChange={(stage) => setFilters({ stage })} tabs={tabs} />
      </div>

      <div className="mt-4">
        {results.length === 0 ? (
          <Card>
            <EmptyState icon={Building2} title="Không có dự án phù hợp" description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((p) => (
              <ProjectCard key={p.id} project={p} unitCount={activeUnitCount(p.id, properties)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
