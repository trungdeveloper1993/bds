import { useEffect, useRef } from 'react';

/**
 * Nhảy tới một đoạn trên trang (theo id) rồi nháy sáng để người xem thấy ngay.
 * Các thành phần đang thu gọn (Q&A, quy định) đăng ký useFocusRequest để tự mở ra.
 */

type Listener = (anchor: string) => void;
const listeners = new Set<Listener>();
let pending: { anchor: string; at: number } | null = null;

function scrollToElement(el: HTMLElement) {
  const header = document.querySelector('header');
  const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0) + 12;
  const bottomBar = window.innerWidth < 1024 ? 80 : 16;
  const rect = el.getBoundingClientRect();
  const room = window.innerHeight - top - bottomBar;
  let y = window.scrollY + rect.top - top;
  // Đoạn ngắn: đặt hơi cao hơn giữa màn hình cho dễ đọc.
  if (rect.height < room) y -= Math.min((room - rect.height) / 3, 120);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
}

function flash(el: HTMLElement) {
  el.classList.remove('sf-flash');
  void el.offsetWidth; // chạy lại hiệu ứng nếu bấm liên tiếp
  el.classList.add('sf-flash');
  window.setTimeout(() => el.classList.remove('sf-flash'), 2400);
}

/** Cuộn tới phần tử có id = anchor (chờ tab mới hiển thị xong); không có thì cuộn tới phần tử dự phòng. */
export function requestFocus(anchor: string, fallback?: string, options: { flash?: boolean } = {}): void {
  pending = { anchor, at: Date.now() };
  listeners.forEach((l) => l(anchor));
  let tries = 0;
  const tick = () => {
    const target = anchor ? document.getElementById(anchor) : null;
    const el = target ?? (tries >= 10 && fallback ? document.getElementById(fallback) : null);
    if (el) {
      scrollToElement(el);
      if (target && options.flash !== false) flash(target);
      return;
    }
    if (++tries < 40) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Mở phần đang thu gọn khi có yêu cầu nhảy tới (kể cả khi phần đó vừa mới hiển thị). */
export function useFocusRequest(match: (anchor: string) => boolean, onFocus: (anchor: string) => void): void {
  const ref = useRef({ match, onFocus });
  useEffect(() => {
    ref.current = { match, onFocus };
  });
  useEffect(() => {
    const check = (anchor: string) => {
      if (ref.current.match(anchor)) ref.current.onFocus(anchor);
    };
    if (pending && Date.now() - pending.at < 1500) check(pending.anchor);
    listeners.add(check);
    return () => {
      listeners.delete(check);
    };
  }, []);
}
