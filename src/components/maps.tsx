import {
  Copy,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  House,
  ImagePlus,
  Map as MapIcon,
  Maximize,
  Minimize,
  Palette,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_MAP_COLORS, DIRECTION_LABEL, INVENTORY_STATUS, INVENTORY_STATUSES, MAP_CARD_FIELDS } from '../constants';
import { requestFocus } from '../lib/focus';
import { formatArea, formatMoney, formatNumber, formatUnitPrice } from '../lib/format';
import { uid } from '../lib/id';
import { upsertItem } from '../lib/inventory';
import { copyText } from '../lib/listing';
import {
  buildLocator,
  compareCodes,
  floorList,
  makeColoring,
  mapContext,
  resolveUnits,
  unitCode,
  unitMatcher,
  unitSummary,
  type Coloring,
  type MapContext,
  type ResolvedUnit,
  type UnitLocation,
} from '../lib/maps';
import { deleteImages, isImageFile, saveImage, saveImageSized } from '../lib/media';
import { navigate, useLocation } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { CodeRule, InventoryStatus, MapColorBy, Project, ProjectMap, Property, Settings } from '../types';
import { InventoryItemModal, InventoryPanel } from './inventory';
import { ColorDot, MapCanvas, stopMapGesture, svgPoints, UnitLabel, VW, type MapCanvasHandle } from './mapcanvas';
import { DropZone, ImageView, Lightbox } from './media';
import { Button, Card, Checkbox, cn, Dropdown, EmptyState, Field, IconButton, Modal, SearchInput, Segmented, Select, TextInput, Toggle } from './ui';

/*
 * Tab "Mặt bằng" của dự án: bản đồ tương tác (chạm vào căn → hình mẫu, giá, diện tích, còn / đã bán)
 * và bảng hàng của dự án.
 */

// ---------------------------------------------------------------- Tiện ích

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, [query]);
  return match;
}

const COLOR_BY: Array<{ value: MapColorBy; label: string }> = [
  { value: 'status', label: 'Trạng thái' },
  { value: 'type', label: 'Loại căn' },
  { value: 'price', label: 'Mức giá' },
  { value: 'direction', label: 'Hướng' },
];

/** Khoá chú thích "chưa có thông tin" (ô không có dữ liệu theo cách tô màu đang chọn). */
const NO_DATA = '__none';

const priceLabel = (r: ResolvedUnit, hidePrice: boolean) => (hidePrice ? 'Liên hệ' : r.price ? formatMoney(r.price) : r.priceText);

function rangeText(values: number[], format: (n: number) => string): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? format(min) : `${format(min)} – ${format(max)}`;
}

// ---------------------------------------------------------------- Tab Mặt bằng

interface FocusRequest {
  code: string;
  loc: UnitLocation;
  seq: number;
}

export function MapsTab({ project, units, editable, privacy }: { project: Project; units: Property[]; editable: boolean; privacy: boolean }) {
  const { settings } = useData();
  const { toast } = useUI();
  const { query } = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [request, setRequest] = useState<FocusRequest | null>(null);
  const ctx = useMemo(() => mapContext(project, units), [project, units]);
  const locator = useMemo(() => buildLocator(project.maps), [project.maps]);
  const map = project.maps.find((m) => m.id === query.get('bd')) ?? project.maps[0];
  const hidePrice = privacy && settings.mapHidePrice;

  const go = useCallback(
    (params: { bd?: string; can?: string }) => {
      const q = new URLSearchParams({ tab: 'mat-bang' });
      if (params.bd) q.set('bd', params.bd);
      if (params.can) q.set('can', params.can);
      navigate(`/du-an/${project.id}?${q}`, { replace: true });
    },
    [project.id],
  );

  // Tìm căn theo mã (?can=…, từ bảng hàng hoặc Hỏi nhanh): mở đúng bản đồ, đúng tầng rồi bỏ tham số.
  const can = query.get('can');
  useEffect(() => {
    if (!can) return;
    const loc = locator.get(can);
    if (loc) setRequest({ code: can, loc, seq: Date.now() });
    else toast(`Căn ${can} chưa được khoanh trên bản đồ`, 'info');
    go({ bd: loc?.mapId ?? map?.id });
    // Chỉ chạy khi có yêu cầu mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  return (
    <div className="space-y-5">
      {map ? (
        <MapViewer
          key={map.id}
          project={project}
          map={map}
          ctx={ctx}
          settings={settings}
          editable={editable}
          privacy={privacy}
          request={request?.loc.mapId === map.id ? request : null}
          onSelectMap={(id) => go({ bd: id })}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <NoMapsCard editable={editable} onCreate={() => setCreateOpen(true)} />
      )}
      <InventoryPanel project={project} ctx={ctx} locator={locator} editable={editable} privacy={privacy} hidePrice={hidePrice} onLocate={(code) => go({ bd: map?.id, can: code })} />
      {editable && <MapCreateModal project={project} open={createOpen} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

const STEPS = [
  { title: 'Tải ảnh mặt bằng', text: 'Mặt bằng tầng, sơ đồ phân lô hay phối cảnh 3D (JPG, PNG). Mặt bằng dạng PDF: chụp màn hình trang đó rồi tải ảnh lên.' },
  { title: 'Khoanh từng căn', text: 'Kéo để vẽ ô chữ nhật, chạm từng góc để vẽ ô bất kỳ; nhân bản cả dãy và tự đánh số căn.' },
  { title: 'Nhập bảng hàng', text: 'Dán bảng hàng từ Excel / Google Sheets — giá, diện tích, trạng thái tự khớp vào bản đồ theo mã căn.' },
];

function NoMapsCard({ editable, onCreate }: { editable: boolean; onCreate: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={MapIcon}
        title="Chưa có bản đồ mặt bằng"
        description={
          editable
            ? 'Khoanh từng căn trên mặt bằng của CĐT — khách chạm vào căn là thấy ngay hình mẫu, giá, diện tích, còn hay đã bán.'
            : 'Dự án chưa có bản đồ mặt bằng tương tác.'
        }
        action={
          editable && (
            <Button variant="primary" icon={Plus} onClick={onCreate}>
              Thêm bản đồ
            </Button>
          )
        }
      />
      {editable && (
        <ol className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-3 sm:p-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-xl bg-slate-50 p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{i + 1}</span>
              <div>
                <div className="text-sm font-bold text-slate-800">{s.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Xem bản đồ

function MapViewer({
  project,
  map,
  ctx,
  settings,
  editable,
  privacy,
  request,
  onSelectMap,
  onCreate,
}: {
  project: Project;
  map: ProjectMap;
  ctx: MapContext;
  settings: Settings;
  editable: boolean;
  privacy: boolean;
  request: FocusRequest | null;
  onSelectMap: (id: string) => void;
  onCreate: () => void;
}) {
  const { patchProject } = useData();
  const { toast, confirm } = useUI();
  const desktop = useMedia('(min-width: 1024px)');
  const canvas = useRef<MapCanvasHandle>(null);
  const floors = useMemo(() => floorList(map), [map]);
  const [floorState, setFloor] = useState<number | undefined>(() => request?.loc.floor ?? floors[0]);
  const floor = floors.length ? (floorState !== undefined && floors.includes(floorState) ? floorState : floors[0]) : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(() => request?.loc.unitId ?? null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [colorBy, setColorBy] = useState<MapColorBy>(map.colorBy);
  const [legendKey, setLegendKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'map' | 'grid'>('map');
  const [fullscreen, setFullscreen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);

  const hidePrice = privacy && settings.mapHidePrice;
  const colorMode: MapColorBy = hidePrice && colorBy === 'price' ? 'status' : colorBy;
  const VH = VW / map.aspect;

  const byFloor = useMemo(() => {
    const out = new Map<number | undefined, ResolvedUnit[]>();
    if (floors.length) for (const f of floors) out.set(f, resolveUnits(ctx, map, f));
    else out.set(undefined, resolveUnits(ctx, map));
    return out;
  }, [ctx, map, floors]);
  const all = useMemo(() => [...byFloor.values()].flat(), [byFloor]);
  const resolved = byFloor.get(floor) ?? [];
  const coloring = useMemo(() => makeColoring(all, colorMode, settings.mapColors, project.unitTypes), [all, colorMode, settings.mapColors, project.unitTypes]);

  // Lọc: hiểu "2pn dưới 4 tỷ hướng đông nam còn hàng"; không hiểu điều kiện nào thì tìm theo chữ (mã, loại, ghi chú).
  const matcher = useMemo(() => unitMatcher(filterText, project), [filterText, project]);
  const narrowing = !!matcher || !!legendKey;
  const matches = useCallback(
    (r: ResolvedUnit) => (!matcher || matcher.test(r)) && (!legendKey || (coloring.keyOf(r) ?? NO_DATA) === legendKey),
    [matcher, legendKey, coloring],
  );

  const filterFloor = matcher?.floor;
  useEffect(() => {
    if (filterFloor !== undefined && floors.includes(filterFloor)) setFloor(filterFloor);
  }, [filterFloor, floors]);

  const selected = selectedId ? (resolved.find((r) => r.unit.id === selectedId) ?? null) : null;

  const focusUnit = useCallback(
    (unitId: string, zoom: boolean) => {
      const unit = map.units.find((u) => u.id === unitId);
      if (unit) requestAnimationFrame(() => canvas.current?.focus(unit.points, { anchorY: desktop ? 0.5 : 0.4, zoom }));
    },
    [map.units, desktop],
  );

  // Yêu cầu tìm căn từ bảng hàng / Hỏi nhanh.
  const lastSeq = useRef(0);
  useEffect(() => {
    if (!request || request.seq === lastSeq.current) return;
    lastSeq.current = request.seq;
    setMode('map');
    setFloor(request.loc.floor);
    setSelectedId(request.loc.unitId);
    setPulseId(request.loc.unitId);
    focusUnit(request.loc.unitId, true);
    if (!fullscreen) requestFocus('map-viewer', undefined, { flash: false });
  }, [request, focusUnit, fullscreen]);

  useEffect(() => {
    if (!pulseId) return;
    const t = window.setTimeout(() => setPulseId(null), 3400);
    return () => window.clearTimeout(t);
  }, [pulseId]);

  // Toàn màn hình: khoá cuộn trang, Esc để thoát.
  useEffect(() => {
    if (!fullscreen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  /**
   * Điện thoại: thẻ chi tiết chiếm nửa dưới màn hình → đưa căn vừa chạm vào chỗ còn nhìn thấy
   * (toàn màn hình: bản đồ thu nhỏ phía trên thẻ; trong trang: cuộn trang lên).
   */
  const reveal = (id: string) => {
    window.setTimeout(() => {
      const el = document.querySelector(`#map-viewer [data-unit="${id}"]`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (fullscreen) {
        const box = document.querySelector('#map-viewer svg[aria-label="Bản đồ mặt bằng"]')?.getBoundingClientRect();
        if (box && (rect.top < box.top || rect.bottom > box.bottom || rect.left < box.left || rect.right > box.right)) focusUnit(id, false);
        return;
      }
      if (rect.bottom <= window.innerHeight * 0.4) return;
      const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      window.scrollBy({ top: rect.top - top - 24, behavior: 'smooth' });
    }, 80);
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id && !desktop) reveal(id);
  };

  const onUnitKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const id = (e.target as Element).getAttribute('data-unit');
    if (id) {
      e.preventDefault();
      select(id);
    }
  };

  const removeMap = async () => {
    const ok = await confirm({
      title: `Xoá bản đồ “${map.name}”?`,
      message: 'Ảnh nền và các ô đã khoanh sẽ bị xoá. Bảng hàng của dự án vẫn được giữ nguyên.',
      confirmLabel: 'Xoá bản đồ',
      danger: true,
    });
    if (!ok) return;
    await patchProject(project.id, (cur) => ({ maps: cur.maps.filter((m) => m.id !== map.id) }));
    await deleteImages([map.imageId]);
    toast('Đã xoá bản đồ');
  };

  // Đếm theo chú thích: tầng đang xem (mặt bằng) hoặc cả toà (bảng tầng).
  const legendUnits = mode === 'grid' ? all : resolved;
  const legendCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of legendUnits) {
      const key = coloring.keyOf(r) ?? NO_DATA;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }, [legendUnits, coloring]);

  const matchHere = narrowing ? resolved.filter(matches).length : 0;
  const matchAll = narrowing ? all.filter(matches).length : 0;
  const floorMatches = narrowing && floors.length && mode === 'map' ? floors.map((f) => ({ f, n: (byFloor.get(f) ?? []).filter(matches).length })).filter((x) => x.n > 0) : [];

  const tooltip = (r: ResolvedUnit) =>
    [r.code || 'Ô chưa đánh số', r.status && INVENTORY_STATUS[r.status].label, !hidePrice && r.price ? formatMoney(r.price) : ''].filter(Boolean).join(' · ');

  const overlay = (
    <>
      <g onKeyDown={onUnitKey}>
        {resolved.map((r) => (
          <UnitShape key={r.unit.id} id={r.unit.id} points={r.unit.points} vh={VH} color={coloring.colorOf(r)} dim={narrowing && !matches(r)} title={tooltip(r)} />
        ))}
      </g>
      {map.showLabels &&
        resolved.map((r) => r.unit.label.trim() && <UnitLabel key={`l-${r.unit.id}`} points={r.unit.points} vh={VH} text={r.unit.label} className={narrowing && !matches(r) ? 'opacity-40' : ''} />)}
      {selected && (
        <g className="pointer-events-none">
          <polygon
            className="map-lift"
            points={svgPoints(selected.unit.points, VH)}
            fill={coloring.colorOf(selected) ?? '#ffffff'}
            fillOpacity={0.6}
            stroke="#ffffff"
            strokeWidth={5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={svgPoints(selected.unit.points, VH)} fill="none" stroke="#0f172a" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {map.showLabels && selected.unit.label.trim() && <UnitLabel points={selected.unit.points} vh={VH} text={selected.unit.label} />}
        </g>
      )}
      {pulseId && (
        <polygon
          key={`p-${pulseId}`}
          className="map-pulse pointer-events-none"
          points={svgPoints(map.units.find((u) => u.id === pulseId)?.points ?? [0, 0, 0, 0, 0, 0], VH)}
          fill="none"
          stroke="#f59e0b"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );

  const details = selected && (
    <UnitDetails
      r={selected}
      project={project}
      map={map}
      settings={settings}
      editable={editable}
      hidePrice={hidePrice}
      onClose={() => setSelectedId(null)}
      onEdit={() => setEditCode(selected.code)}
      onShowOnMap={
        mode === 'grid'
          ? () => {
              setMode('map');
              focusUnit(selected.unit.id, true);
            }
          : undefined
      }
    />
  );

  return (
    <Card id="map-viewer" className="scroll-mt-24 overflow-hidden">
      <div className={cn(fullscreen && 'fixed inset-0 z-[55] flex flex-col bg-white')}>
        <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4', fullscreen && 'pt-[max(0.625rem,env(safe-area-inset-top))]')}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <MapIcon size={17} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-bold leading-tight text-slate-900">{map.name}</h2>
              <p className="text-xs text-slate-500">
                {map.units.length} ô{floors.length > 0 && ` · tầng ${floors[floors.length - 1]}–${floors[0]}`}
                {floors.length > 0 && ` · ${all.length} căn`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {editable && !fullscreen && (
              <>
                <Button size="sm" icon={Pencil} onClick={() => navigate(`/du-an/${project.id}/ban-do/${map.id}`)}>
                  Chỉnh sửa
                </Button>
                <Dropdown
                  trigger={(toggle) => <Button size="sm" icon={Ellipsis} onClick={toggle} aria-label="Thêm thao tác bản đồ" />}
                  items={[
                    { label: 'Thêm bản đồ khác', icon: Plus, onClick: onCreate },
                    { label: 'Màu & thẻ chi tiết', icon: Settings2, onClick: () => setDisplayOpen(true) },
                    { label: 'Xoá bản đồ này', icon: Trash2, onClick: () => void removeMap(), danger: true },
                  ]}
                />
              </>
            )}
            <IconButton icon={fullscreen ? Minimize : Maximize} label={fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'} onClick={() => setFullscreen((v) => !v)} />
          </div>
        </div>

        <MapChips project={project} current={map.id} onSelect={onSelectMap} />

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          {floors.length > 0 && mode === 'map' && floor !== undefined && <FloorStepper floors={floors} floor={floor} onChange={setFloor} />}
          {floors.length > 0 && (
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'map', label: 'Mặt bằng' },
                { value: 'grid', label: 'Bảng tầng' },
              ]}
            />
          )}
          <SearchInput
            value={filterText}
            onChange={setFilterText}
            placeholder="Lọc căn: 2pn, dưới 4 tỷ, hướng Đông Nam, còn hàng…"
            className="w-full sm:w-auto sm:min-w-56 sm:flex-1"
          />
        </div>

        {narrowing && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-amber-100 bg-amber-50/70 px-3 py-2 text-[13px] sm:px-4">
            <span className="font-semibold text-slate-700">
              {!matchAll
                ? 'Không có căn nào khớp'
                : floors.length && mode === 'map'
                  ? `${matchHere} căn khớp ở tầng ${floor} · ${matchAll} căn cả toà`
                  : `${matchAll} căn khớp`}
            </span>
            {!matchAll && matcher && !matcher.structured && (
              <span className="text-xs text-slate-500">Thử gõ: 2pn, dưới 4 tỷ, 60–80m2, hướng Đông Nam, còn hàng, tầng 12, hoặc mã căn.</span>
            )}
            {floorMatches.slice(0, 40).map(({ f, n }) => (
              <button
                key={f}
                type="button"
                onClick={() => setFloor(f)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition',
                  f === floor ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:ring-slate-400',
                )}
              >
                T{f} · {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setFilterText('');
                setLegendKey(null);
              }}
              className="ml-auto text-xs font-bold text-brand-700 hover:underline"
            >
              Bỏ lọc
            </button>
          </div>
        )}

        <div className={cn('lg:flex', fullscreen && 'flex min-h-0 flex-1 flex-col lg:flex-row')}>
          <div className={cn('min-w-0 flex-1', fullscreen && 'flex min-h-0 flex-col')}>
            {mode === 'map' ? (
              <MapCanvas
                ref={canvas}
                imageId={map.imageId}
                aspect={map.aspect}
                overlay={overlay}
                fill={fullscreen}
                className={cn(fullscreen && 'min-h-0 flex-1')}
                maxHeight={desktop ? 640 : Math.round(window.innerHeight * 0.62)}
                wheel={fullscreen ? 'always' : 'ctrl'}
                onTap={(_, target) => select(target?.closest('[data-unit]')?.getAttribute('data-unit') ?? null)}
              >
                {map.units.length === 0 && (
                  <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 text-sm shadow ring-1 ring-slate-200" {...stopMapGesture}>
                    <span className="font-semibold text-slate-700">Chưa khoanh căn nào trên bản đồ này.</span>
                    {editable && (
                      <Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(`/du-an/${project.id}/ban-do/${map.id}`)}>
                        Khoanh căn
                      </Button>
                    )}
                  </div>
                )}
              </MapCanvas>
            ) : (
              <FloorGrid
                map={map}
                floors={floors}
                byFloor={byFloor}
                coloring={coloring}
                dim={(r) => narrowing && !matches(r)}
                floor={floor}
                selectedId={selectedId}
                onPick={(f, id) => {
                  setFloor(f);
                  setSelectedId(id);
                }}
                className={cn(fullscreen && 'min-h-0 flex-1')}
              />
            )}
            <Legend
              coloring={coloring}
              counts={legendCounts}
              active={legendKey}
              onToggle={(key) => setLegendKey((k) => (k === key ? null : key))}
              scope={floors.length ? (mode === 'grid' ? 'cả toà' : `tầng ${floor}`) : ''}
              colorBy={
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Palette size={14} />
                  <span className="sr-only sm:not-sr-only">Tô màu theo</span>
                  <select
                    aria-label="Tô màu theo"
                    value={colorMode}
                    onChange={(e) => {
                      setColorBy(e.target.value as MapColorBy);
                      setLegendKey(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white py-1 pl-2 pr-7 text-xs font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
                  >
                    {COLOR_BY.filter((o) => !(hidePrice && o.value === 'price')).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
          </div>
          {!desktop && fullscreen && details && (
            <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.3)]">
              {details}
            </div>
          )}
          {desktop && (
            <aside className={cn('w-[340px] shrink-0 border-l border-slate-100', fullscreen && 'overflow-y-auto')}>
              <div className={cn(!fullscreen && 'sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto')}>
                {details || <MapSummary units={all} floors={floors} colors={settings.mapColors} hidePrice={hidePrice} />}
              </div>
            </aside>
          )}
        </div>
      </div>

      {!desktop &&
        !fullscreen &&
        details &&
        createPortal(
          <div className="pb-safe fixed inset-x-0 bottom-0 z-[58] max-h-[60dvh] animate-slide-up overflow-y-auto rounded-t-3xl bg-white shadow-[0_-12px_40px_-12px_rgb(15_23_42/0.35)] ring-1 ring-slate-200">
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200" />
            {details}
          </div>,
          document.body,
        )}

      {editCode !== null && <InventoryItemModal project={project} code={editCode} open onClose={() => setEditCode(null)} />}
      {editable && (
        <Modal open={displayOpen} onClose={() => setDisplayOpen(false)} title="Màu & thẻ chi tiết" description="Áp dụng cho mọi bản đồ. Có thể chỉnh lại trong Cài đặt." footer={<Button onClick={() => setDisplayOpen(false)}>Xong</Button>}>
          <MapDisplaySettings />
        </Modal>
      )}
    </Card>
  );
}

const UnitShape = memo(function UnitShape({ id, points, vh, color, dim, title }: { id: string; points: number[]; vh: number; color: string | null; dim: boolean; title: string }) {
  return (
    <polygon
      data-unit={id}
      points={svgPoints(points, vh)}
      className={cn('map-unit cursor-pointer', dim && 'map-dim')}
      fill={color ?? '#ffffff'}
      fillOpacity={dim ? 0.05 : color ? 0.42 : 0.25}
      stroke={dim ? '#94a3b8' : (color ?? '#475569')}
      strokeOpacity={dim ? 0.5 : 0.95}
      strokeWidth={1.5}
      strokeDasharray={color || dim ? undefined : '5 3'}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      tabIndex={0}
      role="button"
      aria-label={title}
    >
      <title>{title}</title>
    </polygon>
  );
});

function MapChips({ project, current, onSelect }: { project: Project; current: string; onSelect: (id: string) => void }) {
  if (project.maps.length < 2) return null;
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2 sm:px-4">
      {project.maps.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.id)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition',
            m.id === current ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900',
          )}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

function FloorStepper({ floors, floor, onChange }: { floors: number[]; floor: number; onChange: (f: number) => void }) {
  const i = floors.indexOf(floor);
  return (
    <div className="flex items-center rounded-xl bg-white ring-1 ring-inset ring-slate-300">
      <IconButton icon={ChevronDown} label="Tầng dưới" size="sm" disabled={i >= floors.length - 1} onClick={() => onChange(floors[i + 1])} />
      <select
        aria-label="Chọn tầng"
        value={floor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none bg-transparent px-1 text-center text-sm font-bold text-slate-900 focus:outline-none"
      >
        {floors.map((f) => (
          <option key={f} value={f}>
            Tầng {f}
          </option>
        ))}
      </select>
      <IconButton icon={ChevronUp} label="Tầng trên" size="sm" disabled={i <= 0} onClick={() => onChange(floors[i - 1])} />
    </div>
  );
}

function Legend({
  coloring,
  counts,
  active,
  onToggle,
  scope,
  colorBy,
}: {
  coloring: Coloring;
  counts: Map<string, number>;
  active: string | null;
  onToggle: (key: string) => void;
  scope: string;
  colorBy: ReactNode;
}) {
  const entries = coloring.legend.filter((e) => (counts.get(e.key) ?? 0) > 0);
  const none = counts.get(NO_DATA) ?? 0;
  const chip = (key: string, label: string, count: number, swatch: ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={() => onToggle(key)}
      aria-pressed={active === key}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition',
        active === key ? 'bg-slate-900 text-white ring-slate-900' : active ? 'bg-white text-slate-400 ring-slate-200' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300',
      )}
    >
      {swatch}
      {label}
      <span className={cn('tabular-nums', active === key ? 'text-white/70' : 'text-slate-400')}>{count}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2.5 sm:px-4">
      {colorBy}
      {entries.map((e) => chip(e.key, e.label, counts.get(e.key) ?? 0, <ColorDot color={e.color} />))}
      {none > 0 && chip(NO_DATA, 'Chưa có thông tin', none, <span className="inline-block size-2.5 shrink-0 rounded-full border border-dashed border-slate-500" />)}
      {(entries.length > 0 || none > 0) && <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">{scope ? `Đếm ${scope} · ` : ''}chạm để lọc</span>}
    </div>
  );
}

function FloorGrid({
  map,
  floors,
  byFloor,
  coloring,
  dim,
  floor,
  selectedId,
  onPick,
  className,
}: {
  map: ProjectMap;
  floors: number[];
  byFloor: Map<number | undefined, ResolvedUnit[]>;
  coloring: Coloring;
  dim: (r: ResolvedUnit) => boolean;
  floor?: number;
  selectedId: string | null;
  onPick: (floor: number, unitId: string) => void;
  className?: string;
}) {
  const columns = useMemo(() => map.units.filter((u) => u.label.trim()).sort((a, b) => compareCodes(a.label, b.label)), [map.units]);
  if (!columns.length) return <p className="px-4 py-10 text-center text-sm text-slate-500">Các ô trên mặt bằng chưa được đánh số căn.</p>;
  return (
    <div className={cn('max-h-[70vh] overflow-auto', className)}>
      <table className="border-separate border-spacing-1 px-2 py-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-10 bg-white px-1.5 text-right text-[11px] font-semibold text-slate-400">Tầng</th>
            {columns.map((u) => (
              <th key={u.id} className="sticky top-0 bg-white px-1 text-[11px] font-semibold text-slate-500">
                {u.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {floors.map((f) => {
            const row = new Map((byFloor.get(f) ?? []).map((r) => [r.unit.id, r]));
            return (
              <tr key={f}>
                <th className="sticky left-0 bg-white px-1.5 text-right font-bold tabular-nums text-slate-600">{f}</th>
                {columns.map((u) => {
                  const r = row.get(u.id);
                  if (!r) return <td key={u.id} />;
                  const color = coloring.colorOf(r);
                  const sel = floor === f && selectedId === u.id;
                  return (
                    <td key={u.id}>
                      <button
                        type="button"
                        title={`${r.code}${r.status ? ` · ${INVENTORY_STATUS[r.status].label}` : ''}`}
                        onClick={() => onPick(f, u.id)}
                        className={cn('h-8 min-w-11 rounded-md px-1 font-semibold tabular-nums text-slate-900 transition hover:brightness-95', sel && 'ring-2 ring-slate-900 ring-offset-1', dim(r) && 'opacity-25')}
                        style={{ backgroundColor: color ? `${color}40` : '#f8fafc', boxShadow: `inset 0 0 0 1.5px ${color ?? '#cbd5e1'}` }}
                      >
                        {u.label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MapSummary({ units, floors, colors, hidePrice }: { units: ResolvedUnit[]; floors: number[]; colors: Record<InventoryStatus, string>; hidePrice: boolean }) {
  const total = units.length;
  const counts = INVENTORY_STATUSES.map((s) => ({ s, n: units.filter((r) => r.status === s).length })).filter((x) => x.n > 0);
  const known = counts.reduce((a, x) => a + x.n, 0);
  const open = units.filter((r) => r.status === 'dang_ban');
  const prices = open.map((r) => r.price).filter((x): x is number => !!x);
  const areas = open.map((r) => r.area).filter((x): x is number => !!x);
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{floors.length ? `Tình trạng cả toà (${floors.length} tầng · ${total} căn)` : `Tình trạng (${total} ô)`}</h3>
        {known > 0 ? (
          <>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              {counts.map((x) => (
                <span key={x.s} style={{ width: `${(x.n / total) * 100}%`, backgroundColor: colors[x.s] }} />
              ))}
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {counts.map((x) => (
                <li key={x.s} className="flex items-center gap-2 text-[13px]">
                  <ColorDot color={colors[x.s]} />
                  <span className="flex-1 text-slate-600">{INVENTORY_STATUS[x.s].label}</span>
                  <b className="tabular-nums text-slate-900">{x.n}</b>
                </li>
              ))}
              {known < total && (
                <li className="flex items-center gap-2 text-[13px]">
                  <span className="inline-block size-2.5 rounded-full border border-dashed border-slate-500" />
                  <span className="flex-1 text-slate-600">Chưa có thông tin</span>
                  <b className="tabular-nums text-slate-900">{total - known}</b>
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Chưa có dữ liệu bảng hàng cho các căn trên bản đồ. Nhập bảng hàng ở phần bên dưới để tô màu còn / đã bán.</p>
        )}
      </div>
      {(prices.length > 0 || areas.length > 0) && (
        <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-[13px]">
          {!hidePrice && prices.length > 0 && (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-slate-500">Giá căn đang bán</dt>
              <dd className="font-bold text-brand-800">{rangeText(prices, (n) => formatMoney(n))}</dd>
            </div>
          )}
          {areas.length > 0 && (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-slate-500">Diện tích</dt>
              <dd className="font-semibold text-slate-800">{rangeText(areas, (n) => formatNumber(n, 1))} m²</dd>
            </div>
          )}
        </dl>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <House size={14} className="mt-0.5 shrink-0 text-slate-400" />
        Chạm vào một căn trên bản đồ để xem hình mẫu, giá, diện tích. Kéo để di chuyển, chụm hai ngón (hoặc Ctrl + cuộn chuột) để phóng to.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Thẻ chi tiết căn

function UnitDetails({
  r,
  project,
  map,
  settings,
  editable,
  hidePrice,
  onClose,
  onEdit,
  onShowOnMap,
}: {
  r: ResolvedUnit;
  project: Project;
  map: ProjectMap;
  settings: Settings;
  editable: boolean;
  hidePrice: boolean;
  onClose: () => void;
  onEdit: () => void;
  onShowOnMap?: () => void;
}) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const [lightbox, setLightbox] = useState(false);
  const upload = useLayoutUpload(project);
  const card = settings.mapCard;
  const color = r.status ? settings.mapColors[r.status] : '#94a3b8';
  const hasData = !!(r.item || r.property);
  const price = priceLabel(r, hidePrice);

  const setStatus = async (status: InventoryStatus) => {
    if (!r.code) return;
    await patchProject(project.id, (cur) => ({ inventory: upsertItem(cur.inventory, r.code, { status }) }));
    toast(`${r.code}: ${INVENTORY_STATUS[status].label}`);
  };

  const copy = async () => {
    const ok = await copyText(unitSummary(r, project.name, { hidePrice }));
    toast(ok ? 'Đã sao chép thông tin căn' : 'Không sao chép được', ok ? 'success' : 'error');
  };

  const rows: Array<[string, ReactNode]> = [
    card.area ? ['Diện tích', r.area ? formatArea(r.area) : r.areaText] : ['', null],
    card.price ? ['Giá', price && <span className="text-brand-800">{price}</span>] : ['', null],
    card.unitPrice && !hidePrice ? ['Đơn giá', formatUnitPrice(r.price, r.area)] : ['', null],
    card.rooms ? ['Phòng ngủ', r.bedrooms ? `${r.bedrooms} PN${r.bathrooms ? ` · ${r.bathrooms} WC` : ''}` : ''] : ['', null],
    card.direction ? ['Hướng', r.direction ? DIRECTION_LABEL[r.direction] : ''] : ['', null],
  ];
  const visibleRows = rows.filter(([label, value]) => label && value);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">{r.code || 'Ô chưa đánh số'}</h3>
            {r.status && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: color }}>
                {INVENTORY_STATUS[r.status].label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-slate-500">{[r.type?.name, r.floor !== undefined && `Tầng ${r.floor}`, map.name].filter(Boolean).join(' · ')}</p>
        </div>
        <IconButton icon={X} label="Đóng" size="sm" onClick={onClose} className="-mr-1.5 -mt-1" />
      </div>

      {card.image && r.imageId && (
        <button type="button" onClick={() => setLightbox(true)} className="mt-3 block w-full overflow-hidden rounded-xl ring-1 ring-slate-200" aria-label="Xem hình mẫu toàn màn hình">
          <ImageView id={r.imageId} variant="full" fit="contain" eager className="aspect-[4/3] w-full bg-slate-50" />
        </button>
      )}
      {card.image && !r.imageId && editable && r.type && (
        <button
          type="button"
          onClick={() => upload.pick(r.type!.id)}
          disabled={upload.busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-5 text-sm font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
        >
          <ImagePlus size={18} /> {upload.busy ? 'Đang lưu…' : `Thêm hình mẫu cho loại “${r.type.name || 'chưa đặt tên'}”`}
        </button>
      )}
      {upload.input}

      {visibleRows.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {visibleRows.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200/70">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="text-sm font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.note && r.note && <p className="mt-2 rounded-xl bg-amber-50/70 px-3 py-2 text-[13px] leading-relaxed text-slate-700">{r.note}</p>}

      {!hasData && r.code && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-500">
          Chưa có thông tin căn <b className="text-slate-700">{r.code}</b> trong bảng hàng{r.type ? '' : ' của dự án'}.
          {editable && ' Nhập riêng căn này, hoặc dán cả bảng hàng ở phần bên dưới.'}
        </p>
      )}
      {!r.code && editable && <p className="mt-3 text-[13px] text-slate-500">Ô này chưa có số căn — đánh số trong trang Chỉnh sửa bản đồ.</p>}

      {r.property && (
        <button
          type="button"
          onClick={() => navigate(`/bds/${r.property!.id}`)}
          className="mt-3 flex w-full items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-left text-[13px] font-semibold text-brand-800 hover:bg-brand-100"
        >
          <House size={15} className="shrink-0" /> Căn này có trong Giỏ hàng ({r.property.code}) — xem chi tiết
        </button>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.code && (
          <Button size="sm" icon={Copy} onClick={() => void copy()}>
            Copy gửi khách
          </Button>
        )}
        {onShowOnMap && (
          <Button size="sm" icon={MapIcon} onClick={onShowOnMap}>
            Xem trên mặt bằng
          </Button>
        )}
        {editable && r.code && (
          <Button size="sm" icon={Pencil} onClick={onEdit}>
            {hasData ? 'Sửa thông tin' : 'Nhập thông tin'}
          </Button>
        )}
      </div>

      {editable && r.code && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Cập nhật nhanh trạng thái</div>
          <div className="flex flex-wrap gap-1.5">
            {INVENTORY_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setStatus(s)}
                aria-pressed={r.status === s}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition',
                  r.status === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:ring-slate-400',
                )}
              >
                <ColorDot color={settings.mapColors[s]} />
                {INVENTORY_STATUS[s].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && r.imageId && <Lightbox images={[r.imageId]} index={0} onIndex={() => undefined} onClose={() => setLightbox(false)} />}
    </div>
  );
}

/** Tải hình mẫu cho một loại căn (lưu ngay vào dự án). */
function useLayoutUpload(project: Project) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    const typeId = target.current;
    if (!file || !typeId) return;
    if (!isImageFile(file)) {
      toast('Hãy chọn file ảnh (JPG, PNG…)', 'error');
      return;
    }
    setBusy(true);
    try {
      const id = await saveImage(file);
      let old: string | undefined;
      await patchProject(project.id, (cur) => ({
        unitTypes: cur.unitTypes.map((t) => {
          if (t.id !== typeId) return t;
          old = t.imageId;
          return { ...t, imageId: id };
        }),
      }));
      if (old) await deleteImages([old]);
      toast('Đã thêm hình mẫu');
    } catch (e) {
      toast(`Không lưu được ảnh: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    pick: (typeId: string) => {
      target.current = typeId;
      inputRef.current?.click();
    },
    input: (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void onFile(file);
        }}
      />
    ),
  };
}

// ---------------------------------------------------------------- Cài đặt hiển thị (dùng chung với trang Cài đặt)

export function MapDisplaySettings() {
  const { settings, updateSettings } = useData();
  const [colors, setColors] = useState(settings.mapColors);
  // Bảng chọn màu bắn sự kiện liên tục khi kéo: chỉ lưu khi dừng tay.
  useEffect(() => {
    if (colors === settings.mapColors) return;
    const t = window.setTimeout(() => void updateSettings({ mapColors: colors }), 300);
    return () => window.clearTimeout(t);
  }, [colors, settings.mapColors, updateSettings]);
  const isDefault = INVENTORY_STATUSES.every((s) => colors[s].toLowerCase() === DEFAULT_MAP_COLORS[s].toLowerCase());

  return (
    <div className="space-y-5">
      <Field
        label="Màu theo trạng thái căn"
        aside={
          !isDefault && (
            <button type="button" onClick={() => setColors({ ...DEFAULT_MAP_COLORS })} className="text-xs font-semibold text-brand-700 hover:underline">
              Màu mặc định
            </button>
          )
        }
        hint="Mặc định theo quy ước bảng hàng: xanh còn hàng, vàng giữ chỗ, cam đã cọc, đỏ đã bán."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {INVENTORY_STATUSES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 hover:border-slate-300">
              <input
                type="color"
                value={colors[s]}
                onChange={(e) => setColors((c) => ({ ...c, [s]: e.target.value }))}
                className="size-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                aria-label={`Màu cho ${INVENTORY_STATUS[s].label}`}
              />
              <span className="text-sm font-semibold text-slate-700">{INVENTORY_STATUS[s].label}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Thẻ chi tiết khi chạm vào căn">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {MAP_CARD_FIELDS.map((f) => (
            <Checkbox key={f.key} checked={settings.mapCard[f.key]} onChange={(v) => void updateSettings({ mapCard: { ...settings.mapCard, [f.key]: v } })} label={f.label} />
          ))}
        </div>
      </Field>
      <Toggle
        checked={settings.mapHidePrice}
        onChange={(v) => void updateSettings({ mapHidePrice: v })}
        label="Ẩn giá khi khách xem"
        description="Ở chế độ khách xem, bản đồ và bảng hàng hiện “Liên hệ” thay cho giá."
      />
    </div>
  );
}

// ---------------------------------------------------------------- Thông tin bản đồ (tạo mới / chỉnh sửa)

export interface MapSetupDraft {
  name: string;
  typical: boolean;
  from: string;
  to: string;
  skip: string;
  prefix: string;
  sep: string;
  padFloor: boolean;
}

export function mapSetupDraft(map: Pick<ProjectMap, 'name' | 'floors' | 'codeRule'>): MapSetupDraft {
  return {
    name: map.name,
    typical: !!map.floors,
    from: String(map.floors?.from ?? 2),
    to: String(map.floors?.to ?? 20),
    skip: map.floors?.skip.join(', ') ?? '',
    prefix: map.codeRule.prefix,
    sep: map.codeRule.sep,
    padFloor: map.codeRule.padFloor,
  };
}

/** Kiểm tra & chuyển thông tin nhập thành cấu hình bản đồ. */
export function parseMapSetup(d: MapSetupDraft): { name: string; floors?: ProjectMap['floors']; codeRule: CodeRule } | { error: string } {
  const name = d.name.trim();
  if (!name) return { error: 'Hãy đặt tên bản đồ.' };
  const codeRule: CodeRule = { prefix: d.prefix.trim(), sep: d.sep, padFloor: d.padFloor };
  if (!d.typical) return { name, codeRule };
  const from = Number(d.from);
  const to = Number(d.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < -10 || to < from) return { error: 'Số tầng chưa đúng: “Từ tầng” phải nhỏ hơn hoặc bằng “Đến tầng”.' };
  if (to - from > 200) return { error: 'Tối đa 200 tầng cho một mặt bằng.' };
  const skip = [...new Set((d.skip.match(/-?\d+/g) ?? []).map(Number))].filter((f) => f >= from && f <= to);
  return { name, floors: { from, to, skip }, codeRule };
}

const SEPARATORS = [
  { value: '-', label: 'Gạch nối (A-12-05)' },
  { value: '.', label: 'Dấu chấm (A-12.05)' },
  { value: '', label: 'Viết liền (A-1205)' },
  { value: '/', label: 'Gạch chéo (A-12/05)' },
];

export function MapSetupFields({ draft, onChange, sample = '05' }: { draft: MapSetupDraft; onChange: (d: MapSetupDraft) => void; sample?: string }) {
  const set = (patch: Partial<MapSetupDraft>) => onChange({ ...draft, ...patch });
  const parsed = parseMapSetup({ ...draft, name: draft.name || 'x' });
  const exampleMap = 'error' in parsed ? null : ({ floors: parsed.floors, codeRule: parsed.codeRule } as ProjectMap);
  const example = exampleMap?.floors ? unitCode(exampleMap, sample, exampleMap.floors.to) : '';
  return (
    <div className="space-y-4">
      <Field label="Tên bản đồ" required>
        <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Mặt bằng tầng 5–25 toà A, Sơ đồ phân lô khu B" />
      </Field>
      <Field label="Loại bản đồ">
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard active={!draft.typical} onClick={() => set({ typical: false })} title="Một mặt bằng">
            Sơ đồ phân lô, mặt bằng một tầng, phối cảnh — mỗi ô một mã căn (VD L-12, SH-05).
          </ChoiceCard>
          <ChoiceCard active={draft.typical} onClick={() => set({ typical: true })} title="Tầng điển hình (chung cư)">
            Một mặt bằng dùng cho nhiều tầng; mã căn ghép tầng + số căn (VD A-12-05).
          </ChoiceCard>
        </div>
      </Field>
      {draft.typical && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Từ tầng">
              <TextInput inputMode="numeric" value={draft.from} onChange={(e) => set({ from: e.target.value.replace(/[^\d-]/g, '') })} />
            </Field>
            <Field label="Đến tầng">
              <TextInput inputMode="numeric" value={draft.to} onChange={(e) => set({ to: e.target.value.replace(/[^\d-]/g, '') })} />
            </Field>
            <Field label="Bỏ qua tầng" className="col-span-2 sm:col-span-1">
              <TextInput value={draft.skip} onChange={(e) => set({ skip: e.target.value })} placeholder="VD: 13, 14" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tiền tố mã căn" hint="Tên toà / block, để trống nếu bảng hàng không ghi.">
              <TextInput value={draft.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="VD: A-" />
            </Field>
            <Field label="Nối tầng và số căn">
              <Select value={draft.sep} onChange={(e) => set({ sep: e.target.value })}>
                {SEPARATORS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox checked={draft.padFloor} onChange={(v) => set({ padFloor: v })} label="Tầng luôn 2 chữ số (tầng 5 ghi 05)" />
          {example && (
            <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-900">
              Mã căn sẽ là <b className="font-mono">{example}</b> (căn số {sample}, tầng {exampleMap?.floors?.to}). Đặt giống cách ghi trong bảng hàng để tự khớp giá & trạng thái.
            </p>
          )}
          {'error' in parsed && <p className="text-sm font-medium text-rose-600">{parsed.error}</p>}
        </>
      )}
    </div>
  );
}

function ChoiceCard({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border px-3.5 py-3 text-left transition',
        active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span className="block text-sm font-bold text-slate-900">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Thêm bản đồ

const nameFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function MapCreateModal({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fresh = (): MapSetupDraft =>
    mapSetupDraft({ name: '', floors: project.productTypes.some((t) => t === 'can_ho' || t === 'condotel') ? { from: 2, to: 20, skip: [] } : undefined, codeRule: { prefix: '', sep: '-', padFloor: true } });
  const [draft, setDraft] = useState<MapSetupDraft>(fresh);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null);
      setPreview(null);
      setDraft(fresh());
    }
  }

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const pick = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!isImageFile(f)) {
      toast('Hãy chọn file ảnh (JPG, PNG…). Mặt bằng dạng PDF: chụp màn hình trang đó rồi tải ảnh lên.', 'error');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setDraft((d) => (d.name.trim() ? d : { ...d, name: nameFromFile(f.name) }));
  };

  const save = async () => {
    const setup = parseMapSetup(draft);
    if ('error' in setup) {
      toast(setup.error, 'error');
      return;
    }
    if (!file) return;
    setSaving(true);
    try {
      // Ảnh mặt bằng giữ nét hơn ảnh thường để phóng to vẫn đọc được số căn.
      const img = await saveImageSized(file, { maxSize: 4000, quality: 0.9 });
      const now = new Date().toISOString();
      const map: ProjectMap = {
        id: uid(),
        name: setup.name,
        imageId: img.id,
        aspect: img.width / img.height,
        floors: setup.floors,
        codeRule: setup.codeRule,
        colorBy: 'status',
        showLabels: true,
        units: [],
        createdAt: now,
        updatedAt: now,
      };
      await patchProject(project.id, (cur) => ({ maps: [...cur.maps, map] }));
      onClose();
      navigate(`/du-an/${project.id}/ban-do/${map.id}`);
    } catch (e) {
      toast(`Không lưu được bản đồ: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title="Thêm bản đồ mặt bằng"
      description="Ảnh mặt bằng tầng, sơ đồ phân lô hoặc phối cảnh của CĐT. Sau khi lưu sẽ chuyển sang khoanh từng căn."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!file} loading={saving}>
            Lưu & khoanh căn
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          pick(files);
        }}
      />
      {preview ? (
        <div className="mb-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
          <img src={preview} alt="" className="max-h-64 w-full bg-slate-50 object-contain" />
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span className="truncate">{file?.name}</span>
            <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 font-semibold text-brand-700 hover:underline">
              Chọn ảnh khác
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <DropZone
            onFiles={pick}
            onPick={() => inputRef.current?.click()}
            title="Chọn ảnh mặt bằng"
            hint="JPG, PNG, WebP. Ảnh càng nét, phóng to càng rõ số căn."
            icon={MapIcon}
          />
        </div>
      )}
      <MapSetupFields draft={draft} onChange={setDraft} />
    </Modal>
  );
}
