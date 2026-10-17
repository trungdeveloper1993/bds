import { Download, Loader2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mapContext, resolveItem } from '../lib/maps';
import { canShareFiles, downloadBlob, formatBytes, shareFiles } from '../lib/media';
import { computeQuote, fmtPct, promotionActive, promotionValueText } from '../lib/pricing';
import { renderSheetPdf, renderSheetPng, type SheetBlock } from '../lib/sheet';
import { sheetFooter, unitSheetBlocks } from '../lib/sheetContent';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Project } from '../types';
import { Button, Checkbox, cn, Field, Modal, Segmented } from './ui';

/*
 * Gửi khách dạng file: phiếu được vẽ sẵn ngay khi mở hộp thoại (xem trước), nên nút "Chia sẻ" gọi được
 * trình chia sẻ của điện thoại ngay trong lần chạm (Safari trên iPhone đòi hỏi điều này).
 */

type Format = 'pdf' | 'png';

/** Tên file không dấu: "Căn A-12-05 Aurora" → "Can-A-12-05-Aurora". */
export const safeFileName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'phieu';

export function SheetExportModal({
  title,
  description,
  baseName,
  build,
  buildKey,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  baseName: string;
  build: () => Promise<SheetBlock[]>;
  /** Đổi khi nội dung phiếu đổi (tuỳ chọn, dữ liệu) — để vẽ lại. */
  buildKey: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { settings } = useData();
  const { toast } = useUI();
  const [format, setFormat] = useState<Format>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const buildRef = useRef(build);
  buildRef.current = build;
  const previewRef = useRef<string | null>(null);
  const canShare = useMemo(canShareFiles, []);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const blocks = await buildRef.current();
        const png = await renderSheetPng(blocks);
        const out = format === 'png' ? png : await renderSheetPdf(blocks, sheetFooter(settings));
        if (!alive) return;
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = URL.createObjectURL(png);
        setPreview(previewRef.current);
        setFile(new File([out], `${safeFileName(baseName)}.${format}`, { type: out.type }));
        setError('');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [buildKey, format, baseName, settings]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const share = async () => {
    if (!file) return;
    const result = await shareFiles([file], title);
    if (result === 'unsupported') {
      downloadBlob(file, file.name);
      toast('Thiết bị không hỗ trợ chia sẻ file — đã tải file về máy', 'info');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={title}
      description={description ?? 'Phiếu do ứng dụng tạo, không kèm đường link web — gửi thẳng cho khách qua Zalo, Messenger, email.'}
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">{file && !busy ? `${file.name} · ${formatBytes(file.size)}` : busy ? 'Đang tạo file…' : ''}</span>
          <Button icon={Download} disabled={!file || busy} onClick={() => file && downloadBlob(file, file.name)}>
            Tải về
          </Button>
          {canShare && (
            <Button variant="primary" icon={Share2} disabled={!file || busy} onClick={() => void share()}>
              Chia sẻ (Zalo…)
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Field label="Định dạng">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'pdf', label: 'PDF (in được, A4)' },
                { value: 'png', label: 'Ảnh PNG (xem trên điện thoại)' },
              ]}
            />
          </Field>
          {children}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        </div>
        <div className="relative max-h-[60dvh] min-h-48 overflow-y-auto rounded-xl bg-slate-100 p-3 ring-1 ring-inset ring-slate-200">
          {preview && <img src={preview} alt="Xem trước phiếu" className={cn('w-full rounded-md bg-white shadow transition', busy && 'opacity-60')} />}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={26} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Gửi chi tiết một căn (kèm giá sau ưu đãi & dòng tiền) cho khách. */
export function UnitShareModal({
  project,
  code,
  initial,
  onClose,
}: {
  project: Project;
  code: string;
  initial?: { methodId?: string; promoIds?: string[]; price?: number };
  onClose: () => void;
}) {
  const { properties, settings } = useData();
  const { privacy } = useUI();
  const units = useMemo(() => properties.filter((p) => p.projectId === project.id), [properties, project.id]);
  const unit = useMemo(() => resolveItem(mapContext(project, units), code), [project, units, code]);
  const hidePrice = privacy && settings.mapHidePrice;
  const sales = project.sales;
  const promos = sales.promotions.filter((p) => !(privacy && p.internal));
  const [methodId, setMethodId] = useState(initial?.methodId ?? sales.methods[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>(() => initial?.promoIds ?? promos.filter((p) => p.auto && promotionActive(p)).map((p) => p.id));
  const [withQuote, setWithQuote] = useState(true);
  const [withLayout, setWithLayout] = useState(true);
  const [withProgress, setWithProgress] = useState(sales.milestones.length > 0);
  const method = sales.methods.find((m) => m.id === methodId);
  const price = initial?.price ?? unit.price;
  const chosen = promos.filter((p) => picked.includes(p.id));

  const build = () => {
    const quote = !hidePrice && withQuote && price ? computeQuote(price, sales, method, chosen) : null;
    return unitSheetBlocks({ project, unit, settings, price, quote, method, hidePrice, includeLayout: withLayout, includeProgress: withProgress });
  };
  const buildKey = JSON.stringify([project.updatedAt, units.length, code, methodId, picked, withQuote, withLayout, withProgress, price, hidePrice]);

  return (
    <SheetExportModal
      title={code ? `Gửi khách: căn ${code}` : 'Gửi khách: bảng tính giá'}
      baseName={`${code ? `Can-${code}` : 'Bang-tinh-gia'}-${project.name}`}
      build={build}
      buildKey={buildKey}
      onClose={onClose}
    >
      {!hidePrice && price ? (
        <>
          <Checkbox checked={withQuote} onChange={setWithQuote} label="Kèm giá sau ưu đãi & dòng tiền từng đợt" />
          {withQuote && sales.methods.length > 0 && (
            <Field label="Phương thức thanh toán">
              <div className="flex flex-wrap gap-1.5">
                {sales.methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    aria-pressed={method?.id === m.id}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition',
                      method?.id === m.id ? 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-500/20' : 'border-slate-200 text-slate-700 hover:border-slate-300',
                    )}
                  >
                    {m.name}
                    {m.discountPct > 0 && <span className="ml-1 text-emerald-700">−{fmtPct(m.discountPct)}</span>}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {withQuote && promos.length > 0 && (
            <Field label="Ưu đãi áp dụng">
              <div className="space-y-2">
                {promos.map((p) => (
                  <Checkbox
                    key={p.id}
                    checked={picked.includes(p.id)}
                    onChange={(on) => setPicked((s) => (on ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                    label={
                      <span className={cn(!promotionActive(p) && 'text-slate-400 line-through')}>
                        <b className={p.kind === 'gift' ? 'text-violet-700' : 'text-emerald-700'}>{promotionValueText(p)}</b> {p.name}
                      </span>
                    }
                  />
                ))}
              </div>
            </Field>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-500">{hidePrice ? 'Giá đang ẩn ở chế độ khách xem — phiếu ghi "Liên hệ".' : 'Căn chưa có giá trong bảng hàng.'}</p>
      )}
      {unit.imageId && <Checkbox checked={withLayout} onChange={setWithLayout} label="Kèm hình mẫu căn" />}
      {sales.milestones.length > 0 && <Checkbox checked={withProgress} onChange={setWithProgress} label="Kèm tiến độ dự án" />}
    </SheetExportModal>
  );
}
