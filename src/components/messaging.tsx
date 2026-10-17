import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CircleCheck,
  Copy,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  Smartphone,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CUSTOMER_TAG_SUGGESTIONS } from '../constants';
import { uniqueTags } from '../lib/defaults';
import { formatPhone, todayStr, zaloHref } from '../lib/format';
import { uid } from '../lib/id';
import { copyText } from '../lib/listing';
import {
  BCC_BATCH,
  CHANNEL_LABEL,
  chunk,
  fillTemplate,
  gmailHref,
  hasTag,
  isEmail,
  mailtoHref,
  missingTokens,
  sentInteraction,
  smsHref,
  smsInfo,
  tagCounts,
  tokenLabel,
  TOKENS,
  tokenValues,
  toTemplate,
  usesProject,
  withoutDiacritics,
  type Channel,
  type TokenGroup,
  type TokenKey,
  type TokenValues,
} from '../lib/messages';
import { navigate } from '../lib/router';
import { DEFAULT_MESSAGE_TEMPLATES } from '../lib/templates';
import { digitsOnly } from '../lib/text';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, Interaction, MessageTemplate, Project } from '../types';
import { applyInteraction } from './customer';
import { TagInput } from './inputs';
import { Avatar, Button, ButtonLink, Card, CardHeader, Checkbox, cn, Field, IconButton, Modal, Segmented, Select, TextArea, TextInput } from './ui';

/*
 * Gửi tin chăm sóc khách: một khách (soạn sẵn từ mẫu, sửa trực tiếp) hoặc một nhóm khách
 * (một email BCC chung, hoặc tin riêng từng khách qua Email / Zalo / SMS), ghi nhật ký chăm sóc.
 */

const hasPhone = (c: Customer) => digitsOnly(c.phone).length >= 8;

// ---------------------------------------------------------------- Ghi nhật ký

type FollowUp = '' | 'done' | '3' | '7' | '14' | '30';

const FOLLOW_UPS: Array<{ value: FollowUp; label: string }> = [
  { value: '', label: 'Giữ lịch hẹn hiện tại' },
  { value: 'done', label: 'Xong — bỏ lịch hẹn' },
  { value: '3', label: 'Hẹn lại sau 3 ngày' },
  { value: '7', label: 'Hẹn lại sau 1 tuần' },
  { value: '14', label: 'Hẹn lại sau 2 tuần' },
  { value: '30', label: 'Hẹn lại sau 1 tháng' },
];

const followUpPatch = (f: FollowUp): Partial<Customer> =>
  f === 'done' ? { nextFollowUp: '', nextFollowUpNote: '' } : f ? { nextFollowUp: todayStr(Number(f)) } : {};

/** Ghi "Gửi email" / "Nhắn tin Zalo/SMS" vào nhật ký của các khách (tự nâng trạng thái như khi ghi tay). */
function useSendLog() {
  const { patchCustomers } = useData();
  return (ids: string[], channel: Channel, subject: string, body: string, opts: { groupSize?: number; followUp?: FollowUp } = {}) => {
    const entry = sentInteraction(channel, subject, body, opts.groupSize);
    const at = new Date().toISOString();
    return patchCustomers(ids, (cur) => {
      const interaction: Interaction = { id: uid(), at, ...entry };
      const result = applyInteraction(cur, interaction);
      return {
        interactions: [interaction, ...cur.interactions].sort((a, b) => b.at.localeCompare(a.at)),
        status: result.status,
        interests: result.interests,
        ...followUpPatch(opts.followUp ?? ''),
      };
    });
  };
}

// ---------------------------------------------------------------- Phần dùng chung

const TOKEN_GROUPS: TokenGroup[] = ['Khách', 'Dự án', 'Môi giới', 'Khác'];

/** Bảng các ô tự điền — bấm để chèn vào vị trí con trỏ. */
function TokenPalette({ onPick, collapsible = true }: { onPick: (label: string) => void; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
        <Plus size={13} strokeWidth={2.6} /> Chèn ô tự điền ({'{xưng hô}'}, {'{dự án}'}…)
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-200/70">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Bấm để chèn — khi gửi sẽ tự thay bằng thông tin của từng khách.</span>
        {collapsible && <IconButton icon={X} label="Ẩn ô tự điền" size="sm" onClick={() => setOpen(false)} className="size-6" />}
      </div>
      {TOKEN_GROUPS.map((g) => (
        <div key={g} className="flex flex-wrap items-center gap-1">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g}</span>
          {TOKENS.filter((t) => t.group === g).map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.hint || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(t.label)}
              className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-brand-50 hover:text-brand-800"
            >
              {t.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

type Editable = HTMLInputElement | HTMLTextAreaElement;

/** Chèn chữ vào ô đang soạn tại vị trí con trỏ. */
function insertInto(el: Editable | null, value: string, text: string, set: (v: string) => void) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  set(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
}

const MISSING_HINT: Partial<Record<TokenKey, string>> = {
  nhucau: 'khách chưa có nhu cầu',
  duan: 'chưa chọn dự án',
  vitriduan: 'dự án chưa có địa chỉ',
  giaduan: 'dự án chưa có giá',
  chudautu: 'dự án chưa có chủ đầu tư',
  bangiao: 'dự án chưa có thời gian bàn giao',
  uudai: 'dự án chưa có ưu đãi còn hạn',
  moigioi: 'chưa nhập tên trong Cài đặt',
  sdtmoigioi: 'chưa nhập SĐT trong Cài đặt',
  emailmoigioi: 'chưa nhập email trong Cài đặt',
  vanphong: 'chưa nhập tên văn phòng trong Cài đặt',
  chuky: 'chưa có hồ sơ môi giới',
};
const PROFILE_TOKENS: TokenKey[] = ['moigioi', 'sdtmoigioi', 'emailmoigioi', 'vanphong', 'chuky'];

function MissingNote({ keys, future }: { keys: TokenKey[]; future?: boolean }) {
  if (!keys.length) return null;
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
      {future ? 'Sẽ bỏ dòng thiếu dữ liệu: ' : 'Đã bỏ dòng thiếu dữ liệu: '}
      {keys.map((k) => `${tokenLabel(k)} (${MISSING_HINT[k] ?? 'trống'})`).join(', ')}.
      {keys.some((k) => PROFILE_TOKENS.includes(k)) && (
        <>
          {' '}
          <button type="button" onClick={() => navigate('/cai-dat')} className="font-semibold underline">
            Mở Cài đặt
          </button>
        </>
      )}
    </p>
  );
}

function TemplateSelect({ templates, value, onChange }: { templates: MessageTemplate[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select id="msg-template" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Tự soạn —</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

function ProjectSelect({ projects, preferred, value, onChange }: { projects: Project[]; preferred: string[]; value: string; onChange: (id: string) => void }) {
  const top = projects.filter((p) => preferred.includes(p.id));
  const rest = projects.filter((p) => !preferred.includes(p.id));
  return (
    <Select id="msg-project" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Chọn dự án —</option>
      {top.length > 0 && (
        <optgroup label="Khách quan tâm">
          {top.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {rest.length > 0 && (
        <optgroup label={top.length ? 'Dự án khác' : 'Dự án'}>
          {rest.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

function FollowUpSelect({ value, onChange }: { value: FollowUp; onChange: (v: FollowUp) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as FollowUp)} aria-label="Lịch hẹn chăm sóc" className="h-9 py-1.5 text-[13px]">
      {FOLLOW_UPS.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </Select>
  );
}

function SmsCounter({ text, onStrip }: { text: string; onStrip: () => void }) {
  const info = smsInfo(text);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span>
        {info.length.toLocaleString('vi-VN')} ký tự · <b className="text-slate-700">{info.segments} tin SMS</b>
        {info.unicode ? ' (có dấu: 70 ký tự / tin)' : ' (không dấu: 160 ký tự / tin)'}
      </span>
      {info.unicode && (
        <button type="button" onClick={onStrip} className="font-semibold text-brand-700 hover:underline">
          Bỏ dấu cho rẻ hơn
        </button>
      )}
    </div>
  );
}

/** Lưu tin đang soạn thành mẫu mới (tên khách, dự án… đổi thành ô tự điền). */
function SaveTemplateInline({ subject, body, suggestedName, onClose }: { subject: string; body: string; suggestedName: string; onClose: (saved?: MessageTemplate) => void }) {
  const { settings, updateSettings } = useData();
  const { toast } = useUI();
  const [name, setName] = useState(suggestedName);
  const save = async () => {
    const t: MessageTemplate = { id: uid(), name: name.trim() || 'Mẫu tin', subject, body };
    await updateSettings({ messageTemplates: [...settings.messageTemplates, t] });
    toast(`Đã lưu mẫu “${t.name}” — sửa trong Cài đặt → Mẫu tin`);
    onClose(t);
  };
  return (
    <div className="space-y-2.5 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <Field label="Tên mẫu" htmlFor="tpl-new-name">
        <TextInput id="tpl-new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Gửi bảng giá đợt mới" />
      </Field>
      <p className="text-xs leading-relaxed text-slate-500">Tên khách, dự án và thông tin của bạn được đổi thành ô tự điền để dùng lại cho khách khác:</p>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2.5 font-sans text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
        {subject ? `${subject}\n\n${body}` : body}
      </pre>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onClose()}>
          Huỷ
        </Button>
        <Button size="sm" variant="primary" icon={BookmarkPlus} onClick={() => void save()}>
          Lưu mẫu
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Gửi tin cho một khách

export function CustomerMessageModal({
  customer,
  open,
  onClose,
  templateId,
  channel,
}: {
  customer: Customer | null | undefined;
  open: boolean;
  onClose: () => void;
  templateId?: string;
  channel?: Channel;
}) {
  if (!open || !customer) return null;
  return <SingleComposer customer={customer} onClose={onClose} initialTemplateId={templateId} initialChannel={channel} />;
}

const greetingOnly = (v: TokenValues) => `Chào ${v.xungho},\n`;

function SingleComposer({
  customer: c,
  onClose,
  initialTemplateId,
  initialChannel,
}: {
  customer: Customer;
  onClose: () => void;
  initialTemplateId?: string;
  initialChannel?: Channel;
}) {
  const { settings, projects, projectById } = useData();
  const { toast, confirm } = useUI();
  const templates = settings.messageTemplates;
  const emailOk = isEmail(c.email);
  const phoneOk = hasPhone(c);
  const logSend = useSendLog();

  const [channel, setChannel] = useState<Channel>(initialChannel ?? (emailOk || !phoneOk ? 'email' : 'zalo'));
  const [projectId, setProjectId] = useState(() => c.projectIds.find((id) => projectById.has(id)) ?? '');
  const project = projectById.get(projectId);
  const values = useMemo(() => tokenValues({ settings, customer: c, project, projectById }), [settings, c, project, projectById]);
  const valuesFor = (pid: string) => tokenValues({ settings, customer: c, project: projectById.get(pid), projectById });

  const initial = templates.find((t) => t.id === initialTemplateId);
  const [templateId, setTemplateId] = useState(initial?.id ?? '');
  const [subject, setSubject] = useState(() => (initial ? fillTemplate(initial.subject, values, false) : ''));
  const [body, setBody] = useState(() => (initial ? fillTemplate(initial.body, values) : greetingOnly(values)));
  const [missing, setMissing] = useState<TokenKey[]>(() => (initial ? missingTokens(`${initial.subject}\n${initial.body}`, values) : []));
  const [edited, setEdited] = useState(false);
  const [log, setLog] = useState(true);
  const [followUp, setFollowUp] = useState<FollowUp>('');
  const [sent, setSent] = useState<Channel[]>([]);
  const [saving, setSaving] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const showProject = !!template && usesProject(`${template.subject}\n${template.body}`) && projects.length > 0;

  const apply = (t: MessageTemplate | undefined, v: TokenValues) => {
    setSubject(t ? fillTemplate(t.subject, v, false) : '');
    setBody(t ? fillTemplate(t.body, v) : greetingOnly(v));
    setMissing(t ? missingTokens(`${t.subject}\n${t.body}`, v) : []);
    setEdited(false);
  };

  const pickTemplate = async (id: string) => {
    if (edited && body.trim()) {
      const ok = await confirm({ title: 'Thay nội dung đang soạn?', message: 'Nội dung bạn đã sửa sẽ được thay bằng mẫu mới.', confirmLabel: 'Dùng mẫu mới' });
      if (!ok) return;
    }
    setTemplateId(id);
    apply(
      templates.find((t) => t.id === id),
      values,
    );
  };

  const pickProject = (id: string) => {
    setProjectId(id);
    if (!edited) apply(template, valuesFor(id));
  };

  // Ô tự điền gõ tay vẫn được thay khi gửi.
  const finalSubject = fillTemplate(subject, values, false);
  const finalBody = fillTemplate(body, values);
  const ready = finalBody.trim().length > 0;

  const onSent = (ch: Channel) => {
    if (sent.includes(ch)) return;
    setSent((s) => [...s, ch]);
    if (!log) return;
    void logSend([c.id], ch, finalSubject, finalBody, { followUp }).then(() => toast('Đã ghi vào nhật ký chăm sóc'));
  };

  const copy = async (text: string, message = 'Đã copy nội dung') => {
    const ok = await copyText(text);
    toast(ok ? message : 'Không copy được — hãy chọn chữ rồi copy', ok ? 'success' : 'error');
  };

  const contactOk = channel === 'email' ? emailOk : phoneOk;
  const mail = { to: [c.email.trim()], subject: finalSubject, body: finalBody };

  let actions: ReactNode;
  if (!contactOk || !ready) {
    actions = (
      <Button variant="primary" icon={channel === 'email' ? Mail : channel === 'zalo' ? MessageCircle : Smartphone} disabled>
        Gửi {CHANNEL_LABEL[channel]}
      </Button>
    );
  } else if (channel === 'email') {
    actions = (
      <>
        <ButtonLink href={gmailHref(mail)} target="_blank" rel="noopener noreferrer" onClick={() => onSent('email')}>
          Gmail
        </ButtonLink>
        <ButtonLink href={mailtoHref(mail)} variant="primary" icon={Mail} onClick={() => onSent('email')}>
          Gửi email
        </ButtonLink>
      </>
    );
  } else if (channel === 'zalo') {
    actions = (
      <ButtonLink
        href={zaloHref(c.phone)}
        target="_blank"
        rel="noopener noreferrer"
        variant="primary"
        icon={MessageCircle}
        onClick={() => {
          void copy(finalBody, 'Đã copy tin — dán vào ô chat Zalo');
          onSent('zalo');
        }}
      >
        Copy & mở Zalo
      </ButtonLink>
    );
  } else {
    actions = (
      <ButtonLink href={smsHref(c.phone, finalBody)} variant="primary" icon={Smartphone} onClick={() => onSent('sms')}>
        Gửi SMS
      </ButtonLink>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Gửi tin cho ${c.name}`}
      description="Chọn mẫu, sửa nếu cần rồi gửi bằng ứng dụng mail, Zalo hoặc tin nhắn trên máy."
      footer={
        <>
          <Button icon={Copy} disabled={!ready} onClick={() => void copy(channel === 'email' && finalSubject ? `${finalSubject}\n\n${finalBody}` : finalBody)}>
            Copy
          </Button>
          {actions}
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={channel}
          onChange={setChannel}
          className="w-full"
          options={(['email', 'zalo', 'sms'] as Channel[]).map((ch) => ({
            value: ch,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {CHANNEL_LABEL[ch]}
                {sent.includes(ch) && <CircleCheck size={14} className="text-emerald-600" />}
              </span>
            ),
          }))}
        />
        {contactOk ? (
          <p className="text-[13px] text-slate-600">
            Gửi tới: <b className="text-slate-900">{channel === 'email' ? c.email.trim() : formatPhone(c.phone)}</b>
            {channel === 'zalo' && <span className="text-slate-500"> · Zalo chưa cho điền sẵn nội dung: tin được copy, mở Zalo rồi dán vào ô chat.</span>}
          </p>
        ) : (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800 ring-1 ring-inset ring-rose-200">
            Khách chưa có {channel === 'email' ? 'email' : 'số điện thoại'}.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                onClose();
                navigate(`/khach/${c.id}/sua`);
              }}
            >
              Thêm {channel === 'email' ? 'email' : 'số điện thoại'}
            </button>
          </p>
        )}

        <div className={cn('grid grid-cols-1 gap-3', showProject && 'sm:grid-cols-2')}>
          <Field
            label="Mẫu tin"
            htmlFor="msg-template"
            aside={
              template &&
              edited && (
                <button type="button" onClick={() => apply(template, values)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  <RotateCcw size={12} /> Điền lại
                </button>
              )
            }
          >
            <TemplateSelect templates={templates} value={templateId} onChange={(id) => void pickTemplate(id)} />
          </Field>
          {showProject && (
            <Field label="Dự án" htmlFor="msg-project">
              <ProjectSelect projects={projects} preferred={c.projectIds} value={projectId} onChange={pickProject} />
            </Field>
          )}
        </div>

        <MissingNote keys={missing} />

        {channel === 'email' && (
          <Field label="Tiêu đề" htmlFor="msg-subject">
            <TextInput
              id="msg-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setEdited(true);
              }}
            />
          </Field>
        )}
        <Field
          label="Nội dung"
          htmlFor="msg-body"
          aside={
            !saving && (
              <button type="button" onClick={() => setSaving(true)} disabled={!ready} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-40">
                <BookmarkPlus size={13} /> Lưu làm mẫu
              </button>
            )
          }
        >
          <TextArea
            id="msg-body"
            rows={10}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setEdited(true);
            }}
          />
        </Field>
        {channel === 'sms' && (
          <SmsCounter
            text={finalBody}
            onStrip={() => {
              setBody(withoutDiacritics(body));
              setEdited(true);
            }}
          />
        )}
        {saving && (
          <SaveTemplateInline
            subject={toTemplate(subject, values)}
            body={toTemplate(body, values)}
            suggestedName={template ? `${template.name} (bản sửa)` : 'Mẫu mới'}
            onClose={(t) => {
              setSaving(false);
              if (t) setTemplateId(t.id);
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <Checkbox checked={log} onChange={setLog} label="Ghi vào nhật ký chăm sóc khi gửi" />
          {log && (
            <div className="min-w-48 flex-1">
              <FollowUpSelect value={followUp} onChange={setFollowUp} />
            </div>
          )}
        </div>
        {sent.length > 0 && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
            <CircleCheck size={15} /> Đã mở {sent.map((s) => CHANNEL_LABEL[s]).join(', ')}
            {log ? ' · đã ghi nhật ký' : ''}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Gửi tin cho nhóm khách

type BulkMode = 'bcc' | 'each';
type MailApp = 'app' | 'gmail';

/** Dự án được nhiều khách trong nhóm quan tâm nhất. */
function commonProject(customers: Customer[], projectById: Map<string, Project>): string {
  const counts = new Map<string, number>();
  for (const c of customers) for (const id of c.projectIds) if (projectById.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function BulkMessageModal({ customers, open, onClose }: { customers: Customer[]; open: boolean; onClose: () => void }) {
  if (!open || customers.length === 0) return null;
  return <BulkComposer customers={customers} onClose={onClose} />;
}

function BulkComposer({ customers: latest, onClose }: { customers: Customer[]; onClose: () => void }) {
  const { settings, projects, projectById } = useData();
  // Giữ nguyên thứ tự lúc mở: khách vừa gửi được cập nhật (ghi nhật ký) không bị nhảy lên đầu.
  const [order] = useState(() => latest.map((c) => c.id));
  const customers = useMemo(() => {
    const byId = new Map(latest.map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter((c): c is Customer => !!c);
  }, [latest, order]);
  const { toast, confirm } = useUI();
  const templates = settings.messageTemplates;
  const logSend = useSendLog();
  const withEmail = customers.filter((c) => isEmail(c.email));
  const withoutEmail = customers.filter((c) => !isEmail(c.email));

  const [mode, setMode] = useState<BulkMode>(withEmail.length >= 2 ? 'bcc' : 'each');
  const [step, setStep] = useState<'compose' | 'send'>('compose');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Chào {xưng hô},\n');
  const [projectId, setProjectId] = useState(() => commonProject(customers, projectById));
  const [previewId, setPreviewId] = useState(customers[0].id);
  const [log, setLog] = useState(true);
  const [mailApp, setMailApp] = useState<MailApp>('app');
  /** Khách đã gửi, theo kênh. */
  const [done, setDone] = useState<Record<string, Channel[]>>({});
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'body'>('body');

  const project = projectById.get(projectId);
  const text = `${subject}\n${body}`;
  const showProject = usesProject(text) && projects.length > 0;
  const preferred = useMemo(() => [...new Set(customers.flatMap((c) => c.projectIds))], [customers]);

  const generic = useMemo(() => tokenValues({ settings, project, projectById }), [settings, project, projectById]);
  const perCustomer = useMemo(
    () =>
      new Map(
        customers.map((c) => {
          const v = tokenValues({ settings, customer: c, project, projectById });
          return [c.id, { subject: fillTemplate(subject, v, false), body: fillTemplate(body, v), values: v }];
        }),
      ),
    [customers, settings, project, projectById, subject, body],
  );
  const previewValues = mode === 'bcc' ? generic : (perCustomer.get(previewId)?.values ?? generic);
  const preview = { subject: fillTemplate(subject, previewValues, false), body: fillTemplate(body, previewValues) };

  const pickTemplate = async (id: string) => {
    if (edited && body.trim() && body !== 'Chào {xưng hô},\n') {
      const ok = await confirm({ title: 'Thay nội dung đang soạn?', message: 'Nội dung bạn đã sửa sẽ được thay bằng mẫu mới.', confirmLabel: 'Dùng mẫu mới' });
      if (!ok) return;
    }
    const t = templates.find((x) => x.id === id);
    setTemplateId(id);
    setSubject(t?.subject ?? '');
    setBody(t?.body ?? 'Chào {xưng hô},\n');
    setEdited(false);
  };

  const insert = (label: string) => {
    if (lastField.current === 'subject') insertInto(subjectRef.current, subject, label, setSubject);
    else insertInto(bodyRef.current, body, label, setBody);
    setEdited(true);
  };

  const mark = (ids: string[], ch: Channel) => setDone((d) => Object.fromEntries([...Object.entries(d), ...ids.map((id) => [id, [...new Set([...(d[id] ?? []), ch])]])]));

  const copy = async (value: string, message: string) => {
    const ok = await copyText(value);
    toast(ok ? message : 'Không copy được — hãy chọn chữ rồi copy', ok ? 'success' : 'error');
  };

  const sentCount = customers.filter((c) => done[c.id]?.length).length;
  const ownEmail = isEmail(settings.agentEmail) ? [settings.agentEmail.trim()] : [];

  const sendStep = () => {
    if (mode === 'bcc') {
      const batches = chunk(withEmail, BCC_BATCH);
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Một email chung cho <b className="text-slate-900">{withEmail.length} khách</b> có email
            {batches.length > 1 ? `, chia ${batches.length} đợt (tối đa ${BCC_BATCH} người nhận / đợt)` : ''}. Khách không thấy địa chỉ của nhau
            {ownEmail.length ? `; người nhận chính là email của bạn (${ownEmail[0]})` : ''}.
          </p>
          <Segmented
            size="sm"
            value={mailApp}
            onChange={setMailApp}
            options={[
              { value: 'app', label: 'Ứng dụng mail' },
              { value: 'gmail', label: 'Gmail (web)' },
            ]}
          />
          {batches.map((batch, i) => {
            const ids = batch.map((c) => c.id);
            const opened = ids.every((id) => done[id]?.includes('email'));
            const draft = { to: ownEmail, bcc: batch.map((c) => c.email.trim()), subject: preview.subject, body: preview.body };
            const onOpen = () => {
              if (!opened && log) void logSend(ids, 'email', preview.subject, preview.body, { groupSize: withEmail.length }).then((n) => toast(`Đã ghi nhật ký cho ${n} khách`));
              mark(ids, 'email');
            };
            return (
              <div key={i} className={cn('rounded-xl border p-3', opened ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200')}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{batches.length > 1 ? `Đợt ${i + 1} · ` : ''}{batch.length} người nhận</span>
                  {opened && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CircleCheck size={14} /> Đã mở
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{batch.map((c) => c.name).join(', ')}</p>
                <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                  <Button size="sm" icon={Copy} onClick={() => void copy(draft.bcc.join(', '), `Đã copy ${batch.length} email — dán vào ô BCC`)}>
                    Copy email
                  </Button>
                  <ButtonLink
                    size="sm"
                    variant="primary"
                    icon={Mail}
                    href={mailApp === 'gmail' ? gmailHref(draft) : mailtoHref(draft)}
                    {...(mailApp === 'gmail' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={onOpen}
                  >
                    {batches.length > 1 ? `Mở email đợt ${i + 1}` : 'Mở email'}
                  </ButtonLink>
                </div>
              </div>
            );
          })}
          {withoutEmail.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
              {withoutEmail.length} khách chưa có email: {withoutEmail.map((c) => c.name).join(', ')}.{' '}
              <button type="button" className="font-semibold underline" onClick={() => setMode('each')}>
                Gửi Zalo / SMS từng khách
              </button>
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            Đã gửi <b className="text-slate-900">{sentCount}</b> / {customers.length} khách
          </p>
          <Segmented
            size="sm"
            value={mailApp}
            onChange={setMailApp}
            options={[
              { value: 'app', label: 'Email: ứng dụng mail' },
              { value: 'gmail', label: 'Gmail (web)' },
            ]}
          />
        </div>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {customers.map((c) => {
            const m = perCustomer.get(c.id)!;
            const sentVia = done[c.id] ?? [];
            const onSent = (ch: Channel) => {
              if (!sentVia.includes(ch) && log) void logSend([c.id], ch, m.subject, m.body);
              mark([c.id], ch);
            };
            const draft = { to: [c.email.trim()], subject: m.subject, body: m.body };
            const chip = (ch: Channel, link: ReactNode) => (
              <span key={ch} className="relative inline-flex">
                {link}
                {sentVia.includes(ch) && <CircleCheck size={13} className="absolute -right-1 -top-1 rounded-full bg-white text-emerald-600" aria-label="Đã gửi" />}
              </span>
            );
            return (
              <li key={c.id} className={cn('px-3 py-2.5', sentVia.length > 0 && 'bg-emerald-50/40')} data-customer={c.id}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">{c.name}</span>
                      {sentVia.length > 0 && <CircleCheck size={14} className="shrink-0 text-emerald-600" />}
                    </div>
                    <div className="truncate text-xs text-slate-500">{[c.phone && formatPhone(c.phone), c.email.trim()].filter(Boolean).join(' · ') || 'Chưa có SĐT / email'}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                  {isEmail(c.email) &&
                    chip(
                      'email',
                      <ButtonLink
                        size="sm"
                        icon={Mail}
                        href={mailApp === 'gmail' ? gmailHref(draft) : mailtoHref(draft)}
                        {...(mailApp === 'gmail' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        onClick={() => onSent('email')}
                        aria-label={`Gửi email cho ${c.name}`}
                      >
                        Email
                      </ButtonLink>,
                    )}
                  {hasPhone(c) &&
                    chip(
                      'zalo',
                      <ButtonLink
                        size="sm"
                        icon={MessageCircle}
                        href={zaloHref(c.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          void copy(m.body, `Đã copy tin cho ${c.name} — dán vào Zalo`);
                          onSent('zalo');
                        }}
                        aria-label={`Gửi Zalo cho ${c.name}`}
                      >
                        Zalo
                      </ButtonLink>,
                    )}
                  {hasPhone(c) &&
                    chip(
                      'sms',
                      <ButtonLink size="sm" icon={Smartphone} href={smsHref(c.phone, m.body)} onClick={() => onSent('sms')} aria-label={`Gửi SMS cho ${c.name}`}>
                        SMS
                      </ButtonLink>,
                    )}
                  <IconButton icon={Copy} label={`Copy tin cho ${c.name}`} size="sm" onClick={() => void copy(m.body, `Đã copy tin cho ${c.name}`)} />
                </div>
                <details className="mt-1.5 text-xs">
                  <summary className="cursor-pointer select-none font-semibold text-slate-500 hover:text-slate-700">Xem tin</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 font-sans leading-relaxed text-slate-700">{m.body}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Gửi tin cho ${customers.length} khách`}
      description={
        step === 'compose'
          ? `${withEmail.length} khách có email · ${customers.filter(hasPhone).length} khách có số điện thoại`
          : mode === 'bcc'
            ? 'Bấm mở email, kiểm tra rồi bấm Gửi trong ứng dụng mail.'
            : 'Gửi lần lượt từng khách — tin đã có sẵn tên và nhu cầu của từng người.'
      }
      footer={
        step === 'compose' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" icon={ArrowRight} disabled={!body.trim() || (mode === 'bcc' && withEmail.length === 0)} onClick={() => setStep('send')}>
              Tiếp tục
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep('compose')}>
              Sửa nội dung
            </Button>
            {mode === 'bcc' && (
              <Button icon={Copy} onClick={() => void copy(preview.subject ? `${preview.subject}\n\n${preview.body}` : preview.body, 'Đã copy nội dung email')}>
                Copy nội dung
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Xong
            </Button>
          </>
        )
      }
    >
      {step === 'send' ? (
        sendStep()
      ) : (
        <div className="space-y-4">
          <div>
            <Segmented
              value={mode}
              onChange={setMode}
              className="w-full"
              options={[
                { value: 'bcc', label: 'Một email chung (BCC)' },
                { value: 'each', label: 'Gửi từng khách' },
              ]}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              {mode === 'bcc'
                ? withEmail.length
                  ? `Gửi một lần cho ${withEmail.length} khách có email; lời chào chung “Anh/Chị” vì không điền được tên từng người.`
                  : 'Chưa khách nào trong nhóm có email — hãy chọn “Gửi từng khách” để gửi Zalo / SMS.'
                : 'Mỗi khách nhận tin riêng có tên và nhu cầu của mình — gửi lần lượt qua Email, Zalo hoặc SMS.'}
            </p>
          </div>

          <div className={cn('grid grid-cols-1 gap-3', showProject && 'sm:grid-cols-2')}>
            <Field label="Mẫu tin" htmlFor="msg-template">
              <TemplateSelect templates={templates} value={templateId} onChange={(id) => void pickTemplate(id)} />
            </Field>
            {showProject && (
              <Field label="Dự án" htmlFor="msg-project">
                <ProjectSelect projects={projects} preferred={preferred} value={projectId} onChange={setProjectId} />
              </Field>
            )}
          </div>

          <Field label="Tiêu đề (khi gửi email)" htmlFor="msg-subject">
            <TextInput
              id="msg-subject"
              ref={subjectRef}
              value={subject}
              onFocus={() => (lastField.current = 'subject')}
              onChange={(e) => {
                setSubject(e.target.value);
                setEdited(true);
              }}
            />
          </Field>
          <Field
            label="Nội dung"
            htmlFor="msg-body"
            aside={
              !saving && (
                <button type="button" onClick={() => setSaving(true)} disabled={!body.trim()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-40">
                  <BookmarkPlus size={13} /> Lưu làm mẫu
                </button>
              )
            }
          >
            <TextArea
              id="msg-body"
              ref={bodyRef}
              rows={8}
              value={body}
              onFocus={() => (lastField.current = 'body')}
              onChange={(e) => {
                setBody(e.target.value);
                setEdited(true);
              }}
            />
          </Field>
          <TokenPalette onPick={insert} />
          {saving && (
            <SaveTemplateInline
              subject={subject}
              body={body}
              suggestedName={templateId ? `${templates.find((t) => t.id === templateId)?.name ?? 'Mẫu'} (bản sửa)` : 'Mẫu mới'}
              onClose={(t) => {
                setSaving(false);
                if (t) setTemplateId(t.id);
              }}
            />
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-slate-700">Xem trước</span>
              {mode === 'each' && (
                <div className="min-w-48">
                  <Select value={previewId} onChange={(e) => setPreviewId(e.target.value)} aria-label="Xem trước cho khách" className="h-9 py-1.5 text-[13px]">
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed text-slate-800" data-testid="message-preview">
              {preview.subject && <div className="mb-2 border-b border-slate-200 pb-2 font-semibold">{preview.subject}</div>}
              <div className="whitespace-pre-wrap">{preview.body || <span className="text-slate-400">Chưa có nội dung</span>}</div>
            </div>
            <MissingNote keys={missingTokens(text, previewValues)} future />
          </div>

          <Checkbox checked={log} onChange={setLog} label="Ghi vào nhật ký chăm sóc của từng khách khi gửi" />
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Gắn nhãn nhiều khách

export function BulkTagModal({ customerIds, open, onClose }: { customerIds: string[]; open: boolean; onClose: () => void }) {
  if (!open || customerIds.length === 0) return null;
  return <BulkTagger customerIds={customerIds} onClose={onClose} />;
}

function BulkTagger({ customerIds, onClose }: { customerIds: string[]; onClose: () => void }) {
  const { customers, customerById, patchCustomers } = useData();
  const { toast } = useUI();
  const [add, setAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const current = customerIds.map((id) => customerById.get(id)).filter((c): c is Customer => !!c);
  const present = tagCounts(current);
  const suggestions = uniqueTags([...tagCounts(customers).map((x) => x.tag), ...CUSTOMER_TAG_SUGGESTIONS]);

  const apply = async () => {
    setBusy(true);
    const n = await patchCustomers(customerIds, (c) => {
      const tags = uniqueTags([...c.tags, ...add]);
      return tags.length === c.tags.length ? null : { tags };
    });
    toast(n ? `Đã gắn nhãn cho ${n} khách` : 'Các khách đã có nhãn này');
    onClose();
  };

  const remove = async (tag: string) => {
    const n = await patchCustomers(customerIds, (c) => (hasTag(c, tag) ? { tags: c.tags.filter((t) => t.toLocaleLowerCase('vi') !== tag.toLocaleLowerCase('vi')) } : null));
    toast(`Đã bỏ nhãn “${tag}” khỏi ${n} khách`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Gắn nhãn cho ${current.length} khách`}
      description="Nhãn dùng để chia nhóm khách (VIP, Nhà đầu tư, Khách Aurora…) — lọc theo nhãn rồi gửi tin cả nhóm."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" icon={Tags} disabled={!add.length} loading={busy} onClick={() => void apply()}>
            Gắn nhãn
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Thêm nhãn" htmlFor="bulk-tags" hint="Gõ rồi nhấn Enter, hoặc bấm nhãn gợi ý.">
          <TagInput id="bulk-tags" value={add} onChange={setAdd} suggestions={suggestions} placeholder="VD: VIP" />
        </Field>
        {present.length > 0 && (
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Nhãn đang có — bấm × để bỏ khỏi các khách đã chọn</div>
            <div className="flex flex-wrap gap-1.5">
              {present.map(({ tag, count }) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-[13px] font-semibold text-slate-700">
                  {tag}
                  <span className="text-xs font-medium text-slate-400">{count}</span>
                  <button
                    type="button"
                    aria-label={`Bỏ nhãn ${tag}`}
                    onClick={() => void remove(tag)}
                    className="flex size-5 items-center justify-center rounded-md text-slate-400 hover:bg-rose-100 hover:text-rose-700"
                  >
                    <X size={13} strokeWidth={2.6} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Quản lý mẫu tin (Cài đặt)

const firstLine = (s: string) => s.split('\n').find((l) => l.trim()) ?? '';

export function MessageTemplatesCard() {
  const { settings, updateSettings } = useData();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const templates = settings.messageTemplates;
  const missingDefaults = DEFAULT_MESSAGE_TEMPLATES.filter((d) => !templates.some((t) => t.id === d.id));

  const save = async (t: MessageTemplate) => {
    const exists = templates.some((x) => x.id === t.id);
    await updateSettings({ messageTemplates: exists ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t] });
    toast(exists ? 'Đã lưu mẫu tin' : 'Đã thêm mẫu tin');
    setEditing(null);
  };

  const remove = async (t: MessageTemplate) => {
    const ok = await confirm({ title: `Xoá mẫu “${t.name}”?`, confirmLabel: 'Xoá mẫu', danger: true });
    if (!ok) return;
    await updateSettings({ messageTemplates: templates.filter((x) => x.id !== t.id) });
    toast('Đã xoá mẫu tin');
  };

  return (
    <Card>
      <CardHeader
        title="Mẫu tin chăm sóc khách"
        icon={MessageSquareText}
        description="Dùng khi gửi email, Zalo, SMS cho một khách hoặc cả nhóm — {xưng hô}, {nhu cầu}, {dự án}… tự điền theo từng khách."
        actions={
          <Button size="sm" icon={Plus} onClick={() => setEditing({ id: uid(), name: '', subject: '', body: 'Chào {xưng hô},\n\n\n{chữ ký}' })}>
            Thêm mẫu
          </Button>
        }
      />
      {templates.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">Chưa có mẫu tin nào.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
              <button type="button" onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-bold text-slate-900">{t.name}</div>
                <div className="truncate text-xs text-slate-500">{t.subject || firstLine(t.body)}</div>
              </button>
              <IconButton icon={Pencil} label={`Sửa mẫu ${t.name}`} size="sm" onClick={() => setEditing(t)} />
              <IconButton icon={Trash2} label={`Xoá mẫu ${t.name}`} size="sm" tone="danger" onClick={() => void remove(t)} />
            </li>
          ))}
        </ul>
      )}
      {missingDefaults.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2.5 sm:px-5">
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={() =>
              void updateSettings({ messageTemplates: [...templates, ...missingDefaults.map((d) => ({ ...d }))] }).then(() => toast(`Đã thêm lại ${missingDefaults.length} mẫu có sẵn`))
            }
          >
            Thêm lại {missingDefaults.length} mẫu có sẵn đã xoá
          </Button>
        </div>
      )}
      {editing && <TemplateEditModal template={editing} onClose={() => setEditing(null)} onSave={save} />}
    </Card>
  );
}

function TemplateEditModal({ template, onClose, onSave }: { template: MessageTemplate; onClose: () => void; onSave: (t: MessageTemplate) => Promise<void> }) {
  const { settings, customers, projects, projectById } = useData();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'body'>('body');

  // Xem thử với khách đầu tiên trong danh sách (hoặc lời chào chung nếu chưa có khách).
  const sample = customers[0];
  const sampleProject = projectById.get(sample?.projectIds.find((id) => projectById.has(id)) ?? '') ?? projects[0];
  const values = tokenValues({ settings, customer: sample, project: sampleProject, projectById });
  const insert = (label: string) => {
    if (lastField.current === 'subject') insertInto(subjectRef.current, subject, label, setSubject);
    else insertInto(bodyRef.current, body, label, setBody);
  };

  const save = async () => {
    setSaving(true);
    await onSave({ ...template, name: name.trim() || 'Mẫu tin', subject: subject.trim(), body });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={template.name ? `Sửa mẫu “${template.name}”` : 'Thêm mẫu tin'}
      description="Dòng có ô tự điền mà khách / dự án chưa có dữ liệu sẽ tự bỏ khi gửi."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" loading={saving} disabled={!body.trim()} onClick={() => void save()}>
            Lưu mẫu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tên mẫu" htmlFor="tpl-name">
          <TextInput id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Gửi bảng giá đợt mới" />
        </Field>
        <Field label="Tiêu đề email" htmlFor="tpl-subject">
          <TextInput id="tpl-subject" ref={subjectRef} value={subject} onFocus={() => (lastField.current = 'subject')} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Nội dung" htmlFor="tpl-body">
          <TextArea id="tpl-body" ref={bodyRef} rows={9} value={body} onFocus={() => (lastField.current = 'body')} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <TokenPalette onPick={insert} collapsible={false} />
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate-700">
            Xem thử{sample ? ` với ${sample.name}` : ''}
            {sampleProject && usesProject(`${subject}\n${body}`) ? ` · ${sampleProject.name}` : ''}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed text-slate-800">
            {subject && <div className="mb-2 border-b border-slate-200 pb-2 font-semibold">{fillTemplate(subject, values, false)}</div>}
            <div className="whitespace-pre-wrap">{fillTemplate(body, values)}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
