import { ArrowLeft, ArrowRight, Check, ImageOff, ImagePlus, Images, LayoutTemplate, Star, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { LAYOUT_TAG_SUGGESTIONS } from '../constants';
import { uid } from '../lib/id';
import { addLayoutImages, codeFromFileName, guessLayout, layoutFinder, layoutUsage, mergeTags, nextLayoutCode, withoutLayout } from '../lib/layouts';
import { normCode } from '../lib/maps';
import { deleteImages, isImageFile, saveImageSized } from '../lib/media';
import { foldText } from '../lib/smartfind';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Project, UnitLayout } from '../types';
import { NumberInput, TagInput } from './inputs';
import { DropZone, ImageView, Lightbox } from './media';
import { Button, Card, CardHeader, cn, Field, IconButton, Modal, SearchInput, Segmented, Select, TextInput } from './ui';

/*
 * Thư viện hình mẫu căn: tải nhiều hình mẫu một lần (mỗi ảnh một mã: căn góc, căn giữa…), gắn mã cho
 * từng căn hoặc từng ô trên mặt bằng → khách chạm vào căn thấy đúng hình mẫu của căn đó.
 */

/** Hình mẫu: ảnh nét hơn ảnh thường để đọc được kích thước phòng. */
const saveLayoutImage = async (file: Blob) => (await saveImageSized(file, { maxSize: 2400, quality: 0.86 })).id;

const splitTags = (text: string) =>
  text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Các thẻ đang dùng trong thư viện (nhiều nhất trước) + thẻ gợi ý. */
function tagSuggestions(layouts: UnitLayout[]): string[] {
  const count = new Map<string, number>();
  for (const l of layouts) for (const t of l.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return mergeTags(
    [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    LAYOUT_TAG_SUGGESTIONS,
  );
}

// ---------------------------------------------------------------- Ô hình mẫu

export function LayoutTile({
  layout,
  count,
  selected,
  onClick,
}: {
  layout: UnitLayout;
  count?: number;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Hình mẫu ${layout.code}`}
      className={cn(
        'group overflow-hidden rounded-xl border bg-white text-left transition',
        selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 hover:border-brand-300 hover:shadow-sm',
      )}
    >
      <div className="relative">
        {layout.images[0] ? (
          <ImageView id={layout.images[0]} fit="contain" className="aspect-[4/3] w-full bg-slate-50" />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
            <ImageOff size={22} />
            <span className="text-xs font-medium">Chưa có ảnh</span>
          </div>
        )}
        {layout.images.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Images size={10} /> {layout.images.length}
          </span>
        )}
        {selected && (
          <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-brand-600 text-white shadow">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[13px] font-bold text-slate-900">{layout.code}</span>
          {count !== undefined && <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{count} căn</span>}
        </div>
        {layout.name && <div className="truncate text-xs text-slate-600">{layout.name}</div>}
        {layout.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {layout.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                {t}
              </span>
            ))}
            {layout.tags.length > 3 && <span className="text-[11px] font-semibold text-slate-400">+{layout.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

/** Kéo thả ảnh vào vùng này (máy tính). */
function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onFiles(files);
      },
    },
  };
}

// ---------------------------------------------------------------- Thư viện (tab Mặt bằng)

const STEPS = [
  { title: 'Tải ảnh hình mẫu', text: 'Chọn nhiều ảnh một lần, mỗi ảnh một mẫu. Đặt tên file theo mã (VD 3PN-GOC.jpg, 2PN-GIUA.png) để tự điền mã và thẻ.' },
  { title: 'Gắn cho căn', text: 'Chạm vào căn trên bản đồ → “Gắn hình mẫu” (một ô áp dụng cho mọi tầng), hoặc cột “Mẫu căn” khi nhập bảng hàng.' },
  { title: 'Khách chạm là thấy', text: 'Căn góc ra đúng hình căn góc, căn giữa ra hình căn giữa — cả trên thẻ căn lẫn file PDF / ảnh gửi khách.' },
];

export function LayoutLibrary({ project, editable }: { project: Project; editable: boolean }) {
  const { toast } = useUI();
  const usage = useMemo(() => layoutUsage(project), [project]);
  const [tag, setTag] = useState<string | null>(null);
  const [upload, setUpload] = useState<File[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<{ images: string[]; index: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const layouts = project.layouts;

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of layouts) for (const t of l.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]);
  }, [layouts]);
  const activeTag = tag && tags.some(([t]) => t === tag) ? tag : null;
  const shown = activeTag ? layouts.filter((l) => l.tags.includes(activeTag)) : layouts;
  const editing = editId ? layouts.find((l) => l.id === editId) : undefined;

  const onFiles = (files: File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) toast('Hãy chọn file ảnh (JPG, PNG…)', 'error');
    else setUpload(images);
  };
  const pick = () => fileRef.current?.click();
  const drop = useFileDrop(onFiles, editable);

  if (!editable && !layouts.length) return null;

  return (
    <Card id="layouts" className="scroll-mt-24">
      <CardHeader
        title={`Hình mẫu căn (${layouts.length})`}
        icon={LayoutTemplate}
        description={
          layouts.length
            ? editable
              ? `${usage.total - usage.unassigned}/${usage.total} căn đã có hình mẫu riêng · chạm vào hình mẫu để sửa mã, thẻ, ảnh.`
              : 'Chạm để xem hình mẫu toàn màn hình.'
            : 'Mỗi hình mẫu một mã (căn góc, căn giữa…) — gắn cho từng căn để khách thấy đúng hình mẫu.'
        }
        actions={
          editable && (
            <Button size="sm" variant={layouts.length ? 'secondary' : 'primary'} icon={ImagePlus} onClick={pick}>
              Tải hình mẫu
            </Button>
          )
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />

      {layouts.length === 0 ? (
        <div className="p-4 sm:p-5">
          <DropZone
            onFiles={onFiles}
            onPick={pick}
            title="Thả nhiều ảnh hình mẫu vào đây hoặc bấm để chọn"
            hint="Mỗi ảnh là một hình mẫu (mặt bằng căn của CĐT). Ảnh cùng mã được gộp chung một mẫu."
            icon={LayoutTemplate}
          />
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
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
        </div>
      ) : (
        <div {...drop.props} className={cn('transition', drop.over && 'bg-brand-50/60 ring-2 ring-inset ring-brand-400')}>
          {tags.length > 0 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2.5 sm:px-5">
              <TagChip active={!activeTag} onClick={() => setTag(null)} label="Tất cả" count={layouts.length} />
              {tags.map(([t, n]) => (
                <TagChip key={t} active={activeTag === t} onClick={() => setTag(activeTag === t ? null : t)} label={t} count={n} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((l) => (
              <LayoutTile
                key={l.id}
                layout={l}
                count={editable ? (usage.count.get(l.id) ?? 0) : undefined}
                onClick={() => (editable ? setEditId(l.id) : l.images.length && setView({ images: l.images, index: 0 }))}
              />
            ))}
          </div>
          {editable && (
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs leading-relaxed text-slate-500 sm:px-5">
              Gắn hình mẫu: chạm vào căn trên bản đồ → <b className="text-slate-700">Gắn hình mẫu</b> (một ô áp dụng cho mọi tầng, hoặc riêng một căn), chọn nhiều ô trong{' '}
              <b className="text-slate-700">Chỉnh sửa bản đồ</b>, hoặc cột <b className="text-slate-700">Mẫu căn</b> khi nhập bảng hàng. Căn chưa gắn dùng hình mẫu chung của loại căn (nếu có).
            </p>
          )}
        </div>
      )}

      {upload && <LayoutUploadModal project={project} files={upload} onClose={() => setUpload(null)} />}
      {editing && <LayoutModal project={project} layout={editing} count={usage.count.get(editing.id) ?? 0} onClose={() => setEditId(null)} />}
      {view && <Lightbox images={view.images} index={view.index} onIndex={(index) => setView({ ...view, index })} onClose={() => setView(null)} />}
    </Card>
  );
}

function TagChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
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
      {label}
      <span className={cn('tabular-nums', active ? 'text-white/70' : 'text-slate-400')}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Tải nhiều hình mẫu

interface UploadRow {
  key: string;
  file: File;
  url: string;
  code: string;
  tags: string;
}

function initialRows(files: File[], project: Project): UploadRow[] {
  const taken = new Set(project.layouts.map((l) => normCode(l.code)));
  return files.map((file) => {
    let code = codeFromFileName(file.name);
    if (!code) {
      code = nextLayoutCode(taken);
      taken.add(normCode(code));
    }
    return { key: uid(), file, url: URL.createObjectURL(file), code, tags: guessLayout(`${code} ${file.name}`, project.unitTypes).tags.join(', ') };
  });
}

export function LayoutUploadModal({ project, files, onClose }: { project: Project; files: File[]; onClose: () => void }) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const [rows, setRows] = useState<UploadRow[]>(() => initialRows(files, project));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const urls = useRef(rows.map((r) => r.url));
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const find = useMemo(() => layoutFinder(project.layouts), [project.layouts]);
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of rows) if (r.code.trim()) out.set(normCode(r.code), (out.get(normCode(r.code)) ?? 0) + 1);
    return out;
  }, [rows]);
  const missing = rows.some((r) => !r.code.trim());
  const set =(key: string, patch: Partial<UploadRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (missing || !rows.length) return;
    setProgress({ done: 0, total: rows.length });
    const saved: Array<{ row: UploadRow; id: string }> = [];
    const failed: string[] = [];
    for (const row of rows) {
      try {
        saved.push({ row, id: await saveLayoutImage(row.file) });
      } catch {
        failed.push(row.file.name);
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    try {
      let added = 0;
      let extended = 0;
      await patchProject(project.id, (cur) => {
        const result = addLayoutImages(
          cur.layouts,
          saved.map(({ row, id }) => ({ code: row.code, tags: splitTags(row.tags), imageId: id })),
          cur.unitTypes,
        );
        added = result.created.length;
        extended = result.extended.length;
        return { layouts: result.layouts };
      });
      toast(
        [added && `Đã thêm ${added} hình mẫu`, extended && `thêm ảnh cho ${extended} mẫu có sẵn`, failed.length && `${failed.length} ảnh lỗi (${failed[0]})`].filter(Boolean).join(' · ') ||
          'Không có ảnh nào được lưu',
        failed.length ? 'error' : 'success',
      );
      onClose();
    } catch (e) {
      await deleteImages(saved.map((s) => s.id)).catch(() => undefined);
      toast(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
      setProgress(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!progress}
      size="lg"
      title={`Thêm ${rows.length} ảnh hình mẫu`}
      description="Kiểm tra mã từng hình mẫu (dùng để gắn cho căn) và thẻ mô tả. Ảnh cùng mã được gộp chung một mẫu; mã trùng mẫu có sẵn thì thêm ảnh vào mẫu đó."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!progress}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={!!progress} disabled={missing || !rows.length}>
            {progress ? `Đang lưu ${progress.done}/${progress.total}` : 'Lưu vào thư viện'}
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {rows.map((r) => {
          const existing = r.code.trim() ? find(r.code) : undefined;
          const grouped = (counts.get(normCode(r.code)) ?? 0) > 1;
          return (
            <li key={r.key} className="flex gap-3 rounded-xl border border-slate-200 p-2.5">
              <img src={r.url} alt="" className="h-20 w-24 shrink-0 rounded-lg bg-slate-50 object-contain ring-1 ring-slate-200 sm:w-28" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <TextInput
                    value={r.code}
                    onChange={(e) => set(r.key, { code: e.target.value })}
                    placeholder="Mã mẫu, VD 3PN-GOC"
                    aria-label={`Mã hình mẫu của ${r.file.name}`}
                    className="font-mono font-bold"
                  />
                  <IconButton icon={X} label="Bỏ ảnh này" size="sm" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} />
                </div>
                <TextInput value={r.tags} onChange={(e) => set(r.key, { tags: e.target.value })} placeholder="Thẻ: Căn góc, 2 mặt thoáng…" aria-label={`Thẻ của ${r.file.name}`} />
                <p className={cn('truncate text-[11px]', !r.code.trim() ? 'font-semibold text-rose-600' : 'text-slate-500')}>
                  {!r.code.trim()
                    ? 'Nhập mã hình mẫu'
                    : existing
                      ? `Thêm ảnh vào mẫu ${existing.code} có sẵn`
                      : grouped
                        ? 'Gộp chung một mẫu với ảnh cùng mã'
                        : 'Hình mẫu mới'}
                  <span className="text-slate-400"> · {r.file.name}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------- Sửa một hình mẫu

function LayoutModal({ project, layout, count, onClose }: { project: Project; layout: UnitLayout; count: number; onClose: () => void }) {
  const { patchProject } = useData();
  const { toast, confirm } = useUI();
  const fid = useId();
  const [draft, setDraft] = useState(layout);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ảnh tải lên trong hộp thoại này: bấm Huỷ thì xoá đi cho khỏi rác.
  const added = useRef<string[]>([]);
  const saved = useRef(false);
  useEffect(
    () => () => {
      if (!saved.current && added.current.length) void deleteImages(added.current);
    },
    [],
  );

  const set = (patch: Partial<UnitLayout>) => setDraft((d) => ({ ...d, ...patch }));
  const suggestions = useMemo(() => tagSuggestions(project.layouts), [project.layouts]);
  const positions = project.maps.reduce((n, m) => n + m.units.filter((u) => u.layoutId === layout.id).length, 0);
  const own = project.layoutAssignments.filter((a) => a.layoutId === layout.id).length;

  const addImages = async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) return;
    setBusy(true);
    try {
      for (const file of images) {
        const id = await saveLayoutImage(file);
        added.current.push(id);
        setDraft((d) => ({ ...d, images: [...d.images, id] }));
      }
    } catch (e) {
      toast(`Không đọc được ảnh: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number) =>
    setDraft((d) => {
      if (to < 0 || to >= d.images.length) return d;
      const images = [...d.images];
      const [x] = images.splice(from, 1);
      images.splice(to, 0, x);
      return { ...d, images };
    });

  const save = async () => {
    const code = draft.code.trim();
    if (!code) return;
    if (project.layouts.some((l) => l.id !== layout.id && normCode(l.code) === normCode(code))) {
      toast(`Mã ${code} đã có hình mẫu khác dùng`, 'error');
      return;
    }
    setBusy(true);
    try {
      const next: UnitLayout = { ...draft, code, name: draft.name.trim(), note: draft.note.trim() };
      await patchProject(project.id, (cur) => ({ layouts: cur.layouts.map((l) => (l.id === layout.id ? next : l)) }));
      saved.current = true;
      await deleteImages(layout.images.filter((id) => !next.images.includes(id)));
      toast(`Đã lưu hình mẫu ${code}`);
      onClose();
    } catch (e) {
      toast(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Xoá hình mẫu ${layout.code}?`,
      message: count
        ? `Đang dùng cho ${count} căn — các căn này sẽ không còn hình mẫu riêng (dùng hình mẫu chung của loại căn nếu có). Ảnh của hình mẫu bị xoá.`
        : 'Ảnh của hình mẫu sẽ bị xoá.',
      confirmLabel: 'Xoá hình mẫu',
      danger: true,
    });
    if (!ok) return;
    await patchProject(project.id, (cur) => withoutLayout(cur, layout.id));
    await deleteImages(layout.images);
    toast(`Đã xoá hình mẫu ${layout.code}`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={`Hình mẫu ${layout.code}`}
      description={
        count
          ? `Đang dùng cho ${count} căn${positions ? ` · gắn ở ${positions} ô trên mặt bằng` : ''}${own ? ` · ${own} căn gắn riêng` : ''}.`
          : 'Chưa gắn cho căn nào — chạm vào căn trên bản đồ → “Gắn hình mẫu”.'
      }
      footer={
        <>
          <Button variant="dangerSoft" icon={Trash2} onClick={() => void remove()} disabled={busy} className="mr-auto">
            Xoá
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!draft.code.trim()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Ảnh ({draft.images.length})</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {draft.images.map((id, i) => (
              <div key={id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button type="button" onClick={() => setView(i)} className="relative block w-full" aria-label={`Xem ảnh ${i + 1}`}>
                  <ImageView id={id} fit="contain" className="aspect-[4/3] w-full bg-slate-50" />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow">
                      <Star size={10} fill="currentColor" /> Ảnh chính
                    </span>
                  )}
                </button>
                <div className="flex items-center justify-between p-1">
                  <div className="flex">
                    <IconButton icon={ArrowLeft} label="Lên trước" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} />
                    <IconButton icon={ArrowRight} label="Ra sau" size="sm" disabled={i === draft.images.length - 1} onClick={() => move(i, i + 1)} />
                  </div>
                  <IconButton icon={Trash2} label="Bỏ ảnh" size="sm" tone="danger" onClick={() => set({ images: draft.images.filter((x) => x !== id) })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
            >
              <ImagePlus size={20} />
              Thêm ảnh
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Ảnh chính hiện trên thẻ căn và phiếu gửi khách; ảnh khác (phối cảnh 3D, nội thất…) xem khi phóng to.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void addImages(files);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mã hình mẫu" required htmlFor={`${fid}-code`} hint="Dùng để gắn cho căn và nhập từ cột “Mẫu căn” của bảng hàng.">
            <TextInput id={`${fid}-code`} value={draft.code} onChange={(e) => set({ code: e.target.value })} placeholder="VD: 3PN-GOC" className="font-mono font-bold" />
          </Field>
          <Field label="Tên hiển thị" htmlFor={`${fid}-name`} hint="Không bắt buộc — hiện cho khách.">
            <TextInput id={`${fid}-name`} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Căn góc 3PN, 2 mặt thoáng" />
          </Field>
        </div>
        <Field label="Thẻ" htmlFor={`${fid}-tags`} hint="Để tìm & lọc: gõ “căn góc” trong ô lọc của bản đồ là ra các căn dùng mẫu có thẻ này.">
          <TagInput id={`${fid}-tags`} value={draft.tags} onChange={(tags) => set({ tags })} placeholder="Căn góc, View sông… (Enter để thêm)" suggestions={suggestions} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Loại căn" htmlFor={`${fid}-type`} className="col-span-2">
            <Select id={`${fid}-type`} value={draft.typeId ?? ''} onChange={(e) => set({ typeId: e.target.value || undefined })}>
              <option value="">— Chưa chọn —</option>
              {project.unitTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || 'Loại chưa đặt tên'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phòng ngủ" htmlFor={`${fid}-bed`}>
            <NumberInput id={`${fid}-bed`} value={draft.bedrooms} onChange={(bedrooms) => set({ bedrooms })} integer placeholder="VD: 3" />
          </Field>
          <Field label="WC" htmlFor={`${fid}-bath`}>
            <NumberInput id={`${fid}-bath`} value={draft.bathrooms} onChange={(bathrooms) => set({ bathrooms })} integer placeholder="VD: 2" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Diện tích mẫu" htmlFor={`${fid}-area`} hint="Dùng khi bảng hàng chưa có.">
            <NumberInput id={`${fid}-area`} value={draft.area} onChange={(area) => set({ area })} suffix="m²" placeholder="VD: 95,2" />
          </Field>
          <Field label="Ghi chú" htmlFor={`${fid}-note`} hint="Hiện cả khi khách xem.">
            <TextInput id={`${fid}-note`} value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="VD: Phòng khách 2 mặt kính, bếp tách riêng" />
          </Field>
        </div>
      </div>
      {view !== null && draft.images[view] && <Lightbox images={draft.images} index={view} onIndex={setView} onClose={() => setView(null)} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- Chọn hình mẫu để gắn

export interface LayoutScope {
  value: string;
  label: string;
  hint?: string;
}

/** Chọn hình mẫu từ thư viện (tải thêm ảnh mới ngay tại đây) để gắn cho căn / ô trên mặt bằng. */
export function LayoutPickerModal({
  project,
  title,
  description,
  current,
  scopes,
  initialScope,
  clearLabel,
  extra,
  onApply,
  onClose,
}: {
  project: Project;
  title: string;
  description?: ReactNode;
  /** Hình mẫu đang dùng (chọn sẵn). */
  current?: string;
  scopes?: LayoutScope[];
  initialScope?: string;
  /** Nhãn lựa chọn "không gắn" theo phạm vi; trống = không cho bỏ. */
  clearLabel?: (scope: string) => string | undefined;
  /** Tuỳ chọn thêm theo phạm vi (hiện dưới phần chọn phạm vi). */
  extra?: (scope: string) => ReactNode;
  onApply: (layoutId: string | undefined, scope: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const { patchProject } = useData();
  const { toast } = useUI();
  const [scope, setScope] = useState(initialScope ?? scopes?.[0]?.value ?? '');
  const [picked, setPicked] = useState<string | null>(current ?? null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const layouts = project.layouts;
  const clear = clearLabel?.(scope);

  // Mở ra là thấy ngay hình mẫu đang dùng (thư viện dài, hình mẫu đó nằm cuối).
  useEffect(() => {
    const timer = window.setTimeout(() => gridRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }), 60);
    return () => window.clearTimeout(timer);
  }, []);
  const q = foldText(query).trim();
  const shown = q ? layouts.filter((l) => foldText(`${l.code} ${l.name} ${l.tags.join(' ')}`).includes(q)) : layouts;
  const scopeInfo = scopes?.find((s) => s.value === scope);

  // Tải ảnh ngay trong hộp chọn: mỗi ảnh thành một hình mẫu (mã theo tên file), sửa mã / thẻ sau trong thư viện.
  const quickAdd = async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of images) ids.push(await saveLayoutImage(file));
      let first: string | undefined;
      await patchProject(project.id, (cur) => {
        const taken = new Set(cur.layouts.map((l) => normCode(l.code)));
        const entries = images.map((file, i) => {
          let code = codeFromFileName(file.name);
          if (!code) {
            code = nextLayoutCode(taken);
            taken.add(normCode(code));
          }
          return { code, tags: guessLayout(`${code} ${file.name}`, cur.unitTypes).tags, imageId: ids[i] };
        });
        const result = addLayoutImages(cur.layouts, entries, cur.unitTypes);
        first = result.ids[0];
        return { layouts: result.layouts };
      });
      if (first) setPicked(first);
      toast(`Đã thêm ${images.length} ảnh vào thư viện hình mẫu — sửa mã / thẻ trong mục Hình mẫu căn`);
    } catch (e) {
      toast(`Không lưu được ảnh: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      await onApply(picked ?? undefined, scope);
      onClose();
    } catch (e) {
      toast(`Không lưu được: ${e instanceof Error ? e.message : String(e)}`, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="primary" icon={Check} onClick={() => void apply()} loading={busy} disabled={picked === null && !clear}>
            {picked === null ? 'Lưu' : 'Gắn hình mẫu'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {scopes && scopes.length > 1 && (
          <Field label="Áp dụng cho">
            <Segmented value={scope} onChange={setScope} options={scopes.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
        )}
        {scopeInfo?.hint && <p className="text-xs leading-relaxed text-slate-500">{scopeInfo.hint}</p>}
        {extra?.(scope)}
        {layouts.length > 8 && <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã, thẻ: 3PN, căn góc…" />}
        <div ref={gridRef} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {clear && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-pressed={picked === null}
              className={cn(
                'flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 text-center text-[13px] font-semibold transition',
                picked === null ? 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-500/30' : 'border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              <ImageOff size={20} />
              {clear}
            </button>
          )}
          {shown.map((l) => (
            <LayoutTile key={l.id} layout={l} selected={picked === l.id} onClick={() => setPicked(l.id)} />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 px-3 text-center text-[13px] font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
          >
            <ImagePlus size={20} />
            Tải hình mẫu mới
          </button>
        </div>
        {!layouts.length && <p className="text-[13px] leading-relaxed text-slate-500">Thư viện chưa có hình mẫu — tải ảnh hình mẫu của căn này lên (đặt tên file theo mã, VD 3PN-GOC.jpg).</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void quickAdd(files);
          }}
        />
      </div>
    </Modal>
  );
}
