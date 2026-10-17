import { Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { bbox, centroid, type Pt } from '../lib/maps';
import { useImageUrl } from './media';
import { cn } from './ui';

/** Chiều rộng hệ toạ độ nội dung; chiều cao = VW / tỉ lệ ảnh. Ô căn lưu toạ độ 0–1 rồi nhân với VW / VH. */
export const VW = 1000;

/** Toạ độ 0–1 → chuỗi điểm của <polygon> theo hệ VW × VH. */
export function svgPoints(points: number[], vh: number): string {
  const out: string[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(`${(points[i] * VW).toFixed(1)},${(points[i + 1] * vh).toFixed(1)}`);
  return out.join(' ');
}

/** Nhãn mã căn đặt giữa ô, cỡ chữ vừa với ô. */
export function UnitLabel({ points, vh, text, className }: { points: number[]; vh: number; text: string; className?: string }) {
  const b = bbox(points);
  const c = centroid(points);
  const size = Math.max(4, Math.min(28, b.h * vh * 0.42, (b.w * VW * 0.9) / Math.max(2, text.length * 0.62)));
  return (
    <text
      x={c.x * VW}
      y={c.y * vh}
      fontSize={size}
      textAnchor="middle"
      dominantBaseline="central"
      className={cn('pointer-events-none select-none fill-slate-900 stroke-white font-bold', className)}
      style={{ paintOrder: 'stroke', strokeWidth: size * 0.24, strokeLinejoin: 'round' }}
    >
      {text}
    </text>
  );
}

/** Chấm màu (trạng thái, chú thích). */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)} style={{ backgroundColor: color }} />;
}

/** Gắn vào nút / bảng nổi trên bản đồ để thao tác bấm không bị hiểu là kéo bản đồ. */
export const stopMapGesture = { onPointerDown: (e: ReactPointerEvent) => e.stopPropagation() };

export interface MapCanvasHandle {
  zoomBy(factor: number): void;
  fit(): void;
  /**
   * Đưa một ô (toạ độ 0–1) vào giữa khung. anchorY: vị trí dọc trong khung (0–1) — đặt cao hơn khi thẻ chi tiết che nửa dưới.
   * zoom = false: chỉ kéo tới, giữ nguyên mức phóng.
   */
  focus(points: number[], options?: { anchorY?: number; zoom?: boolean }): void;
  /** Toạ độ màn hình → toạ độ 0–1 trên ảnh. */
  toNorm(clientX: number, clientY: number): Pt;
}

export interface MapCanvasProps {
  imageId: string;
  aspect: number;
  /** Phần tử SVG vẽ trên ảnh, theo toạ độ VW × VH. */
  overlay: ReactNode;
  /** Chiều cao tối đa của khung (px); ảnh ngang thấp hơn thì khung thấp theo ảnh. */
  maxHeight?: number;
  /** Khung lấp đầy phần tử cha (toàn màn hình, trang chỉnh sửa) thay vì cao theo ảnh. */
  fill?: boolean;
  /** Cuộn chuột để phóng to: luôn (trang chỉnh sửa) hay phải giữ Ctrl (trang xem, để còn cuộn trang). */
  wheel?: 'ctrl' | 'always';
  /** Công cụ vẽ: trả về true nếu nhận thao tác kéo này (khi đó không kéo bản đồ). */
  onToolDown?: (pt: Pt, e: ReactPointerEvent) => boolean;
  onToolMove?: (pt: Pt, e: ReactPointerEvent) => void;
  onToolUp?: (pt: Pt, e: ReactPointerEvent) => void;
  onToolCancel?: () => void;
  /** Chuột di chuyển trên bản đồ khi không bấm (null = chuột ra ngoài). */
  onHover?: (pt: Pt | null) => void;
  /** Chạm / bấm (không kéo). target: phần tử SVG được chạm. */
  onTap?: (pt: Pt, target: Element | null, e: ReactPointerEvent) => void;
  /** Báo mức phóng (px màn hình cho 1 đơn vị nội dung) — để vẽ nút kéo đỉnh đúng cỡ. */
  onScale?: (k: number) => void;
  /** Chạm đúp vào chỗ trống để phóng to (tắt khi đang vẽ đa giác). */
  tapZoom?: boolean;
  /** Giữ phím cách để kéo bản đồ (trang chỉnh sửa). */
  spacePan?: boolean;
  className?: string;
  children?: ReactNode;
}

interface View {
  s: number;
  x: number;
  y: number;
}

const MAX_ZOOM = 12;

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    imageId,
    aspect,
    overlay,
    maxHeight = 560,
    fill,
    wheel = 'ctrl',
    onToolDown,
    onToolMove,
    onToolUp,
    onToolCancel,
    onHover,
    onTap,
    onScale,
    tapZoom = true,
    spacePan,
    className,
    children,
  },
  ref,
) {
  const url = useImageUrl(imageId, 'full');
  const wrapRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const zoomedRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<number | undefined>(undefined);
  // Hàm của trang cha có thể đổi mỗi lần vẽ lại: giữ trong ref để không phải vừa khung lại.
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;
  const VH = VW / aspect;

  const width = size.w;
  const baseH = width / aspect;
  const height = fill ? size.h : width ? Math.max(160, Math.min(maxHeight, baseH)) : 0;
  const ready = width > 0 && height > 0;
  const fitScale = ready ? Math.min(1, height / baseH) : 1;

  const k = useCallback((s: number) => (s * width) / VW, [width]);

  const clamp = useCallback(
    (v: View): View => {
      const s = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale, v.s));
      const cw = width * s;
      const ch = baseH * s;
      const x = cw <= width ? (width - cw) / 2 : Math.min(0, Math.max(width - cw, v.x));
      const y = ch <= height ? (height - ch) / 2 : Math.min(0, Math.max(height - ch, v.y));
      return { s, x, y };
    },
    [fitScale, width, baseH, height],
  );

  const apply = useCallback(
    (v: View) => {
      view.current = clamp(v);
      const g = groupRef.current;
      if (g) g.setAttribute('transform', `translate(${view.current.x} ${view.current.y}) scale(${k(view.current.s)})`);
      zoomedRef.current = view.current.s > fitScale * 1.02;
      setZoomed(zoomedRef.current);
      onScaleRef.current?.(k(view.current.s));
    },
    [clamp, k, fitScale],
  );

  const fit = useCallback(() => apply({ s: fitScale, x: 0, y: 0 }), [apply, fitScale]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = view.current;
      const s = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale, v.s * factor));
      const r = s / v.s;
      apply({ s, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
    },
    [apply, fitScale],
  );

  // Kích thước khung theo bề rộng thật.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Khung đổi cỡ: chưa phóng thì vừa khung lại, đang phóng thì giữ vùng đang xem.
  const prevWidth = useRef(0);
  useLayoutEffect(() => {
    if (!ready) return;
    if (!prevWidth.current || !zoomedRef.current) fit();
    else {
      const r = width / prevWidth.current;
      apply({ s: view.current.s, x: view.current.x * r, y: view.current.y * r });
    }
    prevWidth.current = width;
  }, [ready, width, height, baseH, apply, fit]);

  const toNorm = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = wrapRef.current!.getBoundingClientRect();
      const v = view.current;
      const kk = k(v.s);
      return { x: (clientX - rect.left - v.x) / kk / VW, y: (clientY - rect.top - v.y) / kk / VH };
    },
    [k, VH],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (f) => zoomAt(f, width / 2, height / 2),
      fit,
      focus: (points, { anchorY = 0.5, zoom = true } = {}) => {
        const b = bbox(points);
        const want = Math.min(0.3 / Math.max(b.w, 1e-3), (height * 0.3) / Math.max(b.h * baseH, 1e-3));
        const s = Math.max(fitScale, zoom ? Math.max(view.current.s, Math.min(fitScale * 6, want)) : view.current.s);
        const cx = ((b.x0 + b.x1) / 2) * width * s;
        const cy = ((b.y0 + b.y1) / 2) * baseH * s;
        apply({ s, x: width / 2 - cx, y: height * anchorY - cy });
      },
      toNorm,
    }),
    [zoomAt, fit, apply, fitScale, width, height, baseH, toNorm],
  );

  // Cuộn chuột: phóng to tại vị trí con trỏ.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (wheel === 'ctrl' && !e.ctrlKey && !e.metaKey) {
        setHint(true);
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(false), 1200);
        return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(hintTimer.current);
    };
  }, [wheel, zoomAt]);

  // Phím cách: kéo bản đồ khi đang dùng công cụ vẽ.
  const space = useRef(false);
  useEffect(() => {
    if (!spacePan) return;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target)) {
        space.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [spacePan]);

  // ---------------------------------------------------------------- Kéo / chụm / chạm
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: 'idle' | 'tool' | 'press' | 'pan' | 'pinch'; sx: number; sy: number; dist: number; mx: number; my: number }>({
    mode: 'idle',
    sx: 0,
    sy: 0,
    dist: 0,
    mx: 0,
    my: 0,
  });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const local = (e: ReactPointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 2) {
      if (g.mode === 'tool') onToolCancel?.();
      const [a, b] = [...pointers.current.values()];
      g.mode = 'pinch';
      g.dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.mx = (a.x + b.x) / 2;
      g.my = (a.y + b.y) / 2;
      return;
    }
    if (pointers.current.size > 2) return;
    g.sx = p.x;
    g.sy = p.y;
    g.mx = p.x;
    g.my = p.y;
    const wantsPan = e.button === 1 || space.current;
    if (!wantsPan && onToolDown && onToolDown(toNorm(e.clientX, e.clientY), e)) g.mode = 'tool';
    else g.mode = wantsPan ? 'pan' : 'press';
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && onHover) onHover(toNorm(e.clientX, e.clientY));
      return;
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.mode === 'tool') {
      onToolMove?.(toNorm(e.clientX, e.clientY), e);
      return;
    }
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const v = view.current;
      const s = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale, v.s * (dist / g.dist)));
      const r = s / v.s;
      apply({ s, x: mx - (g.mx - v.x) * r, y: my - (g.my - v.y) * r });
      g.dist = dist;
      g.mx = mx;
      g.my = my;
      return;
    }
    if (g.mode === 'press' && Math.hypot(p.x - g.sx, p.y - g.sy) > 6) g.mode = 'pan';
    if (g.mode === 'pan') {
      const v = view.current;
      apply({ s: v.s, x: v.x + (p.x - g.mx), y: v.y + (p.y - g.my) });
      g.mx = p.x;
      g.my = p.y;
    }
  };

  const end = (e: ReactPointerEvent, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.mode === 'tool') {
      if (cancelled) onToolCancel?.();
      else onToolUp?.(toNorm(e.clientX, e.clientY), e);
    } else if (g.mode === 'press' && !cancelled) {
      const p = local(e);
      const now = Date.now();
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const isDouble = now - lastTap.current.t < 300 && Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 24;
      if (tapZoom && isDouble && !target?.closest('[data-unit]')) {
        zoomAt(2, p.x, p.y); // chạm đúp vào chỗ trống: phóng to
        lastTap.current.t = 0;
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
        onTap?.(toNorm(e.clientX, e.clientY), target, e);
      }
    }
    if (pointers.current.size === 0) g.mode = 'idle';
    else if (g.mode === 'pinch' && pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      g.mode = 'pan';
      g.mx = only.x;
      g.my = only.y;
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn('relative w-full select-none overflow-hidden bg-slate-100', fill && 'h-full', className)}
      style={{ height: fill ? undefined : height || undefined, minHeight: 160, touchAction: wheel === 'always' || zoomed ? 'none' : 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onPointerLeave={() => onHover?.(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {ready && (
        <svg width={width} height={height} className="absolute inset-0 block" role="img" aria-label="Bản đồ mặt bằng">
          <g ref={groupRef} transform={`translate(${view.current.x} ${view.current.y}) scale(${k(view.current.s)})`}>
            {url && <image href={url} x={0} y={0} width={VW} height={VH} preserveAspectRatio="none" />}
            {overlay}
          </g>
        </svg>
      )}
      {url === undefined && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={26} />
        </div>
      )}
      {url === null && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">Không tải được ảnh bản đồ</div>}
      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-xl bg-white/95 shadow ring-1 ring-slate-200" {...stopMapGesture}>
        <button type="button" aria-label="Phóng to" title="Phóng to" className="flex size-9 items-center justify-center text-slate-700 hover:bg-slate-100" onClick={() => zoomAt(1.6, width / 2, height / 2)}>
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="Thu nhỏ"
          title="Thu nhỏ"
          className="flex size-9 items-center justify-center border-t border-slate-200 text-slate-700 hover:bg-slate-100"
          onClick={() => zoomAt(1 / 1.6, width / 2, height / 2)}
        >
          <Minus size={18} />
        </button>
        <button type="button" aria-label="Xem toàn bộ" title="Xem toàn bộ" className="flex size-9 items-center justify-center border-t border-slate-200 text-slate-700 hover:bg-slate-100" onClick={fit}>
          <Maximize2 size={15} />
        </button>
      </div>
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-slate-900/75 px-4 py-2 text-sm font-semibold text-white">
          Giữ Ctrl + cuộn chuột để phóng to
        </div>
      )}
      {children}
    </div>
  );
});
