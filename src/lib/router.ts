import { useEffect, useSyncExternalStore } from 'react';

/**
 * Bộ định tuyến dạng hash (#/du-an/123) — chạy được trên GitHub Pages
 * mà không cần cấu hình máy chủ, tải lại trang vẫn giữ đúng màn hình.
 */

function readHash(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

let current = readHash();
const listeners = new Set<() => void>();
/** Số bước đã điều hướng bên trong ứng dụng (để biết nút "Quay lại" có trang trước hay không). */
let depth = 0;

type Blocker = () => boolean;
let blocker: Blocker | null = null;

function emit() {
  current = readHash();
  listeners.forEach((l) => l());
}

function onHistoryChange() {
  const next = readHash();
  if (next === current) return;
  // Người dùng bấm Back/Forward khi đang nhập dở: hỏi lại, nếu huỷ thì quay về.
  if (blocker && !blocker()) {
    history.pushState(null, '', `#${current}`);
    return;
  }
  depth = Math.max(0, depth - 1);
  emit();
}

// Trình duyệt có thể bắn một hoặc cả hai sự kiện; onHistoryChange tự bỏ qua lần trùng.
window.addEventListener('hashchange', onHistoryChange);
window.addEventListener('popstate', onHistoryChange);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface Location {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

let cachedHash = '';
let cachedLocation: Location = parse('/');

function parse(hash: string): Location {
  const [path, search = ''] = hash.split('?');
  return {
    path,
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(search),
  };
}

function getSnapshot(): Location {
  if (current !== cachedHash) {
    cachedHash = current;
    cachedLocation = parse(current);
  }
  return cachedLocation;
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (target === current) return;
  if (blocker && !blocker()) return;
  if (options.replace) {
    history.replaceState(null, '', `#${target}`);
  } else {
    history.pushState(null, '', `#${target}`);
    depth++;
  }
  emit();
}

/** Quay lại trang trước trong ứng dụng; nếu mở thẳng từ đường dẫn thì về trang dự phòng. */
export function goBack(fallback: string): void {
  if (depth > 0) {
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

/** Hỏi xác nhận trước khi rời trang khi có thay đổi chưa lưu. */
export function useUnsavedChangesGuard(when: boolean, message = 'Bạn có thay đổi chưa lưu. Rời trang này?'): void {
  useEffect(() => {
    if (!when) return;
    const confirmLeave: Blocker = () => window.confirm(message);
    blocker = confirmLeave;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      if (blocker === confirmLeave) blocker = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [when, message]);
}

/** Bỏ chặn ngay (gọi trước khi điều hướng sau khi lưu thành công). */
export function releaseNavigationGuard(): void {
  blocker = null;
}
