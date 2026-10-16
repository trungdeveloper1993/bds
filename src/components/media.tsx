import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Expand,
  House,
  ImagePlus,
  Images,
  Loader2,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadImageUrl, peekImageUrl, type ImageVariant } from '../lib/media';
import { useData, type MediaOwner } from '../store/data';
import { useUI } from '../store/ui';
import { Button, cn, IconButton, Modal } from './ui';

export function useImageUrl(id: string | undefined, variant: ImageVariant, enabled = true): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => (id ? peekImageUrl(id, variant) : null));
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    const cached = peekImageUrl(id, variant);
    if (cached) {
      setUrl(cached);
      return;
    }
    if (!enabled) return;
    let alive = true;
    setUrl(undefined);
    void loadImageUrl(id, variant).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id, variant, enabled]);
  return url;
}

/** Ảnh lấy từ IndexedDB, chỉ tải khi sắp hiện trên màn hình. */
export function ImageView({
  id,
  variant = 'thumb',
  alt = '',
  className,
  placeholderIcon: PlaceholderIcon = House,
  fit = 'cover',
  eager,
}: {
  id: string | undefined;
  variant?: ImageVariant;
  alt?: string;
  className?: string;
  placeholderIcon?: LucideIcon;
  fit?: 'cover' | 'contain';
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!!eager);

  useEffect(() => {
    if (visible || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  const url = useImageUrl(id, variant, visible);

  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-slate-100', className)}>
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          className={cn('size-full animate-fade-in', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200/70 text-slate-300">
          {url === undefined && id ? <Loader2 size={20} className="animate-spin text-slate-300" /> : <PlaceholderIcon size={34} strokeWidth={1.5} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Xem toàn màn hình

export function Lightbox({ images, index, onClose, onIndex }: { images: string[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const count = images.length;
  const prev = useCallback(() => onIndex((index - 1 + count) % count), [index, count, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % count), [index, count, onIndex]);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-slate-950/95"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums">
          {index + 1} / {count}
        </span>
        <IconButton icon={X} label="Đóng" tone="onDark" onClick={onClose} />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6" onClick={onClose}>
        <div className="size-full" onClick={(e) => e.stopPropagation()}>
          <ImageView key={images[index]} id={images[index]} variant="full" fit="contain" eager className="size-full bg-transparent" />
        </div>
        {count > 1 && (
          <>
            <IconButton icon={ChevronLeft} label="Ảnh trước" tone="onDark" onClick={(e) => (e.stopPropagation(), prev())} className="absolute left-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex" />
            <IconButton icon={ChevronRight} label="Ảnh sau" tone="onDark" onClick={(e) => (e.stopPropagation(), next())} className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex" />
          </>
        )}
      </div>
      {count > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {images.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => onIndex(i)}
              className={cn('shrink-0 overflow-hidden rounded-lg ring-2 transition', i === index ? 'ring-white' : 'opacity-50 ring-transparent hover:opacity-90')}
            >
              <ImageView id={id} className="size-14" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Bộ ảnh trên trang chi tiết

export function Gallery({
  images,
  placeholderIcon = House,
  aspect = 'aspect-[16/10]',
}: {
  images: string[];
  placeholderIcon?: LucideIcon;
  aspect?: string;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const safeIndex = Math.min(index, Math.max(0, images.length - 1));

  if (images.length === 0) {
    return <ImageView id={undefined} placeholderIcon={placeholderIcon} className={cn(aspect, 'w-full rounded-2xl')} />;
  }

  return (
    <div>
      <div className={cn('group relative w-full overflow-hidden rounded-2xl bg-slate-900', aspect)}>
        <button type="button" className="block size-full" onClick={() => setOpen(true)} aria-label="Xem ảnh toàn màn hình">
          <ImageView key={images[safeIndex]} id={images[safeIndex]} variant="full" eager className="size-full" placeholderIcon={placeholderIcon} />
        </button>
        <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          <Images size={13} /> {safeIndex + 1}/{images.length}
        </span>
        <IconButton icon={Expand} label="Phóng to" tone="onDark" size="sm" onClick={() => setOpen(true)} className="absolute bottom-3 right-3" />
        {images.length > 1 && (
          <>
            <IconButton
              icon={ChevronLeft}
              label="Ảnh trước"
              tone="onDark"
              onClick={() => setIndex((safeIndex - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
            />
            <IconButton
              icon={ChevronRight}
              label="Ảnh sau"
              tone="onDark"
              onClick={() => setIndex((safeIndex + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
            />
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {images.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-1 transition',
                i === safeIndex ? 'ring-brand-600' : 'ring-transparent opacity-70 hover:opacity-100',
              )}
            >
              <ImageView id={id} className="h-14 w-20 sm:h-16 sm:w-24" />
            </button>
          ))}
        </div>
      )}
      {open && <Lightbox images={images} index={safeIndex} onIndex={setIndex} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Thêm / sắp xếp ảnh

/** Nút "Thêm ảnh" + kéo thả, tải lên và lưu ngay vào hồ sơ. */
export function useImageUpload(owner: MediaOwner) {
  const { addImages } = useData();
  const { toast } = useUI();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    const result = await addImages(owner, files, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (result.added) toast(`Đã thêm ${result.added} ảnh`);
    if (result.failed.length) toast(`${result.failed.length} ảnh lỗi: ${result.failed[0].reason}`, 'error');
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        void upload(files);
      }}
    />
  );

  return { progress, upload, input, pick: () => inputRef.current?.click() };
}

export function ImageManager({
  owner,
  images,
  open,
  onClose,
}: {
  owner: MediaOwner;
  images: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { setImages } = useData();
  const { toast, confirm } = useUI();
  const uploader = useImageUpload(owner);
  const busy = !!uploader.progress;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    void setImages(owner, next);
  };

  const remove = async (id: string) => {
    const ok = await confirm({ title: 'Xoá ảnh này?', message: 'Ảnh sẽ bị xoá vĩnh viễn khỏi hồ sơ.', confirmLabel: 'Xoá ảnh', danger: true });
    if (!ok) return;
    await setImages(owner, images.filter((x) => x !== id));
    toast('Đã xoá ảnh');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Quản lý hình ảnh (${images.length})`}
      description="Ảnh đầu tiên là ảnh bìa. Dùng mũi tên để sắp xếp thứ tự."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Xong
          </Button>
          <Button variant="primary" icon={ImagePlus} onClick={uploader.pick} loading={busy}>
            {busy ? `Đang xử lý ${uploader.progress!.done}/${uploader.progress!.total}` : 'Thêm ảnh'}
          </Button>
        </>
      }
    >
      {uploader.input}
      {images.length === 0 ? (
        <DropZone onFiles={uploader.upload} onPick={uploader.pick} busy={busy} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((id, i) => (
            <div key={id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative">
                <ImageView id={id} className="aspect-[4/3] w-full" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">
                    <Star size={11} fill="currentColor" /> Ảnh bìa
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex">
                  <IconButton icon={ArrowLeft} label="Lên trước" size="sm" disabled={i === 0 || busy} onClick={() => move(i, i - 1)} />
                  <IconButton icon={ArrowRight} label="Ra sau" size="sm" disabled={i === images.length - 1 || busy} onClick={() => move(i, i + 1)} />
                  {i !== 0 && <IconButton icon={Star} label="Đặt làm ảnh bìa" size="sm" disabled={busy} onClick={() => move(i, 0)} />}
                </div>
                <IconButton icon={Trash2} label="Xoá ảnh" size="sm" tone="danger" disabled={busy} onClick={() => void remove(id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Vùng kéo-thả file (máy tính) hoặc bấm để chọn (điện thoại). */
export function DropZone({
  onFiles,
  onPick,
  busy,
  title = 'Kéo thả ảnh vào đây hoặc bấm để chọn',
  hint = 'Hỗ trợ JPG, PNG, WebP. Ảnh được tự động nén để tiết kiệm bộ nhớ.',
  icon: Icon = ImagePlus,
}: {
  onFiles: (files: File[]) => void;
  onPick: () => void;
  busy?: boolean;
  title?: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  };
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
        over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60 hover:border-brand-400 hover:bg-brand-50/40',
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
        {busy ? <Loader2 className="animate-spin" size={22} /> : <Icon size={22} />}
      </span>
      <span className="text-sm font-bold text-slate-800">{title}</span>
      <span className="text-xs text-slate-500">{hint}</span>
    </button>
  );
}

export const ProjectPlaceholder = Building2;
