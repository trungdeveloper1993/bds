import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { AppShell } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { useLocation } from './lib/router';
import { ClientSheet } from './pages/ClientSheet';
import { CustomerDetail } from './pages/CustomerDetail';
import { CustomerForm } from './pages/CustomerForm';
import { CustomerList } from './pages/CustomerList';
import { Dashboard } from './pages/Dashboard';
import { MapEditor } from './pages/MapEditor';
import { NotFound, PrivacyLocked } from './pages/NotFound';
import { ProjectDetail } from './pages/ProjectDetail';
import { ProjectForm } from './pages/ProjectForm';
import { ProjectList } from './pages/ProjectList';
import { PropertyDetail } from './pages/PropertyDetail';
import { PropertyForm } from './pages/PropertyForm';
import { PropertyList } from './pages/PropertyList';
import { Settings } from './pages/Settings';
import { DataProvider, useData } from './store/data';
import { UIProvider, useUI } from './store/ui';

export function App() {
  return (
    <DataProvider>
      <UIProvider>
        <Root />
      </UIProvider>
    </DataProvider>
  );
}

const scrollPositions = new Map<string, number>();

/** Trang danh sách: quay lại đúng vị trí đang cuộn. Trang khác: lên đầu trang. */
function useScrollRestoration(path: string) {
  useLayoutEffect(() => {
    const isList = path.split('/').filter(Boolean).length <= 1;
    window.scrollTo(0, isList ? (scrollPositions.get(path) ?? 0) : 0);
    const onScroll = () => scrollPositions.set(path, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [path]);
}

function Root() {
  const { status, error } = useData();
  const location = useLocation();
  useScrollRestoration(location.path);

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <img src="favicon.svg" alt="" className="size-14 rounded-2xl shadow-lg" />
        <Spinner />
        <p className="text-sm text-slate-500">Đang tải dữ liệu…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <TriangleAlert className="mx-auto text-rose-500" size={32} />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Không mở được dữ liệu</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{error}</p>
          <p className="mt-2 text-xs text-slate-500">
            Nếu đang dùng chế độ ẩn danh, hãy mở bằng cửa sổ thường. Trình duyệt cần cho phép lưu trữ dữ liệu trang web.
          </p>
          <Button variant="primary" icon={RefreshCw} className="mt-5" onClick={() => window.location.reload()}>
            Tải lại
          </Button>
        </div>
      </div>
    );
  }

  if (location.segments[0] === 'tu-van') return <ClientSheet />;

  return (
    <AppShell>
      <RouteView key={location.path} />
    </AppShell>
  );
}

function RouteView() {
  const { segments } = useLocation();
  const { privacy } = useUI();
  const [section, id, action, sub] = segments;
  const locked = <PrivacyLocked />;

  switch (section) {
    case undefined:
      return privacy ? <ProjectList /> : <Dashboard />;
    case 'du-an':
      if (!id) return <ProjectList />;
      if (id === 'moi') return privacy ? locked : <ProjectForm />;
      if (action === 'sua') return privacy ? locked : <ProjectForm id={id} />;
      if (action === 'ban-do' && sub) return privacy ? locked : <MapEditor projectId={id} mapId={sub} />;
      return <ProjectDetail id={id} />;
    case 'bds':
      if (!id) return <PropertyList />;
      if (id === 'moi') return privacy ? locked : <PropertyForm />;
      if (action === 'sua') return privacy ? locked : <PropertyForm id={id} />;
      return <PropertyDetail id={id} />;
    case 'khach':
      if (privacy) return locked;
      if (!id) return <CustomerList />;
      if (id === 'moi') return <CustomerForm />;
      if (action === 'sua') return <CustomerForm id={id} />;
      return <CustomerDetail id={id} />;
    case 'cai-dat':
      return privacy ? locked : <Settings />;
    default:
      return <NotFound />;
  }
}
