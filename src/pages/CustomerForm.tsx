import { CalendarClock, ClipboardList, StickyNote, Target, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FieldGrid, FormFooter, FormSection, useDraft } from '../components/form';
import { ChipMultiSelect, EnumSelect, MoneyInput, NumberInput, ProvinceSelect, TagInput } from '../components/inputs';
import { Field, PageHeader, Segmented, Select, TextArea, TextInput, Toggle } from '../components/ui';
import {
  CUSTOMER_SOURCE_LABEL,
  CUSTOMER_STATUS,
  CUSTOMER_STATUSES,
  DIRECTION_LABEL,
  DIRECTIONS,
  PAYMENT_LABEL,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  PURPOSE_LABEL,
  TEMPERATURE,
  TEMPERATURES,
} from '../constants';
import { emptyCustomer } from '../lib/defaults';
import { todayStr } from '../lib/format';
import { goBack, navigate, releaseNavigationGuard, useLocation } from '../lib/router';
import { digitsOnly } from '../lib/text';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, CustomerSource, CustomerStatus } from '../types';
import { NotFound } from './NotFound';

export function CustomerForm({ id }: { id?: string }) {
  const { customerById, settings } = useData();
  const { query } = useLocation();
  const initial = useMemo(() => {
    if (id) return customerById.get(id);
    const projectId = query.get('du-an');
    return emptyCustomer({
      province: settings.defaultProvince,
      projectIds: projectId ? [projectId] : [],
      nextFollowUp: todayStr(1),
    });
    // Chỉ tính khi mở form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!initial) return <NotFound what="khách hàng" backTo="/khach" />;
  return <CustomerFormInner initial={initial} isNew={!id} />;
}

function CustomerFormInner({ initial, isNew }: { initial: Customer; isNew: boolean }) {
  const { customers, customerById, projects, saveCustomer } = useData();
  const { toast } = useUI();
  const { draft: d, update, dirty } = useDraft<Customer>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const duplicates = useMemo(() => {
    const phones = [digitsOnly(d.phone), digitsOnly(d.phone2)].filter((p) => p.length >= 9);
    if (!phones.length) return [];
    return customers.filter((c) => c.id !== d.id && [digitsOnly(c.phone), digitsOnly(c.phone2)].some((p) => p && phones.includes(p)));
  }, [customers, d.phone, d.phone2, d.id]);

  const locationSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) c.locations.forEach((l) => set.add(l));
    return [...set].slice(0, 16);
  }, [customers]);

  const submit = async () => {
    if (saving) return;
    if (!d.name.trim()) {
      setError('Vui lòng nhập tên khách.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const latest = d.id ? customerById.get(d.id) : undefined;
      const saved = await saveCustomer({
        ...d,
        name: d.name.trim(),
        // Nhật ký và danh sách BĐS giới thiệu được cập nhật ở trang chi tiết.
        interests: latest?.interests ?? d.interests,
        interactions: latest?.interactions ?? d.interactions,
      });
      releaseNavigationGuard();
      toast(isNew ? `Đã thêm khách ${saved.name}` : 'Đã lưu thay đổi');
      if (isNew) navigate(`/khach/${saved.id}`, { replace: true });
      else goBack(`/khach/${saved.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không lưu được', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        backTo={isNew ? '/khach' : `/khach/${d.id}`}
        title={isNew ? 'Thêm khách hàng' : `Sửa ${initial.name}`}
        subtitle="Nhu cầu càng rõ, gợi ý BĐS phù hợp càng chính xác."
      />

      <div className="space-y-5">
        <FormSection title="Thông tin liên hệ" icon={UserRound}>
          <FieldGrid>
            <Field label="Họ tên / cách xưng hô" required htmlFor="name" hint={error ? <span className="font-semibold text-rose-600">{error}</span> : undefined}>
              <TextInput
                id="name"
                value={d.name}
                autoFocus={isNew}
                onChange={(e) => {
                  setError('');
                  update({ name: e.target.value });
                }}
                placeholder="VD: Chị Lan (Q7)"
              />
            </Field>
            <Field
              label="Số điện thoại"
              htmlFor="phone"
              hint={
                duplicates.length ? (
                  <span className="text-amber-700">
                    Trùng với:{' '}
                    {duplicates.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ', '}
                        <b>
                          {c.code} {c.name}
                        </b>
                      </span>
                    ))}
                  </span>
                ) : undefined
              }
            >
              <TextInput id="phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="09xx xxx xxx" />
            </Field>
            <Field label="SĐT khác" htmlFor="phone2">
              <TextInput id="phone2" type="tel" inputMode="tel" value={d.phone2} onChange={(e) => update({ phone2: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="email">
              <TextInput id="email" type="email" inputMode="email" value={d.email} onChange={(e) => update({ email: e.target.value })} />
            </Field>
            <Field label="Nơi ở hiện tại" htmlFor="address">
              <TextInput id="address" value={d.address} onChange={(e) => update({ address: e.target.value })} />
            </Field>
            <Field label="Nghề nghiệp" htmlFor="occupation">
              <TextInput id="occupation" value={d.occupation} onChange={(e) => update({ occupation: e.target.value })} />
            </Field>
            <Field label="Năm sinh" htmlFor="birthYear">
              <NumberInput id="birthYear" integer value={d.birthYear} onChange={(birthYear) => update({ birthYear })} placeholder="VD: 1988" />
            </Field>
            <Field label="Nguồn khách" htmlFor="source">
              <Select id="source" value={d.source} onChange={(e) => update({ source: e.target.value as CustomerSource })}>
                {(Object.keys(CUSTOMER_SOURCE_LABEL) as CustomerSource[]).map((s) => (
                  <option key={s} value={s}>
                    {CUSTOMER_SOURCE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Phân loại" icon={Target}>
          <FieldGrid cols={2}>
            <Field label="Trạng thái chăm sóc" htmlFor="status">
              <Select id="status" value={d.status} onChange={(e) => update({ status: e.target.value as CustomerStatus })}>
                {CUSTOMER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CUSTOMER_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mức độ tiềm năng">
              <Segmented
                value={d.temperature}
                onChange={(temperature) => update({ temperature })}
                options={TEMPERATURES.map((t) => ({ value: t, label: TEMPERATURE[t].label }))}
                className="w-full"
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Nhu cầu" icon={ClipboardList} description="Dùng để tự động ghép BĐS phù hợp.">
          <div className="space-y-5">
            <Field label="Khách muốn">
              <Segmented
                value={d.transaction}
                onChange={(transaction) => update({ transaction })}
                options={[
                  { value: 'ban', label: 'Mua' },
                  { value: 'cho_thue', label: 'Thuê' },
                ]}
              />
            </Field>
            <Field label="Loại hình quan tâm">
              <ChipMultiSelect
                options={PROPERTY_TYPES.filter((t) => t !== 'khac').map((t) => ({ value: t, label: PROPERTY_TYPE_LABEL[t] }))}
                value={d.propertyTypes}
                onChange={(propertyTypes) => update({ propertyTypes })}
              />
            </Field>
            {projects.length > 0 && (
              <Field label="Dự án quan tâm">
                <ChipMultiSelect options={projects.map((p) => ({ value: p.id, label: p.name }))} value={d.projectIds} onChange={(projectIds) => update({ projectIds })} />
              </Field>
            )}
            <FieldGrid cols={2}>
              <Field label="Tỉnh / Thành phố" htmlFor="province">
                <ProvinceSelect id="province" value={d.province} onChange={(province) => update({ province })} placeholder="— Không giới hạn —" />
              </Field>
              <Field label="Khu vực / tuyến đường" hint="Gõ rồi nhấn Enter, vd “Quận 7”, “Nguyễn Hữu Thọ”.">
                <TagInput value={d.locations} onChange={(locations) => update({ locations })} suggestions={locationSuggestions} placeholder="VD: Quận 7" />
              </Field>
              <Field label="Ngân sách từ" htmlFor="budgetMin">
                <MoneyInput id="budgetMin" value={d.budgetMin} onChange={(budgetMin) => update({ budgetMin })} defaultUnit={d.transaction === 'ban' ? 1e9 : 1e6} />
              </Field>
              <Field label="Ngân sách đến" htmlFor="budgetMax">
                <MoneyInput id="budgetMax" value={d.budgetMax} onChange={(budgetMax) => update({ budgetMax })} defaultUnit={d.transaction === 'ban' ? 1e9 : 1e6} />
              </Field>
              <Field label="Diện tích từ" htmlFor="areaMin">
                <NumberInput id="areaMin" value={d.areaMin} onChange={(areaMin) => update({ areaMin })} suffix="m²" />
              </Field>
              <Field label="Diện tích đến" htmlFor="areaMax">
                <NumberInput id="areaMax" value={d.areaMax} onChange={(areaMax) => update({ areaMax })} suffix="m²" />
              </Field>
              <Field label="Phòng ngủ tối thiểu" htmlFor="bedroomsMin">
                <NumberInput id="bedroomsMin" integer value={d.bedroomsMin} onChange={(bedroomsMin) => update({ bedroomsMin })} suffix="PN" />
              </Field>
              <div className="flex items-center sm:pt-6">
                <Toggle checked={d.requireLegal} onChange={(requireLegal) => update({ requireLegal })} label="Chỉ nhận sổ riêng" />
              </div>
              <Field label="Mục đích" htmlFor="purpose">
                <EnumSelect id="purpose" value={d.purpose} onChange={(purpose) => update({ purpose })} labels={PURPOSE_LABEL} placeholder="— Chọn —" />
              </Field>
              <Field label="Phương thức thanh toán" htmlFor="payment">
                <EnumSelect id="payment" value={d.payment} onChange={(payment) => update({ payment })} labels={PAYMENT_LABEL} placeholder="— Chọn —" />
              </Field>
            </FieldGrid>
            <Field label="Hướng ưu tiên">
              <ChipMultiSelect options={DIRECTIONS.map((x) => ({ value: x, label: DIRECTION_LABEL[x] }))} value={d.directions} onChange={(directions) => update({ directions })} />
            </Field>
            <Field label="Yêu cầu khác" htmlFor="requirements">
              <TextArea
                id="requirements"
                rows={3}
                value={d.requirements}
                onChange={(e) => update({ requirements: e.target.value })}
                placeholder="VD: Gần trường quốc tế, tầng trung, view sông, cần dọn vào trước Tết…"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Lịch chăm sóc" icon={CalendarClock}>
          <FieldGrid cols={2}>
            <Field label="Hẹn chăm sóc tiếp" htmlFor="nextFollowUp">
              <TextInput id="nextFollowUp" type="date" value={d.nextFollowUp} onChange={(e) => update({ nextFollowUp: e.target.value })} />
            </Field>
            <Field label="Nội dung hẹn" htmlFor="nextFollowUpNote">
              <TextInput id="nextFollowUpNote" value={d.nextFollowUpNote} onChange={(e) => update({ nextFollowUpNote: e.target.value })} placeholder="VD: Gửi bảng giá đợt mới" />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Ghi chú" icon={StickyNote}>
          <TextArea rows={4} value={d.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Tính cách, người quyết định, khả năng tài chính, lịch rảnh…" />
        </FormSection>
      </div>

      <FormFooter dirty={dirty} saving={saving} onSave={() => void submit()} cancelTo={isNew ? '/khach' : `/khach/${d.id}`} saveLabel={isNew ? 'Thêm khách' : 'Lưu thay đổi'} />
    </div>
  );
}
