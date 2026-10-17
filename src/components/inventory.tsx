import { ArrowDown, ArrowUp, ChevronDown, ClipboardPaste, Download, Ellipsis, FileSpreadsheet, MapPin, Pencil, Plus, Table2, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DIRECTION_LABEL, INVENTORY_STATUS, INVENTORY_STATUSES } from '../constants';
import { fileStamp, formatMoney, formatNumber, formatUnitPrice } from '../lib/format';
import { uid } from '../lib/id';
import {
  detectColumns,
  FIELD_LABEL,
  matchUnitType,
  mergeInventory,
  parseTable,
  readSpreadsheet,
  rowsToItems,
  type ColumnMap,
  type InventoryField,
} from '../lib/inventory';
import { applyToPosition, guessLayout, layoutFinder, positionCodes, setAssignments } from '../lib/layouts';
import {
  buildLocator,
  compareCodes,
  indexByCode,
  normCode,
  positionOf,
  resolveItem,
  unitMatcher,
  type CodeIndex,
  type MapContext,
  type ResolvedUnit,
  type UnitLocation,
} from '../lib/maps';
import { downloadBlob } from '../lib/media';
import { foldText } from '../lib/smartfind';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Direction, InventoryItem, InventoryStatus, Project, UnitLayout, UnitTypeRow } from '../types';
import { EnumSelect, MoneyInput, NumberInput } from './inputs';
import { ColorDot } from './mapcanvas';
import { Badge, Button, Card, CardHeader, cn, Dropdown, EmptyState, Field, IconButton, Modal, SearchInput, Segmented, Select, TextArea, TextInput, Toggle } from './ui';

/*
 * Bảng hàng của dự án: mọi căn theo mã căn (loại, diện tích, giá, hướng, trạng thái).
 * Bản đồ mặt bằng tô màu theo bảng này; cập nhật hằng ngày bằng cách dán bảng hàng mới.
 */

type SortKey = 'code' | 'type' | 'area' | 'price' | 'status';

const PAGE = 60;

export function InventoryPanel({
  project,
  ctx,
  locator,
  editable,
  privacy,
  hidePrice,
  onLocate,
}: {
  project: Project;
  ctx: MapContext;
  locator: CodeIndex<UnitLocation>;
  editable: boolean;
  privacy: boolean;
  hidePrice: boolean;
  onLocate: (code: string) => void;
}) {
  const { settings, patchProject } = useData();
  const { toast, confirm } = useUI();
  const [status, setStatus] = useState<InventoryStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'code', dir: 1 });
  const [limit, setLimit] = useState(PAGE);
  const [importOpen, setImportOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  const rows = useMemo(() => project.inventory.map((it) => resolveItem(ctx, it.code)), [project.inventory, ctx]);
  const counts = useMemo(() => {
    const out = new Map<InventoryStatus, number>();
    for (const r of rows) if (r.status) out.set(r.status, (out.get(r.status) ?? 0) + 1);
    return out;
  }, [rows]);
  const matcher = useMemo(() => unitMatcher(query, project), [query, project]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => (status === 'all' || r.status === status) && (!matcher || matcher.test(r)));
    const value = (r: ResolvedUnit): number | string => {
      if (sort.key === 'area') return r.area ?? -1;
      if (sort.key === 'price') return r.price ?? -1;
      if (sort.key === 'status') return r.status ? INVENTORY_STATUSES.indexOf(r.status) : 9;
      if (sort.key === 'type') return r.type?.name ?? '';
      return r.code;
    };
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : compareCodes(String(va), String(vb));
      return (c || compareCodes(a.code, b.code)) * sort.dir;
    });
  }, [rows, status, matcher, sort]);

  const setItemStatus = async (code: string, next: InventoryStatus) => {
    await patchProject(project.id, (cur) => ({
      inventory: cur.inventory.map((x) => (normCode(x.code) === normCode(code) ? { ...x, status: next, updatedAt: new Date().toISOString() } : x)),
    }));
    toast(`${code}: ${INVENTORY_STATUS[next].label}`);
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: 'Xoá toàn bộ bảng hàng?',
      message: `${project.inventory.length} căn trong bảng hàng sẽ bị xoá. Các ô trên bản đồ vẫn giữ nguyên, chỉ mất giá / trạng thái.`,
      confirmLabel: 'Xoá bảng hàng',
      danger: true,
    });
    if (!ok) return;
    await patchProject(project.id, () => ({ inventory: [] }));
    toast('Đã xoá bảng hàng');
  };

  const exportXlsx = () => {
    const sorted = [...rows].sort((a, b) => compareCodes(a.code, b.code));
    // Cột "Mẫu căn" (khi dự án có thư viện hình mẫu): nhập lại file này là giữ được hình mẫu từng căn.
    const withLayouts = project.layouts.length > 0;
    const blob = buildXlsx([
      {
        name: 'Bảng hàng',
        columns: [
          { header: 'Mã căn', width: 14 },
          { header: 'Loại căn', width: 16 },
          ...(withLayouts ? [{ header: 'Mẫu căn', width: 14 }] : []),
          { header: 'Diện tích (m²)', width: 14 },
          { header: 'Giá (VND)', width: 18, money: true },
          { header: 'Đơn giá (triệu/m²)', width: 16 },
          { header: 'Hướng', width: 12 },
          { header: 'Trạng thái', width: 16 },
          { header: 'Ghi chú', width: 30 },
        ],
        rows: sorted.map((r) => [
          r.code,
          r.type?.name,
          ...(withLayouts ? [r.layout?.code] : []),
          r.area,
          hidePrice ? undefined : r.price,
          !hidePrice && r.price && r.area ? Math.round((r.price / r.area / 1e6) * 10) / 10 : undefined,
          r.direction ? DIRECTION_LABEL[r.direction] : undefined,
          r.status ? INVENTORY_STATUS[r.status].label : undefined,
          r.note,
        ]),
      },
    ]);
    downloadBlob(blob, `bang-hang-${project.code || 'du-an'}-${fileStamp()}.xlsx`);
  };

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'price' || key === 'area' ? -1 : 1 }));
  const total = rows.length;
  const hasLayouts = project.layouts.length > 0;
  const summary = INVENTORY_STATUSES.filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${INVENTORY_STATUS[s].label.toLowerCase()}`)
    .join(' · ');

  return (
    <Card id="inventory">
      <CardHeader
        title={`Bảng hàng (${total} căn)`}
        icon={Table2}
        description={summary || 'Danh sách căn theo mã căn: loại, diện tích, giá, trạng thái — bản đồ tô màu theo bảng này.'}
        actions={
          editable && (
            <>
              <Button size="sm" variant="primary" icon={ClipboardPaste} onClick={() => setImportOpen(true)}>
                {total ? 'Cập nhật bảng hàng' : 'Nhập bảng hàng'}
              </Button>
              <Button size="sm" icon={Plus} onClick={() => setEditCode('')}>
                Thêm căn
              </Button>
              {total > 0 && (
                <Dropdown
                  trigger={(toggle) => <Button size="sm" icon={Ellipsis} onClick={toggle} aria-label="Thêm thao tác bảng hàng" />}
                  items={[
                    { label: 'Tải file Excel (.xlsx)', icon: Download, onClick: exportXlsx },
                    { label: 'Xoá toàn bộ bảng hàng', icon: Trash2, onClick: () => void clearAll(), danger: true },
                  ]}
                />
              )}
            </>
          )
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Chưa có bảng hàng"
          description={
            editable
              ? 'Copy bảng hàng từ Excel / Google Sheets (mã căn, loại, diện tích, giá, trạng thái…) rồi dán vào, hoặc mở file .xlsx CĐT / F1 gửi. Giá và trạng thái tự hiện trên bản đồ theo mã căn.'
              : 'Dự án chưa có bảng hàng.'
          }
          action={
            editable && (
              <Button variant="primary" icon={ClipboardPaste} onClick={() => setImportOpen(true)}>
                Nhập bảng hàng
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3 sm:px-5">
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã căn, hoặc lọc: 2pn dưới 4 tỷ, hướng Đông Nam…" />
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              <StatusChip active={status === 'all'} onClick={() => setStatus('all')} label="Tất cả" count={total} />
              {INVENTORY_STATUSES.filter((s) => counts.get(s)).map((s) => (
                <StatusChip
                  key={s}
                  active={status === s}
                  onClick={() => setStatus(status === s ? 'all' : s)}
                  label={INVENTORY_STATUS[s].label}
                  count={counts.get(s) ?? 0}
                  color={settings.mapColors[s]}
                />
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Không có căn nào khớp.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={cn('w-full text-left text-sm', hasLayouts ? 'min-w-[800px]' : 'min-w-[720px]')}>
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <SortTh label="Mã căn" k="code" sort={sort} onSort={toggleSort} className="pl-4 sm:pl-5" />
                    <SortTh label="Loại" k="type" sort={sort} onSort={toggleSort} />
                    {hasLayouts && <th className="px-3 py-2.5 font-semibold">Mẫu</th>}
                    <SortTh label="Diện tích" k="area" sort={sort} onSort={toggleSort} align="right" />
                    <SortTh label="Giá" k="price" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-3 py-2.5 text-right font-semibold">Đơn giá</th>
                    <th className="px-3 py-2.5 font-semibold">Hướng</th>
                    <SortTh label="Trạng thái" k="status" sort={sort} onSort={toggleSort} />
                    <th className="px-3 py-2.5 font-semibold">Ghi chú</th>
                    <th className="w-0 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.slice(0, limit).map((r) => {
                    const onMap = !!locator.get(r.code);
                    const st = r.status ?? 'dang_ban';
                    return (
                      <tr key={r.code} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap py-2 pl-4 pr-3 font-bold text-slate-900 sm:pl-5">
                          {onMap ? (
                            <button type="button" onClick={() => onLocate(r.code)} className="hover:text-brand-700 hover:underline" title="Xem trên mặt bằng">
                              {r.code}
                            </button>
                          ) : (
                            r.code
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{r.type?.name}</td>
                        {hasLayouts && (
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-slate-700" title={r.layout?.tags.join(' · ')}>
                            {r.layout?.code}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">{r.area ? `${formatNumber(r.area, 1)} m²` : ''}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-brand-800">{hidePrice ? 'Liên hệ' : r.price ? formatMoney(r.price) : ''}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-slate-500">{hidePrice ? '' : formatUnitPrice(r.price, r.area)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{r.direction ? DIRECTION_LABEL[r.direction] : ''}</td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          {editable ? (
                            <StatusSelect value={st} color={settings.mapColors[st]} onChange={(s) => void setItemStatus(r.code, s)} />
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <ColorDot color={settings.mapColors[st]} />
                              {INVENTORY_STATUS[st].label}
                            </span>
                          )}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2 text-[13px] text-slate-500" title={r.note}>
                          {r.note}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right">
                          {onMap && <IconButton icon={MapPin} label="Xem trên mặt bằng" size="sm" onClick={() => onLocate(r.code)} />}
                          {editable && <IconButton icon={Pencil} label="Sửa căn" size="sm" onClick={() => setEditCode(r.code)} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {shown.length > limit && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Xem thêm {Math.min(PAGE * 2, shown.length - limit)} căn ({shown.length - limit} căn còn lại)
              </Button>
            </div>
          )}
          {privacy && hidePrice && <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">Giá đang ẩn ở chế độ khách xem — vui lòng liên hệ để có giá chi tiết.</p>}
        </>
      )}

      {editable && <InventoryImportModal project={project} open={importOpen} onClose={() => setImportOpen(false)} />}
      {editCode !== null && <InventoryItemModal project={project} code={editCode} open onClose={() => setEditCode(null)} />}
    </Card>
  );
}

function StatusChip({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition',
        active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300',
      )}
    >
      {color && <ColorDot color={color} />}
      {label}
      <span className={cn('tabular-nums', active ? 'text-white/70' : 'text-slate-400')}>{count}</span>
    </button>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  align?: 'right';
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={cn('px-3 py-2.5 font-semibold', align === 'right' && 'text-right', className)} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 uppercase hover:text-slate-800', active && 'text-slate-800')}>
        {label}
        {active && <Icon size={12} />}
      </button>
    </th>
  );
}

function StatusSelect({ value, color, onChange }: { value: InventoryStatus; color: string; onChange: (s: InventoryStatus) => void }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="pointer-events-none absolute left-2.5">
        <ColorDot color={color} />
      </span>
      <select
        aria-label="Trạng thái"
        value={value}
        onChange={(e) => onChange(e.target.value as InventoryStatus)}
        className="cursor-pointer appearance-none rounded-full border border-slate-200 bg-white py-1 pl-6 pr-7 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:border-brand-500 focus:outline-none"
      >
        {INVENTORY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INVENTORY_STATUS[s].label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 text-slate-400" />
    </label>
  );
}

// ---------------------------------------------------------------- Nhập bảng hàng

const columnLetter = (i: number) => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const FIELDS: InventoryField[] = ['code', 'type', 'layout', 'area', 'price', 'status', 'direction', 'note'];

const EXAMPLE = 'Mã căn\tLoại\tDiện tích\tGiá\tHướng\tTrạng thái\nA-12-05\t2PN\t68,5\t3,6 tỷ\tĐông Nam\tCòn\nA-12-06\t3PN\t92\t4.850.000.000\tTây Bắc\tĐã cọc';

export function InventoryImportModal({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [source, setSource] = useState('');
  const [columns, setColumns] = useState<ColumnMap>({});
  const [headerRow, setHeaderRow] = useState(-1);
  const [replace, setReplace] = useState(false);
  const [createTypes, setCreateTypes] = useState(true);
  const [createLayouts, setCreateLayouts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText('');
      setTable(null);
      setError('');
      setReplace(false);
      setCreateTypes(true);
      setCreateLayouts(true);
    }
  }

  const load = (rows: string[][], name: string) => {
    if (!rows.length) {
      setError('Không đọc được dòng nào. Hãy copy cả vùng bảng (có dòng tiêu đề) trong Excel / Google Sheets rồi dán lại.');
      return;
    }
    const detected = detectColumns(rows);
    setTable(rows);
    setColumns(detected.map);
    setHeaderRow(detected.headerRow);
    setSource(name);
    setError('');
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      load(await readSpreadsheet(file), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const width = table ? Math.max(...table.slice(0, 50).map((r) => r.length)) : 0;
  const fieldOf = (i: number): InventoryField | '' => FIELDS.find((f) => columns[f] === i) ?? '';
  const assign = (i: number, field: InventoryField | '') =>
    setColumns((c) => {
      const next: ColumnMap = {};
      for (const f of FIELDS) if (c[f] !== undefined && c[f] !== i && f !== field) next[f] = c[f];
      if (field) next[field] = i;
      return next;
    });

  // Loại căn chưa có trong dự án (VD bảng hàng ghi "A1", "B2") → đề nghị tạo mới để gắn hình mẫu.
  const newTypes = useMemo<UnitTypeRow[]>(() => {
    if (!table || columns.type === undefined) return [];
    const names = new Map<string, string>();
    table.forEach((row, r) => {
      if (r <= headerRow) return;
      const v = (row[columns.type!] ?? '').trim();
      if (v && v.length <= 40 && !matchUnitType(v, project.unitTypes)) names.set(foldText(v).replace(/\s+/g, ''), v);
    });
    return [...names.values()].slice(0, 40).map((name) => ({ id: uid(), name, area: '', price: '', quantity: '', note: '' }));
  }, [table, columns.type, headerRow, project.unitTypes]);
  const types = createTypes ? [...project.unitTypes, ...newTypes] : project.unitTypes;

  const parsed = useMemo(() => (table ? rowsToItems(table, columns, headerRow, types) : []), [table, columns, headerRow, types]);
  const existing = useMemo(() => indexByCode(project.inventory, (x) => x.code), [project.inventory]);
  const updates = parsed.filter((r) => existing.get(r.code)).length;
  const warned = parsed.filter((r) => r.warnings.length);
  const merged = useMemo(() => (parsed.length ? mergeInventory(project.inventory, parsed) : null), [parsed, project.inventory]);
  const removed = replace && merged ? merged.items.filter((x) => !merged.touched.has(x.code)).length : 0;
  const typeName = (id?: string) => types.find((t) => t.id === id)?.name ?? '';

  // Mẫu căn ghi trong bảng nhưng chưa có trong thư viện hình mẫu → đề nghị tạo (thêm ảnh sau).
  const findLayout = useMemo(() => layoutFinder(project.layouts), [project.layouts]);
  const newLayoutCodes = useMemo(() => {
    const codes = new Map<string, string>();
    for (const r of parsed) if (r.layout && !findLayout(r.layout)) codes.set(normCode(r.layout), r.layout.trim());
    return [...codes.values()].slice(0, 80);
  }, [parsed, findLayout]);

  const commit = async () => {
    if (!table || !parsed.length) return;
    setBusy(true);
    try {
      let summary = { added: 0, updated: 0, removed: 0, layouts: 0, assigned: 0 };
      await patchProject(project.id, (cur) => {
        const unitTypes = createTypes && newTypes.length ? [...cur.unitTypes, ...newTypes.filter((t) => !matchUnitType(t.name, cur.unitTypes))] : cur.unitTypes;
        const rows = rowsToItems(table, columns, headerRow, unitTypes);
        const result = mergeInventory(cur.inventory, rows);
        const inventory = replace ? result.items.filter((x) => result.touched.has(x.code)) : result.items;
        summary = { ...summary, added: result.added, updated: result.updated, removed: result.items.length - inventory.length };
        if (columns.layout === undefined) return { unitTypes, inventory };

        // Hình mẫu theo cột "Mẫu căn": gắn riêng từng căn (trùng hình mẫu theo ô trên mặt bằng thì khỏi gắn riêng).
        let layouts = cur.layouts;
        let find = layoutFinder(layouts);
        if (createLayouts) {
          const extra: UnitLayout[] = [];
          for (const r of rows) {
            if (!r.layout || find(r.layout) || extra.some((l) => normCode(l.code) === normCode(r.layout!))) continue;
            const code = r.layout.trim();
            const guess = guessLayout(code, unitTypes);
            extra.push({ id: uid(), code, name: '', tags: guess.tags, images: [], typeId: guess.typeId, bedrooms: guess.bedrooms, note: '' });
          }
          if (extra.length) {
            layouts = [...layouts, ...extra];
            find = layoutFinder(layouts);
            summary.layouts = extra.length;
          }
        }
        const changes = rows.flatMap((r) => {
          const layout = r.layout ? find(r.layout) : undefined;
          if (!layout) return [];
          return [{ code: r.code, layoutId: positionOf(cur.maps, r.code)?.layoutId === layout.id ? undefined : layout.id }];
        });
        summary.assigned = changes.length;
        return { unitTypes, inventory, layouts, layoutAssignments: setAssignments(cur.layoutAssignments, changes) };
      });
      toast(
        `Đã cập nhật bảng hàng: ${summary.added} căn mới, ${summary.updated} căn cập nhật${summary.removed ? `, bỏ ${summary.removed} căn không còn trong bảng` : ''}${
          summary.assigned ? `, gắn hình mẫu cho ${summary.assigned} căn` : ''
        }${summary.layouts ? ` (tạo ${summary.layouts} mẫu căn mới — thêm ảnh trong mục Hình mẫu căn)` : ''}`,
      );
      onClose();
    } catch (e) {
      toast(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="xl"
      title={project.inventory.length ? 'Cập nhật bảng hàng' : 'Nhập bảng hàng'}
      description={
        table
          ? `${source}: ${table.length} dòng. Kiểm tra cột được nhận đúng chưa rồi bấm cập nhật — căn trùng mã sẽ được cập nhật, căn mới được thêm.`
          : 'Copy bảng hàng trong Excel / Google Sheets (gồm dòng tiêu đề) rồi dán vào ô dưới, hoặc mở file .xlsx / .csv.'
      }
      footer={
        table ? (
          <>
            <Button variant="ghost" onClick={() => setTable(null)} disabled={busy} className="mr-auto">
              Dán lại
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={() => void commit()} loading={busy} disabled={!parsed.length}>
              Cập nhật {parsed.length} căn
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={() => load(parseTable(text), 'Dữ liệu dán')} disabled={!text.trim()}>
              Đọc bảng
            </Button>
          </>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void openFile(file);
        }}
      />
      {!table ? (
        <div className="space-y-3">
          <TextArea
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (pasted.includes('\t') || pasted.split('\n').length > 2) {
                e.preventDefault();
                setText(pasted);
                load(parseTable(pasted), 'Dữ liệu dán');
              }
            }}
            placeholder={`Dán bảng hàng vào đây. Ví dụ:\n\n${EXAMPLE}`}
            className="font-mono text-xs sm:text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={FileSpreadsheet} onClick={() => fileRef.current?.click()} loading={busy}>
              Mở file Excel / CSV
            </Button>
            <span className="text-xs text-slate-500">Chỉ cần cột mã căn; các cột khác (loại, mẫu căn, diện tích, giá, hướng, trạng thái, ghi chú) có cột nào nhận cột đó.</span>
          </div>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Dòng tiêu đề" className="w-48">
              <Select value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
                <option value={-1}>Không có tiêu đề</option>
                {table.slice(0, 6).map((_, i) => (
                  <option key={i} value={i}>
                    Dòng {i + 1}
                  </option>
                ))}
              </Select>
            </Field>
            {columns.code === undefined && <p className="pb-2.5 text-sm font-semibold text-rose-600">Chọn cột nào là “Mã căn”.</p>}
          </div>

          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Cột trong bảng</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: width }, (_, i) => {
                const head = headerRow >= 0 ? (table[headerRow][i] ?? '') : '';
                const samples = table
                  .slice(headerRow + 1)
                  .map((r) => r[i] ?? '')
                  .filter(Boolean)
                  .slice(0, 2);
                const field = fieldOf(i);
                return (
                  <div key={i} className={cn('rounded-xl border p-2.5', field ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200')}>
                    <div className="truncate text-xs font-bold text-slate-800" title={head}>
                      {columnLetter(i)}
                      {head && ` · ${head}`}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500" title={samples.join(' · ')}>
                      {samples.join(' · ') || '—'}
                    </div>
                    <select
                      aria-label={`Cột ${columnLetter(i)} là`}
                      value={field}
                      onChange={(e) => assign(i, e.target.value as InventoryField | '')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">— Bỏ qua —</option>
                      {FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {parsed.length > 0 && (
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold text-slate-700">Xem trước</span>
                <Badge tone="emerald" size="sm">
                  {parsed.length - updates} căn mới
                </Badge>
                {updates > 0 && (
                  <Badge tone="blue" size="sm">
                    {updates} căn cập nhật
                  </Badge>
                )}
                {warned.length > 0 && (
                  <Badge tone="amber" size="sm" icon={TriangleAlert}>
                    {warned.length} dòng có ô chưa đọc được
                  </Badge>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      {['Mã căn', 'Loại', ...(columns.layout !== undefined ? ['Mẫu'] : []), 'Diện tích', 'Giá', 'Hướng', 'Trạng thái', 'Ghi chú'].map((h) => (
                        <th key={h} className="px-2.5 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.slice(0, 8).map((r, i) => (
                      <tr key={`${r.code}-${i}`} className={r.warnings.length ? 'bg-amber-50/60' : ''}>
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-bold text-slate-900">{r.code}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5">{typeName(r.item.typeId)}</td>
                        {columns.layout !== undefined && (
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-mono font-semibold">
                            {r.layout}
                            {r.layout && !findLayout(r.layout) && <span className="ml-1 font-sans font-normal text-slate-400">(mới)</span>}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{r.item.area ? `${formatNumber(r.item.area, 1)} m²` : ''}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-brand-800">{r.item.price ? formatMoney(r.item.price) : ''}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.item.direction ? DIRECTION_LABEL[r.item.direction] : ''}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5">{r.item.status ? INVENTORY_STATUS[r.item.status].label : ''}</td>
                        <td className="max-w-40 truncate px-2.5 py-1.5 text-slate-500">{r.warnings.length ? `Chưa đọc được: ${r.warnings.join(', ')}` : r.item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 8 && <div className="border-t border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-500">… và {parsed.length - 8} căn nữa</div>}
              </div>
              {warned.length > 0 && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Ô chưa đọc được sẽ để trống (VD {warned[0].code}: {warned[0].warnings.join(', ')}). Có thể sửa từng căn sau khi nhập.
                </p>
              )}
            </div>
          )}

          {newTypes.length > 0 && (
            <Toggle
              checked={createTypes}
              onChange={setCreateTypes}
              label={`Tạo ${newTypes.length} loại căn mới: ${newTypes
                .slice(0, 6)
                .map((t) => t.name)
                .join(', ')}${newTypes.length > 6 ? '…' : ''}`}
              description="Để gắn hình mẫu cho từng loại căn (Sửa dự án → Sản phẩm & giá)."
            />
          )}
          {newLayoutCodes.length > 0 && (
            <Toggle
              checked={createLayouts}
              onChange={setCreateLayouts}
              label={`Tạo ${newLayoutCodes.length} mẫu căn mới: ${newLayoutCodes.slice(0, 6).join(', ')}${newLayoutCodes.length > 6 ? '…' : ''}`}
              description="Mẫu căn chưa có trong thư viện hình mẫu — tạo sẵn và gắn cho từng căn, thêm ảnh sau trong mục Hình mẫu căn."
            />
          )}
          {project.inventory.length > 0 && (
            <Toggle
              checked={replace}
              onChange={setReplace}
              label="Bỏ các căn không có trong bảng mới"
              description={
                replace && removed
                  ? `${removed} căn đang có sẽ bị xoá khỏi bảng hàng.`
                  : 'Bật khi bảng mới là bảng hàng đầy đủ (căn đã bán bị CĐT gỡ khỏi bảng). Tắt: chỉ thêm / cập nhật.'
              }
            />
          )}
          {!parsed.length && columns.code !== undefined && <p className="text-sm text-slate-500">Không có dòng nào có mã căn.</p>}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Sửa một căn

export function InventoryItemModal({ project, code, open, onClose }: { project: Project; code: string; open: boolean; onClose: () => void }) {
  const { patchProject } = useData();
  const { toast, confirm } = useUI();
  const existing = useMemo(() => (code ? indexByCode(project.inventory, (x) => x.code).get(code) : undefined), [project.inventory, code]);
  const [draft, setDraft] = useState<InventoryItem>(() => existing ?? { code, status: 'dang_ban', note: '', updatedAt: '' });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<InventoryItem>) => setDraft((d) => ({ ...d, ...patch }));

  // Hình mẫu: mặc định đổi cho cả ô trên mặt bằng (mọi căn cùng vị trí ở các tầng), "Chỉ căn này" cho căn ngoại lệ.
  const own = useMemo(() => (code ? indexByCode(project.layoutAssignments, (a) => a.code).get(code)?.layoutId : undefined), [project.layoutAssignments, code]);
  const loc = useMemo(() => buildLocator(project.maps).get(draft.code), [project.maps, draft.code]);
  const posMap = loc ? project.maps.find((m) => m.id === loc.mapId) : undefined;
  const posUnit = loc ? posMap?.units.find((u) => u.id === loc.unitId) : undefined;
  const posCodes = posMap && posUnit ? positionCodes(posMap, posUnit) : [];
  const positionLayout = project.layouts.find((l) => l.id === posUnit?.layoutId);
  const [layoutId, setLayoutId] = useState(() => own ?? positionLayout?.id ?? '');
  const [layoutScope, setLayoutScope] = useState<'position' | 'code'>(() => (posUnit ? 'position' : 'code'));
  const [layoutTouched, setLayoutTouched] = useState(false);
  const scope = posUnit ? layoutScope : 'code';

  const save = async () => {
    const next: InventoryItem = { ...draft, code: draft.code.trim(), note: draft.note.trim(), updatedAt: new Date().toISOString() };
    if (!next.code) return;
    setSaving(true);
    try {
      await patchProject(project.id, (cur) => {
        const index = indexByCode(cur.inventory, (x) => x.code);
        const original = existing ? index.get(existing.code) : undefined;
        const clash = index.get(next.code);
        if (clash && clash !== original) throw new Error(`Mã ${next.code} đã có trong bảng hàng.`);
        const inventory = original ? cur.inventory.map((x) => (x === original ? next : x)) : [...cur.inventory, next];
        // Đổi mã căn: hình mẫu riêng chuyển theo mã mới.
        const renamed = !!existing && normCode(existing.code) !== normCode(next.code);
        const moved = setAssignments(cur.layoutAssignments, renamed ? [{ code: existing.code }, ...(!layoutTouched && own ? [{ code: next.code, layoutId: own }] : [])] : []);
        if (!layoutTouched) return { inventory, layoutAssignments: moved };
        if (scope === 'position' && posMap && posUnit) {
          return { inventory, ...applyToPosition({ maps: cur.maps, layoutAssignments: moved }, posMap.id, [posUnit.id], layoutId || undefined) };
        }
        // Chỉ căn này: trùng hình mẫu theo ô thì khỏi gắn riêng.
        const ownNext = layoutId && layoutId !== positionOf(cur.maps, next.code)?.layoutId ? layoutId : undefined;
        return { inventory, layoutAssignments: setAssignments(moved, [{ code: next.code, layoutId: ownNext }]) };
      });
      const layoutCode = project.layouts.find((l) => l.id === layoutId)?.code;
      toast(
        layoutTouched && scope === 'position' && posCodes.length > 1
          ? `Đã lưu căn ${next.code} · ${layoutCode ? `hình mẫu ${layoutCode}` : 'bỏ hình mẫu'} cho ${posCodes.length} căn cùng vị trí`
          : `Đã lưu căn ${next.code}`,
      );
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: `Xoá căn ${existing.code} khỏi bảng hàng?`, confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    await patchProject(project.id, (cur) => ({ inventory: cur.inventory.filter((x) => normCode(x.code) !== normCode(existing.code)) }));
    toast(`Đã xoá căn ${existing.code}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? `Căn ${existing.code}` : code ? `Thêm căn ${code} vào bảng hàng` : 'Thêm căn vào bảng hàng'}
      footer={
        <>
          {existing && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => void remove()} className="mr-auto">
              Xoá
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!draft.code.trim()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mã căn" required>
            <TextInput value={draft.code} onChange={(e) => set({ code: e.target.value })} placeholder="VD: A-12-05, L-12" autoFocus={!code} />
          </Field>
          <Field label="Loại căn" hint={project.unitTypes.length ? undefined : 'Thêm loại căn (2PN, 3PN…) trong Sửa dự án để gắn hình mẫu.'}>
            <Select value={draft.typeId ?? ''} onChange={(e) => set({ typeId: e.target.value || undefined })}>
              <option value="">— Chưa chọn —</option>
              {project.unitTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || 'Loại chưa đặt tên'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Diện tích">
            <NumberInput value={draft.area} onChange={(area) => set({ area })} suffix="m²" placeholder="VD: 68,5" />
          </Field>
          <Field label="Giá bán">
            <MoneyInput value={draft.price} onChange={(price) => set({ price })} placeholder="VD: 3,6" />
          </Field>
          <Field label="Hướng">
            <EnumSelect<Direction> value={draft.direction} onChange={(direction) => set({ direction })} labels={DIRECTION_LABEL} placeholder="— Chưa rõ —" />
          </Field>
          {project.layouts.length > 0 && (
            <Field
              label="Hình mẫu"
              className="sm:col-span-2"
              hint={
                scope === 'position'
                  ? 'Mọi căn cùng vị trí ở các tầng dùng chung hình mẫu này (kể cả căn đang gắn riêng).'
                  : 'Chỉ đổi căn này — cho căn khác mẫu với các tầng còn lại (VD tầng trên cùng có sân vườn).'
              }
            >
              <Select
                value={layoutId}
                onChange={(e) => {
                  setLayoutId(e.target.value);
                  setLayoutTouched(true);
                }}
                aria-label="Hình mẫu"
              >
                <option value="">{scope === 'code' && positionLayout ? `Theo ô trên mặt bằng (${positionLayout.code})` : '— Không gắn hình mẫu —'}</option>
                {project.layouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`${l.code}${l.tags.length ? ` · ${l.tags.join(', ')}` : ''}`}
                  </option>
                ))}
              </Select>
              {posUnit && posCodes.length > 1 && (
                <Segmented
                  size="sm"
                  className="mt-2"
                  value={layoutScope}
                  onChange={(s) => {
                    setLayoutScope(s);
                    setLayoutTouched(true);
                  }}
                  options={[
                    { value: 'position', label: `Ô ${posUnit.label.trim()} – mọi tầng (${posCodes.length} căn)` },
                    { value: 'code', label: 'Chỉ căn này' },
                  ]}
                />
              )}
            </Field>
          )}
        </div>
        <Field label="Trạng thái">
          <div className="flex flex-wrap gap-1.5">
            {INVENTORY_STATUSES.map((s) => (
              <StatusButton key={s} status={s} active={draft.status === s} onClick={() => set({ status: s })} />
            ))}
          </div>
        </Field>
        <Field label="Ghi chú" hint="Hiện cả khi khách xem — không ghi thông tin nội bộ ở đây.">
          <TextInput value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="VD: Căn góc, view hồ bơi, tầng đẹp" />
        </Field>
      </div>
    </Modal>
  );
}

function StatusButton({ status, active, onClick }: { status: InventoryStatus; active: boolean; onClick: () => void }) {
  const { settings } = useData();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition',
        active ? 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-500/20' : 'border-slate-200 text-slate-700 hover:border-slate-300',
      )}
    >
      <ColorDot color={settings.mapColors[status]} />
      {INVENTORY_STATUS[status].label}
    </button>
  );
}
