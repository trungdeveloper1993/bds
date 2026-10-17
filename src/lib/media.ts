import { db } from './db';
import { uid } from './id';

/** Ảnh đã nén: bản lớn để xem, bản nhỏ cho danh sách. */
export interface StoredImage {
  id: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: string;
}

/** Tài liệu giữ nguyên file gốc (PDF, Word, Excel, ảnh...). */
export interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export type ImageVariant = 'thumb' | 'full';

const FULL_MAX = 1920;
const THUMB_MAX = 560;

// ---------------------------------------------------------------------------
// Ảnh
// ---------------------------------------------------------------------------

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // Một số trình duyệt cũ không hỗ trợ tuỳ chọn trên — thử cách khác.
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Không đọc được ảnh này (định dạng chưa hỗ trợ, ví dụ HEIC trên máy tính).');
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number, maxSize: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  ctx.fillStyle = '#ffffff'; // nền trắng cho ảnh PNG trong suốt
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh.'))), 'image/jpeg', quality),
  );
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}

/** Nén ảnh (tối đa 1920px) + tạo ảnh thu nhỏ, lưu vào IndexedDB, trả về id. */
export async function saveImage(file: Blob): Promise<string> {
  return (await saveImageSized(file)).id;
}

/**
 * Như saveImage nhưng cho chọn cỡ / chất lượng và trả về kích thước ảnh.
 * Bản đồ mặt bằng cần nét hơn (tối đa 4000px) để phóng to vẫn đọc được số căn.
 */
export async function saveImageSized(
  file: Blob,
  options: { maxSize?: number; quality?: number } = {},
): Promise<{ id: string; width: number; height: number }> {
  const decoded = await decodeImage(file);
  try {
    const fullCanvas = drawScaled(decoded.source, decoded.width, decoded.height, options.maxSize ?? FULL_MAX);
    // Thu nhỏ từ bản lớn để ảnh mịn hơn so với thu nhỏ một bước.
    const thumbCanvas = drawScaled(fullCanvas, fullCanvas.width, fullCanvas.height, THUMB_MAX);
    const [full, thumb] = await Promise.all([toJpeg(fullCanvas, options.quality ?? 0.82), toJpeg(thumbCanvas, 0.76)]);
    const record: StoredImage = {
      id: uid(),
      full,
      thumb,
      width: fullCanvas.width,
      height: fullCanvas.height,
      createdAt: new Date().toISOString(),
    };
    await db.put('images', record);
    return { id: record.id, width: record.width, height: record.height };
  } finally {
    decoded.release();
  }
}

const imageUrls = new Map<string, string>();
const imageLoads = new Map<string, Promise<string | null>>();
const imageKey = (id: string, variant: ImageVariant) => `${id}:${variant}`;

/** URL đã có sẵn trong bộ nhớ đệm (để hiển thị ngay, không nhấp nháy). */
export function peekImageUrl(id: string, variant: ImageVariant): string | undefined {
  return imageUrls.get(imageKey(id, variant));
}

export function loadImageUrl(id: string, variant: ImageVariant): Promise<string | null> {
  const key = imageKey(id, variant);
  const ready = imageUrls.get(key);
  if (ready) return Promise.resolve(ready);
  let pending = imageLoads.get(key);
  if (!pending) {
    pending = db
      .get<StoredImage>('images', id)
      .then((rec) => {
        if (!rec) return null;
        const url = URL.createObjectURL(rec[variant]);
        imageUrls.set(key, url);
        return url;
      })
      .catch(() => null)
      .finally(() => imageLoads.delete(key));
    imageLoads.set(key, pending);
  }
  return pending;
}

function forgetImage(id: string) {
  for (const variant of ['thumb', 'full'] as const) {
    const key = imageKey(id, variant);
    const url = imageUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    imageUrls.delete(key);
  }
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete('images', ids);
  ids.forEach(forgetImage);
}

/** Sao chép ảnh sang id mới (dùng khi nhân bản BĐS). */
export async function duplicateImages(ids: string[]): Promise<string[]> {
  const copies: StoredImage[] = [];
  for (const id of ids) {
    const rec = await db.get<StoredImage>('images', id);
    if (rec) copies.push({ ...rec, id: uid(), createdAt: new Date().toISOString() });
  }
  await db.putMany('images', copies);
  return copies.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Tài liệu
// ---------------------------------------------------------------------------

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  txt: 'text/plain',
  csv: 'text/csv',
  dwg: 'application/acad',
};

export function guessMimeType(name: string, fallback = ''): string {
  if (fallback) return fallback;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? 'application/octet-stream';
}

export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'slide' | 'video' | 'archive' | 'other';

export function fileKind(type: string, name = ''): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (/word|msword/.test(type) || ['doc', 'docx'].includes(ext)) return 'word';
  if (/excel|spreadsheet|csv/.test(type) || ['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (/powerpoint|presentation/.test(type) || ['ppt', 'pptx'].includes(ext)) return 'slide';
  if (/zip|rar|7z|compressed/.test(type) || ['zip', 'rar', '7z'].includes(ext)) return 'archive';
  return 'other';
}

/** Trình duyệt có tự mở xem được loại file này không. */
export function isPreviewable(type: string): boolean {
  return type === 'application/pdf' || type.startsWith('image/') || type.startsWith('video/') || type.startsWith('text/');
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: value >= 10 || i === 0 ? 0 : 1 })} ${units[i]}`;
}

export interface SavedFileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export async function saveFile(file: File): Promise<SavedFileMeta> {
  const record: StoredFile = {
    id: uid(),
    blob: file,
    name: file.name || 'tai-lieu',
    type: guessMimeType(file.name, file.type),
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  await db.put('files', record);
  return { id: record.id, name: record.name, type: record.type, size: record.size, createdAt: record.createdAt };
}

const fileUrls = new Map<string, string>();
const fileLoads = new Map<string, Promise<string | null>>();

export function peekFileUrl(id: string): string | undefined {
  return fileUrls.get(id);
}

export function loadFileUrl(id: string): Promise<string | null> {
  const ready = fileUrls.get(id);
  if (ready) return Promise.resolve(ready);
  let pending = fileLoads.get(id);
  if (!pending) {
    pending = db
      .get<StoredFile>('files', id)
      .then((rec) => {
        if (!rec) return null;
        const blob = rec.blob.type === rec.type ? rec.blob : new Blob([rec.blob], { type: rec.type });
        const url = URL.createObjectURL(blob);
        fileUrls.set(id, url);
        return url;
      })
      .catch(() => null)
      .finally(() => fileLoads.delete(id));
    fileLoads.set(id, pending);
  }
  return pending;
}

/** Lấy file để chia sẻ (Zalo, email...) qua Web Share API. */
export async function getShareableFile(id: string, name: string): Promise<File | null> {
  const rec = await db.get<StoredFile>('files', id);
  if (!rec) return null;
  return new File([rec.blob], name || rec.name, { type: rec.type });
}

export async function deleteFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete('files', ids);
  for (const id of ids) {
    const url = fileUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    fileUrls.delete(id);
  }
}

/**
 * Dọn ảnh / file không còn được bản ghi nào tham chiếu. Chỉ xoá bản cũ hơn 1 giờ để
 * không đụng vào file vừa tải lên (kể cả đang tải ở một tab khác).
 */
export async function collectGarbage(usedImages: Set<string>, usedFiles: Set<string>): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [images, files] = await Promise.all([db.getAll<StoredImage>('images'), db.getAll<StoredFile>('files')]);
  const orphanImages = images.filter((x) => !usedImages.has(x.id) && x.createdAt < cutoff).map((x) => x.id);
  const orphanFiles = files.filter((x) => !usedFiles.has(x.id) && x.createdAt < cutoff).map((x) => x.id);
  await Promise.all([deleteImages(orphanImages), deleteFiles(orphanFiles)]);
  return orphanImages.length + orphanFiles.length;
}

export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })
    );
  } catch {
    return false;
  }
}

export async function shareFiles(files: File[], title?: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!files.length || typeof navigator.share !== 'function') return 'unsupported';
  try {
    if (navigator.canShare && !navigator.canShare({ files })) return 'unsupported';
    await navigator.share({ files, title });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
