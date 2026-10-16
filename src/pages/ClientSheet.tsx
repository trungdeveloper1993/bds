import { ChevronLeft, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ImageView } from '../components/media';
import { resolveChecklist, UnitTypesTable } from '../components/project';
import { Button, Toggle } from '../components/ui';
import {
  ACTIVE_PROPERTY_STATUSES,
  DIRECTION_LABEL,
  DOC_CATEGORY,
  FRONTAGE_LABEL,
  FURNISHING_LABEL,
  LEGAL_LABEL,
  PROJECT_STAGE,
  PROPERTY_TYPE_LABEL,
  TRANSACTION_LABEL,
  isApartment,
  isLand,
} from '../constants';
import { formatArea, formatDate, formatNumber, formatPhone, formatPrice, formatUnitPrice } from '../lib/format';
import { formatAddress, formatPriceRange, formatProjectAddress } from '../lib/listing';
import { mainArea } from '../lib/match';
import { goBack, useLocation } from '../lib/router';
import { needsSummary } from '../lib/summary';
import { useData } from '../store/data';
import type { Project, Property } from '../types';

export function ClientSheet() {
  const { query } = useLocation();
  const { propertyById, projectById, customerById, settings } = useData();
  const [hideNumber, setHideNumber] = useState(true);
  const [showDescription, setShowDescription] = useState(true);

  const customer = customerById.get(query.get('kh') ?? '');
  const project = projectById.get(query.get('da') ?? '');
  const properties = (query.get('bds') ?? '')
    .split(',')
    .map((id) => propertyById.get(id))
    .filter((p): p is Property => !!p);

  const title = project ? 'THÔNG TIN DỰ ÁN' : 'PHIẾU TƯ VẤN BẤT ĐỘNG SẢN';
  const nothing = !project && properties.length === 0;

  return (
    <div className="min-h-dvh bg-slate-200/70 print:bg-white">
      <div className="pt-safe sticky top-0 z-10 border-b border-slate-300 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" icon={ChevronLeft} onClick={() => goBack(project ? `/du-an/${project.id}` : '/bds')}>
            Quay lại
          </Button>
          <div className="flex flex-wrap items-center gap-4">
            {!project && <Toggle checked={hideNumber} onChange={setHideNumber} label="Ẩn số nhà" />}
            <Toggle checked={showDescription} onChange={setShowDescription} label="Kèm mô tả" />
            <Button variant="primary" icon={Printer} onClick={() => window.print()} disabled={nothing}>
              In / Lưu PDF
            </Button>
          </div>
        </div>
        <p className="mx-auto max-w-[210mm] px-4 pb-2 text-xs text-slate-500">
          Mẹo: trên điện thoại chọn <b>In → Lưu thành PDF</b>, rồi gửi file PDF cho khách qua Zalo.
        </p>
      </div>

      <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:max-w-none print:p-0">
        <article className="bg-white px-5 py-6 shadow-xl sm:px-10 sm:py-9 print:px-0 print:py-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-700 pb-4">
            <div className="flex items-center gap-3">
              <img src="favicon.svg" alt="" className="size-11 rounded-xl" />
              <div>
                <div className="text-lg font-extrabold leading-tight text-slate-900">{settings.officeName || settings.agentName || 'Tư vấn bất động sản'}</div>
                {settings.officeAddress && <div className="text-xs text-slate-500">{settings.officeAddress}</div>}
              </div>
            </div>
            <div className="text-right text-sm">
              {settings.agentName && <div className="font-bold text-slate-900">{settings.agentName}</div>}
              {settings.agentTitle && <div className="text-xs text-slate-500">{settings.agentTitle}</div>}
              {settings.agentPhone && <div className="font-semibold text-brand-800">☎ {formatPhone(settings.agentPhone)}</div>}
              {settings.agentEmail && <div className="text-xs text-slate-600">{settings.agentEmail}</div>}
            </div>
          </header>

          <div className="mt-5 text-center">
            <h1 className="text-xl font-extrabold tracking-wide text-brand-900 sm:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">Ngày {formatDate(new Date().toISOString())}</p>
          </div>

          {customer && (
            <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm print:border print:border-slate-200">
              <div>
                Kính gửi: <b className="text-slate-900">{salutation(customer.name)}</b>
              </div>
              <div className="mt-0.5 text-slate-600">Nhu cầu: {needsSummary(customer, projectById)}</div>
            </div>
          )}

          {nothing && <p className="mt-10 text-center text-slate-500">Không có BĐS nào để hiển thị.</p>}

          {project && <ProjectSheet project={project} showDescription={showDescription} />}

          {properties.map((p, i) => (
            <PropertyBlock
              key={p.id}
              index={i + 1}
              property={p}
              project={projectById.get(p.projectId)}
              hideNumber={hideNumber}
              showDescription={showDescription}
            />
          ))}

          <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            Thông tin mang tính tham khảo tại thời điểm lập phiếu và có thể thay đổi theo chính sách của chủ đầu tư / chủ nhà. Vui lòng liên hệ{' '}
            {settings.agentName ? <b className="text-slate-700">{settings.agentName}</b> : 'chuyên viên tư vấn'}
            {settings.agentPhone ? ` (${formatPhone(settings.agentPhone)})` : ''} để được tư vấn chi tiết và đi xem thực tế.
          </footer>
        </article>
      </div>
    </div>
  );
}

/** "Chị Lan" giữ nguyên; "Nguyễn Văn A" → "Anh/Chị Nguyễn Văn A". */
function salutation(name: string): string {
  const trimmed = name.trim();
  return /^(anh|chị|chi|cô|chú|bác|ông|bà|em|mr\.?|mrs\.?|ms\.?)\s/i.test(trimmed) ? trimmed : `Anh/Chị ${trimmed}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <th className="w-40 py-1.5 pr-3 text-left align-top text-[13px] font-medium text-slate-500">{label}</th>
      <td className="py-1.5 text-[13px] font-semibold text-slate-800">{children}</td>
    </tr>
  );
}

function PropertyBlock({
  index,
  property: p,
  project,
  hideNumber,
  showDescription,
}: {
  index: number;
  property: Property;
  project?: Project;
  hideNumber: boolean;
  showDescription: boolean;
}) {
  const area = mainArea(p);
  const unitPrice = p.transaction === 'ban' ? formatUnitPrice(p.price, area) : '';
  return (
    <section className="mt-7 break-inside-avoid border-t border-slate-200 pt-6 first-of-type:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold leading-snug text-slate-900">
          {index}. {p.title || PROPERTY_TYPE_LABEL[p.type]}
        </h2>
        <span className="font-mono text-xs font-semibold text-slate-400">{p.code}</span>
      </div>
      <p className="mt-0.5 text-sm text-slate-600">
        {[project?.name, p.unitCode, formatAddress(p, { hideNumber })].filter(Boolean).join(' · ')}
      </p>

      {p.images.length === 1 && <ImageView id={p.images[0]} variant="full" eager className="mt-3 aspect-[16/9] w-full rounded-xl" />}
      {p.images.length === 2 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {p.images.map((id) => (
            <ImageView key={id} id={id} variant="full" eager className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}
      {p.images.length > 2 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <ImageView id={p.images[0]} variant="full" eager className="col-span-3 aspect-[16/9] rounded-xl sm:col-span-2 sm:row-span-2 sm:aspect-auto" />
          {p.images.slice(1, 3).map((id) => (
            <ImageView key={id} id={id} eager className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-brand-50/70 px-4 py-3 print:border print:border-brand-100">
        <div>
          <div className="text-xs font-semibold text-brand-700">{p.transaction === 'ban' ? 'Giá bán' : 'Giá thuê'}</div>
          <div className="text-2xl font-extrabold text-brand-900">{formatPrice(p.price, p.transaction)}</div>
        </div>
        <div className="text-right text-sm text-slate-600">
          {unitPrice && <div>≈ {unitPrice}</div>}
          {!!p.price && <div>{p.negotiable ? 'Có thương lượng' : 'Giá cố định'}</div>}
        </div>
      </div>

      <table className="mt-3 w-full">
        <tbody>
          <Row label="Loại hình">{`${PROPERTY_TYPE_LABEL[p.type]} · ${TRANSACTION_LABEL[p.transaction]}`}</Row>
          <Row label={isApartment(p.type) ? 'Diện tích' : 'Diện tích đất'}>{formatArea(area)}</Row>
          <Row label="Kích thước">
            {p.width && p.length ? `${formatNumber(p.width, 2)} × ${formatNumber(p.length, 2)} m${p.backWidth ? ` (nở hậu ${formatNumber(p.backWidth, 2)} m)` : ''}` : undefined}
          </Row>
          {!isApartment(p.type) && <Row label="Diện tích sử dụng">{formatArea(p.floorArea)}</Row>}
          {!isLand(p.type) && (
            <Row label="Kết cấu">
              {[p.floors && p.floors > 1 ? `${p.floors} tầng` : '', p.bedrooms ? `${p.bedrooms} phòng ngủ` : '', p.bathrooms ? `${p.bathrooms} WC` : '']
                .filter(Boolean)
                .join(' · ') || undefined}
            </Row>
          )}
          <Row label="Hướng">
            {[p.direction ? DIRECTION_LABEL[p.direction] : '', p.balconyDirection ? `ban công ${DIRECTION_LABEL[p.balconyDirection]}` : ''].filter(Boolean).join(', ') || undefined}
          </Row>
          <Row label="Vị trí">{p.frontage ? `${FRONTAGE_LABEL[p.frontage]}${p.roadWidth ? ` · đường ${formatNumber(p.roadWidth, 1)} m` : ''}` : undefined}</Row>
          <Row label="Pháp lý">{p.legal ? LEGAL_LABEL[p.legal] : undefined}</Row>
          {!isLand(p.type) && <Row label="Nội thất">{p.furnishing ? FURNISHING_LABEL[p.furnishing] : undefined}</Row>}
          <Row label="Tiện ích">{p.amenities.join(' · ') || undefined}</Row>
        </tbody>
      </table>

      {showDescription && p.description && <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{p.description}</p>}
    </section>
  );
}

function ProjectSheet({ project: p, showDescription }: { project: Project; showDescription: boolean }) {
  const { properties } = useData();
  const units = properties.filter((u) => u.projectId === p.id && ACTIVE_PROPERTY_STATUSES.includes(u.status));
  const legalDone = resolveChecklist(p).filter((i) => i.status === 'co');
  const publicDocs = p.documents.filter((d) => d.visibility === 'public' && !d.archived);
  const highlights = p.highlights
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*+]\s*/, ''))
    .filter(Boolean);

  return (
    <div className="mt-6">
      <h2 className="text-2xl font-extrabold text-slate-900">{p.name}</h2>
      {p.legalName && <p className="text-sm text-slate-500">{p.legalName}</p>}
      <p className="mt-1 text-sm text-slate-600">{formatProjectAddress(p)}</p>

      {p.images.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ImageView id={p.images[0]} variant="full" eager className="col-span-3 aspect-[16/9] rounded-xl" />
          {p.images.slice(1, 4).map((id) => (
            <ImageView key={id} id={id} eager className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      {(formatPriceRange(p.priceFrom, p.priceTo) || p.unitPrice) && (
        <div className="mt-4 rounded-xl bg-brand-50/70 px-4 py-3 print:border print:border-brand-100">
          <div className="text-xs font-semibold text-brand-700">Giá tham khảo</div>
          <div className="text-xl font-extrabold text-brand-900">{[formatPriceRange(p.priceFrom, p.priceTo), p.unitPrice].filter(Boolean).join(' · ')}</div>
          {p.priceNote && <div className="text-xs text-slate-600">{p.priceNote}</div>}
        </div>
      )}

      <table className="mt-3 w-full">
        <tbody>
          <Row label="Chủ đầu tư">{p.developer}</Row>
          <Row label="Đơn vị phát triển">{p.devPartner}</Row>
          <Row label="Tình trạng">{`${PROJECT_STAGE[p.stage].label}${p.construction ? ` – ${p.construction}` : ''}`}</Row>
          <Row label="Tổng diện tích">{p.siteArea ? `${formatNumber(p.siteArea, 2)} ha` : undefined}</Row>
          <Row label="Mật độ xây dựng">{p.density ? `${formatNumber(p.density, 1)}%` : undefined}</Row>
          <Row label="Quy mô">{[p.scale, p.totalUnits ? `${p.totalUnits.toLocaleString('vi-VN')} sản phẩm` : ''].filter(Boolean).join(' · ') || undefined}</Row>
          <Row label="Loại hình">{p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(', ') || undefined}</Row>
          <Row label="Diện tích sản phẩm">{p.unitAreaRange}</Row>
          <Row label="Hình thức sở hữu">{p.ownership}</Row>
          <Row label="Bàn giao">{[p.handover, p.handoverStandard].filter(Boolean).join(' · ') || undefined}</Row>
          <Row label="Phí quản lý">{p.managementFee}</Row>
          <Row label="Ngân hàng">{p.banks}</Row>
        </tbody>
      </table>

      {highlights.length > 0 && (
        <div className="mt-4 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Điểm nổi bật</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {showDescription && p.description && <p className="mt-4 whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{p.description}</p>}

      {(p.connectivity || p.amenities.length > 0 || p.nearby.length > 0) && (
        <div className="mt-4 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Vị trí & tiện ích</h3>
          {p.connectivity && <p className="mt-1.5 whitespace-pre-line text-[13px] text-slate-700">{p.connectivity}</p>}
          {p.amenities.length > 0 && <p className="mt-1.5 text-[13px] text-slate-700">Nội khu: {p.amenities.join(' · ')}</p>}
          {p.nearby.length > 0 && <p className="mt-1 text-[13px] text-slate-700">Ngoại khu: {p.nearby.join(' · ')}</p>}
        </div>
      )}

      {p.unitTypes.length > 0 && (
        <div className="mt-4 break-inside-avoid overflow-hidden rounded-xl border border-slate-200">
          <UnitTypesTable rows={p.unitTypes} />
        </div>
      )}

      {(p.paymentPlan || p.salesPolicy) && (
        <div className="mt-4 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Thanh toán & chính sách</h3>
          {p.paymentPlan && <p className="mt-1.5 whitespace-pre-line text-[13px] text-slate-700">{p.paymentPlan}</p>}
          {p.salesPolicy && <p className="mt-1.5 whitespace-pre-line text-[13px] text-slate-700">{p.salesPolicy}</p>}
        </div>
      )}

      {(p.legalStatus || legalDone.length > 0) && (
        <div className="mt-4 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Pháp lý</h3>
          {p.legalStatus && <p className="mt-1.5 whitespace-pre-line text-[13px] text-slate-700">{p.legalStatus}</p>}
          {legalDone.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[13px] text-slate-700">
              {legalDone.map((i) => (
                <li key={i.key}>
                  ✓ {i.label}
                  {i.note ? <span className="text-slate-500"> — {i.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {units.length > 0 && (
        <div className="mt-5 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Căn đang có sẵn ({units.length})</h3>
          <table className="mt-2 w-full text-left text-[13px]">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-1.5 pr-2 font-semibold">Mã</th>
                <th className="py-1.5 pr-2 font-semibold">Căn</th>
                <th className="py-1.5 pr-2 font-semibold">Diện tích</th>
                <th className="py-1.5 font-semibold">Giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="py-1.5 pr-2 font-mono text-xs text-slate-500">{u.code}</td>
                  <td className="py-1.5 pr-2 text-slate-800">{[u.unitCode, u.bedrooms ? `${u.bedrooms}PN` : '', u.direction ? DIRECTION_LABEL[u.direction] : ''].filter(Boolean).join(' · ') || PROPERTY_TYPE_LABEL[u.type]}</td>
                  <td className="py-1.5 pr-2 text-slate-800">{formatArea(mainArea(u))}</td>
                  <td className="py-1.5 font-semibold text-brand-800">{formatPrice(u.price, u.transaction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {publicDocs.length > 0 && (
        <div className="mt-5 break-inside-avoid">
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-800">Tài liệu có thể gửi kèm</h3>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-slate-700">
            {publicDocs.map((d) => (
              <li key={d.id}>
                • {d.name} <span className="text-slate-400">({DOC_CATEGORY[d.category].label})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
