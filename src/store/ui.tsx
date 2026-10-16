import { CircleCheck, CircleX, Info, Lock } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, cn, Modal, TextInput } from '../components/ui';
import { useData } from './data';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Bắt người dùng gõ đúng chữ này mới cho xác nhận (thao tác nguy hiểm). */
  requireText?: string;
}

interface UIContextValue {
  toast: (message: ReactNode, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  privacy: boolean;
  enterPrivacy: () => void;
  exitPrivacy: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

const PRIVACY_KEY = 'bds.privacy';

function readPrivacy(): boolean {
  try {
    return localStorage.getItem(PRIVACY_KEY) === '1';
  } catch {
    return false;
  }
}

function writePrivacy(on: boolean) {
  try {
    if (on) localStorage.setItem(PRIVACY_KEY, '1');
    else localStorage.removeItem(PRIVACY_KEY);
  } catch {
    // Trình duyệt chặn lưu trữ: chế độ vẫn hoạt động trong phiên hiện tại.
  }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: ReactNode, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);

  // ---- Xác nhận
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setConfirmState({ ...options, resolve });
      }),
    [],
  );
  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  // ---- Chế độ khách xem
  const [privacy, setPrivacy] = useState(readPrivacy);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const enterPrivacy = useCallback(() => {
    writePrivacy(true);
    setPrivacy(true);
  }, []);

  const exitPrivacy = useCallback(() => {
    if (settings.privacyPin) {
      setPin('');
      setPinError('');
      setPinOpen(true);
      return;
    }
    writePrivacy(false);
    setPrivacy(false);
  }, [settings.privacyPin]);

  const submitPin = () => {
    if (pin === settings.privacyPin) {
      writePrivacy(false);
      setPrivacy(false);
      setPinOpen(false);
    } else {
      setPinError('Mã PIN không đúng.');
      setPin('');
    }
  };

  // ---- Tìm kiếm toàn cục
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const value = useMemo(
    () => ({ toast, confirm, privacy, enterPrivacy, exitPrivacy, searchOpen, openSearch, closeSearch }),
    [toast, confirm, privacy, enterPrivacy, exitPrivacy, searchOpen, openSearch, closeSearch],
  );

  const confirmDisabled = !!confirmState?.requireText && typed.trim().toUpperCase() !== confirmState.requireText.toUpperCase();

  return (
    <UIContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-md animate-pop-in items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl',
              t.tone === 'success' && 'bg-slate-900',
              t.tone === 'error' && 'bg-rose-600',
              t.tone === 'info' && 'bg-brand-800',
            )}
          >
            {t.tone === 'success' && <CircleCheck size={18} className="mt-px shrink-0 text-emerald-400" />}
            {t.tone === 'error' && <CircleX size={18} className="mt-px shrink-0" />}
            {t.tone === 'info' && <Info size={18} className="mt-px shrink-0" />}
            <div className="min-w-0">{t.message}</div>
          </div>
        ))}
      </div>

      <Modal
        open={!!confirmState}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => closeConfirm(false)}>
              {confirmState?.cancelLabel ?? 'Huỷ'}
            </Button>
            <Button
              variant={confirmState?.danger ? 'danger' : 'primary'}
              disabled={confirmDisabled}
              onClick={() => closeConfirm(true)}
              data-autofocus={confirmState?.requireText ? undefined : true}
            >
              {confirmState?.confirmLabel ?? 'Đồng ý'}
            </Button>
          </>
        }
      >
        {confirmState?.message && <div className="text-sm leading-relaxed text-slate-600">{confirmState.message}</div>}
        {confirmState?.requireText && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold text-slate-700">
              Gõ <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-rose-700">{confirmState.requireText}</span> để xác nhận
            </p>
            <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Modal>

      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Nhập mã PIN để thoát chế độ khách xem"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPinOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" icon={Lock} onClick={submitPin} disabled={!pin}>
              Mở khoá
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPin();
          }}
        >
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setPinError('');
            }}
            placeholder="••••"
            className="text-center text-2xl tracking-[0.5em] sm:text-2xl"
          />
          {pinError && <p className="mt-2 text-sm font-medium text-rose-600">{pinError}</p>}
        </form>
      </Modal>
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
