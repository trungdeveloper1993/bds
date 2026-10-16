import {
  ArrowRight,
  Banknote,
  BookmarkPlus,
  Building2,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Copy,
  ExternalLink,
  FilePen,
  FileText,
  Files,
  HandCoins,
  House,
  Images,
  Info,
  Landmark,
  Lock,
  MapPin,
  MessageCircleQuestion,
  Mic,
  MicOff,
  Scale,
  Search,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LEGAL_REFERENCE, LEGAL_STATUS, PROPERTY_STATUS, propertyStatusLabel } from '../constants';
import { requestFocus } from '../lib/focus';
import { formatPrice } from '../lib/format';
import { copyText } from '../lib/listing';
import { navigate } from '../lib/router';
import {
  askProject,
  buildProjectIndex,
  highlightParts,
  matchedItems,
  quickQuestions,
  replyFor,
  type AnswerGroup,
  type Chunk,
  type ParsedQuery,
  type ProjectTab,
  type SmartResult,
  type Verdict,
} from '../lib/smartfind';
import { useUI } from '../store/ui';
import type { Project, Property } from '../types';
import { DocActions, FileTypeIcon } from './documents';
import { useFaqEditor } from './project';
import { Badge, Button, Card, cn } from './ui';

// ---------------------------------------------------------------- Nhận giọng nói (Web Speech API)

interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<SpeechResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function useSpeech(onText: (text: string) => void) {
  const { toast } = useUI();
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const supported = useMemo(() => !!speechCtor(), []);

  useEffect(() => () => rec.current?.abort(), []);

  const start = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = 'vi-VN';
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        onText(text);
      };
      r.onend = () => setListening(false);
      r.onerror = (e) => {
        setListening(false);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Chưa cho phép dùng micro — kiểm tra quyền của trình duyệt', 'error');
        else if (e.error === 'network') toast('Nhận giọng nói cần kết nối mạng', 'info');
      };
      rec.current = r;
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return { supported, listening, start, stop: () => rec.current?.stop() };
}

// ---------------------------------------------------------------- Ô Hỏi nhanh

/**
 * "Hỏi nhanh về dự án": khách hỏi gì, gõ (hoặc nói) đúng câu đó — hiện ngay đoạn thông tin
 * tương ứng trong hồ sơ, kèm câu trả lời mẫu để copy và nút nhảy tới đúng chỗ trong hồ sơ.
 */
export function ProjectSmartFind({
  project,
  units,
  privacy,
  editable,
  initialQuery,
  onJump,
}: {
  project: Project;
  units: Property[];
  privacy: boolean;
  editable: boolean;
  initialQuery?: string;
  onJump: (tab: ProjectTab, anchor: string) => void;
}) {
  const { toast } = useUI();
  const index = useMemo(() => buildProjectIndex(project, units, { privacy }), [project, units, privacy]);
  const suggestions = useMemo(() => quickQuestions(index), [index]);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [appliedInitial, setAppliedInitial] = useState(initialQuery);
  if (initialQuery !== appliedInitial) {
    setAppliedInitial(initialQuery);
    if (initialQuery) setQuery(initialQuery);
  }
  const deferred = useDeferredValue(query);
  const result = useMemo(() => askProject(index, deferred), [index, deferred]);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech(setQuery);
  const faq = useFaqEditor(project);
  const active = query.trim().length > 0;

  // Mở từ ô tìm kiếm chung ("aurora bàn giao khi nào") → đưa khung trả lời vào giữa màn hình.
  useEffect(() => {
    if (appliedInitial) requestFocus('smart-find-card', undefined, { flash: false });
  }, [appliedInitial]);

  const ask = (q: string) => {
    setQuery(q);
    inputRef.current?.focus({ preventScroll: true });
  };

  const copy = async (text: string) => {
    const ok = await copyText(text);
    toast(ok ? 'Đã copy câu trả lời — dán vào Zalo / Messenger cho khách' : 'Không copy được, hãy chọn và copy thủ công', ok ? 'success' : 'error');
  };

  const saveAsFaq = (answer = '') => {
    const q = query.trim();
    faq.open({ question: q.charAt(0).toUpperCase() + q.slice(1) + (/[?？]$/.test(q) ? '' : '?'), answer });
  };

  return (
    <Card id="smart-find-card" className="mb-5 overflow-hidden border-brand-200/70">
      <div className="bg-gradient-to-br from-brand-50/80 to-white p-3 sm:p-4">
        <label htmlFor="smart-find" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
          <MessageCircleQuestion size={17} className="text-brand-700" />
          Hỏi nhanh về dự án
          <span className="hidden font-normal text-slate-500 sm:inline">
            {privacy ? '— nhập câu hỏi, thông tin lấy từ hồ sơ dự án' : '— gõ hoặc nói đúng câu khách hỏi, trả lời lấy từ hồ sơ'}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              id="smart-find"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
                else if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              placeholder={`${privacy ? 'Bạn muốn biết gì?' : 'Khách hỏi gì?'} VD: bàn giao khi nào, vay mấy %, có hồ bơi không…`}
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-base text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Xoá câu hỏi"
                onClick={() => ask('')}
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={17} />
              </button>
            )}
          </div>
          {speech.supported && (
            <Button
              size="lg"
              variant={speech.listening ? 'danger' : 'secondary'}
              icon={speech.listening ? MicOff : Mic}
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? 'Dừng nghe' : 'Nói câu hỏi'}
              title={speech.listening ? 'Dừng nghe' : 'Nói câu hỏi (tiếng Việt)'}
              className={cn(speech.listening && 'animate-pulse')}
            />
          )}
        </div>

        {active && result.understood.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>Hiểu là:</span>
            {result.understood.map((u) => (
              <span key={u} className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                {u}
              </span>
            ))}
          </div>
        )}

        {!active && suggestions.length > 0 && <SuggestionChips items={suggestions} onPick={ask} className="mt-2.5" />}
      </div>

      {active && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4" aria-live="polite">
          <Results
            result={result}
            project={project}
            privacy={privacy}
            editable={editable}
            onJump={onJump}
            onCopy={(t) => void copy(t)}
            onSaveFaq={saveAsFaq}
            onAsk={ask}
            suggestions={suggestions}
          />
        </div>
      )}
      {faq.modal}
    </Card>
  );
}

function SuggestionChips({ items, onPick, className }: { items: string[]; onPick: (q: string) => void; className?: string }) {
  return (
    <div className={cn('no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0', className)}>
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:text-brand-800 hover:ring-brand-300"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Kết quả

function Results({
  result,
  project,
  privacy,
  editable,
  onJump,
  onCopy,
  onSaveFaq,
  onAsk,
  suggestions,
}: {
  result: SmartResult;
  project: Project;
  privacy: boolean;
  editable: boolean;
  onJump: (tab: ProjectTab, anchor: string) => void;
  onCopy: (text: string) => void;
  onSaveFaq: (answer?: string) => void;
  onAsk: (q: string) => void;
  suggestions: string[];
}) {
  const q = result.query;
  const docsFirst = (q.topics.get('tai_lieu') ?? 0) >= 1 || (q.topics.get('hinh_anh') ?? 0) >= 1;
  const nothing = !result.best && !result.related.length && !result.docs.length && !result.units.length && !result.verdict && !result.missing.length;
  const docs = result.docs.length > 0 && <DocsList groups={result.docs} q={q} onJump={onJump} />;

  if (nothing && !result.showUnits) {
    return (
      <div className="px-1 py-3 text-center">
        <CircleHelp size={26} className="mx-auto text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-800">Hồ sơ dự án chưa có thông tin cho câu này</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          {privacy
            ? 'Thử hỏi cách khác, hoặc chọn một câu gợi ý bên dưới.'
            : 'Thử hỏi cách khác (VD: "giá", "pháp lý", "tiện ích"…). Nếu khách hỏi điều hồ sơ chưa có, ghi lại để bổ sung câu trả lời sau.'}
        </p>
        {editable && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="primary" icon={BookmarkPlus} onClick={() => onSaveFaq()}>
              Ghi câu hỏi vào Q&A
            </Button>
            <Button size="sm" icon={FilePen} onClick={() => navigate(`/du-an/${project.id}/sua`)}>
              Bổ sung hồ sơ
            </Button>
          </div>
        )}
        {suggestions.length > 0 && <SuggestionChips items={suggestions.slice(0, 6)} onPick={onAsk} className="mt-4 justify-center" />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result.verdict && <VerdictBanner verdict={result.verdict} onJump={onJump} />}
      {result.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200">
          <TriangleAlert size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {privacy ? (
              <>Thông tin “{result.missing.join(', ')}” đang được cập nhật.</>
            ) : (
              <>
                Hồ sơ chưa nhập <b>{result.missing.join(', ')}</b> — hỏi lại CĐT / F1 rồi bổ sung để lần sau trả lời ngay.
              </>
            )}
          </span>
          {editable && (
            <Button size="sm" variant="soft" icon={FilePen} onClick={() => navigate(`/du-an/${project.id}/sua`)}>
              Bổ sung
            </Button>
          )}
        </div>
      )}
      {docsFirst && docs}
      {result.showUnits && <UnitsList result={result} privacy={privacy} onJump={onJump} />}
      {result.best && (
        <BestAnswer
          group={result.best}
          q={q}
          project={project}
          editable={editable}
          onJump={onJump}
          onCopy={onCopy}
          onSaveFaq={onSaveFaq}
        />
      )}
      {!docsFirst && docs}
      {result.related.length > 0 && (
        <section>
          <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Thông tin liên quan</h3>
          <div className="space-y-0.5">
            {result.related.map((g) => (
              <RelatedRow key={g.key} group={g} q={q} onJump={onJump} />
            ))}
          </div>
        </section>
      )}
      {editable && (result.verdict?.tone === 'unknown' || result.missing.length > 0 || !result.best) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-[13px] text-slate-600">Khách hỏi điều hồ sơ chưa có? Ghi lại để bổ sung câu trả lời chuẩn.</span>
          <Button size="sm" icon={BookmarkPlus} onClick={() => onSaveFaq()}>
            Ghi câu hỏi vào Q&A
          </Button>
        </div>
      )}
      <p className="px-1 text-[11px] text-slate-400">
        {privacy ? 'Thông tin tham khảo từ hồ sơ dự án.' : 'Trả lời lấy từ hồ sơ bạn đã nhập — nên kiểm tra lại bảng giá / chính sách mới nhất trước khi chốt với khách.'}
      </p>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict['tone'], { icon: LucideIcon; className: string }> = {
  yes: { icon: CircleCheck, className: 'bg-emerald-50 text-emerald-900 ring-emerald-200 [&_svg]:text-emerald-600' },
  no: { icon: CircleX, className: 'bg-rose-50 text-rose-900 ring-rose-200 [&_svg]:text-rose-600' },
  partial: { icon: Info, className: 'bg-amber-50 text-amber-900 ring-amber-200 [&_svg]:text-amber-600' },
  unknown: { icon: CircleHelp, className: 'bg-slate-100 text-slate-800 ring-slate-200 [&_svg]:text-slate-500' },
};

function VerdictBanner({ verdict, onJump }: { verdict: Verdict; onJump: (tab: ProjectTab, anchor: string) => void }) {
  const style = VERDICT_STYLE[verdict.tone];
  const canJump = verdict.tab !== undefined;
  const body = (
    <>
      <style.icon size={20} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{verdict.label}</span>
        <span className="block text-[13px] leading-relaxed opacity-90">{verdict.detail}</span>
      </span>
      {canJump && <ChevronRight size={18} className="mt-0.5 shrink-0 opacity-50" />}
    </>
  );
  const className = cn('flex w-full items-start gap-2.5 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset', style.className);
  return canJump ? (
    <button type="button" className={cn(className, 'transition hover:brightness-[.98]')} onClick={() => onJump(verdict.tab!, verdict.anchor ?? '')}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Chữ có tô sáng các từ khớp câu hỏi. */
function Hl({ text, q }: { text: string; q: ParsedQuery }) {
  const parts = useMemo(() => highlightParts(text, q), [text, q]);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-amber-100 px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

function iconFor(c: Chunk): LucideIcon {
  if (c.kind === 'faq') return MessageCircleQuestion;
  if (c.kind === 'rule') return Landmark;
  if (c.internal) return Lock;
  switch (c.tab) {
    case 'phap-ly':
      return Scale;
    case 'tai-lieu':
      return Files;
    case 'hinh-anh':
      return Images;
    case 'gio-hang':
      return House;
    default:
      break;
  }
  if (c.kind === 'list') return Sparkles;
  if (c.section.includes('giá')) return Banknote;
  if (c.section.startsWith('Thanh toán')) return HandCoins;
  if (c.section.startsWith('Vị trí')) return MapPin;
  if (c.section.startsWith('Giới thiệu')) return FileText;
  return Building2;
}

function sectionLabel(g: AnswerGroup): string {
  const c = g.top;
  if (c.kind === 'faq') return 'Hỏi đáp';
  if (c.kind === 'legal' || c.kind === 'unitType' || c.kind === 'rule') return c.section;
  return c.section === c.title ? c.title : `${c.section} · ${c.title}`;
}

function BestAnswer({
  group,
  q,
  project,
  editable,
  onJump,
  onCopy,
  onSaveFaq,
}: {
  group: AnswerGroup;
  q: ParsedQuery;
  project: Project;
  editable: boolean;
  onJump: (tab: ProjectTab, anchor: string) => void;
  onCopy: (text: string) => void;
  onSaveFaq: (answer?: string) => void;
}) {
  const c = group.top;
  const reply = replyFor(group, project, q);
  const Icon = iconFor(c);
  const hits = group.hits.slice(0, 8);
  const hidden = group.hits.length - hits.length + group.more;
  return (
    <article className="overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-brand-200">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Icon size={15} className="shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-brand-700">{sectionLabel(group)}</span>
        {group.internal && (
          <Badge tone="rose" size="sm" icon={Lock}>
            Nội bộ
          </Badge>
        )}
      </div>
      <div className="px-3.5 pb-3 pt-1.5">
        <AnswerBody group={group} hits={hits} q={q} />
        {hidden > 0 && <p className="mt-1.5 text-xs text-slate-400">và {hidden} dòng khác trong hồ sơ</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/50 px-2.5 py-2">
        {reply && (
          <Button size="sm" variant="soft" icon={Copy} onClick={() => onCopy(reply)}>
            Copy trả lời
          </Button>
        )}
        {group.internal && <span className="px-1 text-xs font-medium text-rose-700">Thông tin nội bộ — không gửi khách</span>}
        {c.link && (
          <a
            href={c.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            <ExternalLink size={14} /> {c.link.label}
          </a>
        )}
        {c.doc && <DocActions doc={c.doc} compact />}
        {editable && c.kind !== 'faq' && !group.internal && (
          <Button size="sm" variant="ghost" icon={BookmarkPlus} onClick={() => onSaveFaq(reply ?? '')} title="Lưu thành câu hỏi – trả lời chuẩn">
            <span className="hidden sm:inline">Lưu vào Q&A</span>
          </Button>
        )}
        <button
          type="button"
          onClick={() => onJump(c.tab, c.anchor)}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
        >
          Xem trong hồ sơ <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function AnswerBody({ group, hits, q }: { group: AnswerGroup; hits: Chunk[]; q: ParsedQuery }) {
  const c = group.top;
  switch (c.kind) {
    case 'fact':
      return (
        <p className="text-lg font-extrabold leading-snug text-slate-900">
          <Hl text={c.text} q={q} />
        </p>
      );
    case 'faq':
      return (
        <>
          <p className="text-[13px] font-semibold text-slate-500">
            <Hl text={c.title} q={q} />
          </p>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{c.text ? <Hl text={c.text} q={q} /> : <i className="text-slate-400">Chưa có câu trả lời</i>}</p>
        </>
      );
    case 'list': {
      const picked = new Set(matchedItems(c, q));
      const items = [...(c.items ?? [])].sort((a, b) => Number(picked.has(b)) - Number(picked.has(a)));
      return (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((it) => (
            <span
              key={it}
              className={cn(
                'rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1 ring-inset',
                picked.has(it) ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-slate-50 text-slate-600 ring-slate-200',
              )}
            >
              {it}
            </span>
          ))}
        </div>
      );
    }
    case 'legal':
      return (
        <ul className="space-y-2 pt-0.5">
          {hits.map((h) => (
            <li key={h.id}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">{h.title}</span>
                {h.legal && (
                  <Badge size="sm" tone={LEGAL_STATUS[h.legal.status].tone}>
                    {LEGAL_STATUS[h.legal.status].label}
                  </Badge>
                )}
              </div>
              {h.legal?.note && <p className="mt-0.5 text-[13px] text-slate-600">{h.legal.note}</p>}
              {h.doc && (
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                  <Files size={13} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{h.doc.name}</span>
                  <DocActions doc={h.doc} compact />
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    case 'unitType':
      return (
        <ul className="divide-y divide-slate-100">
          {hits.map((h) => (
            <li key={h.id} className="py-1.5 first:pt-0.5 last:pb-0">
              <span className="text-sm font-bold text-slate-900">
                <Hl text={h.title} q={q} />
              </span>
              <span className="block text-[13px] text-slate-600">
                <Hl text={h.text} q={q} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'rule':
      return (
        <>
          {hits.map((h) => (
            <p key={h.id} className="mt-1 text-[14px] leading-relaxed text-slate-800 first:mt-0">
              <b>{h.title}:</b> <Hl text={h.text} q={q} />
            </p>
          ))}
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Quy định chung, cập nhật {LEGAL_REFERENCE.asOf} — luật có thể được sửa đổi, kiểm tra văn bản mới nhất.
          </p>
        </>
      );
    default:
      return (
        <ul className={cn('space-y-1', hits.length > 1 && 'list-disc pl-4 marker:text-slate-300')}>
          {hits.map((h) => (
            <li key={h.id} className="text-[15px] leading-relaxed text-slate-800">
              <Hl text={h.text} q={q} />
            </li>
          ))}
        </ul>
      );
  }
}

function snippetOf(g: AnswerGroup, q: ParsedQuery): ReactNode {
  const c = g.top;
  if (c.kind === 'faq') {
    return (
      <>
        <b className="font-semibold text-slate-800">
          <Hl text={c.title} q={q} />
        </b>{' '}
        {c.text && <Hl text={c.text} q={q} />}
      </>
    );
  }
  if (c.kind === 'list') {
    const picked = matchedItems(c, q);
    return <Hl text={(picked.length ? picked : c.items ?? []).join(' · ')} q={q} />;
  }
  if (c.kind === 'legal' || c.kind === 'unitType' || c.kind === 'rule') {
    return <Hl text={g.hits.map((h) => `${h.title}: ${h.text}`).join(' · ')} q={q} />;
  }
  return <Hl text={g.hits.slice(0, 3).map((h) => h.text).join(' · ')} q={q} />;
}

function RelatedRow({ group, q, onJump }: { group: AnswerGroup; q: ParsedQuery; onJump: (tab: ProjectTab, anchor: string) => void }) {
  const Icon = iconFor(group.top);
  return (
    <button
      type="button"
      onClick={() => onJump(group.top.tab, group.top.anchor)}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white hover:shadow-xs"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <span className="truncate">{sectionLabel(group)}</span>
          {group.internal && <Lock size={11} className="shrink-0 text-rose-500" aria-label="Nội bộ" />}
        </span>
        <span className="line-clamp-2 text-[13px] leading-snug text-slate-700">{snippetOf(group, q)}</span>
      </span>
      <ChevronRight size={16} className="mt-1.5 shrink-0 text-slate-300" />
    </button>
  );
}

function DocsList({ groups, q, onJump }: { groups: AnswerGroup[]; q: ParsedQuery; onJump: (tab: ProjectTab, anchor: string) => void }) {
  return (
    <section className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
      <h3 className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <Files size={13} /> Tài liệu liên quan
      </h3>
      <ul className="divide-y divide-slate-100">
        {groups.map((g) => {
          const d = g.top.doc!;
          return (
            <li key={g.key} className="flex items-center gap-2.5 px-3 py-2">
              <FileTypeIcon type={d.type} name={d.name} className="size-9 rounded-lg [&_svg]:size-4" />
              <button type="button" onClick={() => onJump('tai-lieu', g.top.anchor)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-slate-900">
                  <Hl text={d.name} q={q} />
                </span>
                <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                  {g.top.text}
                  {g.internal && <Lock size={11} className="shrink-0 text-rose-500" aria-label="Nội bộ" />}
                </span>
              </button>
              <DocActions doc={d} compact />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UnitsList({ result, privacy, onJump }: { result: SmartResult; privacy: boolean; onJump: (tab: ProjectTab, anchor: string) => void }) {
  const filters = result.understood.filter((u) => /PN$|tỷ|triệu|m²|Hướng/.test(u));
  return (
    <section className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <House size={13} /> Căn phù hợp trong giỏ hàng ({result.unitTotal}){filters.length > 0 && ` · ${filters.join(' · ')}`}
        </h3>
        <button type="button" onClick={() => onJump('gio-hang', '')} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">
          Giỏ hàng
        </button>
      </div>
      {result.units.length === 0 ? (
        <p className="px-3.5 pb-3 pt-1.5 text-[13px] text-slate-500">Giỏ hàng hiện chưa có căn đúng yêu cầu này.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {result.units.map(({ unit: u, chunk }) => (
            <li key={u.id}>
              <button type="button" onClick={() => navigate(`/bds/${u.id}`)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">{chunk.title}</span>
                    <Badge tone={PROPERTY_STATUS[u.status].tone} size="sm" dot>
                      {propertyStatusLabel(u.status, u.transaction)}
                    </Badge>
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    <Hl text={chunk.text.split(' · ').slice(0, -2).join(' · ')} q={result.query} />
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-brand-800">{formatPrice(u.price, u.transaction)}</span>
              </button>
            </li>
          ))}
          {result.unitTotal > result.units.length && (
            <li>
              <button type="button" onClick={() => onJump('gio-hang', '')} className="w-full px-3.5 py-2 text-left text-xs font-semibold text-brand-700 hover:bg-slate-50">
                Xem thêm {result.unitTotal - result.units.length} căn trong giỏ hàng
              </button>
            </li>
          )}
        </ul>
      )}
      {!privacy && result.units.some((x) => x.unit.status === 'da_coc') && (
        <p className="border-t border-slate-100 px-3.5 py-1.5 text-[11px] text-slate-400">Căn “Đã đặt cọc” chỉ để tham khảo, có thể không còn nhận khách.</p>
      )}
    </section>
  );
}
