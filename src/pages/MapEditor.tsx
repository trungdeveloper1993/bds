import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Columns3,
  CopyPlus,
  Hash,
  ImageUp,
  ListOrdered,
  MousePointer2,
  Pentagon,
  Redo2,
  Rows3,
  Save,
  Settings2,
  Square,
  SquareDashed,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { MapCanvas, svgPoints, UnitLabel, VW, type MapCanvasHandle } from '../components/mapcanvas';
import { mapSetupDraft, MapSetupFields, parseMapSetup, useMedia, type MapSetupDraft } from '../components/maps';
import { Button, Checkbox, cn, Field, IconButton, Modal, Segmented, Select, TextInput, Toggle } from '../components/ui';
import { uid } from '../lib/id';
import {
  bbox,
  centroid,
  clampPoints,
  compareCodes,
  floorList,
  mapContext,
  nextLabel,
  normCode,
  pointInPolygon,
  readingOrder,
  rectPoints,
  renumber,
  resolveCode,
  splitUnit,
  translatePoints,
  unitCode,
  type Pt,
} from '../lib/maps';
import { isImageFile, saveImageSized } from '../lib/media';
import { goBack, releaseNavigationGuard, useUnsavedChangesGuard } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { MapColorBy, MapUnit, Project, ProjectMap } from '../types';
import { NotFound } from './NotFound';

/*
 * Trang khoanh căn trên bản đồ: vẽ ô chữ nhật / đa giác, chọn – kéo – chỉnh góc (tự hít vào góc ô bên cạnh),
 * chạm để đánh số, nhân bản cả dãy, đánh số lại, hoàn tác. Lưu một lần khi xong.
 */

export function MapEditor({ projectId, mapId }: { projectId: string; mapId: string }) {
  const { projectById } = useData();
  const project = projectById.get(projectId);
  const map = project?.maps.find((m) => m.id === mapId);
  if (!project || !map) return <NotFound what="bản đồ" backTo={project ? `/du-an/${project.id}?tab=mat-bang` : '/du-an'} />;
  return <Editor key={map.id} project={project} initial={map} />;
}

type Tool = 'select' | 'rect' | 'poly' | 'number';
type Dir = 'right' | 'left' | 'down' | 'up';

const TOOLS: Array<{ value: Tool; label: string; short: string; icon: LucideIcon; key: string; hint: string }> = [
  {
    value: 'select',
    label: 'Chọn & sửa',
    short: 'Chọn',
    icon: MousePointer2,
    key: 'V',
    hint: 'Chạm vào ô để chọn, kéo để di chuyển, kéo chấm ở góc để chỉnh hình (chấm nhỏ giữa cạnh: thêm góc). Kéo chỗ trống để di chuyển bản đồ.',
  },
  {
    value: 'rect',
    label: 'Vẽ ô chữ nhật',
    short: 'Chữ nhật',
    icon: Square,
    key: 'R',
    hint: 'Kéo trên ảnh để khoanh một căn; số căn tự tăng sau mỗi ô. Mẹo: khoanh cả dãy căn bằng một ô rồi bấm “Chia đều”. Kéo bản đồ bằng 2 ngón tay (hoặc giữ phím cách).',
  },
  {
    value: 'poly',
    label: 'Vẽ ô đa giác',
    short: 'Đa giác',
    icon: Pentagon,
    key: 'P',
    hint: 'Chạm lần lượt từng góc của căn, chạm lại điểm đầu (hoặc Enter) để khép kín — dùng cho căn góc, lô đất méo.',
  },
  {
    value: 'number',
    label: 'Chạm để đánh số',
    short: 'Đánh số',
    icon: Hash,
    key: 'N',
    hint: 'Chạm lần lượt từng căn theo đúng thứ tự — mỗi lần chạm gán số tiếp theo.',
  },
];

interface Drag {
  kind: 'move' | 'vertex' | 'rect' | 'marquee';
  start: Pt;
  end?: Pt;
  ids?: string[];
  base?: Map<string, number[]>;
  id?: string;
  index?: number;
  moved: boolean;
}

/** Số tiếp theo sau số lớn nhất đang có. */
function firstLabel(units: MapUnit[]): string {
  const labels = units
    .map((u) => u.label.trim())
    .filter(Boolean)
    .sort(compareCodes);
  return labels.length ? nextLabel(labels[labels.length - 1]) : '01';
}

/** Bản sao của các ô đang chọn, xếp liền nhau theo một hướng (nhân bản cả dãy căn). */
function makeCopies(all: MapUnit[], ids: string[], dir: Dir, count: number, gap: number, step: number, relabel: boolean): MapUnit[] {
  const chosen = readingOrder(all.filter((u) => ids.includes(u.id)));
  if (!chosen.length || count < 1) return [];
  const b = bbox(chosen.flatMap((u) => u.points));
  const dx = dir === 'right' ? b.w * (1 + gap) : dir === 'left' ? -b.w * (1 + gap) : 0;
  const dy = dir === 'down' ? b.h * (1 + gap) : dir === 'up' ? -b.h * (1 + gap) : 0;
  let last =
    chosen
      .map((u) => u.label.trim())
      .filter(Boolean)
      .sort(compareCodes)
      .pop() ?? '';
  const out: MapUnit[] = [];
  for (let i = 1; i <= count; i++) {
    for (const u of chosen) {
      let label = u.label;
      if (relabel) label = last ? (last = nextLabel(last, step)) : '';
      out.push({ id: uid(), points: clampPoints(translatePoints(u.points, dx * i, dy * i)), label });
    }
  }
  return out;
}

const clampCoord = (v: number) => Math.min(1.2, Math.max(-0.2, v));

function Editor({ project, initial }: { project: Project; initial: ProjectMap }) {
  const { patchProject, properties } = useData();
  const { toast, confirm } = useUI();
  const desktop = useMedia('(min-width: 1024px)');
  const coarse = useMedia('(pointer: coarse)');
  const canvas = useRef<MapCanvasHandle>(null);
  const back = `/du-an/${project.id}?tab=mat-bang&bd=${initial.id}`;

  // ---------------------------------------------------------------- Bản nháp + hoàn tác
  const [draft, setDraftState] = useState(initial);
  const draftRef = useRef(initial);
  const saved = useRef(initial);
  const past = useRef<ProjectMap[]>([]);
  const future = useRef<ProjectMap[]>([]);
  const put = useCallback((next: ProjectMap) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const checkpoint = useCallback(() => {
    past.current.push(draftRef.current);
    if (past.current.length > 150) past.current.shift();
    future.current = [];
  }, []);
  const commit = useCallback(
    (fn: (d: ProjectMap) => ProjectMap) => {
      const next = fn(draftRef.current);
      if (next === draftRef.current) return;
      checkpoint();
      put(next);
    },
    [checkpoint, put],
  );
  const setUnits = useCallback((fn: (units: MapUnit[]) => MapUnit[]) => commit((d) => ({ ...d, units: fn(d.units) })), [commit]);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(draftRef.current);
    put(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(draftRef.current);
    put(next);
  };
  const dirty = draft !== saved.current;
  useUnsavedChangesGuard(dirty, 'Bản đồ có thay đổi chưa lưu. Rời trang này?');

  // ---------------------------------------------------------------- Trạng thái thao tác
  const [tool, setToolState] = useState<Tool>(initial.units.length ? 'select' : 'rect');
  const [selected, setSelected] = useState<string[]>([]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const [activeVertex, setActiveVertex] = useState<{ id: string; index: number } | null>(null);
  const [multi, setMulti] = useState(false);
  const [pending, setPending] = useState(() => firstLabel(initial.units));
  const [step, setStep] = useState(1);
  const [poly, setPoly] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [ghost, setGhost] = useState<{ kind: 'rect' | 'marquee'; points: number[] } | null>(null);
  const [k, setK] = useState(1);
  const [panel, setPanel] = useState<null | 'row' | 'renumber' | 'split'>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const drag = useRef<Drag | null>(null);
  const labelEdit = useRef(false);

  const VH = VW / draft.aspect;
  const snapPx = coarse ? 12 : 8;
  const units = draft.units;
  const single = selected.length === 1 ? (units.find((u) => u.id === selected[0]) ?? null) : null;
  // Sửa số căn: mỗi lần chọn ô khác là một bước hoàn tác mới.
  const singleId = single?.id;
  useEffect(() => {
    labelEdit.current = false;
  }, [singleId]);

  const setTool = (t: Tool) => {
    setToolState(t);
    setPoly([]);
    setGhost(null);
    setActiveVertex(null);
    if (t !== 'select') setPanel(null);
  };

  // Trang chỉnh sửa chiếm toàn màn hình: khoá cuộn trang phía sau.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // ---------------------------------------------------------------- Đối chiếu bảng hàng
  const ctx = useMemo(() => mapContext(project, properties), [project, properties]);
  const floors = useMemo(() => floorList(draft), [draft]);
  const labelKey = units.map((u) => `${u.id}:${u.label}`).join('|');
  const ruleKey = JSON.stringify([draft.floors, draft.codeRule]);
  const { matched, duplicates } = useMemo(() => {
    const current = draftRef.current;
    const fl = floorList(current);
    const matched = new Set<string>();
    const count = new Map<string, number>();
    for (const u of current.units) {
      const label = normCode(u.label);
      if (!label) continue;
      count.set(label, (count.get(label) ?? 0) + 1);
      const tryFloors = fl.length ? fl : [undefined];
      if (tryFloors.some((f) => {
        const r = resolveCode(ctx, unitCode(current, u.label, f), u, f);
        return !!(r.item || r.property);
      }))
        matched.add(u.id);
    }
    return { matched, duplicates: new Set([...count].filter(([, n]) => n > 1).map(([l]) => l)) };
    // labelKey / ruleKey thay cho draft.units: kéo ô (đổi toạ độ) không cần tính lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey, ruleKey, ctx]);
  const unlabeled = units.filter((u) => !u.label.trim());
  const dupUnits = units.filter((u) => duplicates.has(normCode(u.label)));

  // ---------------------------------------------------------------- Hình học trên màn hình
  /** Khoảng cách (px màn hình) của một độ lệch toạ độ 0–1. */
  const px = (dx: number, dy: number) => Math.hypot(dx * VW, dy * VH) * k;

  const snap = (pt: Pt, exclude: Set<string>, off?: boolean): Pt => {
    if (off) return pt;
    let best = pt;
    let bestD = snapPx;
    for (const u of draftRef.current.units) {
      if (exclude.has(u.id)) continue;
      const p = u.points;
      for (let i = 0; i < p.length; i += 2) {
        const d = px(p[i] - pt.x, p[i + 1] - pt.y);
        if (d < bestD) {
          bestD = d;
          best = { x: p[i], y: p[i + 1] };
        }
      }
    }
    return best;
  };

  /** Khi kéo ít ô: hít góc ô đang kéo vào góc ô bên cạnh. */
  const snapOffset = (ids: Set<string>, base: Map<string, number[]>, dx: number, dy: number): Pt => {
    let best: Pt = { x: 0, y: 0 };
    let bestD = snapPx;
    const others = draftRef.current.units.filter((u) => !ids.has(u.id));
    for (const pts of base.values()) {
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] + dx;
        const y = pts[i + 1] + dy;
        for (const o of others) {
          for (let j = 0; j < o.points.length; j += 2) {
            const d = px(o.points[j] - x, o.points[j + 1] - y);
            if (d < bestD) {
              bestD = d;
              best = { x: o.points[j] - x, y: o.points[j + 1] - y };
            }
          }
        }
      }
    }
    return best;
  };

  const hitTest = (pt: Pt) => [...draftRef.current.units].reverse().find((u) => pointInPolygon(pt.x, pt.y, u.points)) ?? null;

  const addUnit = (points: number[]) => {
    const unit: MapUnit = { id: uid(), points: clampPoints(points), label: pending };
    setUnits((list) => [...list, unit]);
    setSelected([unit.id]);
    setPending(nextLabel(pending, step));
  };

  // ---------------------------------------------------------------- Chuột / chạm
  const onToolDown = (pt: Pt, e: ReactPointerEvent): boolean => {
    const target = e.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    const unitId = target.closest('[data-unit]')?.getAttribute('data-unit') ?? null;
    if (tool === 'select') {
      if (handle) {
        const [kind, id, idx] = handle.split(':');
        const u = draftRef.current.units.find((x) => x.id === id);
        if (!u) return false;
        let index = Number(idx);
        if (kind === 'm') {
          // Chấm giữa cạnh: thêm góc mới rồi kéo luôn.
          checkpoint();
          const points = [...u.points];
          points.splice((index + 1) * 2, 0, pt.x, pt.y);
          put({ ...draftRef.current, units: draftRef.current.units.map((x) => (x.id === id ? { ...x, points } : x)) });
          index += 1;
          drag.current = { kind: 'vertex', start: pt, id, index, moved: true };
        } else {
          drag.current = { kind: 'vertex', start: pt, id, index, moved: false };
        }
        setActiveVertex({ id, index });
        return true;
      }
      if (unitId) {
        setActiveVertex(null);
        if (multi || e.shiftKey || e.ctrlKey || e.metaKey) {
          setSelected((s) => (s.includes(unitId) ? s.filter((x) => x !== unitId) : [...s, unitId]));
          return true;
        }
        const ids = selSet.has(unitId) ? selected : [unitId];
        if (!selSet.has(unitId)) setSelected([unitId]);
        const base = new Map(draftRef.current.units.filter((u) => ids.includes(u.id)).map((u) => [u.id, u.points]));
        drag.current = { kind: 'move', start: pt, ids, base, moved: false };
        return true;
      }
      if (e.shiftKey && e.pointerType === 'mouse') {
        drag.current = { kind: 'marquee', start: pt, moved: false };
        return true;
      }
      return false;
    }
    if (tool === 'rect') {
      const start = snap(pt, new Set(), e.altKey);
      drag.current = { kind: 'rect', start, end: start, moved: false };
      return true;
    }
    return false;
  };

  const onToolMove = (pt: Pt, e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'move' && d.base && d.ids) {
      let dx = pt.x - d.start.x;
      let dy = pt.y - d.start.y;
      if (!d.moved) {
        if (px(dx, dy) < 3) return;
        d.moved = true;
        checkpoint();
      }
      if (d.ids.length <= 4 && !e.altKey) {
        const fix = snapOffset(new Set(d.ids), d.base, dx, dy);
        dx += fix.x;
        dy += fix.y;
      }
      const base = d.base;
      put({ ...draftRef.current, units: draftRef.current.units.map((u) => (base.has(u.id) ? { ...u, points: clampPoints(translatePoints(base.get(u.id)!, dx, dy)) } : u)) });
    } else if (d.kind === 'vertex' && d.id !== undefined && d.index !== undefined) {
      if (!d.moved) {
        if (px(pt.x - d.start.x, pt.y - d.start.y) < 2) return;
        d.moved = true;
        checkpoint();
      }
      const p = snap(pt, new Set([d.id]), e.altKey);
      const { id, index } = d;
      put({
        ...draftRef.current,
        units: draftRef.current.units.map((u) => {
          if (u.id !== id) return u;
          const points = [...u.points];
          points[index * 2] = clampCoord(p.x);
          points[index * 2 + 1] = clampCoord(p.y);
          return { ...u, points };
        }),
      });
    } else if (d.kind === 'rect') {
      const p = snap(pt, new Set(), e.altKey);
      d.end = p;
      d.moved = d.moved || px(p.x - d.start.x, p.y - d.start.y) > 4;
      setGhost({ kind: 'rect', points: rectPoints(d.start.x, d.start.y, p.x, p.y) });
    } else if (d.kind === 'marquee') {
      d.end = pt;
      d.moved = true;
      setGhost({ kind: 'marquee', points: rectPoints(d.start.x, d.start.y, pt.x, pt.y) });
    }
  };

  const onToolUp = (pt: Pt) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'rect') {
      setGhost(null);
      const end = d.end ?? pt;
      const pts = rectPoints(d.start.x, d.start.y, end.x, end.y);
      const b = bbox(pts);
      if (d.moved && px(b.w, 0) >= 6 && px(0, b.h) >= 6) addUnit(pts);
      else {
        // Chạm (không kéo) khi đang vẽ: chọn ô dưới ngón tay để sửa số.
        const hit = hitTest(pt);
        setSelected(hit ? [hit.id] : []);
      }
    } else if (d.kind === 'marquee') {
      setGhost(null);
      const b = bbox(rectPoints(d.start.x, d.start.y, pt.x, pt.y));
      const ids = draftRef.current.units
        .filter((u) => {
          const c = centroid(u.points);
          return c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1;
        })
        .map((u) => u.id);
      setSelected((s) => [...new Set([...s, ...ids])]);
    }
  };

  const onToolCancel = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (d && (d.kind === 'move' || d.kind === 'vertex') && d.moved) {
      const prev = past.current.pop();
      if (prev) put(prev);
    }
  };

  const finishPoly = (points = poly) => {
    if (points.length < 3) return;
    addUnit(points.flatMap((p) => [p.x, p.y]));
    setPoly([]);
  };

  const onTap = (raw: Pt, target: Element | null) => {
    const unitId = target?.closest('[data-unit]')?.getAttribute('data-unit') ?? null;
    if (tool === 'select') {
      if (!unitId) {
        setSelected([]);
        setActiveVertex(null);
      }
      return;
    }
    if (tool === 'number') {
      if (!unitId) return;
      const label = pending;
      setUnits((list) => list.map((u) => (u.id === unitId ? { ...u, label } : u)));
      setSelected([unitId]);
      setPending(nextLabel(label, step));
      return;
    }
    if (tool === 'poly') {
      const pt = snap(raw, new Set());
      const first = poly[0];
      const last = poly[poly.length - 1];
      if (first && poly.length >= 3 && px(first.x - pt.x, first.y - pt.y) <= (coarse ? 18 : 12)) finishPoly();
      else if (last && px(last.x - pt.x, last.y - pt.y) < 4) {
        if (poly.length >= 3) finishPoly(); // chạm đúp vào điểm cuối: khép kín
      } else setPoly([...poly, pt]);
    }
  };

  // ---------------------------------------------------------------- Thao tác trên ô đang chọn
  const removeSelected = () => {
    if (activeVertex && single && activeVertex.id === single.id) {
      if (single.points.length <= 6) {
        toast('Ô cần ít nhất 3 góc', 'info');
        return;
      }
      const { index } = activeVertex;
      setUnits((list) => list.map((u) => (u.id === single.id ? { ...u, points: u.points.filter((_, i) => i !== index * 2 && i !== index * 2 + 1) } : u)));
      setActiveVertex(null);
      return;
    }
    if (!selected.length) return;
    setUnits((list) => list.filter((u) => !selSet.has(u.id)));
    setSelected([]);
  };

  const duplicate = () => {
    if (!selected.length) return;
    const copies = makeCopies(draftRef.current.units, selected, 'right', 1, 0, step, true);
    setUnits((list) => [...list, ...copies]);
    setSelected(copies.map((c) => c.id));
    setPending(firstLabel([...draftRef.current.units]));
  };

  const nudge = (dx: number, dy: number) => {
    if (!selected.length) return;
    setUnits((list) => list.map((u) => (selSet.has(u.id) ? { ...u, points: clampPoints(translatePoints(u.points, dx, dy)) } : u)));
  };

  const setLabel = (id: string, label: string) => {
    if (!labelEdit.current) {
      checkpoint();
      labelEdit.current = true;
    }
    put({ ...draftRef.current, units: draftRef.current.units.map((u) => (u.id === id ? { ...u, label } : u)) });
  };

  const selectAndShow = (ids: string[]) => {
    setTool('select');
    setSelected(ids);
    const pts = draftRef.current.units.filter((u) => ids.includes(u.id)).flatMap((u) => u.points);
    if (pts.length) canvas.current?.focus(pts, { anchorY: desktop ? 0.5 : 0.45 });
  };

  // ---------------------------------------------------------------- Lưu
  const save = async (): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const current = draftRef.current;
      const next: ProjectMap = {
        ...current,
        units: current.units.map((u) => ({ ...u, label: u.label.trim(), points: u.points.map((v) => Math.round(v * 1e5) / 1e5) })),
        updatedAt: new Date().toISOString(),
      };
      await patchProject(project.id, (cur) => ({
        maps: cur.maps.some((m) => m.id === next.id) ? cur.maps.map((m) => (m.id === next.id ? next : m)) : [...cur.maps, next],
      }));
      saved.current = next;
      put(next);
      toast('Đã lưu bản đồ');
      return true;
    } catch (e) {
      toast(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const done = async () => {
    if (dirty && !(await save())) return;
    releaseNavigationGuard();
    goBack(back);
  };

  const leave = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Bỏ các thay đổi chưa lưu?', message: 'Các ô vừa khoanh / sửa sẽ không được lưu.', confirmLabel: 'Bỏ thay đổi', danger: true });
      if (!ok) return;
    }
    releaseNavigationGuard();
    goBack(back);
  };

  // ---------------------------------------------------------------- Phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void save();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (document.querySelector('[role=dialog]')) return;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && key === 'a') {
        e.preventDefault();
        setToolState('select');
        setSelected(draftRef.current.units.map((u) => u.id));
      } else if (!mod && !e.altKey) {
        const found = TOOLS.find((x) => x.key.toLowerCase() === key);
        if (found) setTool(found.value);
        else if (e.key === 'Escape') {
          if (poly.length) setPoly([]);
          else if (panel) setPanel(null);
          else {
            setSelected([]);
            setActiveVertex(null);
          }
        } else if (e.key === 'Enter' && poly.length >= 3) finishPoly();
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (poly.length) setPoly(poly.slice(0, -1));
          else removeSelected();
        } else if (e.key.startsWith('Arrow') && selected.length) {
          e.preventDefault();
          const s = (e.shiftKey ? 10 : 1) / k;
          const dx = e.key === 'ArrowLeft' ? -s / VW : e.key === 'ArrowRight' ? s / VW : 0;
          const dy = e.key === 'ArrowUp' ? -s / VH : e.key === 'ArrowDown' ? s / VH : 0;
          nudge(dx, dy);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- Nhân bản dãy / đánh số lại
  const [row, setRow] = useState({ dir: 'right' as Dir, count: 4, gap: 0, relabel: true });
  const rowCopies = useMemo(
    () => (panel === 'row' ? makeCopies(units, selected, row.dir, row.count, row.gap / 100, step, row.relabel) : []),
    [panel, units, selected, row, step],
  );
  const applyRow = () => {
    if (!rowCopies.length) return;
    setUnits((list) => [...list, ...rowCopies]);
    setSelected([...selected, ...rowCopies.map((c) => c.id)]);
    setPending(firstLabel([...units, ...rowCopies]));
    setPanel(null);
    toast(`Đã thêm ${rowCopies.length} ô`);
  };

  // Chia đều: khoanh cả dãy căn bằng một ô rồi chia thành từng căn.
  const [split, setSplit] = useState({ cols: 8, rows: 1, relabel: true, start: '' });
  const splitStart = split.start.trim() || single?.label.trim() || pending;
  const splitCells = useMemo(() => {
    if (panel !== 'split' || !single) return [];
    let label = splitStart;
    return splitUnit(single.points, split.cols, split.rows).map((points, i): MapUnit => {
      if (i) label = nextLabel(label, step);
      return { id: uid(), points: clampPoints(points), label: split.relabel ? label : '' };
    });
  }, [panel, single, split, splitStart, step]);
  const applySplit = () => {
    if (!single || !splitCells.length) return;
    const id = single.id;
    setUnits((list) => {
      const at = list.findIndex((u) => u.id === id);
      const next = list.filter((u) => u.id !== id);
      next.splice(Math.max(0, at), 0, ...splitCells);
      return next;
    });
    setSelected(splitCells.map((c) => c.id));
    const last = splitCells[splitCells.length - 1].label;
    if (last) setPending(nextLabel(last, step));
    setPanel(null);
    toast(`Đã chia thành ${splitCells.length} ô`);
  };
  // Bảng thao tác cần ô đang chọn: bỏ chọn thì đóng bảng.
  useEffect(() => {
    if ((panel === 'split' && !singleId) || (panel === 'row' && !selected.length)) setPanel(null);
  }, [panel, singleId, selected.length]);

  const [numbering, setNumbering] = useState({ prefix: '', start: '1', digits: '2', scope: 'selected' as 'selected' | 'all' });
  const applyRenumber = () => {
    const ids = numbering.scope === 'selected' && selected.length ? new Set(selected) : undefined;
    const start = Math.max(0, Number(numbering.start) || 0);
    const digits = Math.min(4, Math.max(1, Number(numbering.digits) || 1));
    const next = renumber(units, { prefix: numbering.prefix, start, digits, step, ids });
    setUnits(() => next);
    setPending(firstLabel(next));
    setPanel(null);
    toast(`Đã đánh số ${ids ? ids.size : units.length} ô`);
  };

  // ---------------------------------------------------------------- Vẽ
  const handleR = (coarse ? 10 : 6) / k;
  const midR = (coarse ? 7 : 4.5) / k;
  const toolInfo = TOOLS.find((t) => t.value === tool)!;

  const overlay = (
    <>
      {units.map((u) => (
        <EditorUnit
          key={u.id}
          id={u.id}
          points={u.points}
          vh={VH}
          state={selSet.has(u.id) ? 'selected' : !u.label.trim() || duplicates.has(normCode(u.label)) ? 'warn' : matched.has(u.id) ? 'matched' : 'plain'}
          dashed={!u.label.trim()}
        />
      ))}
      {units.map((u) => u.label.trim() && <UnitLabel key={`l-${u.id}`} points={u.points} vh={VH} text={u.label} />)}
      {[...rowCopies, ...splitCells].map((c) => (
        <g key={c.id} className="pointer-events-none">
          <polygon points={svgPoints(c.points, VH)} fill="#f59e0b" fillOpacity={0.12} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          {c.label && <UnitLabel points={c.points} vh={VH} text={c.label} className="opacity-70" />}
        </g>
      ))}
      {tool === 'select' && single && (
        <g>
          {single.points.map((_, i) => {
            if (i % 2) return null;
            const j = (i + 2) % single.points.length;
            const x1 = single.points[i];
            const y1 = single.points[i + 1];
            const x2 = single.points[j];
            const y2 = single.points[j + 1];
            if (px(x2 - x1, y2 - y1) < 36) return null;
            return (
              <circle
                key={`m${i}`}
                data-handle={`m:${single.id}:${i / 2}`}
                cx={((x1 + x2) / 2) * VW}
                cy={((y1 + y2) / 2) * VH}
                r={midR}
                fill="#ffffff"
                stroke="#d97706"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                className="cursor-copy"
              />
            );
          })}
          {single.points.map((v, i) =>
            i % 2 ? null : (
              <circle
                key={`v${i}`}
                data-handle={`v:${single.id}:${i / 2}`}
                cx={v * VW}
                cy={single.points[i + 1] * VH}
                r={handleR}
                fill={activeVertex?.id === single.id && activeVertex.index === i / 2 ? '#0f172a' : '#f59e0b'}
                stroke="#ffffff"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                className="cursor-grab"
              />
            ),
          )}
        </g>
      )}
      {ghost && (
        <polygon
          className="pointer-events-none"
          points={svgPoints(ghost.points, VH)}
          fill={ghost.kind === 'rect' ? '#f59e0b' : '#0f172a'}
          fillOpacity={ghost.kind === 'rect' ? 0.2 : 0.06}
          stroke={ghost.kind === 'rect' ? '#d97706' : '#334155'}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {poly.length > 0 && (
        <g className="pointer-events-none">
          <polyline
            points={svgPoints([...poly, ...(hover && desktop ? [hover] : [])].flatMap((p) => [p.x, p.y]), VH)}
            fill="#f59e0b"
            fillOpacity={0.12}
            stroke="#d97706"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {poly.map((p, i) => (
            <circle
              key={i}
              cx={p.x * VW}
              cy={p.y * VH}
              r={(i === 0 ? handleR * 1.5 : handleR) * 0.9}
              fill={i === 0 ? '#ffffff' : '#d97706'}
              stroke="#d97706"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}
    </>
  );

  // Gợi ý nổi trên bản đồ theo công cụ.
  const floating =
    tool === 'number'
      ? `Chạm căn tiếp theo → số ${pending}`
      : tool === 'poly' && poly.length
        ? `Đã chấm ${poly.length} góc${poly.length >= 3 ? ' — chạm điểm đầu để khép kín' : ''}`
        : tool === 'rect' && !units.length
          ? 'Kéo trên ảnh để khoanh căn đầu tiên'
          : '';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-100">
      {/* Thanh trên */}
      <header className="pt-safe shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
          <IconButton icon={ChevronLeft} label="Quay lại" onClick={() => void leave()} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold leading-tight text-slate-900">{draft.name}</h1>
            <p className="truncate text-xs text-slate-500">
              {project.name} · {units.length} ô{dirty ? ' · chưa lưu' : ''}
            </p>
          </div>
          <IconButton icon={Undo2} label="Hoàn tác (Ctrl+Z)" onClick={undo} disabled={!past.current.length} />
          <IconButton icon={Redo2} label="Làm lại (Ctrl+Y)" onClick={redo} disabled={!future.current.length} />
          <IconButton icon={Settings2} label="Cài đặt bản đồ" onClick={() => setSettingsOpen(true)} />
          {dirty ? (
            <Button variant="primary" icon={Save} onClick={() => void save()} loading={saving} className="ml-1" title="Lưu (Ctrl+S)">
              Lưu
            </Button>
          ) : (
            <Button icon={Check} onClick={() => void done()} className="ml-1">
              Xong
            </Button>
          )}
        </div>
      </header>

      {/* Công cụ */}
      <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 sm:px-4">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTool(t.value)}
            aria-pressed={tool === t.value}
            title={`${t.label} (${t.key})`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition',
              tool === t.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <t.icon size={16} strokeWidth={2.2} />
            {t.short}
          </button>
        ))}
        <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" />
        {tool !== 'select' && (
          <label className="flex shrink-0 items-center gap-1.5 text-[13px] text-slate-500">
            Số tiếp
            <input
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-[13px] font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
              aria-label="Số căn tiếp theo"
            />
            <select
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white py-1 pl-1.5 pr-6 text-[13px] text-slate-700 focus:border-brand-500 focus:outline-none"
              aria-label="Bước nhảy số"
              title="Bước nhảy: 1 (01, 02, 03…) hoặc 2 (01, 03, 05… — dãy lẻ / chẵn)"
            >
              <option value={1}>+1</option>
              <option value={2}>+2</option>
            </select>
          </label>
        )}
        {tool === 'poly' && poly.length > 0 && (
          <>
            <Button size="sm" variant="primary" icon={Check} onClick={() => finishPoly()} disabled={poly.length < 3}>
              Khép kín
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPoly(poly.slice(0, -1))}>
              Bỏ điểm cuối
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setPoly([])}>
              Huỷ
            </Button>
          </>
        )}
        {tool === 'select' && (
          <>
            <button
              type="button"
              onClick={() => setMulti((v) => !v)}
              aria-pressed={multi}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition',
                multi ? 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200' : 'text-slate-600 hover:bg-slate-100',
              )}
              title="Chạm từng ô để chọn nhiều (hoặc giữ Shift)"
            >
              <SquareDashed size={16} /> Chọn nhiều
            </button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(units.map((u) => u.id))} disabled={!units.length}>
              Chọn tất cả
            </Button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MapCanvas
            ref={canvas}
            imageId={draft.imageId}
            aspect={draft.aspect}
            overlay={overlay}
            fill
            className="min-h-0 flex-1"
            wheel="always"
            spacePan
            tapZoom={tool !== 'poly' && tool !== 'number'}
            onToolDown={onToolDown}
            onToolMove={onToolMove}
            onToolUp={onToolUp}
            onToolCancel={onToolCancel}
            onTap={onTap}
            onHover={tool === 'poly' && poly.length ? setHover : undefined}
            onScale={(next) => setK((prev) => (Math.abs(prev - next) / prev > 0.02 ? next : prev))}
          >
            {floating && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white shadow">{floating}</div>
            )}
          </MapCanvas>
        </div>

        <aside className={cn('flex shrink-0 flex-col border-t border-slate-200 bg-white lg:w-[340px] lg:border-l lg:border-t-0', panelOpen ? 'max-h-[44%] lg:max-h-none' : '')}>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-left lg:hidden"
            aria-expanded={panelOpen}
          >
            <span className="truncate text-[13px] font-bold text-slate-800">
              {panel === 'row'
                ? 'Nhân bản theo dãy'
                : panel === 'renumber'
                  ? 'Đánh số lại'
                  : panel === 'split'
                    ? 'Chia đều'
                    : selected.length
                      ? `Đã chọn ${selected.length} ô`
                      : toolInfo.label}
            </span>
            {panelOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
          </button>
          {panelOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === 'row' ? (
                <RowPanel value={row} onChange={setRow} copies={rowCopies.length} step={step} onStep={setStep} onApply={applyRow} onCancel={() => setPanel(null)} />
              ) : panel === 'split' && single ? (
                <SplitPanel
                  value={split}
                  onChange={setSplit}
                  firstLabel={splitStart}
                  lastLabel={splitCells[splitCells.length - 1]?.label ?? ''}
                  cells={splitCells.length}
                  step={step}
                  onStep={setStep}
                  onApply={applySplit}
                  onCancel={() => setPanel(null)}
                />
              ) : panel === 'renumber' ? (
                <RenumberPanel value={numbering} onChange={setNumbering} hasSelection={selected.length > 0} total={units.length} step={step} onStep={setStep} onApply={applyRenumber} onCancel={() => setPanel(null)} />
              ) : selected.length ? (
                <SelectionPanel
                  map={draft}
                  selected={selected}
                  single={single}
                  floors={floors}
                  matched={matched}
                  duplicates={duplicates}
                  activeVertex={activeVertex}
                  onLabel={setLabel}
                  onLabelDone={() => (labelEdit.current = false)}
                  onDuplicate={duplicate}
                  onRow={() => setPanel('row')}
                  onSplit={() => {
                    setSplit((s) => ({ ...s, start: '' }));
                    setPanel('split');
                  }}
                  onRenumber={() => {
                    setNumbering((n) => ({ ...n, scope: 'selected' }));
                    setPanel('renumber');
                  }}
                  onRemove={removeSelected}
                  onClear={() => setSelected([])}
                />
              ) : (
                <OverviewPanel
                  hint={toolInfo.hint}
                  units={units}
                  unlabeled={unlabeled}
                  dupUnits={dupUnits}
                  matchedCount={matched.size}
                  hasInventory={project.inventory.length > 0}
                  map={draft}
                  onShow={selectAndShow}
                  onRenumberAll={() => {
                    setNumbering((n) => ({ ...n, scope: 'all' }));
                    setPanel('renumber');
                  }}
                  onSettings={() => setSettingsOpen(true)}
                />
              )}
            </div>
          )}
        </aside>
      </div>

      <MapSettingsModal open={settingsOpen} map={draft} onClose={() => setSettingsOpen(false)} onApply={(patch) => commit((d) => ({ ...d, ...patch }))} />
    </div>
  );
}

const EditorUnit = memo(function EditorUnit({ id, points, vh, state, dashed }: { id: string; points: number[]; vh: number; state: 'selected' | 'warn' | 'matched' | 'plain'; dashed: boolean }) {
  const color = state === 'selected' ? '#f59e0b' : state === 'warn' ? '#e11d48' : state === 'matched' ? '#16a34a' : '#2563eb';
  return (
    <polygon
      data-unit={id}
      points={svgPoints(points, vh)}
      fill={color}
      fillOpacity={state === 'selected' ? 0.32 : 0.16}
      stroke={color}
      strokeWidth={state === 'selected' ? 2.5 : 1.5}
      strokeDasharray={dashed ? '5 3' : undefined}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      className="cursor-pointer"
    />
  );
});

// ---------------------------------------------------------------- Bảng bên

function PanelSection({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-b border-slate-100 px-4 py-3', className)}>
      {title && <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>}
      {children}
    </div>
  );
}

function OverviewPanel({
  hint,
  units,
  unlabeled,
  dupUnits,
  matchedCount,
  hasInventory,
  map,
  onShow,
  onRenumberAll,
  onSettings,
}: {
  hint: string;
  units: MapUnit[];
  unlabeled: MapUnit[];
  dupUnits: MapUnit[];
  matchedCount: number;
  hasInventory: boolean;
  map: ProjectMap;
  onShow: (ids: string[]) => void;
  onRenumberAll: () => void;
  onSettings: () => void;
}) {
  const floors = floorList(map);
  const sorted = useMemo(() => [...units].sort((a, b) => compareCodes(a.label || '~', b.label || '~')), [units]);
  return (
    <>
      <PanelSection>
        <p className="text-[13px] leading-relaxed text-slate-600">{hint}</p>
      </PanelSection>
      <PanelSection title="Kiểm tra">
        <ul className="space-y-1.5 text-[13px]">
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-emerald-600/70" />
            <span className="flex-1 text-slate-600">{hasInventory ? 'Khớp bảng hàng' : 'Có dữ liệu căn'}</span>
            <b className="tabular-nums text-slate-900">
              {matchedCount}/{units.length}
            </b>
          </li>
          {unlabeled.length > 0 && (
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm border border-dashed border-rose-600 bg-rose-600/20" />
              <span className="flex-1 text-slate-600">Chưa đánh số</span>
              <button type="button" onClick={() => onShow(unlabeled.map((u) => u.id))} className="font-bold text-rose-700 hover:underline">
                {unlabeled.length} ô
              </button>
            </li>
          )}
          {dupUnits.length > 0 && (
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-rose-600/60" />
              <span className="flex-1 text-slate-600">Trùng số</span>
              <button type="button" onClick={() => onShow(dupUnits.map((u) => u.id))} className="font-bold text-rose-700 hover:underline">
                {dupUnits.length} ô
              </button>
            </li>
          )}
        </ul>
        {!hasInventory && units.length > 0 && <p className="mt-2 text-xs leading-relaxed text-slate-500">Nhập bảng hàng ở tab Mặt bằng để giá & trạng thái tự hiện theo số căn.</p>}
        {hasInventory && units.length > 0 && matchedCount < units.length && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Ô xanh dương chưa khớp mã nào trong bảng hàng — kiểm tra số căn{floors.length ? ' và quy tắc mã căn (Cài đặt bản đồ)' : ''}.
          </p>
        )}
      </PanelSection>
      {units.length > 0 && (
        <PanelSection
          title={
            <span className="flex items-center justify-between">
              Các ô ({units.length})
              <button type="button" onClick={onRenumberAll} className="text-[11px] font-bold normal-case tracking-normal text-brand-700 hover:underline">
                Đánh số lại tất cả
              </button>
            </span>
          }
        >
          <div className="flex flex-wrap gap-1">
            {sorted.slice(0, 300).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onShow([u.id])}
                className={cn('min-w-9 rounded-md px-1.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset transition hover:ring-slate-400', u.label.trim() ? 'bg-slate-50 text-slate-700 ring-slate-200' : 'bg-rose-50 text-rose-700 ring-rose-200')}
              >
                {u.label.trim() || '?'}
              </button>
            ))}
          </div>
        </PanelSection>
      )}
      <PanelSection title="Bản đồ">
        <p className="text-[13px] text-slate-600">
          {floors.length ? `Tầng điển hình: tầng ${floors[floors.length - 1]}–${floors[0]} (${floors.length} tầng)` : 'Một mặt bằng'}
          {floors.length > 0 && (
            <>
              {' · mã căn VD '}
              <b className="font-mono text-slate-900">{unitCode(map, units.find((u) => u.label.trim())?.label || '05', floors[0])}</b>
            </>
          )}
        </p>
        <Button size="sm" icon={Settings2} className="mt-2" onClick={onSettings}>
          Cài đặt bản đồ
        </Button>
      </PanelSection>
      <PanelSection className="border-b-0">
        <p className="text-xs leading-relaxed text-slate-400">
          Phím tắt: V chọn · R chữ nhật · P đa giác · N đánh số · Ctrl+D nhân bản · Delete xoá · mũi tên dịch ô · Ctrl+Z hoàn tác · giữ Alt để không hít góc.
        </p>
      </PanelSection>
    </>
  );
}

function SelectionPanel({
  map,
  selected,
  single,
  floors,
  matched,
  duplicates,
  activeVertex,
  onLabel,
  onLabelDone,
  onDuplicate,
  onRow,
  onSplit,
  onRenumber,
  onRemove,
  onClear,
}: {
  map: ProjectMap;
  selected: string[];
  single: MapUnit | null;
  floors: number[];
  matched: Set<string>;
  duplicates: Set<string>;
  activeVertex: { id: string; index: number } | null;
  onLabel: (id: string, label: string) => void;
  onLabelDone: () => void;
  onDuplicate: () => void;
  onRow: () => void;
  onSplit: () => void;
  onRenumber: () => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const count = selected.length;
  const vertexActive = !!(single && activeVertex && activeVertex.id === single.id);
  return (
    <>
      {single ? (
        <PanelSection title="Ô đang chọn">
          <Field label="Số căn / mã căn">
            <TextInput
              value={single.label}
              onChange={(e) => onLabel(single.id, e.target.value)}
              onBlur={onLabelDone}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={floors.length ? 'VD: 05' : 'VD: L-12'}
              className="font-bold"
            />
          </Field>
          {single.label.trim() ? (
            <p className="mt-2 text-[13px] text-slate-600">
              Mã căn: <b className="font-mono text-slate-900">{unitCode(map, single.label, floors[0])}</b>
              {floors.length > 1 && (
                <>
                  {' … '}
                  <b className="font-mono text-slate-900">{unitCode(map, single.label, floors[floors.length - 1])}</b>
                </>
              )}
              {matched.has(single.id) ? <span className="ml-1 font-semibold text-emerald-700">· có trong bảng hàng</span> : <span className="ml-1 text-slate-400">· chưa có trong bảng hàng</span>}
            </p>
          ) : (
            <p className="mt-2 text-[13px] font-medium text-rose-600">Ô chưa có số căn.</p>
          )}
          {single.label.trim() && duplicates.has(normCode(single.label)) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-rose-600">
              <TriangleAlert size={14} /> Số này bị trùng với ô khác.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            {single.points.length / 2} góc · kéo chấm cam để chỉnh, chấm trắng giữa cạnh để thêm góc{vertexActive ? ' · Delete: xoá góc đang chọn' : ''}.
          </p>
        </PanelSection>
      ) : (
        <PanelSection title="Đang chọn">
          <p className="text-sm font-semibold text-slate-800">
            {count} ô
            <button type="button" onClick={onClear} className="ml-2 text-xs font-semibold text-brand-700 hover:underline">
              Bỏ chọn
            </button>
          </p>
          <p className="mt-1 text-xs text-slate-500">Kéo một ô bất kỳ để di chuyển cả nhóm.</p>
        </PanelSection>
      )}
      <PanelSection title="Thao tác">
        <div className="grid grid-cols-2 gap-2">
          {single && (
            <Button size="sm" icon={Columns3} onClick={onSplit}>
              Chia đều
            </Button>
          )}
          <Button size="sm" icon={Rows3} onClick={onRow}>
            Nhân theo dãy
          </Button>
          <Button size="sm" icon={CopyPlus} onClick={onDuplicate}>
            Nhân bản
          </Button>
          <Button size="sm" icon={ListOrdered} onClick={onRenumber}>
            Đánh số lại
          </Button>
          <Button size="sm" variant="dangerSoft" icon={Trash2} onClick={onRemove}>
            {vertexActive ? 'Xoá góc' : `Xoá ${count > 1 ? `${count} ô` : 'ô'}`}
          </Button>
        </div>
        {single && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Mẹo: khoanh cả dãy căn thành một ô rồi bấm “Chia đều” — các căn thẳng hàng, số tự tăng. “Nhân theo dãy” dùng khi chỉ khoanh một căn mẫu.
          </p>
        )}
      </PanelSection>
    </>
  );
}

const DIRS: Array<{ value: Dir; label: string; icon: LucideIcon }> = [
  { value: 'right', label: 'Sang phải', icon: ArrowRight },
  { value: 'left', label: 'Sang trái', icon: ArrowLeft },
  { value: 'down', label: 'Xuống dưới', icon: ArrowDown },
  { value: 'up', label: 'Lên trên', icon: ArrowUp },
];

function StepSelect({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <Segmented
      size="sm"
      value={String(step)}
      onChange={(v) => onStep(Number(v))}
      options={[
        { value: '1', label: 'Liên tiếp (01, 02…)' },
        { value: '2', label: 'Lẻ / chẵn (01, 03…)' },
      ]}
    />
  );
}

function RowPanel({
  value,
  onChange,
  copies,
  step,
  onStep,
  onApply,
  onCancel,
}: {
  value: { dir: Dir; count: number; gap: number; relabel: boolean };
  onChange: (v: { dir: Dir; count: number; gap: number; relabel: boolean }) => void;
  copies: number;
  step: number;
  onStep: (s: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  return (
    <>
      <PanelSection title="Nhân bản theo dãy">
        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
          Các ô đang chọn được nhân ra liền nhau theo hướng đã chọn — xem trước bằng nét đứt. Ô nét đứt lệch dần so với mặt bằng: chỉnh khoảng hở, hoặc khoanh cả dãy rồi dùng “Chia đều”.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {DIRS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => set({ dir: d.value })}
              aria-pressed={value.dir === d.value}
              title={d.label}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-semibold transition',
                value.dir === d.value ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              <d.icon size={16} />
              {d.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Số bản sao">
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronDown} label="Bớt" size="sm" onClick={() => set({ count: Math.max(1, value.count - 1) })} />
              <TextInput
                inputMode="numeric"
                value={String(value.count)}
                onChange={(e) => set({ count: Math.min(60, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) })}
                className="px-2 text-center font-bold"
              />
              <IconButton icon={ChevronUp} label="Thêm" size="sm" onClick={() => set({ count: Math.min(60, value.count + 1) })} />
            </div>
          </Field>
          <Field label={`Khoảng hở: ${value.gap}%`}>
            <input type="range" min={-10} max={60} value={value.gap} onChange={(e) => set({ gap: Number(e.target.value) })} className="mt-2.5 w-full accent-brand-700" />
          </Field>
        </div>
        <Checkbox className="mt-3" checked={value.relabel} onChange={(v) => set({ relabel: v })} label="Đánh số tiếp theo cho ô mới" />
        {value.relabel && (
          <div className="mt-2">
            <StepSelect step={step} onStep={onStep} />
          </div>
        )}
      </PanelSection>
      <div className="flex gap-2 px-4 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button variant="primary" icon={Check} onClick={onApply} disabled={!copies} className="flex-1">
          Thêm {copies} ô
        </Button>
      </div>
    </>
  );
}

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronDown} label={`Bớt ${label}`} size="sm" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <TextInput
        inputMode="numeric"
        aria-label={label}
        value={String(value)}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value.replace(/\D/g, '')) || min)))}
        className="px-2 text-center font-bold"
      />
      <IconButton icon={ChevronUp} label={`Thêm ${label}`} size="sm" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  );
}

function SplitPanel({
  value,
  onChange,
  firstLabel,
  lastLabel,
  cells,
  step,
  onStep,
  onApply,
  onCancel,
}: {
  value: { cols: number; rows: number; relabel: boolean; start: string };
  onChange: (v: { cols: number; rows: number; relabel: boolean; start: string }) => void;
  firstLabel: string;
  lastLabel: string;
  cells: number;
  step: number;
  onStep: (s: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  return (
    <>
      <PanelSection title="Chia đều">
        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
          Chia ô đang chọn (cả dãy căn) thành các căn bằng nhau — giữ đúng độ nghiêng nếu là ảnh phối cảnh. Xem trước bằng nét đứt.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Số căn theo chiều ngang">
            <Stepper value={value.cols} onChange={(cols) => set({ cols })} min={1} max={60} label="số cột" />
          </Field>
          <Field label="Số hàng">
            <Stepper value={value.rows} onChange={(rows) => set({ rows })} min={1} max={20} label="số hàng" />
          </Field>
        </div>
        <Checkbox className="mt-3" checked={value.relabel} onChange={(v) => set({ relabel: v })} label="Đánh số các căn mới" />
        {value.relabel && (
          <>
            <div className="mt-2 grid grid-cols-2 items-end gap-3">
              <Field label="Bắt đầu từ số">
                <TextInput value={value.start} onChange={(e) => set({ start: e.target.value })} placeholder={firstLabel} />
              </Field>
              <p className="pb-2.5 text-[13px] text-slate-600">
                {firstLabel} → <b className="text-slate-900">{lastLabel}</b>
              </p>
            </div>
            <div className="mt-2">
              <StepSelect step={step} onStep={onStep} />
            </div>
          </>
        )}
      </PanelSection>
      <div className="flex gap-2 px-4 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button variant="primary" icon={Columns3} onClick={onApply} disabled={cells < 2} className="flex-1">
          Chia thành {cells} ô
        </Button>
      </div>
    </>
  );
}

function RenumberPanel({
  value,
  onChange,
  hasSelection,
  total,
  step,
  onStep,
  onApply,
  onCancel,
}: {
  value: { prefix: string; start: string; digits: string; scope: 'selected' | 'all' };
  onChange: (v: { prefix: string; start: string; digits: string; scope: 'selected' | 'all' }) => void;
  hasSelection: boolean;
  total: number;
  step: number;
  onStep: (s: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  const start = Number(value.start) || 0;
  const digits = Math.min(4, Math.max(1, Number(value.digits) || 1));
  const sample = [0, 1, 2].map((i) => `${value.prefix}${String(start + i * step).padStart(digits, '0')}`).join(', ');
  return (
    <>
      <PanelSection title="Đánh số lại">
        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">Đánh số theo thứ tự đọc: từng hàng từ trên xuống, trong hàng từ trái sang phải. Thứ tự khác: dùng công cụ “Đánh số” rồi chạm lần lượt.</p>
        {hasSelection && (
          <Segmented
            size="sm"
            value={value.scope}
            onChange={(scope) => set({ scope })}
            options={[
              { value: 'selected', label: 'Ô đang chọn' },
              { value: 'all', label: `Tất cả ${total} ô` },
            ]}
          />
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="Tiền tố">
            <TextInput value={value.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="VD: L-" />
          </Field>
          <Field label="Bắt đầu">
            <TextInput inputMode="numeric" value={value.start} onChange={(e) => set({ start: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Chữ số">
            <Select value={value.digits} onChange={(e) => set({ digits: e.target.value })}>
              <option value="1">1 (5)</option>
              <option value="2">2 (05)</option>
              <option value="3">3 (005)</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <StepSelect step={step} onStep={onStep} />
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
          Kết quả: <b className="font-mono text-slate-900">{sample}…</b>
        </p>
      </PanelSection>
      <div className="flex gap-2 px-4 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button variant="primary" icon={ListOrdered} onClick={onApply} className="flex-1">
          Đánh số
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Cài đặt bản đồ

const COLOR_OPTIONS: Array<{ value: MapColorBy; label: string }> = [
  { value: 'status', label: 'Trạng thái (còn / đã bán)' },
  { value: 'type', label: 'Loại căn' },
  { value: 'price', label: 'Mức giá' },
  { value: 'direction', label: 'Hướng' },
];

function MapSettingsModal({ open, map, onClose, onApply }: { open: boolean; map: ProjectMap; onClose: () => void; onApply: (patch: Partial<ProjectMap>) => void }) {
  const { toast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [setup, setSetup] = useState<MapSetupDraft>(() => mapSetupDraft(map));
  const [showLabels, setShowLabels] = useState(map.showLabels);
  const [colorBy, setColorBy] = useState(map.colorBy);
  const [image, setImage] = useState<{ id: string; aspect: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSetup(mapSetupDraft(map));
      setShowLabels(map.showLabels);
      setColorBy(map.colorBy);
      setImage(null);
    }
  }

  const replaceImage = async (file: File | undefined) => {
    if (!file) return;
    if (!isImageFile(file)) {
      toast('Hãy chọn file ảnh (JPG, PNG…)', 'error');
      return;
    }
    setBusy(true);
    try {
      const img = await saveImageSized(file, { maxSize: 4000, quality: 0.9 });
      setImage({ id: img.id, aspect: img.width / img.height });
    } catch (e) {
      toast(`Không đọc được ảnh: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const parsed = parseMapSetup(setup);
    if ('error' in parsed) {
      toast(parsed.error, 'error');
      return;
    }
    onApply({ name: parsed.name, floors: parsed.floors, codeRule: parsed.codeRule, showLabels, colorBy, ...(image ? { imageId: image.id, aspect: image.aspect } : {}) });
    onClose();
  };

  const aspectChanged = image && Math.abs(image.aspect - map.aspect) / map.aspect > 0.03;
  const sample = map.units.find((u) => u.label.trim())?.label;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Cài đặt bản đồ"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={apply} disabled={busy}>
            Áp dụng
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <MapSetupFields draft={setup} onChange={setSetup} sample={sample} />
        <Field label="Tô màu mặc định khi mở bản đồ">
          <Select value={colorBy} onChange={(e) => setColorBy(e.target.value as MapColorBy)}>
            {COLOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Toggle checked={showLabels} onChange={setShowLabels} label="Hiện số căn trên bản đồ" description="Tắt nếu ảnh mặt bằng đã in sẵn số căn rõ ràng." />
        <Field label="Ảnh nền" hint="Thay bằng ảnh nét hơn / bản cập nhật của CĐT — các ô đã khoanh được giữ nguyên vị trí.">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void replaceImage(file);
            }}
          />
          <Button icon={ImageUp} onClick={() => fileRef.current?.click()} loading={busy}>
            {image ? 'Đã chọn ảnh mới — chọn lại' : 'Thay ảnh nền'}
          </Button>
          {aspectChanged && (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-amber-700">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              Ảnh mới khác tỉ lệ ảnh cũ — các ô có thể bị lệch, hãy kiểm tra lại sau khi áp dụng.
            </p>
          )}
        </Field>
      </div>
    </Modal>
  );
}
