import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BackupContent } from '../lib/backup';
import { db, requestPersistentStorage } from '../lib/db';
import {
  defaultSettings,
  normalizeCustomer,
  normalizeProject,
  normalizeProperty,
  normalizeSettings,
} from '../lib/defaults';
import { nextCode, uid } from '../lib/id';
import { projectImageIds } from '../lib/maps';
import {
  collectGarbage,
  deleteFiles,
  deleteImages,
  duplicateImages,
  isImageFile,
  saveFile,
  saveImage,
  type StoredFile,
  type StoredImage,
} from '../lib/media';
import type { Customer, DocumentRef, Project, Property, Settings } from '../types';

export type MediaOwner = { kind: 'project' | 'property'; id: string };

interface DataState {
  projects: Project[];
  properties: Property[];
  customers: Customer[];
  settings: Settings;
}

export interface UploadResult {
  added: number;
  failed: Array<{ name: string; reason: string }>;
}

export interface RestoreSummary {
  projects: number;
  properties: number;
  customers: number;
  images: number;
  files: number;
}

type DocumentDefaults = Partial<Omit<DocumentRef, 'id' | 'name' | 'size' | 'type' | 'createdAt'>>;

interface DataContextValue extends DataState {
  status: 'loading' | 'ready' | 'error';
  error: string;
  projectById: Map<string, Project>;
  propertyById: Map<string, Property>;
  customerById: Map<string, Customer>;

  saveProject(project: Project): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  saveProperty(property: Property): Promise<Property>;
  deleteProperty(id: string): Promise<void>;
  duplicateProperty(id: string): Promise<Property>;
  saveCustomer(customer: Customer): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  /** Sửa nhanh trên bản ghi mới nhất (an toàn khi có thao tác khác đang chạy). */
  patchProject(id: string, fn: (current: Project) => Partial<Project>): Promise<void>;
  patchProperty(id: string, fn: (current: Property) => Partial<Property>): Promise<void>;
  patchCustomer(id: string, fn: (current: Customer) => Partial<Customer>): Promise<void>;
  /** Sửa nhiều khách một lần (gắn nhãn, ghi nhật ký gửi tin nhóm); fn trả về null = giữ nguyên. Trả về số khách đã sửa. */
  patchCustomers(ids: string[], fn: (current: Customer) => Partial<Customer> | null): Promise<number>;
  updateSettings(patch: Partial<Settings>): Promise<void>;

  addImages(owner: MediaOwner, files: File[], onProgress?: (done: number, total: number) => void): Promise<UploadResult>;
  setImages(owner: MediaOwner, images: string[]): Promise<void>;
  addDocuments(
    owner: MediaOwner,
    files: File[],
    defaults: DocumentDefaults,
    onProgress?: (done: number, total: number) => void,
  ): Promise<UploadResult>;
  updateDocument(owner: MediaOwner, docId: string, patch: Partial<DocumentRef>): Promise<void>;
  removeDocument(owner: MediaOwner, docId: string): Promise<void>;

  restoreBackup(content: BackupContent, mode: 'merge' | 'replace'): Promise<RestoreSummary>;
  wipeAll(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const EMPTY: DataState = { projects: [], properties: [], customers: [], settings: defaultSettings() };

const byUpdatedDesc = <T extends { updatedAt: string }>(a: T, b: T) => (a.updatedAt < b.updatedAt ? 1 : -1);

/** Thay bản ghi cùng id, hoặc thêm lên đầu danh sách (mới nhất trước). */
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return [item, ...list.filter((x) => x.id !== item.id)];
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadState(): Promise<DataState> {
  const [projects, properties, customers, settings] = await Promise.all([
    db.getAll<unknown>('projects'),
    db.getAll<unknown>('properties'),
    db.getAll<unknown>('customers'),
    db.get<unknown>('meta', 'settings'),
  ]);
  return {
    projects: projects.map(normalizeProject).filter((x): x is Project => x !== null).sort(byUpdatedDesc),
    properties: properties.map(normalizeProperty).filter((x): x is Property => x !== null).sort(byUpdatedDesc),
    customers: customers.map(normalizeCustomer).filter((x): x is Customer => x !== null).sort(byUpdatedDesc),
    settings: normalizeSettings(settings),
  };
}

/** Khi gộp bản sao lưu: mã trùng với bản ghi khác trên máy thì cấp mã mới. */
function renumber<T extends { id: string; code: string }>(incoming: T[], local: T[], prefix: string): T[] {
  const localIds = new Set(local.map((x) => x.id));
  const codes = new Map(local.map((x) => [x.code, x.id]));
  const allCodes = [...local.map((x) => x.code), ...incoming.map((x) => x.code)];
  return incoming.map((item) => {
    const owner = codes.get(item.code);
    if (!localIds.has(item.id) && (!item.code || (owner && owner !== item.id))) {
      const code = nextCode(prefix, allCodes);
      allCodes.push(code);
      return { ...item, code };
    }
    return item;
  });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  // Nguồn dữ liệu đúng nhất cho các thao tác bất đồng bộ (không phụ thuộc lần render).
  const ref = useRef<DataState>(EMPTY);
  const commit = useCallback((fn: (s: DataState) => DataState) => {
    ref.current = fn(ref.current);
    setState(ref.current);
  }, []);

  // Báo cho các tab khác đang mở ứng dụng tải lại dữ liệu sau mỗi lần ghi.
  const channel = useRef<BroadcastChannel | null>(null);

  // Mọi thao tác ghi chạy lần lượt để không ghi đè lẫn nhau.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  const exclusive = useCallback(
    <T,>(task: () => Promise<T>): Promise<T> =>
      enqueue(task).then((result) => {
        channel.current?.postMessage('changed');
        return result;
      }),
    [enqueue],
  );

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('bds-manager-sync');
    channel.current = ch;
    let timer: number | undefined;
    ch.onmessage = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void enqueue(async () => {
          const loaded = await loadState();
          commit(() => loaded);
        }).catch(() => undefined);
      }, 200);
    };
    return () => {
      window.clearTimeout(timer);
      ch.close();
      channel.current = null;
    };
  }, [commit, enqueue]);

  const persistAsked = useRef(false);
  const askPersist = useCallback(() => {
    if (persistAsked.current) return;
    persistAsked.current = true;
    void requestPersistentStorage();
  }, []);

  useEffect(() => {
    let alive = true;
    loadState()
      .then(async (loaded) => {
        if (!alive) return;
        commit(() => loaded);
        setStatus('ready');
        // Dọn ảnh / file mồ côi (chỉ chạy lúc khởi động, khi chưa có thao tác nào).
        const usedImages = new Set([...loaded.projects.flatMap(projectImageIds), ...loaded.properties.flatMap((x) => x.images)]);
        const usedFiles = new Set([...loaded.projects, ...loaded.properties].flatMap((x) => x.documents.map((d) => d.id)));
        await collectGarbage(usedImages, usedFiles).catch(() => 0);
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [commit]);

  // ---------------------------------------------------------------- Dự án
  const saveProject = useCallback(
    (project: Project) =>
      exclusive(async () => {
        const s = ref.current;
        const existing = project.id ? s.projects.find((x) => x.id === project.id) : undefined;
        const now = new Date().toISOString();
        const record: Project = {
          ...project,
          id: project.id || uid(),
          code: project.code || nextCode('DA', s.projects.map((x) => x.code)),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await db.put('projects', record);
        commit((st) => ({ ...st, projects: upsert(st.projects, record) }));
        askPersist();
        return record;
      }),
    [askPersist, commit, exclusive],
  );

  const deleteProject = useCallback(
    (id: string) =>
      exclusive(async () => {
        const s = ref.current;
        const project = s.projects.find((x) => x.id === id);
        if (!project) return;
        const now = new Date().toISOString();
        // BĐS trong dự án được giữ lại dưới dạng BĐS lẻ.
        const units = s.properties.filter((p) => p.projectId === id).map((p) => ({ ...p, projectId: '', updatedAt: now }));
        const customers = s.customers
          .filter((c) => c.projectIds.includes(id))
          .map((c) => ({ ...c, projectIds: c.projectIds.filter((x) => x !== id), updatedAt: now }));
        await db.delete('projects', id);
        await db.putMany('properties', units);
        await db.putMany('customers', customers);
        commit((st) => ({
          ...st,
          projects: st.projects.filter((x) => x.id !== id),
          properties: st.properties.map((p) => units.find((u) => u.id === p.id) ?? p),
          customers: st.customers.map((c) => customers.find((u) => u.id === c.id) ?? c),
        }));
        await deleteImages(projectImageIds(project));
        await deleteFiles(project.documents.map((d) => d.id));
      }),
    [commit, exclusive],
  );

  // ---------------------------------------------------------------- BĐS
  const saveProperty = useCallback(
    (property: Property) =>
      exclusive(async () => {
        const s = ref.current;
        const existing = property.id ? s.properties.find((x) => x.id === property.id) : undefined;
        const now = new Date().toISOString();
        const closedAt =
          property.status === 'hoan_tat'
            ? existing?.status === 'hoan_tat'
              ? (existing.closedAt ?? now)
              : now
            : undefined;
        const record: Property = {
          ...property,
          id: property.id || uid(),
          code: property.code || nextCode('BDS', s.properties.map((x) => x.code)),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          closedAt,
        };
        await db.put('properties', record);
        commit((st) => ({ ...st, properties: upsert(st.properties, record) }));
        askPersist();
        return record;
      }),
    [askPersist, commit, exclusive],
  );

  const deleteProperty = useCallback(
    (id: string) =>
      exclusive(async () => {
        const s = ref.current;
        const property = s.properties.find((x) => x.id === id);
        if (!property) return;
        const now = new Date().toISOString();
        const customers = s.customers
          .filter((c) => c.interests.some((i) => i.propertyId === id))
          .map((c) => ({ ...c, interests: c.interests.filter((i) => i.propertyId !== id), updatedAt: now }));
        await db.delete('properties', id);
        await db.putMany('customers', customers);
        commit((st) => ({
          ...st,
          properties: st.properties.filter((x) => x.id !== id),
          customers: st.customers.map((c) => customers.find((u) => u.id === c.id) ?? c),
        }));
        await deleteImages(property.images);
        await deleteFiles(property.documents.map((d) => d.id));
      }),
    [commit, exclusive],
  );

  const duplicateProperty = useCallback(
    (id: string) =>
      exclusive(async () => {
        const s = ref.current;
        const source = s.properties.find((x) => x.id === id);
        if (!source) throw new Error('Không tìm thấy BĐS cần nhân bản.');
        const images = await duplicateImages(source.images);
        const now = new Date().toISOString();
        const copy: Property = {
          ...source,
          id: uid(),
          code: nextCode('BDS', s.properties.map((x) => x.code)),
          title: source.title ? `${source.title} (bản sao)` : '',
          status: 'dang_chao',
          images,
          documents: [],
          createdAt: now,
          updatedAt: now,
          closedAt: undefined,
        };
        await db.put('properties', copy);
        commit((st) => ({ ...st, properties: upsert(st.properties, copy) }));
        return copy;
      }),
    [commit, exclusive],
  );

  // ---------------------------------------------------------------- Khách hàng
  const saveCustomer = useCallback(
    (customer: Customer) =>
      exclusive(async () => {
        const s = ref.current;
        const existing = customer.id ? s.customers.find((x) => x.id === customer.id) : undefined;
        const now = new Date().toISOString();
        const record: Customer = {
          ...customer,
          id: customer.id || uid(),
          code: customer.code || nextCode('KH', s.customers.map((x) => x.code)),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await db.put('customers', record);
        commit((st) => ({ ...st, customers: upsert(st.customers, record) }));
        askPersist();
        return record;
      }),
    [askPersist, commit, exclusive],
  );

  const deleteCustomer = useCallback(
    (id: string) =>
      exclusive(async () => {
        await db.delete('customers', id);
        commit((st) => ({ ...st, customers: st.customers.filter((x) => x.id !== id) }));
      }),
    [commit, exclusive],
  );

  const patchProject = useCallback(
    (id: string, fn: (current: Project) => Partial<Project>) =>
      exclusive(async () => {
        const current = ref.current.projects.find((x) => x.id === id);
        if (!current) throw new Error('Dự án không còn tồn tại.');
        const next: Project = { ...current, ...fn(current), id, updatedAt: new Date().toISOString() };
        await db.put('projects', next);
        commit((st) => ({ ...st, projects: upsert(st.projects, next) }));
      }),
    [commit, exclusive],
  );

  const patchProperty = useCallback(
    (id: string, fn: (current: Property) => Partial<Property>) =>
      exclusive(async () => {
        const current = ref.current.properties.find((x) => x.id === id);
        if (!current) throw new Error('BĐS không còn tồn tại.');
        const now = new Date().toISOString();
        const merged: Property = { ...current, ...fn(current), id, updatedAt: now };
        merged.closedAt = merged.status === 'hoan_tat' ? (current.status === 'hoan_tat' ? (current.closedAt ?? now) : now) : undefined;
        await db.put('properties', merged);
        commit((st) => ({ ...st, properties: upsert(st.properties, merged) }));
      }),
    [commit, exclusive],
  );

  const patchCustomer = useCallback(
    (id: string, fn: (current: Customer) => Partial<Customer>) =>
      exclusive(async () => {
        const current = ref.current.customers.find((x) => x.id === id);
        if (!current) throw new Error('Khách hàng không còn tồn tại.');
        const next: Customer = { ...current, ...fn(current), id, updatedAt: new Date().toISOString() };
        await db.put('customers', next);
        commit((st) => ({ ...st, customers: upsert(st.customers, next) }));
      }),
    [commit, exclusive],
  );

  const patchCustomers = useCallback(
    (ids: string[], fn: (current: Customer) => Partial<Customer> | null) =>
      exclusive(async () => {
        const wanted = new Set(ids);
        const now = new Date().toISOString();
        const changed: Customer[] = [];
        for (const current of ref.current.customers) {
          if (!wanted.has(current.id)) continue;
          const patch = fn(current);
          if (patch) changed.push({ ...current, ...patch, id: current.id, updatedAt: now });
        }
        await db.putMany('customers', changed);
        const byId = new Map(changed.map((c) => [c.id, c]));
        commit((st) => ({ ...st, customers: [...changed, ...st.customers.filter((c) => !byId.has(c.id))] }));
        return changed.length;
      }),
    [commit, exclusive],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      exclusive(async () => {
        const settings = { ...ref.current.settings, ...patch };
        await db.put('meta', settings, 'settings');
        commit((st) => ({ ...st, settings }));
      }),
    [commit, exclusive],
  );

  // ---------------------------------------------------------------- Ảnh & tài liệu
  type MediaPatch = Partial<Pick<Project, 'images' | 'documents'>>;

  const mutateOwner = useCallback(
    (owner: MediaOwner, fn: (rec: { images: string[]; documents: DocumentRef[] }) => MediaPatch) =>
      exclusive(async () => {
        const now = new Date().toISOString();
        if (owner.kind === 'project') {
          const current = ref.current.projects.find((x) => x.id === owner.id);
          if (!current) throw new Error('Dự án không còn tồn tại.');
          const next: Project = { ...current, ...fn(current), updatedAt: now };
          await db.put('projects', next);
          commit((st) => ({ ...st, projects: upsert(st.projects, next) }));
        } else {
          const current = ref.current.properties.find((x) => x.id === owner.id);
          if (!current) throw new Error('BĐS không còn tồn tại.');
          const next: Property = { ...current, ...fn(current), updatedAt: now };
          await db.put('properties', next);
          commit((st) => ({ ...st, properties: upsert(st.properties, next) }));
        }
      }),
    [commit, exclusive],
  );

  const addImages = useCallback(
    async (owner: MediaOwner, files: File[], onProgress?: (done: number, total: number) => void) => {
      const result: UploadResult = { added: 0, failed: [] };
      let done = 0;
      for (const file of files) {
        let imageId = '';
        try {
          if (!isImageFile(file)) throw new Error('Không phải file ảnh');
          imageId = await saveImage(file);
          const id = imageId;
          await mutateOwner(owner, (rec) => ({ images: [...rec.images, id] }));
          result.added++;
        } catch (e) {
          if (imageId) await deleteImages([imageId]).catch(() => undefined);
          result.failed.push({ name: file.name, reason: errorMessage(e) });
        }
        onProgress?.(++done, files.length);
      }
      askPersist();
      return result;
    },
    [askPersist, mutateOwner],
  );

  const setImages = useCallback(
    async (owner: MediaOwner, images: string[]) => {
      let removed: string[] = [];
      await mutateOwner(owner, (rec) => {
        removed = rec.images.filter((id) => !images.includes(id));
        return { images };
      });
      await deleteImages(removed);
    },
    [mutateOwner],
  );

  const addDocuments = useCallback(
    async (
      owner: MediaOwner,
      files: File[],
      defaults: DocumentDefaults,
      onProgress?: (done: number, total: number) => void,
    ) => {
      const result: UploadResult = { added: 0, failed: [] };
      let done = 0;
      for (const file of files) {
        let fileId = '';
        try {
          const meta = await saveFile(file);
          fileId = meta.id;
          const doc: DocumentRef = {
            category: 'khac',
            visibility: owner.kind === 'project' ? 'public' : 'internal',
            note: '',
            effectiveDate: '',
            archived: false,
            ...defaults,
            id: meta.id,
            name: meta.name,
            size: meta.size,
            type: meta.type,
            createdAt: meta.createdAt,
          };
          await mutateOwner(owner, (rec) => ({ documents: [doc, ...rec.documents] }));
          result.added++;
        } catch (e) {
          if (fileId) await deleteFiles([fileId]).catch(() => undefined);
          result.failed.push({ name: file.name, reason: errorMessage(e) });
        }
        onProgress?.(++done, files.length);
      }
      askPersist();
      return result;
    },
    [askPersist, mutateOwner],
  );

  const updateDocument = useCallback(
    (owner: MediaOwner, docId: string, patch: Partial<DocumentRef>) =>
      mutateOwner(owner, (rec) => ({
        documents: rec.documents.map((d) => (d.id === docId ? { ...d, ...patch, id: d.id } : d)),
      })),
    [mutateOwner],
  );

  const removeDocument = useCallback(
    async (owner: MediaOwner, docId: string) => {
      await mutateOwner(owner, (rec) => ({ documents: rec.documents.filter((d) => d.id !== docId) }));
      await deleteFiles([docId]);
    },
    [mutateOwner],
  );

  // ---------------------------------------------------------------- Sao lưu
  const restoreBackup = useCallback(
    (content: BackupContent, mode: 'merge' | 'replace') =>
      exclusive(async () => {
        let summary: RestoreSummary;
        if (mode === 'replace') {
          await db.clear(['projects', 'properties', 'customers', 'images', 'files', 'meta']);
          await db.putMany('projects', content.projects);
          await db.putMany('properties', content.properties);
          await db.putMany('customers', content.customers);
          await db.putMany('images', content.images);
          await db.putMany('files', content.files);
          await db.put('meta', content.settings, 'settings');
          summary = {
            projects: content.projects.length,
            properties: content.properties.length,
            customers: content.customers.length,
            images: content.images.length,
            files: content.files.length,
          };
        } else {
          const s = ref.current;
          const newer = <T extends { id: string; updatedAt: string }>(incoming: T[], local: T[]) => {
            const map = new Map(local.map((x) => [x.id, x]));
            return incoming.filter((x) => {
              const mine = map.get(x.id);
              return !mine || x.updatedAt > mine.updatedAt;
            });
          };
          const projects = renumber(newer(content.projects, s.projects), s.projects, 'DA');
          const properties = renumber(newer(content.properties, s.properties), s.properties, 'BDS');
          const customers = renumber(newer(content.customers, s.customers), s.customers, 'KH');
          const [imageKeys, fileKeys] = await Promise.all([db.getAllKeys('images'), db.getAllKeys('files')]);
          const haveImages = new Set(imageKeys.map(String));
          const haveFiles = new Set(fileKeys.map(String));
          const images: StoredImage[] = content.images.filter((x) => !haveImages.has(x.id));
          const files: StoredFile[] = content.files.filter((x) => !haveFiles.has(x.id));
          await db.putMany('projects', projects);
          await db.putMany('properties', properties);
          await db.putMany('customers', customers);
          await db.putMany('images', images);
          await db.putMany('files', files);
          // Chỉ điền các mục cài đặt còn trống trên máy này.
          const merged: Settings = { ...s.settings };
          const fill = merged as unknown as Record<string, unknown>;
          for (const key of Object.keys(merged) as Array<keyof Settings>) {
            const theirs = content.settings[key];
            if (typeof merged[key] === 'string' && !merged[key] && typeof theirs === 'string' && theirs) fill[key] = theirs;
          }
          // Mẫu tin tự soạn trong file sao lưu được thêm vào (mẫu cùng id trên máy này giữ nguyên).
          const ownTemplates = new Set(merged.messageTemplates.map((t) => t.id));
          merged.messageTemplates = [...merged.messageTemplates, ...content.settings.messageTemplates.filter((t) => !ownTemplates.has(t.id))];
          await db.put('meta', merged, 'settings');
          summary = {
            projects: projects.length,
            properties: properties.length,
            customers: customers.length,
            images: images.length,
            files: files.length,
          };
        }
        const loaded = await loadState();
        commit(() => loaded);
        return summary;
      }),
    [commit, exclusive],
  );

  const wipeAll = useCallback(
    () =>
      exclusive(async () => {
        await db.clear(['projects', 'properties', 'customers', 'images', 'files', 'meta']);
        commit(() => ({ ...EMPTY, settings: defaultSettings() }));
      }),
    [commit, exclusive],
  );

  const projectById = useMemo(() => new Map(state.projects.map((x) => [x.id, x])), [state.projects]);
  const propertyById = useMemo(() => new Map(state.properties.map((x) => [x.id, x])), [state.properties]);
  const customerById = useMemo(() => new Map(state.customers.map((x) => [x.id, x])), [state.customers]);

  const value: DataContextValue = {
    ...state,
    status,
    error,
    projectById,
    propertyById,
    customerById,
    saveProject,
    deleteProject,
    saveProperty,
    deleteProperty,
    duplicateProperty,
    saveCustomer,
    deleteCustomer,
    patchProject,
    patchProperty,
    patchCustomer,
    patchCustomers,
    updateSettings,
    addImages,
    setImages,
    addDocuments,
    updateDocument,
    removeDocument,
    restoreBackup,
    wipeAll,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
