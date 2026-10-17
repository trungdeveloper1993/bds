import {
  ArchiveRestore,
  DatabaseBackup,
  Download,
  Eye,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  Map as MapIcon,
  Save,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FieldGrid, useDraft } from '../components/form';
import { ProvinceSelect } from '../components/inputs';
import { MapDisplaySettings } from '../components/maps';
import { MessageTemplatesCard } from '../components/messaging';
import { Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Segmented, TextInput } from '../components/ui';
import { readBackup, createBackup, type BackupContent } from '../lib/backup';
import { requestPersistentStorage, storageInfo } from '../lib/db';
import { customersSheet, documentsSheet, projectsSheet, propertiesSheet } from '../lib/exports';
import { fileStamp, formatDateTime, timeAgo } from '../lib/format';
import { canShareFiles, downloadBlob, formatBytes, shareFiles } from '../lib/media';
import { canInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';
import { buildXlsx } from '../lib/xlsx';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Settings as SettingsType } from '../types';

export function Settings() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Cài đặt & Dữ liệu" subtitle="Cá nhân hoá, bảo mật khi đưa máy cho khách, sao lưu và chuyển dữ liệu sang máy khác." />
      <div className="space-y-5">
        <ProfileCard />
        <MessageTemplatesCard />
        <PrivacyCard />
        <Card>
          <CardHeader title="Bản đồ mặt bằng" icon={MapIcon} description="Màu trạng thái căn, thông tin trên thẻ khi chạm vào căn, ẩn giá khi khách xem." />
          <div className="p-4 sm:p-5">
            <MapDisplaySettings />
          </div>
        </Card>
        <BackupCard />
        <ExportCard />
        <InstallCard />
        <DangerCard />
        <p className="px-1 text-center text-xs leading-relaxed text-slate-400">
          Quản Lý BĐS · Dữ liệu chỉ lưu trên thiết bị này, không gửi lên bất kỳ máy chủ nào.
        </p>
      </div>
    </div>
  );
}

function ProfileCard() {
  const { settings, updateSettings } = useData();
  const { toast } = useUI();
  const { draft, update, dirty, reset } = useDraft<SettingsType>(settings);
  const [saving, setSaving] = useState(false);
  // Đồng bộ khi cài đặt thay đổi từ nơi khác (vd khôi phục sao lưu), nếu đang không sửa dở.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) reset(settings);
  }, [settings, reset]);

  const save = async () => {
    setSaving(true);
    const patch = {
      agentName: draft.agentName.trim(),
      agentTitle: draft.agentTitle.trim(),
      agentPhone: draft.agentPhone.trim(),
      agentEmail: draft.agentEmail.trim(),
      officeName: draft.officeName.trim(),
      officeAddress: draft.officeAddress.trim(),
      defaultProvince: draft.defaultProvince,
    };
    await updateSettings(patch);
    reset({ ...settings, ...patch });
    setSaving(false);
    toast('Đã lưu hồ sơ môi giới');
  };

  return (
    <Card>
      <CardHeader title="Hồ sơ môi giới" icon={UserRound} description="Hiển thị trên phiếu tư vấn, tin đăng và đầu ứng dụng." />
      <form
        className="space-y-4 p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FieldGrid cols={2}>
          <Field label="Họ tên" htmlFor="agentName">
            <TextInput id="agentName" value={draft.agentName} onChange={(e) => update({ agentName: e.target.value })} placeholder="VD: Nguyễn Văn Trung" />
          </Field>
          <Field label="Chức danh" htmlFor="agentTitle">
            <TextInput id="agentTitle" value={draft.agentTitle} onChange={(e) => update({ agentTitle: e.target.value })} />
          </Field>
          <Field label="Số điện thoại / Zalo" htmlFor="agentPhone">
            <TextInput id="agentPhone" type="tel" inputMode="tel" value={draft.agentPhone} onChange={(e) => update({ agentPhone: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="agentEmail">
            <TextInput id="agentEmail" type="email" inputMode="email" value={draft.agentEmail} onChange={(e) => update({ agentEmail: e.target.value })} />
          </Field>
          <Field label="Tên văn phòng / thương hiệu" htmlFor="officeName">
            <TextInput id="officeName" value={draft.officeName} onChange={(e) => update({ officeName: e.target.value })} placeholder="VD: Trung Land" />
          </Field>
          <Field label="Địa chỉ văn phòng" htmlFor="officeAddress">
            <TextInput id="officeAddress" value={draft.officeAddress} onChange={(e) => update({ officeAddress: e.target.value })} />
          </Field>
          <Field label="Tỉnh / thành mặc định" htmlFor="defaultProvince" hint="Tự điền khi thêm BĐS, dự án, khách mới.">
            <ProvinceSelect id="defaultProvince" value={draft.defaultProvince} onChange={(defaultProvince) => update({ defaultProvince })} />
          </Field>
        </FieldGrid>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" icon={Save} disabled={!dirty} loading={saving}>
            Lưu hồ sơ
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PrivacyCard() {
  const { settings, updateSettings } = useData();
  const { toast, enterPrivacy } = useUI();
  const [pin, setPin] = useState('');
  const [open, setOpen] = useState(false);

  const savePin = async (value: string) => {
    await updateSettings({ privacyPin: value });
    setOpen(false);
    setPin('');
    toast(value ? 'Đã đặt mã PIN' : 'Đã bỏ mã PIN');
  };

  return (
    <Card>
      <CardHeader title="Chế độ khách xem" icon={Eye} description="Đưa máy cho khách xem dự án, giỏ hàng mà không lộ thông tin nội bộ." />
      <div className="space-y-4 p-4 sm:p-6">
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>• Ẩn thông tin chủ nhà, giá chốt, hoa hồng, ghi chú và tài liệu nội bộ.</li>
          <li>• Ẩn toàn bộ danh sách khách hàng, tổng quan và cài đặt.</li>
          <li>• Khoá chức năng thêm / sửa / xoá; vẫn giữ nguyên sau khi tải lại trang.</li>
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2.5">
            <KeyRound size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-800">Mã PIN để thoát</div>
              <div className="text-xs text-slate-500">{settings.privacyPin ? 'Đã đặt — khách không tự thoát được' : 'Chưa đặt — ai cũng bấm thoát được'}</div>
            </div>
          </div>
          <div className="flex gap-2">
            {settings.privacyPin && (
              <Button size="sm" variant="ghost" onClick={() => void savePin('')}>
                Bỏ PIN
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(true)}>
              {settings.privacyPin ? 'Đổi PIN' : 'Đặt PIN'}
            </Button>
          </div>
        </div>
        <Button variant="primary" icon={Eye} onClick={enterPrivacy}>
          Bật chế độ khách xem ngay
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Đặt mã PIN"
        description="4–6 chữ số. Cần nhập mã này để thoát chế độ khách xem."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" disabled={pin.length < 4} onClick={() => void savePin(pin)}>
              Lưu PIN
            </Button>
          </>
        }
      >
        <TextInput
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center text-2xl tracking-[0.5em] sm:text-2xl"
          placeholder="••••"
        />
      </Modal>
    </Card>
  );
}

function BackupCard() {
  const data = useData();
  const { settings, projects, properties, customers, updateSettings, restoreBackup } = data;
  const { toast, confirm } = useUI();
  const [busy, setBusy] = useState<'' | 'full' | 'quick' | 'read' | 'restore'>('');
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [pending, setPending] = useState<BackupContent | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [info, setInfo] = useState<{ persisted: boolean; usage?: number; quota?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shareable = canShareFiles();

  useEffect(() => {
    void storageInfo().then(setInfo);
  }, [projects, properties]);

  const markBackedUp = () => updateSettings({ lastBackupAt: new Date().toISOString() });

  const make = async (includeMedia: boolean) => {
    setBusy(includeMedia ? 'full' : 'quick');
    try {
      const blob = await createBackup({ settings, projects, properties, customers }, includeMedia);
      const name = `bds-sao-luu-${includeMedia ? 'day-du' : 'du-lieu'}-${fileStamp()}.zip`;
      setResult({ blob, name });
      if (!shareable) {
        downloadBlob(blob, name);
        await markBackedUp();
        toast(`Đã tải file sao lưu (${formatBytes(blob.size)})`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không tạo được bản sao lưu', 'error');
    } finally {
      setBusy('');
    }
  };

  const pick = async (file: File) => {
    setBusy('read');
    try {
      const content = await readBackup(file);
      setMode('merge');
      setPending(content);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không đọc được file', 'error');
    } finally {
      setBusy('');
    }
  };

  const restore = async () => {
    if (!pending) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Thay thế toàn bộ dữ liệu?',
        message: 'Toàn bộ dữ liệu hiện có trên máy này sẽ bị xoá và thay bằng bản sao lưu. Không thể hoàn tác.',
        confirmLabel: 'Thay thế',
        danger: true,
        requireText: 'XOA',
      });
      if (!ok) return;
    }
    setBusy('restore');
    try {
      const summary = await restoreBackup(pending, mode);
      setPending(null);
      toast(
        `Đã khôi phục: ${summary.projects} dự án, ${summary.properties} BĐS, ${summary.customers} khách, ${summary.images} ảnh, ${summary.files} tài liệu`,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Khôi phục thất bại', 'error');
    } finally {
      setBusy('');
    }
  };

  const docCount = [...projects, ...properties].reduce((n, x) => n + x.documents.length, 0);
  const imageCount = [...projects, ...properties].reduce((n, x) => n + x.images.length, 0);

  return (
    <Card>
      <CardHeader
        title="Sao lưu & khôi phục"
        icon={DatabaseBackup}
        description="Dữ liệu nằm trên thiết bị này. Sao lưu định kỳ để không mất dữ liệu và để chuyển sang máy khác."
      />
      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          {[
            ['Dự án', projects.length],
            ['BĐS', properties.length],
            ['Khách', customers.length],
            ['Ảnh', imageCount],
            ['Tài liệu', docCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="text-lg font-extrabold text-slate-900">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <DatabaseBackup size={16} className="text-slate-400" />
            Sao lưu gần nhất:{' '}
            <b className="text-slate-800">{settings.lastBackupAt ? `${timeAgo(settings.lastBackupAt)} (${formatDateTime(settings.lastBackupAt)})` : 'chưa có'}</b>
          </span>
          {info?.usage !== undefined && (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <HardDrive size={16} className="text-slate-400" /> Đã dùng {formatBytes(info.usage)}
              {info.quota ? ` / ${formatBytes(info.quota)}` : ''}
            </span>
          )}
          {info && (
            <span className="inline-flex items-center gap-1.5">
              {info.persisted ? (
                <Badge tone="emerald" icon={ShieldCheck}>
                  Lưu trữ lâu dài: đã bật
                </Badge>
              ) : (
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                  onClick={() =>
                    void requestPersistentStorage().then((ok) => {
                      toast(ok ? 'Trình duyệt đã cho phép lưu trữ lâu dài' : 'Trình duyệt chưa cho phép — hãy cài app lên màn hình chính và sao lưu thường xuyên', ok ? 'success' : 'info');
                      void storageInfo().then(setInfo);
                    })
                  }
                >
                  Bật lưu trữ lâu dài
                </button>
              )}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void make(true)}
            className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 text-left transition hover:border-brand-400 disabled:opacity-60"
          >
            <DatabaseBackup size={22} className="mt-0.5 shrink-0 text-brand-700" />
            <span>
              <span className="block font-bold text-slate-900">{busy === 'full' ? 'Đang tạo…' : 'Sao lưu đầy đủ (.zip)'}</span>
              <span className="block text-xs leading-relaxed text-slate-600">Gồm dữ liệu, toàn bộ ảnh và tài liệu gốc. Dùng để chuyển sang máy khác.</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void make(false)}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-slate-400 disabled:opacity-60"
          >
            <Download size={22} className="mt-0.5 shrink-0 text-slate-600" />
            <span>
              <span className="block font-bold text-slate-900">{busy === 'quick' ? 'Đang tạo…' : 'Sao lưu nhanh (chỉ dữ liệu)'}</span>
              <span className="block text-xs leading-relaxed text-slate-600">File nhỏ, không kèm ảnh và tài liệu. Hợp để sao lưu hằng ngày.</span>
            </span>
          </button>
        </div>

        {result && shareable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
            <span className="text-sm text-emerald-900">
              Đã tạo <b>{result.name}</b> ({formatBytes(result.blob.size)})
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon={Download}
                onClick={() => {
                  downloadBlob(result.blob, result.name);
                  void markBackedUp();
                }}
              >
                Tải về
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={Share2}
                onClick={async () => {
                  const status = await shareFiles([new File([result.blob], result.name, { type: 'application/zip' })], result.name);
                  if (status === 'shared') {
                    await markBackedUp();
                    toast('Đã gửi file sao lưu');
                  } else if (status === 'unsupported') {
                    toast('Không chia sẻ được — hãy dùng nút Tải về', 'info');
                  }
                }}
              >
                Gửi qua Zalo / Drive…
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-600">Khôi phục từ file sao lưu (.zip hoặc .json)</div>
          <Button icon={ArchiveRestore} onClick={() => fileRef.current?.click()} loading={busy === 'read'}>
            Chọn file khôi phục
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pick(file);
            }}
          />
        </div>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Khôi phục dữ liệu"
        description={pending?.exportedAt ? `Bản sao lưu lúc ${formatDateTime(pending.exportedAt)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Huỷ
            </Button>
            <Button variant={mode === 'replace' ? 'danger' : 'primary'} icon={ArchiveRestore} loading={busy === 'restore'} onClick={() => void restore()}>
              {mode === 'replace' ? 'Thay thế toàn bộ' : 'Gộp dữ liệu'}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              File gồm <b>{pending.projects.length}</b> dự án, <b>{pending.properties.length}</b> BĐS, <b>{pending.customers.length}</b> khách
              {pending.includesMedia ? (
                <>
                  , <b>{pending.images.length}</b> ảnh và <b>{pending.files.length}</b> tài liệu.
                </>
              ) : (
                ' (không kèm ảnh, tài liệu).'
              )}
            </p>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Gộp vào dữ liệu hiện có' },
                { value: 'replace', label: 'Thay thế toàn bộ' },
              ]}
              className="w-full"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              {mode === 'merge'
                ? 'Giữ dữ liệu trên máy này; bản ghi trong file mới hơn sẽ được cập nhật, bản ghi mới sẽ được thêm vào.'
                : 'Xoá sạch dữ liệu trên máy này rồi nạp lại từ file — dùng khi chuyển hẳn sang máy mới.'}
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function ExportCard() {
  const { projects, properties, customers, projectById } = useData();
  const { toast } = useUI();
  return (
    <Card>
      <CardHeader title="Xuất Excel" icon={FileSpreadsheet} description="Một file gồm các sheet: Dự án, Giỏ hàng BĐS (kèm chủ nhà), Khách hàng, Tài liệu." />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <p className="text-sm text-slate-600">Dùng để in, lọc trên máy tính hoặc gửi cho cộng sự. File có thông tin nội bộ — cân nhắc trước khi chia sẻ.</p>
        <Button
          icon={FileSpreadsheet}
          onClick={() => {
            const blob = buildXlsx([
              projectsSheet(projects),
              propertiesSheet(properties, projectById),
              customersSheet(customers, projectById),
              documentsSheet(projects, properties),
            ]);
            downloadBlob(blob, `quan-ly-bds-${fileStamp()}.xlsx`);
            toast('Đã xuất file Excel');
          }}
        >
          Xuất toàn bộ
        </Button>
      </div>
    </Card>
  );
}

function InstallCard() {
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  const standalone = isStandalone();
  return (
    <Card>
      <CardHeader title="Cài lên màn hình chính" icon={Smartphone} description="Mở nhanh như ứng dụng, dùng được cả khi không có mạng." />
      <div className="space-y-3 p-4 text-sm text-slate-600 sm:p-6">
        {standalone ? (
          <Badge tone="emerald" icon={ShieldCheck}>
            Đang chạy dạng ứng dụng
          </Badge>
        ) : installable ? (
          <Button variant="primary" icon={Smartphone} onClick={() => void promptInstall()}>
            Cài ứng dụng
          </Button>
        ) : isIOS() ? (
          <p>
            Trên iPhone/iPad: mở bằng <b>Safari</b> → bấm nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>.
          </p>
        ) : (
          <p>
            Trên Android (Chrome): menu <b>⋮</b> → <b>Cài đặt ứng dụng</b> / <b>Thêm vào màn hình chính</b>. Trên máy tính (Chrome/Edge): biểu tượng cài đặt ở thanh địa chỉ.
          </p>
        )}
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          Mỗi trình duyệt / ứng dụng cài đặt có kho dữ liệu riêng (trên iPhone, bản cài ở màn hình chính tách biệt với Safari). Hãy chọn dùng một nơi, và dùng
          “Sao lưu đầy đủ” → “Khôi phục” để chuyển dữ liệu giữa các nơi.
        </p>
      </div>
    </Card>
  );
}

function DangerCard() {
  const { wipeAll } = useData();
  const { confirm, toast } = useUI();
  return (
    <Card className="border-rose-200">
      <CardHeader title="Vùng nguy hiểm" icon={TriangleAlert} className="bg-rose-50/60" />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <p className="text-sm text-slate-600">Xoá toàn bộ dự án, BĐS, khách hàng, ảnh và tài liệu trên thiết bị này.</p>
        <Button
          variant="danger"
          icon={Trash2}
          onClick={async () => {
            const ok = await confirm({
              title: 'Xoá toàn bộ dữ liệu?',
              message: 'Không thể hoàn tác. Hãy chắc chắn bạn đã có bản sao lưu đầy đủ.',
              confirmLabel: 'Xoá tất cả',
              danger: true,
              requireText: 'XOA',
            });
            if (!ok) return;
            await wipeAll();
            toast('Đã xoá toàn bộ dữ liệu');
          }}
        >
          Xoá toàn bộ dữ liệu
        </Button>
      </div>
    </Card>
  );
}
