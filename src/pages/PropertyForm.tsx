import { Building2, Banknote, FileText, House, Lock, MapPin, Plus, Ruler, Sparkles, StickyNote, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldGrid, FormFooter, FormSection, useDraft } from '../components/form';
import { EnumSelect, MoneyInput, NumberInput, ProvinceSelect, TagInput } from '../components/inputs';
import { Button, Field, Modal, PageHeader, Segmented, Select, TextArea, TextInput, Toggle } from '../components/ui';
import {
  AMENITY_SUGGESTIONS,
  BROKER_CONTRACT_LABEL,
  DIRECTION_LABEL,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  LEGAL_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  SELLER_RELATION_LABEL,
  UNIT_TYPES,
  URGENCY,
  isApartment,
  isLand,
  propertyStatusLabel,
} from '../constants';
import { emptyProject, emptyProperty } from '../lib/defaults';
import { formatNumber, formatUnitPrice } from '../lib/format';
import { suggestTitle } from '../lib/listing';
import { mainArea } from '../lib/match';
import { goBack, navigate, releaseNavigationGuard, useLocation } from '../lib/router';
import { digitsOnly } from '../lib/text';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Property, SellerInfo } from '../types';
import { NotFound } from './NotFound';

export function PropertyForm({ id }: { id?: string }) {
  const { propertyById, projectById, properties, settings } = useData();
  const { query } = useLocation();

  const initial = useMemo(() => {
    if (id) return propertyById.get(id);
    const projectId = query.get('du-an') ?? '';
    const project = projectById.get(projectId);
    const lastProvince = properties[0]?.province ?? '';
    return emptyProperty({
      projectId: project ? project.id : '',
      type: project?.productTypes[0] ?? 'nha_rieng',
      ward: project?.ward ?? '',
      area: project?.area ?? '',
      province: project?.province || settings.defaultProvince || lastProvince,
    });
    // Chỉ tính một lần khi mở form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!initial) return <NotFound what="BĐS" backTo="/bds" />;
  return <PropertyFormInner initial={initial} isNew={!id} />;
}

function PropertyFormInner({ initial, isNew }: { initial: Property; isNew: boolean }) {
  const { projects, projectById, properties, propertyById, saveProperty } = useData();
  const { toast } = useUI();
  const { draft, update, dirty } = useDraft<Property>(initial);
  const [saving, setSaving] = useState(false);
  const [quickProject, setQuickProject] = useState(false);

  const d = draft;
  const project = projectById.get(d.projectId);
  const land = isLand(d.type);
  const apartment = isApartment(d.type);
  const showUnit = UNIT_TYPES.includes(d.type) || !!d.projectId;
  const updateSeller = (patch: Partial<SellerInfo>) => update({ seller: { ...d.seller, ...patch } });

  const sameOwner = useMemo(() => {
    const phone = digitsOnly(d.seller.phone);
    if (phone.length < 9) return [];
    return properties.filter((p) => p.id !== d.id && digitsOnly(p.seller.phone) === phone);
  }, [properties, d.seller.phone, d.id]);

  const suggestedArea = d.width && d.length ? Math.round(d.width * d.length * 100) / 100 : undefined;
  const unitPrice = d.transaction === 'ban' ? formatUnitPrice(d.price, mainArea(d)) : '';

  const chooseProject = (projectId: string) => {
    const next = projectById.get(projectId);
    update({
      projectId,
      // Điền sẵn vị trí theo dự án nếu đang để trống.
      ward: d.ward || next?.ward || '',
      area: d.area || next?.area || '',
      province: d.province || next?.province || '',
    });
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const latest = d.id ? propertyById.get(d.id) : undefined;
      const title = d.title.trim() || suggestTitle(d, project);
      const saved = await saveProperty({
        ...d,
        title,
        // Ảnh và tài liệu được quản lý ở trang chi tiết — giữ bản mới nhất.
        images: latest?.images ?? d.images,
        documents: latest?.documents ?? d.documents,
      });
      releaseNavigationGuard();
      if (isNew) {
        toast(`Đã thêm ${saved.code}. Thêm ảnh và giấy tờ ngay bên dưới.`);
        navigate(`/bds/${saved.id}`, { replace: true });
      } else {
        toast('Đã lưu thay đổi');
        goBack(`/bds/${saved.id}`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không lưu được', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        backTo={isNew ? '/bds' : `/bds/${d.id}`}
        title={isNew ? 'Thêm BĐS mới' : `Sửa ${d.code}`}
        subtitle={isNew ? 'Chỉ cần điền những gì bạn đang có — có thể bổ sung sau.' : d.title}
      />

      <div className="space-y-5">
        <FormSection title="Thông tin chính" icon={House}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Nhu cầu">
                <Segmented
                  value={d.transaction}
                  onChange={(transaction) => update({ transaction })}
                  options={[
                    { value: 'ban', label: 'Bán' },
                    { value: 'cho_thue', label: 'Cho thuê' },
                  ]}
                />
              </Field>
              <Toggle
                className="flex-1 sm:max-w-xs"
                checked={d.featured}
                onChange={(featured) => update({ featured })}
                label="BĐS nổi bật"
                description="Ưu tiên hiển thị đầu danh sách"
              />
            </div>
            <FieldGrid>
              <Field label="Loại hình" htmlFor="type">
                <Select id="type" value={d.type} onChange={(e) => update({ type: e.target.value as Property['type'] })}>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PROPERTY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Trạng thái" htmlFor="status">
                <Select id="status" value={d.status} onChange={(e) => update({ status: e.target.value as Property['status'] })}>
                  {PROPERTY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {propertyStatusLabel(s, d.transaction)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Thuộc dự án"
                htmlFor="project"
                aside={
                  <button type="button" onClick={() => setQuickProject(true)} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline">
                    <Plus size={13} /> Dự án mới
                  </button>
                }
              >
                <Select id="project" value={d.projectId} onChange={(e) => chooseProject(e.target.value)}>
                  <option value="">— BĐS lẻ, không thuộc dự án —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {showUnit && (
                <Field label="Mã căn / Tòa / Tầng" htmlFor="unitCode">
                  <TextInput id="unitCode" value={d.unitCode} onChange={(e) => update({ unitCode: e.target.value })} placeholder="VD: S1.02-1508" />
                </Field>
              )}
            </FieldGrid>
            <Field
              label="Tiêu đề"
              htmlFor="title"
              hint="Để trống sẽ tự tạo tiêu đề từ thông tin bên dưới."
              aside={
                <button
                  type="button"
                  onClick={() => update({ title: suggestTitle(d, project) })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  <Wand2 size={13} /> Gợi ý tiêu đề
                </button>
              }
            >
              <TextInput id="title" value={d.title} onChange={(e) => update({ title: e.target.value })} placeholder={suggestTitle(d, project)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Vị trí" icon={MapPin} description="Địa chỉ theo đơn vị hành chính mới (34 tỉnh/thành, từ 01/07/2025).">
          <FieldGrid>
            <Field label="Số nhà, tên đường" htmlFor="street" className="sm:col-span-2 lg:col-span-1">
              <TextInput id="street" value={d.street} onChange={(e) => update({ street: e.target.value })} placeholder="VD: 123/4 Nguyễn Văn Linh" />
            </Field>
            <Field label="Phường / Xã" htmlFor="ward">
              <TextInput id="ward" value={d.ward} onChange={(e) => update({ ward: e.target.value })} placeholder="VD: Phường Tân Thuận" />
            </Field>
            <Field label="Tỉnh / Thành phố" htmlFor="province">
              <ProvinceSelect id="province" value={d.province} onChange={(province) => update({ province })} />
            </Field>
            <Field label="Khu vực / địa chỉ cũ" htmlFor="area" hint="Tên quen gọi giúp tìm kiếm, vd “Quận 7 cũ”.">
              <TextInput id="area" value={d.area} onChange={(e) => update({ area: e.target.value })} placeholder="VD: Quận 7 cũ" />
            </Field>
            {!apartment && (
              <Field label="Vị trí" htmlFor="frontage">
                <EnumSelect id="frontage" value={d.frontage} onChange={(frontage) => update({ frontage })} labels={FRONTAGE_LABEL} placeholder="— Chọn —" />
              </Field>
            )}
            {!apartment && (
              <Field label="Độ rộng đường / hẻm" htmlFor="roadWidth">
                <NumberInput id="roadWidth" value={d.roadWidth} onChange={(roadWidth) => update({ roadWidth })} suffix="m" />
              </Field>
            )}
            <Field label="Link Google Maps" htmlFor="mapUrl" className="sm:col-span-2 lg:col-span-3">
              <TextInput id="mapUrl" type="url" inputMode="url" value={d.mapUrl} onChange={(e) => update({ mapUrl: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title={land ? 'Diện tích' : 'Diện tích & kết cấu'} icon={Ruler}>
          <FieldGrid>
            <Field
              label={land ? 'Diện tích đất' : apartment ? 'DT tim tường / đất' : 'Diện tích đất'}
              htmlFor="landArea"
              hint={
                suggestedArea && suggestedArea !== d.landArea ? (
                  <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => update({ landArea: suggestedArea })}>
                    Dùng {formatNumber(suggestedArea, 2)} m² (ngang × dài)
                  </button>
                ) : undefined
              }
            >
              <NumberInput id="landArea" value={d.landArea} onChange={(landArea) => update({ landArea })} suffix="m²" />
            </Field>
            {!land && (
              <Field label={apartment ? 'DT thông thủy' : 'Diện tích sử dụng'} htmlFor="floorArea" hint={apartment ? 'Dùng để tính giá/m².' : 'Tổng diện tích sàn.'}>
                <NumberInput id="floorArea" value={d.floorArea} onChange={(floorArea) => update({ floorArea })} suffix="m²" />
              </Field>
            )}
            {!apartment && (
              <>
                <Field label="Chiều ngang" htmlFor="width">
                  <NumberInput id="width" value={d.width} onChange={(width) => update({ width })} suffix="m" />
                </Field>
                <Field label="Chiều dài" htmlFor="length">
                  <NumberInput id="length" value={d.length} onChange={(length) => update({ length })} suffix="m" />
                </Field>
                <Field label="Nở hậu (ngang mặt sau)" htmlFor="backWidth">
                  <NumberInput id="backWidth" value={d.backWidth} onChange={(backWidth) => update({ backWidth })} suffix="m" />
                </Field>
              </>
            )}
            {!land && (
              <>
                {!apartment && (
                  <Field label="Số tầng" htmlFor="floors">
                    <NumberInput id="floors" integer value={d.floors} onChange={(floors) => update({ floors })} suffix="tầng" />
                  </Field>
                )}
                <Field label="Phòng ngủ" htmlFor="bedrooms">
                  <NumberInput id="bedrooms" integer value={d.bedrooms} onChange={(bedrooms) => update({ bedrooms })} suffix="PN" />
                </Field>
                <Field label="Phòng tắm / WC" htmlFor="bathrooms">
                  <NumberInput id="bathrooms" integer value={d.bathrooms} onChange={(bathrooms) => update({ bathrooms })} suffix="WC" />
                </Field>
              </>
            )}
            <Field label={apartment ? 'Hướng cửa chính' : 'Hướng nhà / đất'} htmlFor="direction">
              <EnumSelect id="direction" value={d.direction} onChange={(direction) => update({ direction })} labels={DIRECTION_LABEL} placeholder="— Chọn —" />
            </Field>
            {apartment && (
              <Field label="Hướng ban công" htmlFor="balconyDirection">
                <EnumSelect id="balconyDirection" value={d.balconyDirection} onChange={(balconyDirection) => update({ balconyDirection })} labels={DIRECTION_LABEL} placeholder="— Chọn —" />
              </Field>
            )}
            {!land && (
              <>
                <Field label="Nội thất" htmlFor="furnishing">
                  <EnumSelect id="furnishing" value={d.furnishing} onChange={(furnishing) => update({ furnishing })} labels={FURNISHING_LABEL} placeholder="— Chọn —" />
                </Field>
                <Field label="Năm xây dựng" htmlFor="yearBuilt">
                  <NumberInput id="yearBuilt" integer value={d.yearBuilt} onChange={(yearBuilt) => update({ yearBuilt })} placeholder="VD: 2019" />
                </Field>
              </>
            )}
          </FieldGrid>
        </FormSection>

        <FormSection title="Giá & pháp lý" icon={Banknote}>
          <FieldGrid>
            <Field label={d.transaction === 'ban' ? 'Giá chào bán' : 'Giá thuê / tháng'} htmlFor="price" hint={unitPrice ? `≈ ${unitPrice}` : 'Để trống nếu giá thoả thuận.'}>
              <MoneyInput id="price" value={d.price} onChange={(price) => update({ price })} defaultUnit={d.transaction === 'ban' ? 1e9 : 1e6} />
            </Field>
            <Field label="Pháp lý" htmlFor="legal">
              <EnumSelect id="legal" value={d.legal} onChange={(legal) => update({ legal })} labels={LEGAL_LABEL} placeholder="— Chọn —" />
            </Field>
            <div className="flex items-center sm:pt-6">
              <Toggle checked={d.negotiable} onChange={(negotiable) => update({ negotiable })} label="Còn thương lượng" />
            </div>
          </FieldGrid>
        </FormSection>

        <FormSection title="Mô tả & tiện ích" icon={FileText} description="Thông tin công khai — dùng cho tin đăng và phiếu tư vấn.">
          <div className="space-y-4">
            <Field label="Mô tả chi tiết" htmlFor="description">
              <TextArea
                id="description"
                rows={6}
                value={d.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Ưu điểm nổi bật, hiện trạng, kết cấu từng tầng, tiềm năng khai thác…"
              />
            </Field>
            <Field label="Tiện ích & đặc điểm" hint="Bấm gợi ý hoặc tự gõ rồi nhấn Enter.">
              <TagInput value={d.amenities} onChange={(amenities) => update({ amenities })} suggestions={AMENITY_SUGGESTIONS} placeholder="VD: Gần chợ" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Thông tin chủ nhà" icon={Lock} tone="internal" description="Nội bộ — không bao giờ hiển thị cho khách, kể cả trong tin đăng và phiếu tư vấn.">
          <div className="space-y-4">
            <FieldGrid>
              <Field label="Tên chủ nhà" htmlFor="sellerName">
                <TextInput id="sellerName" value={d.seller.name} onChange={(e) => updateSeller({ name: e.target.value })} placeholder="VD: Anh Hùng" />
              </Field>
              <Field
                label="Số điện thoại"
                htmlFor="sellerPhone"
                hint={sameOwner.length ? `SĐT này đã có ở: ${sameOwner.map((p) => p.code).join(', ')}` : undefined}
              >
                <TextInput id="sellerPhone" type="tel" inputMode="tel" value={d.seller.phone} onChange={(e) => updateSeller({ phone: e.target.value })} placeholder="09xx xxx xxx" />
              </Field>
              <Field label="SĐT khác" htmlFor="sellerPhone2">
                <TextInput id="sellerPhone2" type="tel" inputMode="tel" value={d.seller.phone2} onChange={(e) => updateSeller({ phone2: e.target.value })} />
              </Field>
              <Field label="Quan hệ" htmlFor="relation">
                <EnumSelect id="relation" value={d.seller.relation} onChange={(relation) => updateSeller({ relation: relation ?? 'chinh_chu' })} labels={SELLER_RELATION_LABEL} />
              </Field>
              <Field label="Email" htmlFor="sellerEmail">
                <TextInput id="sellerEmail" type="email" inputMode="email" value={d.seller.email} onChange={(e) => updateSeller({ email: e.target.value })} />
              </Field>
              <Field label="Địa chỉ liên hệ" htmlFor="sellerAddress">
                <TextInput id="sellerAddress" value={d.seller.address} onChange={(e) => updateSeller({ address: e.target.value })} />
              </Field>
            </FieldGrid>
            <FieldGrid>
              <Field label="Giá chốt tối thiểu" htmlFor="minPrice" hint="Mức thấp nhất chủ nhà đồng ý.">
                <MoneyInput id="minPrice" value={d.seller.minPrice} onChange={(minPrice) => updateSeller({ minPrice })} defaultUnit={d.transaction === 'ban' ? 1e9 : 1e6} />
              </Field>
              <Field
                label="Hoa hồng"
                aside={
                  <Segmented
                    size="sm"
                    value={d.seller.commissionType}
                    onChange={(commissionType) => updateSeller({ commissionType, commissionValue: undefined })}
                    options={[
                      { value: 'percent', label: '%' },
                      { value: 'amount', label: 'Số tiền' },
                    ]}
                  />
                }
              >
                {d.seller.commissionType === 'percent' ? (
                  <NumberInput value={d.seller.commissionValue} onChange={(commissionValue) => updateSeller({ commissionValue })} suffix="%" placeholder="VD: 1,5" />
                ) : (
                  <MoneyInput value={d.seller.commissionValue} onChange={(commissionValue) => updateSeller({ commissionValue })} defaultUnit={1e6} />
                )}
              </Field>
              <Field label="Mức độ cần bán">
                <Segmented
                  value={d.seller.urgency}
                  onChange={(urgency) => updateSeller({ urgency })}
                  options={(Object.keys(URGENCY) as Array<keyof typeof URGENCY>).map((k) => ({ value: k, label: URGENCY[k].label }))}
                  className="w-full"
                />
              </Field>
              <Field label="Hợp đồng môi giới" htmlFor="contract">
                <EnumSelect id="contract" value={d.seller.contract} onChange={(contract) => updateSeller({ contract: contract ?? 'chua_ky' })} labels={BROKER_CONTRACT_LABEL} />
              </Field>
              {d.seller.contract !== 'chua_ky' && (
                <Field label="Hợp đồng hết hạn" htmlFor="contractExpiry">
                  <TextInput id="contractExpiry" type="date" value={d.seller.contractExpiry} onChange={(e) => updateSeller({ contractExpiry: e.target.value })} />
                </Field>
              )}
              <Field label="Lý do bán" htmlFor="reason" className={d.seller.contract === 'chua_ky' ? 'lg:col-span-2' : ''}>
                <TextInput id="reason" value={d.seller.reason} onChange={(e) => updateSeller({ reason: e.target.value })} placeholder="VD: Cần vốn kinh doanh" />
              </Field>
            </FieldGrid>
            <Field label="Ghi chú về chủ nhà" htmlFor="sellerNotes">
              <TextArea id="sellerNotes" rows={3} value={d.seller.notes} onChange={(e) => updateSeller({ notes: e.target.value })} placeholder="Tính cách, thời gian tiện liên hệ, lịch xem nhà…" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Ghi chú nội bộ" icon={StickyNote} tone="internal">
          <TextArea
            rows={4}
            value={d.internalNotes}
            onChange={(e) => update({ internalNotes: e.target.value })}
            placeholder="Lịch sử giá, khách đã xem, điểm cần lưu ý khi dẫn khách…"
          />
        </FormSection>
      </div>

      <FormFooter dirty={dirty} saving={saving} onSave={() => void submit()} cancelTo={isNew ? '/bds' : `/bds/${d.id}`} saveLabel={isNew ? 'Thêm BĐS' : 'Lưu thay đổi'} />

      <QuickProjectModal
        open={quickProject}
        onClose={() => setQuickProject(false)}
        defaultProvince={d.province}
        onCreated={(projectId) => {
          setQuickProject(false);
          chooseProject(projectId);
        }}
      />
    </div>
  );
}

/** Tạo nhanh dự án (chỉ tên, CĐT, tỉnh) mà không rời form hiện tại. */
export function QuickProjectModal({
  open,
  onClose,
  onCreated,
  defaultProvince = '',
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
  defaultProvince?: string;
}) {
  const { saveProject } = useData();
  const { toast } = useUI();
  const [name, setName] = useState('');
  const [developer, setDeveloper] = useState('');
  const [province, setProvince] = useState(defaultProvince);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const project = await saveProject(emptyProject({ name: name.trim(), developer: developer.trim(), province }));
      toast(`Đã tạo dự án ${project.name}`);
      setName('');
      setDeveloper('');
      onCreated(project.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo nhanh dự án"
      description="Bổ sung đầy đủ hồ sơ, tài liệu, hình ảnh của dự án sau ở mục Dự án."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" icon={Building2} onClick={() => void create()} loading={saving} disabled={!name.trim()}>
            Tạo dự án
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label="Tên dự án" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vinhomes Grand Park" />
        </Field>
        <Field label="Chủ đầu tư">
          <TextInput value={developer} onChange={(e) => setDeveloper(e.target.value)} />
        </Field>
        <Field label="Tỉnh / Thành phố">
          <ProvinceSelect value={province} onChange={setProvince} />
        </Field>
        <button type="submit" hidden />
      </form>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Sparkles size={13} /> Mẹo: dự án giúp gom tài liệu, hình ảnh dùng chung cho mọi căn.
      </p>
    </Modal>
  );
}
