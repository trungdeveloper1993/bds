import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate';
import type { Customer, Project, Property, Settings } from '../types';
import { db } from './db';
import { normalizeCustomer, normalizeProject, normalizeProperty, normalizeSettings } from './defaults';
import type { StoredFile, StoredImage } from './media';

const BACKUP_APP = 'bds-manager';
const BACKUP_VERSION = 1;

interface ImageMeta {
  id: string;
  width: number;
  height: number;
  createdAt: string;
}

interface FileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  path: string;
}

interface BackupJson {
  app: string;
  version: number;
  exportedAt: string;
  includesMedia: boolean;
  settings: Settings;
  projects: Project[];
  properties: Property[];
  customers: Customer[];
  images?: ImageMeta[];
  files?: FileMeta[];
}

export interface BackupData {
  settings: Settings;
  projects: Project[];
  properties: Property[];
  customers: Customer[];
}

export interface BackupContent extends BackupData {
  exportedAt: string;
  includesMedia: boolean;
  images: StoredImage[];
  files: StoredFile[];
}

function zipAsync(entries: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    // level 0: ảnh JPEG và PDF đã được nén sẵn, nén thêm chỉ tốn thời gian.
    zip(entries, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data))),
  );
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => unzip(data, (err, files) => (err ? reject(err) : resolve(files))));
}

const safeName = (name: string) =>
  name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'tai-lieu';

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Tạo file .zip: data.json + thư mục images/ + files/ (tài liệu giữ tên gốc). */
export async function createBackup(data: BackupData, includeMedia: boolean): Promise<Blob> {
  const entries: Zippable = {};
  const json: BackupJson = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesMedia: includeMedia,
    ...data,
  };

  if (includeMedia) {
    const [images, files] = await Promise.all([
      db.getAll<StoredImage>('images'),
      db.getAll<StoredFile>('files'),
    ]);
    json.images = [];
    json.files = [];
    for (const img of images) {
      entries[`images/${img.id}.jpg`] = await bytes(img.full);
      entries[`images/${img.id}.thumb.jpg`] = await bytes(img.thumb);
      json.images.push({ id: img.id, width: img.width, height: img.height, createdAt: img.createdAt });
    }
    for (const f of files) {
      const path = `files/${f.id}/${safeName(f.name)}`;
      entries[path] = await bytes(f.blob);
      json.files.push({ id: f.id, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, path });
    }
  }

  entries['data.json'] = strToU8(JSON.stringify(json, null, 1));
  const out = await zipAsync(entries);
  return new Blob([out as BlobPart], { type: 'application/zip' });
}

/** Đọc file sao lưu (.zip hoặc .json) và kiểm tra hợp lệ. */
export async function readBackup(file: File): Promise<BackupContent> {
  const raw = new Uint8Array(await file.arrayBuffer());
  let entries: Unzipped | null = null;
  let parsed: unknown;
  try {
    if (raw[0] === 0x50 && raw[1] === 0x4b) {
      entries = await unzipAsync(raw);
      const dataEntry = entries['data.json'];
      if (!dataEntry) throw new Error('missing data.json');
      parsed = JSON.parse(strFromU8(dataEntry));
    } else {
      parsed = JSON.parse(strFromU8(raw));
    }
  } catch {
    throw new Error('File không đúng định dạng sao lưu của ứng dụng.');
  }

  const j = parsed as Partial<BackupJson>;
  if (!j || j.app !== BACKUP_APP || !Array.isArray(j.properties) || !Array.isArray(j.customers)) {
    throw new Error('File không phải bản sao lưu của Quản Lý BĐS.');
  }

  const images: StoredImage[] = [];
  const files: StoredFile[] = [];
  if (entries) {
    for (const meta of j.images ?? []) {
      const full = entries[`images/${meta.id}.jpg`];
      const thumb = entries[`images/${meta.id}.thumb.jpg`];
      if (!full || !thumb) continue;
      images.push({
        id: meta.id,
        full: new Blob([full as BlobPart], { type: 'image/jpeg' }),
        thumb: new Blob([thumb as BlobPart], { type: 'image/jpeg' }),
        width: meta.width,
        height: meta.height,
        createdAt: meta.createdAt,
      });
    }
    for (const meta of j.files ?? []) {
      const content = entries[meta.path];
      if (!content) continue;
      files.push({
        id: meta.id,
        blob: new Blob([content as BlobPart], { type: meta.type }),
        name: meta.name,
        type: meta.type,
        size: meta.size,
        createdAt: meta.createdAt,
      });
    }
  }

  return {
    exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : '',
    includesMedia: j.includesMedia === true,
    settings: normalizeSettings(j.settings),
    projects: (j.projects ?? []).map(normalizeProject).filter((x): x is Project => x !== null),
    properties: j.properties.map(normalizeProperty).filter((x): x is Property => x !== null),
    customers: j.customers.map(normalizeCustomer).filter((x): x is Customer => x !== null),
    images,
    files,
  };
}
