import {
  Archive,
  ArchiveRestore,
  Download,
  Ellipsis,
  ExternalLink,
  FileArchive,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Files,
  Lock,
  Pencil,
  Presentation,
  Share2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DOC_CATEGORIES, DOC_CATEGORY, VISIBILITY, guessDocCategory, looksInternal } from '../constants';
import { formatDate, timeAgo } from '../lib/format';
import {
  canShareFiles,
  fileKind,
  formatBytes,
  getShareableFile,
  guessMimeType,
  isPreviewable,
  loadFileUrl,
  peekFileUrl,
  shareFiles,
  type FileKind,
} from '../lib/media';
import { buildHaystack, matchesQuery } from '../lib/text';
import { useData, type MediaOwner } from '../store/data';
import { useUI } from '../store/ui';
import type { DocCategory, DocumentRef, Visibility } from '../types';
import { DropZone } from './media';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  cn,
  Dropdown,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SearchInput,
  Segmented,
  Select,
  TabBar,
  TextArea,
  TextInput,
  Toggle,
} from './ui';

const KIND_STYLE: Record<FileKind, { icon: LucideIcon; className: string; label: string }> = {
  pdf: { icon: FileText, className: 'bg-rose-50 text-rose-600 ring-rose-200', label: 'PDF' },
  image: { icon: FileImage, className: 'bg-sky-50 text-sky-600 ring-sky-200', label: 'Ảnh' },
  word: { icon: FileText, className: 'bg-blue-50 text-blue-700 ring-blue-200', label: 'Word' },
  excel: { icon: FileSpreadsheet, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Excel' },
  slide: { icon: Presentation, className: 'bg-orange-50 text-orange-600 ring-orange-200', label: 'Slide' },
  video: { icon: FileVideo, className: 'bg-violet-50 text-violet-600 ring-violet-200', label: 'Video' },
  archive: { icon: FileArchive, className: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Nén' },
  other: { icon: Files, className: 'bg-slate-100 text-slate-600 ring-slate-200', label: 'File' },
};

export function FileTypeIcon({ type, name, className }: { type: string; name: string; className?: string }) {
  const style = KIND_STYLE[fileKind(type, name)];
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', style.className, className)}>
      <style.icon size={19} strokeWidth={2} />
    </span>
  );
}

export function fileKindLabel(doc: Pick<DocumentRef, 'type' | 'name'>): string {
  return KIND_STYLE[fileKind(doc.type, doc.name)].label;
}

export function useFileUrl(id: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => (id ? peekFileUrl(id) : null));
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    const cached = peekFileUrl(id);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    setUrl(undefined);
    void loadFileUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

/** Tên file khi tải về: giữ đuôi gốc. */
function downloadName(doc: DocumentRef): string {
  return doc.name;
}

/** Nút Mở / Tải về / Chia sẻ cho một tài liệu. */
export function DocActions({ doc, compact }: { doc: DocumentRef; compact?: boolean }) {
  const url = useFileUrl(doc.id);
  const { toast } = useUI();
  const shareable = useMemo(canShareFiles, []);
  const previewable = isPreviewable(doc.type);

  const share = async () => {
    const file = await getShareableFile(doc.id, downloadName(doc));
    if (!file) return toast('Không tìm thấy file', 'error');
    const result = await shareFiles([file], doc.name);
    if (result === 'unsupported') toast('Thiết bị không hỗ trợ chia sẻ file — hãy dùng nút Tải về', 'info');
  };

  const linkClass =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition aria-disabled:pointer-events-none aria-disabled:opacity-50';

  return (
    <div className="flex items-center gap-1">
      {previewable && (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noopener"
          aria-disabled={!url}
          className={cn(linkClass, 'bg-brand-50 text-brand-800 hover:bg-brand-100')}
          title="Mở xem"
        >
          <ExternalLink size={15} />
          {!compact && 'Mở'}
        </a>
      )}
      <a
        href={url ?? undefined}
        download={downloadName(doc)}
        aria-disabled={!url}
        className={cn(linkClass, previewable ? 'text-slate-600 hover:bg-slate-100' : 'bg-brand-50 text-brand-800 hover:bg-brand-100')}
        title="Tải về"
      >
        <Download size={15} />
        {!compact && !previewable && 'Tải về'}
      </a>
      {shareable && (
        <button type="button" onClick={() => void share()} className={cn(linkClass, 'text-slate-600 hover:bg-slate-100')} title="Chia sẻ (Zalo, email…)">
          <Share2 size={15} />
        </button>
      )}
    </div>
  );
}

/** Tài liệu mới nhất (còn hiệu lực) trong từng nhóm. */
function latestIds(docs: DocumentRef[]): Set<string> {
  const best = new Map<DocCategory, DocumentRef>();
  const count = new Map<DocCategory, number>();
  for (const d of docs) {
    if (d.archived) continue;
    count.set(d.category, (count.get(d.category) ?? 0) + 1);
    const cur = best.get(d.category);
    const key = (x: DocumentRef) => x.effectiveDate || x.createdAt.slice(0, 10);
    if (!cur || key(d) > key(cur) || (key(d) === key(cur) && d.createdAt > cur.createdAt)) best.set(d.category, d);
  }
  return new Set([...best.entries()].filter(([cat]) => (count.get(cat) ?? 0) > 1).map(([, d]) => d.id));
}

function DocumentRow({
  doc,
  latest,
  editable,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  doc: DocumentRef;
  latest: boolean;
  editable: boolean;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', doc.archived && 'bg-slate-50/70')}>
      <FileTypeIcon type={doc.type} name={doc.name} className={doc.archived ? 'opacity-50' : ''} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('break-all text-sm font-semibold', doc.archived ? 'text-slate-400 line-through' : 'text-slate-900')}>
            {doc.name}
          </span>
          {latest && (
            <Badge tone="emerald" size="sm">
              Mới nhất
            </Badge>
          )}
          {doc.archived && (
            <Badge tone="slate" size="sm">
              Hết hiệu lực
            </Badge>
          )}
          {doc.visibility === 'internal' && (
            <Badge tone="rose" size="sm" icon={Lock}>
              Nội bộ
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span>{fileKindLabel(doc)}</span>
          <span>· {formatBytes(doc.size)}</span>
          {doc.effectiveDate && <span>· Áp dụng {formatDate(doc.effectiveDate)}</span>}
          <span>· Tải lên {timeAgo(doc.createdAt)}</span>
        </div>
        {doc.note && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{doc.note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <DocActions doc={doc} compact />
        {editable && (
          <Dropdown
            trigger={(toggle) => <IconButton icon={Ellipsis} label="Thêm thao tác" size="sm" onClick={toggle} />}
            items={[
              { label: 'Sửa thông tin', icon: Pencil, onClick: onEdit },
              {
                label: doc.archived ? 'Đánh dấu còn hiệu lực' : 'Đánh dấu hết hiệu lực',
                icon: doc.archived ? ArchiveRestore : Archive,
                onClick: onToggleArchive,
              },
              { label: 'Xoá tài liệu', icon: Trash2, onClick: onDelete, danger: true },
            ]}
          />
        )}
      </div>
    </li>
  );
}

interface PendingUpload {
  files: File[];
  category: DocCategory;
  visibility: Visibility;
  effectiveDate: string;
  note: string;
  archiveOld: boolean;
}

/**
 * Khu vực tài liệu của một dự án / BĐS: lọc theo nhóm, tìm kiếm, tải lên,
 * sửa thông tin, đánh dấu hết hiệu lực. Mọi thay đổi được lưu ngay.
 */
export function DocumentManager({
  owner,
  documents,
  editable,
  privacy,
  title = 'Tài liệu',
  description,
}: {
  owner: MediaOwner;
  documents: DocumentRef[];
  editable: boolean;
  privacy: boolean;
  title?: string;
  description?: string;
}) {
  const { addDocuments, updateDocument, removeDocument } = useData();
  const { toast, confirm } = useUI();
  const [category, setCategory] = useState<DocCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<DocumentRef | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => documents.filter((d) => !(privacy && d.visibility === 'internal')), [documents, privacy]);
  const latest = useMemo(() => latestIds(visible), [visible]);
  const archivedCount = visible.filter((d) => d.archived).length;

  const filtered = useMemo(() => {
    return visible.filter((d) => {
      if (!showArchived && d.archived) return false;
      if (category !== 'all' && d.category !== category) return false;
      if (query) {
        const hay = buildHaystack([d.name, d.note, DOC_CATEGORY[d.category].label]);
        if (!matchesQuery(hay, query)) return false;
      }
      return true;
    });
  }, [visible, showArchived, category, query]);

  const counts = useMemo(() => {
    const map = new Map<DocCategory, number>();
    for (const d of visible) if (showArchived || !d.archived) map.set(d.category, (map.get(d.category) ?? 0) + 1);
    return map;
  }, [visible, showArchived]);

  const groups = DOC_CATEGORIES.map((cat) => ({
    cat,
    docs: filtered
      .filter((d) => d.category === cat)
      .sort((a, b) => Number(a.archived) - Number(b.archived) || (b.effectiveDate || b.createdAt).localeCompare(a.effectiveDate || a.createdAt)),
  })).filter((g) => g.docs.length > 0);

  const startUpload = (files: File[]) => {
    if (!files.length) return;
    const guessed = guessDocCategory(files[0].name, guessMimeType(files[0].name, files[0].type));
    setPending({
      files,
      category: category !== 'all' ? category : guessed,
      visibility: owner.kind === 'project' && !files.some((f) => looksInternal(f.name)) ? 'public' : 'internal',
      effectiveDate: '',
      note: '',
      archiveOld: false,
    });
  };

  const oldInCategory = pending ? documents.filter((d) => d.category === pending.category && !d.archived) : [];

  const confirmUpload = async () => {
    if (!pending) return;
    const job = pending;
    setPending(null);
    setProgress({ done: 0, total: job.files.length });
    const big = job.files.filter((f) => f.size > 50 * 1024 * 1024);
    if (big.length) toast(`Có ${big.length} file trên 50 MB — sẽ làm file sao lưu khá nặng.`, 'info');
    const result = await addDocuments(
      owner,
      job.files,
      { category: job.category, visibility: job.visibility, effectiveDate: job.effectiveDate, note: job.note },
      (done, total) => setProgress({ done, total }),
    );
    if (job.archiveOld && result.added) {
      for (const d of oldInCategory) await updateDocument(owner, d.id, { archived: true });
    }
    setProgress(null);
    if (result.added) toast(`Đã tải lên ${result.added} tài liệu`);
    if (result.failed.length) toast(`${result.failed.length} file lỗi: ${result.failed[0].reason}`, 'error');
  };

  const remove = async (doc: DocumentRef) => {
    const ok = await confirm({
      title: 'Xoá tài liệu?',
      message: (
        <>
          <b>{doc.name}</b> sẽ bị xoá vĩnh viễn. Nếu chỉ là bản cũ, bạn có thể chọn “Đánh dấu hết hiệu lực” để giữ lại tra cứu.
        </>
      ),
      confirmLabel: 'Xoá tài liệu',
      danger: true,
    });
    if (!ok) return;
    await removeDocument(owner, doc.id);
    toast('Đã xoá tài liệu');
  };

  const tabs = [
    { value: 'all' as const, label: 'Tất cả', count: visible.filter((d) => showArchived || !d.archived).length },
    ...DOC_CATEGORIES.filter((c) => counts.get(c)).map((c) => ({ value: c, label: DOC_CATEGORY[c].label, count: counts.get(c) })),
  ];

  return (
    <Card>
      <CardHeader
        title={`${title} (${visible.length})`}
        icon={Files}
        description={description}
        actions={
          editable && (
            <Button variant="primary" size="sm" icon={FilePlus2} onClick={() => inputRef.current?.click()} loading={!!progress}>
              {progress ? `Đang tải ${progress.done}/${progress.total}` : 'Tải lên tài liệu'}
            </Button>
          )
        }
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          startUpload(files);
        }}
      />

      {visible.length === 0 ? (
        editable ? (
          <div className="p-4 sm:p-5">
            <DropZone
              onFiles={startUpload}
              onPick={() => inputRef.current?.click()}
              busy={!!progress}
              icon={FilePlus2}
              title="Kéo thả hoặc bấm để tải lên tài liệu"
              hint="PDF, Word, Excel, PowerPoint, ảnh, video… File được giữ nguyên bản gốc."
            />
          </div>
        ) : (
          <EmptyState icon={Files} title="Chưa có tài liệu" description="Chưa có tài liệu nào được chia sẻ." />
        )
      ) : (
        <>
          <div className="space-y-3 border-b border-slate-100 px-4 py-3 sm:px-5">
            {visible.length > 5 && <SearchInput value={query} onChange={setQuery} placeholder="Tìm trong tài liệu…" />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabBar value={category} onChange={setCategory} tabs={tabs} className="flex-1" />
              {archivedCount > 0 && (
                <Checkbox checked={showArchived} onChange={setShowArchived} label={`Hiện ${archivedCount} bản hết hiệu lực`} className="text-xs" />
              )}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Không có tài liệu phù hợp.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {groups.map((g) => (
                <div key={g.cat}>
                  <div className="flex items-baseline justify-between gap-2 bg-slate-50/80 px-4 py-2 sm:px-5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{DOC_CATEGORY[g.cat].label}</h3>
                    <span className="text-xs text-slate-400">{g.docs.length}</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {g.docs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        latest={latest.has(doc.id)}
                        editable={editable}
                        onEdit={() => setEditing(doc)}
                        onToggleArchive={() => void updateDocument(owner, doc.id, { archived: !doc.archived })}
                        onDelete={() => void remove(doc)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Thông tin cho đợt tải lên */}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={`Tải lên ${pending?.files.length ?? 0} tài liệu`}
        description="Chọn nhóm và quyền xem cho các file này. Có thể sửa lại từng file sau."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Huỷ
            </Button>
            <Button variant="primary" icon={FilePlus2} onClick={() => void confirmUpload()}>
              Tải lên
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <ul className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-2.5">
              {pending.files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[13px]">
                  <FileTypeIcon type={guessMimeType(f.name, f.type)} name={f.name} className="size-7 rounded-lg [&_svg]:size-3.5" />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{f.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            <Field label="Nhóm tài liệu" hint={DOC_CATEGORY[pending.category].examples}>
              <Select value={pending.category} onChange={(e) => setPending({ ...pending, category: e.target.value as DocCategory, archiveOld: false })}>
                {DOC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {DOC_CATEGORY[c].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quyền xem">
              <Segmented
                value={pending.visibility}
                onChange={(v) => setPending({ ...pending, visibility: v })}
                options={[
                  { value: 'public', label: VISIBILITY.public.label },
                  { value: 'internal', label: VISIBILITY.internal.label },
                ]}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Ngày ban hành / áp dụng" hint="Để biết đâu là bản mới nhất.">
                <TextInput type="date" value={pending.effectiveDate} onChange={(e) => setPending({ ...pending, effectiveDate: e.target.value })} />
              </Field>
              <Field label="Ghi chú">
                <TextInput value={pending.note} onChange={(e) => setPending({ ...pending, note: e.target.value })} placeholder="VD: Đợt 3, áp dụng tháng 10" />
              </Field>
            </div>
            {oldInCategory.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
                <Toggle
                  checked={pending.archiveOld}
                  onChange={(v) => setPending({ ...pending, archiveOld: v })}
                  label={`Đánh dấu ${oldInCategory.length} tài liệu “${DOC_CATEGORY[pending.category].label}” hiện có là hết hiệu lực`}
                  description="Dùng khi cập nhật bảng giá / chính sách mới. Bản cũ vẫn được giữ để tra cứu."
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <EditDocumentModal
        doc={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          await updateDocument(owner, editing.id, patch);
          setEditing(null);
          toast('Đã cập nhật tài liệu');
        }}
      />
    </Card>
  );
}

function EditDocumentModal({
  doc,
  onClose,
  onSave,
}: {
  doc: DocumentRef | null;
  onClose: () => void;
  onSave: (patch: Partial<DocumentRef>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DocumentRef | null>(doc);
  useEffect(() => setDraft(doc), [doc]);
  if (!doc || !draft) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Sửa thông tin tài liệu"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              void onSave({
                name: draft.name.trim() || doc.name,
                category: draft.category,
                visibility: draft.visibility,
                effectiveDate: draft.effectiveDate,
                note: draft.note,
                archived: draft.archived,
              })
            }
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tên tài liệu">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Nhóm tài liệu" hint={DOC_CATEGORY[draft.category].examples}>
          <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as DocCategory })}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quyền xem">
          <Segmented
            value={draft.visibility}
            onChange={(v) => setDraft({ ...draft, visibility: v })}
            options={[
              { value: 'public', label: VISIBILITY.public.label },
              { value: 'internal', label: VISIBILITY.internal.label },
            ]}
          />
        </Field>
        <Field label="Ngày ban hành / áp dụng">
          <TextInput type="date" value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} />
        </Field>
        <Field label="Ghi chú">
          <TextArea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
        <Toggle
          checked={draft.archived}
          onChange={(v) => setDraft({ ...draft, archived: v })}
          label="Hết hiệu lực"
          description="Bản cũ vẫn được giữ lại nhưng ẩn khỏi danh sách mặc định."
        />
      </div>
    </Modal>
  );
}
