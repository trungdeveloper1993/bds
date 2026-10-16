import {
  Building2,
  DatabaseBackup,
  Eye,
  EyeOff,
  House,
  LayoutDashboard,
  Plus,
  Search,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ACTIVE_CUSTOMER_STATUSES, ACTIVE_PROPERTY_STATUSES } from '../constants';
import { daysFromToday } from '../lib/format';
import { navigate, useLocation } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { SearchOverlay } from './SearchOverlay';
import { Button, cn, IconButton, Modal } from './ui';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  count?: number;
  alert?: number;
  privateOnly?: boolean;
}

function useNavItems(): NavItem[] {
  const { projects, properties, customers } = useData();
  return useMemo(() => {
    const due = customers.filter(
      (c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status) && c.nextFollowUp && (daysFromToday(c.nextFollowUp) ?? 1) <= 0,
    ).length;
    return [
      { to: '/', label: 'Tổng quan', short: 'Tổng quan', icon: LayoutDashboard, privateOnly: true },
      { to: '/du-an', label: 'Dự án', short: 'Dự án', icon: Building2, count: projects.length },
      {
        to: '/bds',
        label: 'Giỏ hàng BĐS',
        short: 'Giỏ hàng',
        icon: House,
        count: properties.filter((p) => ACTIVE_PROPERTY_STATUSES.includes(p.status)).length,
      },
      {
        to: '/khach',
        label: 'Khách hàng',
        short: 'Khách',
        icon: Users,
        count: customers.filter((c) => ACTIVE_CUSTOMER_STATUSES.includes(c.status)).length,
        alert: due,
        privateOnly: true,
      },
      { to: '/cai-dat', label: 'Cài đặt & Dữ liệu', short: 'Cài đặt', icon: SettingsIcon, privateOnly: true },
    ];
  }, [projects, properties, customers]);
}

function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}

function Logo({ compact }: { compact?: boolean }) {
  const { settings } = useData();
  return (
    <button type="button" onClick={() => navigate('/')} className="flex min-w-0 items-center gap-2.5 text-left">
      <img src="favicon.svg" alt="" className="size-9 shrink-0 rounded-xl shadow-sm" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold leading-tight tracking-tight text-slate-900">
            {settings.officeName || 'Quản Lý BĐS'}
          </span>
          <span className="block truncate text-xs font-medium text-slate-500">
            {settings.agentName || 'Sổ tay môi giới'}
          </span>
        </span>
      )}
    </button>
  );
}

function SearchPill({ className }: { className?: string }) {
  const { openSearch, privacy } = useUI();
  return (
    <button
      type="button"
      onClick={openSearch}
      className={cn(
        'flex h-10 min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white',
        className,
      )}
    >
      <Search size={17} className="shrink-0 text-slate-400" />
      <span className="truncate">{privacy ? 'Tìm dự án, tài liệu, BĐS…' : 'Tìm dự án, tài liệu, BĐS, khách…'}</span>
      <kbd className="ml-auto hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-400 lg:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

function PrivacyButton({ compact }: { compact?: boolean }) {
  const { privacy, enterPrivacy, exitPrivacy } = useUI();
  if (compact) {
    return (
      <IconButton
        icon={privacy ? EyeOff : Eye}
        label={privacy ? 'Thoát chế độ khách xem' : 'Bật chế độ khách xem'}
        onClick={privacy ? exitPrivacy : enterPrivacy}
        className={privacy ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : ''}
      />
    );
  }
  return (
    <Button
      variant={privacy ? 'soft' : 'secondary'}
      icon={privacy ? EyeOff : Eye}
      onClick={privacy ? exitPrivacy : enterPrivacy}
      className={privacy ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : ''}
    >
      {privacy ? 'Thoát chế độ khách xem' : 'Chế độ khách xem'}
    </Button>
  );
}

const ADD_ACTIONS = [
  { to: '/du-an/moi', label: 'Thêm dự án', description: 'Hồ sơ dự án: tổng quan, pháp lý, tài liệu, hình ảnh', icon: Building2 },
  { to: '/bds/moi', label: 'Thêm BĐS / căn', description: 'Căn trong dự án hoặc BĐS lẻ, kèm thông tin chủ nhà', icon: House },
  { to: '/khach/moi', label: 'Thêm khách hàng', description: 'Nhu cầu, ngân sách, lịch chăm sóc', icon: UserPlus },
];

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Thêm mới" size="sm">
      <div className="space-y-2">
        {ADD_ACTIONS.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => {
              onClose();
              navigate(a.to);
            }}
            className="flex w-full items-center gap-3.5 rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <a.icon size={21} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-slate-900">{a.label}</span>
              <span className="block text-xs text-slate-500">{a.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BackupReminder() {
  const { settings, properties, projects, customers } = useData();
  const total = properties.length + projects.length + customers.length;
  const days = settings.lastBackupAt ? -(daysFromToday(settings.lastBackupAt.slice(0, 10)) ?? 0) : Infinity;
  if (total < 3 || days < 7) return null;
  return (
    <button
      type="button"
      onClick={() => navigate('/cai-dat')}
      className="flex w-full items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-left ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
    >
      <DatabaseBackup size={18} className="mt-0.5 shrink-0 text-amber-700" />
      <span className="text-xs leading-relaxed text-amber-900">
        <b className="block text-[13px]">Nên sao lưu dữ liệu</b>
        {settings.lastBackupAt ? `Lần sao lưu gần nhất ${days} ngày trước.` : 'Bạn chưa sao lưu lần nào.'}
      </span>
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const { privacy, exitPrivacy } = useUI();
  const items = useNavItems().filter((i) => !(privacy && i.privateOnly));
  const [addOpen, setAddOpen] = useState(false);

  const mobileItems = items.filter((i) => i.to !== '/cai-dat');
  const half = Math.ceil(mobileItems.length / 2);
  // Trang nhập liệu: ẩn thanh điều hướng dưới để thanh Lưu nằm sát đáy.
  const formRoute = /\/(moi|sua)$/.test(path);

  return (
    <div className="min-h-dvh">
      {/* Thanh bên (máy tính) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
        <div className="px-5 pb-4 pt-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const active = isActive(path, item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <item.icon size={19} strokeWidth={2.1} className={active ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600'} />
                <span className="flex-1 text-left">{item.label}</span>
                {!!item.alert && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{item.alert}</span>
                )}
                {item.count !== undefined && !item.alert && (
                  <span className="text-xs font-semibold tabular-nums text-slate-400">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="space-y-3 p-4">
          {!privacy && <BackupReminder />}
          {!privacy && (
            <Button variant="primary" icon={Plus} className="w-full" onClick={() => setAddOpen(true)}>
              Thêm mới
            </Button>
          )}
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Thanh trên */}
        <header className="pt-safe sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md print:hidden">
          {privacy && (
            <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-1.5 text-[13px] font-semibold text-amber-950">
              <EyeOff size={15} />
              <span>Chế độ khách xem — thông tin nội bộ đang được ẩn</span>
              <button type="button" onClick={exitPrivacy} className="rounded-md bg-amber-950/10 px-2 py-0.5 text-xs font-bold hover:bg-amber-950/20">
                Thoát
              </button>
            </div>
          )}
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <SearchPill className="flex-1 lg:max-w-xl" />
            <div className="hidden flex-1 lg:block" />
            <div className="lg:hidden">
              <PrivacyButton compact />
            </div>
            {!privacy && (
              <IconButton icon={SettingsIcon} label="Cài đặt" onClick={() => navigate('/cai-dat')} className="lg:hidden" />
            )}
            <div className="hidden lg:block">
              <PrivacyButton />
            </div>
          </div>
        </header>

        <main
          className={cn(
            'mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12',
            formRoute ? 'pb-0' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Thanh điều hướng dưới (điện thoại) */}
      <nav
        className={cn(
          'pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden print:hidden',
          formRoute && 'hidden',
        )}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {mobileItems.slice(0, half).map((item) => (
            <MobileNavButton key={item.to} item={item} active={isActive(path, item.to)} />
          ))}
          {!privacy && (
            <div className="flex flex-1 items-center justify-center">
              <button
                type="button"
                aria-label="Thêm mới"
                onClick={() => setAddOpen(true)}
                className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-lg shadow-brand-900/30 ring-4 ring-white transition active:scale-95"
              >
                <Plus size={26} strokeWidth={2.5} />
              </button>
            </div>
          )}
          {mobileItems.slice(half).map((item) => (
            <MobileNavButton key={item.to} item={item} active={isActive(path, item.to)} />
          ))}
        </div>
      </nav>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <SearchOverlay />
    </div>
  );
}

function MobileNavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <button
      type="button"
      onClick={() => navigate(item.to)}
      className={cn(
        'relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-semibold transition',
        active ? 'text-brand-700' : 'text-slate-500',
      )}
    >
      <item.icon size={22} strokeWidth={active ? 2.4 : 2} />
      {item.short}
      {!!item.alert && (
        <span className="absolute right-[calc(50%-20px)] top-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {item.alert}
        </span>
      )}
    </button>
  );
}
