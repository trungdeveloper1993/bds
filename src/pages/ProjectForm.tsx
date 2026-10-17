import { Banknote, Building2, FileText, Handshake, Info, Lock, MapPin, Ruler, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldGrid, FormFooter, FormSection, useDraft } from '../components/form';
import { ChipMultiSelect, MoneyInput, NumberInput, ProvinceSelect, TagInput } from '../components/inputs';
import { UnitTypesEditor } from '../components/project';
import { Field, PageHeader, Select, TextArea, TextInput, Toggle } from '../components/ui';
import {
  HANDOVER_STANDARD_SUGGESTIONS,
  OWNERSHIP_SUGGESTIONS,
  PROJECT_AMENITY_SUGGESTIONS,
  PROJECT_STAGE,
  PROJECT_STAGES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
} from '../constants';
import { emptyProject } from '../lib/defaults';
import { goBack, navigate, releaseNavigationGuard } from '../lib/router';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Project, ProjectStage } from '../types';
import { NotFound } from './NotFound';

export function ProjectForm({ id }: { id?: string }) {
  const { projectById, projects, settings } = useData();
  const initial = useMemo(
    () => (id ? projectById.get(id) : emptyProject({ province: settings.defaultProvince || projects[0]?.province || '' })),
    // Chỉ tính khi mở form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  if (!initial) return <NotFound what="dự án" backTo="/du-an" />;
  return <ProjectFormInner initial={initial} isNew={!id} />;
}

function ProjectFormInner({ initial, isNew }: { initial: Project; isNew: boolean }) {
  const { projectById, projects, saveProject } = useData();
  const { toast } = useUI();
  const { draft: d, update, dirty } = useDraft<Project>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const duplicate = useMemo(() => {
    const n = d.name.trim().toLowerCase();
    return n ? projects.find((p) => p.id !== d.id && p.name.trim().toLowerCase() === n) : undefined;
  }, [projects, d.name, d.id]);

  const submit = async () => {
    if (saving) return;
    if (!d.name.trim()) {
      setError('Vui lòng nhập tên dự án.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const latest = d.id ? projectById.get(d.id) : undefined;
      const saved = await saveProject({
        ...d,
        name: d.name.trim(),
        // Các phần quản lý trực tiếp trên trang chi tiết — luôn giữ bản mới nhất.
        images: latest?.images ?? d.images,
        documents: latest?.documents ?? d.documents,
        legalChecklist: latest?.legalChecklist ?? d.legalChecklist,
        faqs: latest?.faqs ?? d.faqs,
        maps: latest?.maps ?? d.maps,
        inventory: latest?.inventory ?? d.inventory,
        layouts: latest?.layouts ?? d.layouts,
        layoutAssignments: latest?.layoutAssignments ?? d.layoutAssignments,
        sales: latest?.sales ?? d.sales,
        unitTypes: d.unitTypes.filter((r) => r.name.trim() || r.area.trim() || r.price.trim()),
      });
      releaseNavigationGuard();
      if (isNew) {
        toast(`Đã tạo dự án ${saved.name}. Tải tài liệu & hình ảnh ngay tại đây.`);
        navigate(`/du-an/${saved.id}?tab=tai-lieu`, { replace: true });
      } else {
        toast('Đã lưu thay đổi');
        goBack(`/du-an/${saved.id}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không lưu được', 'error');
      setSaving(false);
    }
  };

  const text = (key: keyof Project) => ({
    value: (d[key] as string) ?? '',
    onChange: (e: { target: { value: string } }) => update({ [key]: e.target.value } as Partial<Project>),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        backTo={isNew ? '/du-an' : `/du-an/${d.id}`}
        title={isNew ? 'Thêm dự án' : `Sửa dự án ${initial.name}`}
        subtitle="Chỉ tên dự án là bắt buộc — các mục khác bổ sung dần khi có tài liệu."
      />

      <datalist id="ownership-options">
        {OWNERSHIP_SUGGESTIONS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="handover-options">
        {HANDOVER_STANDARD_SUGGESTIONS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <div className="space-y-5">
        <FormSection title="Thông tin chung" icon={Building2}>
          <div className="space-y-4">
            <FieldGrid cols={2}>
              <Field
                label="Tên thương mại"
                required
                htmlFor="name"
                hint={error ? <span className="font-semibold text-rose-600">{error}</span> : duplicate ? <span className="text-amber-700">Đã có dự án trùng tên ({duplicate.code}).</span> : undefined}
              >
                <TextInput
                  id="name"
                  value={d.name}
                  onChange={(e) => {
                    setError('');
                    update({ name: e.target.value });
                  }}
                  placeholder="VD: Vinhomes Grand Park"
                  autoFocus={isNew}
                />
              </Field>
              <Field label="Tên pháp lý / tên gọi khác / phân khu" htmlFor="legalName">
                <TextInput id="legalName" {...text('legalName')} placeholder="VD: Khu dân cư và công viên Phước Thiện" />
              </Field>
              <Field label="Tình trạng" htmlFor="stage">
                <Select id="stage" value={d.stage} onChange={(e) => update({ stage: e.target.value as ProjectStage })}>
                  {PROJECT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STAGE[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center sm:pt-6">
                <Toggle checked={d.featured} onChange={(featured) => update({ featured })} label="Dự án trọng tâm" description="Ưu tiên hiển thị đầu danh sách" />
              </div>
            </FieldGrid>
            <Field label="Loại hình sản phẩm">
              <ChipMultiSelect
                options={PROPERTY_TYPES.filter((t) => t !== 'khac').map((t) => ({ value: t, label: PROPERTY_TYPE_LABEL[t] }))}
                value={d.productTypes}
                onChange={(productTypes) => update({ productTypes })}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Chủ đầu tư & đối tác" icon={Handshake}>
          <FieldGrid>
            <Field label="Chủ đầu tư" htmlFor="developer">
              <TextInput id="developer" {...text('developer')} />
            </Field>
            <Field label="Đơn vị phát triển" htmlFor="devPartner">
              <TextInput id="devPartner" {...text('devPartner')} />
            </Field>
            <Field label="Tổng thầu xây dựng" htmlFor="contractor">
              <TextInput id="contractor" {...text('contractor')} />
            </Field>
            <Field label="Đơn vị thiết kế" htmlFor="designer">
              <TextInput id="designer" {...text('designer')} />
            </Field>
            <Field label="Quản lý vận hành" htmlFor="operator">
              <TextInput id="operator" {...text('operator')} />
            </Field>
            <Field label="Đơn vị phân phối (F1)" htmlFor="distributor">
              <TextInput id="distributor" {...text('distributor')} />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Vị trí & kết nối" icon={MapPin} description="Ghi địa chỉ mới (sau sáp nhập 07/2025) và địa chỉ cũ để khách dễ hình dung.">
          <div className="space-y-4">
            <FieldGrid>
              <Field label="Địa chỉ / tuyến đường" htmlFor="address" className="sm:col-span-2 lg:col-span-1">
                <TextInput id="address" {...text('address')} placeholder="VD: Đường Nguyễn Xiển" />
              </Field>
              <Field label="Phường / Xã" htmlFor="ward">
                <TextInput id="ward" {...text('ward')} placeholder="VD: Phường Long Bình" />
              </Field>
              <Field label="Tỉnh / Thành phố" htmlFor="province">
                <ProvinceSelect id="province" value={d.province} onChange={(province) => update({ province })} />
              </Field>
              <Field label="Địa chỉ cũ / khu vực quen gọi" htmlFor="area">
                <TextInput id="area" {...text('area')} placeholder="VD: TP. Thủ Đức (Quận 9 cũ)" />
              </Field>
              <Field label="Link Google Maps" htmlFor="mapUrl">
                <TextInput id="mapUrl" type="url" inputMode="url" {...text('mapUrl')} placeholder="https://maps.app.goo.gl/…" />
              </Field>
              <Field label="Website dự án" htmlFor="website">
                <TextInput id="website" type="url" inputMode="url" {...text('website')} placeholder="https://…" />
              </Field>
            </FieldGrid>
            <Field label="Liên kết vùng & hạ tầng" htmlFor="connectivity" hint="Metro, cao tốc, cầu… kèm thời gian di chuyển / tiến độ dự kiến.">
              <TextArea id="connectivity" rows={3} {...text('connectivity')} placeholder={'VD:\n- 5 phút ra cao tốc Long Thành – Dầu Giây\n- Ga Metro số 1 cách 2 km'} />
            </Field>
            <Field label="Tiện ích nội khu">
              <TagInput value={d.amenities} onChange={(amenities) => update({ amenities })} suggestions={PROJECT_AMENITY_SUGGESTIONS} placeholder="VD: Hồ bơi" />
            </Field>
            <Field label="Tiện ích ngoại khu" hint="Gõ kèm khoảng cách rồi Enter, vd “Vincom Mega Mall – 5 phút”.">
              <TagInput value={d.nearby} onChange={(nearby) => update({ nearby })} placeholder="VD: Bệnh viện Quận 9 – 3 km" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Quy mô & sản phẩm" icon={Ruler}>
          <div className="space-y-5">
            <FieldGrid>
              <Field label="Tổng diện tích đất" htmlFor="siteArea">
                <NumberInput id="siteArea" value={d.siteArea} onChange={(siteArea) => update({ siteArea })} suffix="ha" />
              </Field>
              <Field label="Mật độ xây dựng" htmlFor="density">
                <NumberInput id="density" value={d.density} onChange={(density) => update({ density })} suffix="%" />
              </Field>
              <Field label="Tổng số căn / lô" htmlFor="totalUnits">
                <NumberInput id="totalUnits" integer value={d.totalUnits} onChange={(totalUnits) => update({ totalUnits })} />
              </Field>
              <Field label="Quy mô (tòa / tầng / hầm)" htmlFor="scale" className="sm:col-span-2">
                <TextInput id="scale" {...text('scale')} placeholder="VD: 4 tòa · 35 tầng · 3 hầm" />
              </Field>
              <Field label="Diện tích sản phẩm" htmlFor="unitAreaRange">
                <TextInput id="unitAreaRange" {...text('unitAreaRange')} placeholder="VD: 45 – 120 m²" />
              </Field>
            </FieldGrid>
            <Field label="Bảng loại sản phẩm" hint="Mỗi dòng một loại căn: 1PN, 2PN, shophouse, lô góc…">
              <UnitTypesEditor rows={d.unitTypes} onChange={(unitTypes) => update({ unitTypes })} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Giá & thanh toán" icon={Banknote}>
          <div className="space-y-4">
            <FieldGrid>
              <Field label="Giá từ" htmlFor="priceFrom">
                <MoneyInput id="priceFrom" value={d.priceFrom} onChange={(priceFrom) => update({ priceFrom })} />
              </Field>
              <Field label="Giá đến" htmlFor="priceTo">
                <MoneyInput id="priceTo" value={d.priceTo} onChange={(priceTo) => update({ priceTo })} />
              </Field>
              <Field label="Đơn giá / m²" htmlFor="unitPrice">
                <TextInput id="unitPrice" {...text('unitPrice')} placeholder="VD: 55 – 65 triệu/m² thông thủy" />
              </Field>
            </FieldGrid>
            <Field label="Giá đã gồm" htmlFor="priceNote">
              <TextInput id="priceNote" {...text('priceNote')} placeholder="VD: Đã gồm VAT, chưa gồm 2% kinh phí bảo trì" />
            </Field>
            <Field label="Phương thức / tiến độ thanh toán" htmlFor="paymentPlan">
              <TextArea id="paymentPlan" rows={4} {...text('paymentPlan')} placeholder={'VD:\n- Thanh toán chuẩn: 10 đợt theo tiến độ\n- Thanh toán sớm 95%: chiết khấu 9%'} />
            </Field>
            <Field label="Ngân hàng bảo lãnh / cho vay" htmlFor="banks">
              <TextArea id="banks" rows={3} {...text('banks')} placeholder="VD: Vietcombank bảo lãnh; vay tối đa 70%, hỗ trợ lãi suất 0% trong 24 tháng" />
            </Field>
            <Field label="Chính sách bán hàng hiện hành" htmlFor="salesPolicy">
              <TextArea id="salesPolicy" rows={4} {...text('salesPolicy')} placeholder="Chiết khấu, quà tặng, ưu đãi theo đợt…" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Pháp lý & tiến độ" icon={Scale} description={<>Checklist 12 hồ sơ pháp lý cập nhật trực tiếp ở tab <b>Pháp lý</b> của dự án.</>}>
          <div className="space-y-4">
            <FieldGrid>
              <Field label="Hình thức sở hữu" htmlFor="ownership">
                <TextInput id="ownership" list="ownership-options" {...text('ownership')} />
              </Field>
              <Field label="Khởi công" htmlFor="startDate">
                <TextInput id="startDate" {...text('startDate')} placeholder="VD: Quý I/2025" />
              </Field>
              <Field label="Bàn giao dự kiến" htmlFor="handover">
                <TextInput id="handover" {...text('handover')} placeholder="VD: Quý IV/2027" />
              </Field>
              <Field label="Tiến độ hiện tại" htmlFor="construction">
                <TextInput id="construction" {...text('construction')} placeholder="VD: Đã cất nóc tòa A" />
              </Field>
              <Field label="Tiêu chuẩn bàn giao" htmlFor="handoverStandard">
                <TextInput id="handoverStandard" list="handover-options" {...text('handoverStandard')} />
              </Field>
              <Field label="Phí quản lý" htmlFor="managementFee">
                <TextInput id="managementFee" {...text('managementFee')} placeholder="VD: 15.000 đ/m²/tháng" />
              </Field>
              <Field label="Phí gửi xe" htmlFor="parkingFee">
                <TextInput id="parkingFee" {...text('parkingFee')} placeholder="VD: Ô tô 1,5 triệu/tháng" />
              </Field>
            </FieldGrid>
            <Field label="Tóm tắt tình trạng pháp lý" htmlFor="legalStatus">
              <TextArea id="legalStatus" rows={3} {...text('legalStatus')} placeholder="VD: Đã có văn bản đủ điều kiện bán của Sở Xây dựng; sổ hồng dự kiến cấp sau bàn giao 6 tháng…" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Giới thiệu dự án" icon={FileText} description="Thông tin công khai — dùng để gửi khách và in phiếu tư vấn.">
          <div className="space-y-4">
            <Field label="Tổng quan" htmlFor="description">
              <TextArea id="description" rows={5} {...text('description')} />
            </Field>
            <Field label="Điểm nổi bật" htmlFor="highlights" hint="Mỗi dòng một ý.">
              <TextArea id="highlights" rows={5} {...text('highlights')} placeholder={'VD:\n- Mặt tiền đại lộ 60m\n- Pháp lý đầy đủ, ngân hàng bảo lãnh'} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Nội bộ" icon={Lock} tone="internal" description="Chỉ bạn xem được — ẩn trong chế độ khách xem, tin đăng và phiếu tư vấn.">
          <div className="space-y-4">
            <Field label="Điểm cần lưu ý khi tư vấn" htmlFor="cautions">
              <TextArea id="cautions" rows={3} {...text('cautions')} placeholder="Nhược điểm, câu hỏi khó, cách xử lý từ chối…" />
            </Field>
            <Field label="So sánh dự án cạnh tranh" htmlFor="competitors">
              <TextArea id="competitors" rows={3} {...text('competitors')} />
            </Field>
            <Field label="Thị trường thứ cấp & cho thuê" htmlFor="marketInfo">
              <TextArea id="marketInfo" rows={3} {...text('marketInfo')} placeholder="Giá chuyển nhượng, giá thuê, tỷ suất cho thuê…" />
            </Field>
            <FieldGrid cols={2}>
              <Field label="Chính sách hoa hồng" htmlFor="commission">
                <TextArea id="commission" rows={3} {...text('commission')} />
              </Field>
              <Field label="Danh bạ đầu mối" htmlFor="contacts">
                <TextArea id="contacts" rows={3} {...text('contacts')} placeholder="Admin CĐT / F1, cán bộ ngân hàng…" />
              </Field>
            </FieldGrid>
            <FieldGrid cols={2}>
              <Field label="Nguồn thông tin" htmlFor="infoSource">
                <TextInput id="infoSource" {...text('infoSource')} placeholder="VD: Tài liệu CĐT đợt 3, sàn F1 ABC" />
              </Field>
              <Field label="Ghi chú khác" htmlFor="internalNotes">
                <TextArea id="internalNotes" rows={2} {...text('internalNotes')} />
              </Field>
            </FieldGrid>
          </div>
        </FormSection>

        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          Hình ảnh, tài liệu, checklist pháp lý và Q&A được thêm / cập nhật trực tiếp trên trang dự án — không cần vào form này.
        </p>
      </div>

      <FormFooter dirty={dirty} saving={saving} onSave={() => void submit()} cancelTo={isNew ? '/du-an' : `/du-an/${d.id}`} saveLabel={isNew ? 'Tạo dự án' : 'Lưu thay đổi'} />
    </div>
  );
}
