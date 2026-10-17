import { ArrowRight, Building2, CornerDownLeft, House, MessageCircleQuestion, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DOC_CATEGORY, PROJECT_STAGE, PROPERTY_TYPE_LABEL, propertyStatusLabel, PROPERTY_STATUS, CUSTOMER_STATUS } from '../constants';
import { formatPhone, formatPrice } from '../lib/format';
import { formatAddress, formatProjectAddress } from '../lib/listing';
import { navigate } from '../lib/router';
import { askProject, buildProjectIndex, findProjectMention, type AnswerGroup, type Verdict } from '../lib/smartfind';
import { buildHaystack, matchesQuery, normalize } from '../lib/text';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Customer, DocumentRef, Project, Property } from '../types';
import { DocActions, FileTypeIcon } from './documents';
import { ImageView } from './media';
import { Avatar, Badge, cn } from './ui';

type Result =
  | { kind: 'answer'; id: string; item: Project; rest: string; answer?: AnswerGroup; verdict?: Verdict; score: number }
  | { kind: 'project'; id: string; item: Project; score: number }
  | { kind: 'doc'; id: string; item: DocumentRef; owner: string; path: string; score: number }
  | { kind: 'property'; id: string; item: Property; score: number }
  | { kind: 'customer'; id: string; item: Customer; score: number };

const LIMIT = 6;

function scoreOf(primary: string, query: string): number {
  const p = normalize(primary);
  const q = normalize(query);
  if (p === q) return 3;
  if (p.startsWith(q)) return 2;
  if (p.includes(q)) return 1.5;
  return 1;
}

export function SearchOverlay() {
  const { searchOpen, openSearch, closeSearch, privacy } = useUI();
  const { projects, properties, customers, projectById } = useData();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Phím tắt Ctrl/⌘ + K hoặc "/" để mở tìm kiếm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    setActive(0);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.select(), 20);
    return () => {
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
    };
  }, [searchOpen]);

  const index = useMemo(() => {
    if (!searchOpen) return null;
    const docs: Array<{ doc: DocumentRef; owner: string; path: string; hay: string }> = [];
    for (const p of projects) {
      for (const d of p.documents) {
        if (privacy && d.visibility === 'internal') continue;
        docs.push({
          doc: d,
          owner: p.name,
          path: `/du-an/${p.id}?tab=tai-lieu`,
          hay: buildHaystack([d.name, d.note, DOC_CATEGORY[d.category].label, p.name, p.code]),
        });
      }
    }
    for (const p of properties) {
      for (const d of p.documents) {
        if (privacy && d.visibility === 'internal') continue;
        const project = projectById.get(p.projectId);
        docs.push({
          doc: d,
          owner: `${p.code} · ${p.title || PROPERTY_TYPE_LABEL[p.type]}`,
          path: `/bds/${p.id}`,
          hay: buildHaystack([d.name, d.note, DOC_CATEGORY[d.category].label, p.title, p.code, project?.name]),
        });
      }
    }
    return {
      projects: projects.map((p) => ({
        item: p,
        hay: buildHaystack([
          p.code,
          p.name,
          p.developer,
          formatProjectAddress(p),
          p.scale,
          p.productTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(' '),
          p.amenities.join(' '),
          p.description,
        ]),
      })),
      properties: properties.map((p) => ({
        item: p,
        hay: buildHaystack([
          p.code,
          p.title,
          formatAddress(p),
          projectById.get(p.projectId)?.name,
          p.unitCode,
          PROPERTY_TYPE_LABEL[p.type],
          p.description,
          privacy ? '' : `${p.seller.name} ${p.seller.phone} ${p.internalNotes}`,
        ]),
      })),
      customers: privacy
        ? []
        : customers.map((c) => ({
            item: c,
            hay: buildHaystack([c.code, c.name, c.phone, c.phone2, c.email, c.locations.join(' '), c.requirements, c.notes]),
          })),
      docs,
    };
  }, [searchOpen, projects, properties, customers, projectById, privacy]);

  const groups = useMemo((): Array<{ key: string; title: string; total: number; all: string; results: Result[] }> => {
    if (!index) return [];
    const q = query.trim();
    if (!q) {
      const recentProjects = index.projects.slice(0, 5).map((x): Result => ({ kind: 'project', id: x.item.id, item: x.item, score: 0 }));
      const recentProperties = index.properties.slice(0, 5).map((x): Result => ({ kind: 'property', id: x.item.id, item: x.item, score: 0 }));
      return [
        { key: 'recentProjects', title: 'Dự án gần đây', total: 0, all: '/du-an', results: recentProjects },
        { key: 'recentProperties', title: 'BĐS mới cập nhật', total: 0, all: '/bds', results: recentProperties },
      ].filter((g) => g.results.length);
    }
    const take = <T extends { score: number }>(list: T[]) => list.sort((a, b) => b.score - a.score);
    const projectsFound = take(
      index.projects
        .filter((x) => matchesQuery(x.hay, q))
        .map((x): Result & { kind: 'project' } => ({ kind: 'project', id: x.item.id, item: x.item, score: scoreOf(x.item.name, q) })),
    );
    const docsFound = take(
      index.docs
        .filter((x) => matchesQuery(x.hay, q))
        .map(
          (x): Result & { kind: 'doc' } => ({
            kind: 'doc',
            id: x.doc.id,
            item: x.doc,
            owner: x.owner,
            path: x.path,
            score: scoreOf(x.doc.name, q) - (x.doc.archived ? 1 : 0),
          }),
        ),
    );
    const propertiesFound = take(
      index.properties
        .filter((x) => matchesQuery(x.hay, q))
        .map((x): Result & { kind: 'property' } => ({ kind: 'property', id: x.item.id, item: x.item, score: scoreOf(x.item.code + ' ' + x.item.title, q) })),
    );
    const customersFound = take(
      index.customers
        .filter((x) => matchesQuery(x.hay, q))
        .map((x): Result & { kind: 'customer' } => ({ kind: 'customer', id: x.item.id, item: x.item, score: scoreOf(x.item.name, q) })),
    );
    const enc = encodeURIComponent(q);
    // "aurora bàn giao khi nào" → trả lời luôn từ hồ sơ dự án được nhắc tên.
    const answers: Result[] = [];
    const mention = findProjectMention(q, projects);
    if (mention) {
      const units = properties.filter((x) => x.projectId === mention.project.id);
      const r = askProject(buildProjectIndex(mention.project, units, { privacy }), mention.rest);
      if (r.best || r.verdict || r.related.length) {
        answers.push({ kind: 'answer', id: mention.project.id, item: mention.project, rest: mention.rest, answer: r.best ?? r.related[0], verdict: r.verdict, score: 99 });
      }
    }
    return [
      { key: 'answer', title: mention ? `Trả lời nhanh · ${mention.project.name}` : '', total: 0, all: '', results: answers },
      { key: 'projects', title: 'Dự án', total: projectsFound.length, all: `/du-an?q=${enc}`, results: projectsFound.slice(0, LIMIT) as Result[] },
      { key: 'docs', title: 'Tài liệu', total: docsFound.length, all: '', results: docsFound.slice(0, 10) as Result[] },
      { key: 'properties', title: 'Bất động sản', total: propertiesFound.length, all: `/bds?q=${enc}`, results: propertiesFound.slice(0, LIMIT) as Result[] },
      { key: 'customers', title: 'Khách hàng', total: customersFound.length, all: `/khach?q=${enc}`, results: customersFound.slice(0, LIMIT) as Result[] },
    ].filter((g) => g.results.length);
  }, [index, query]);

  const flat = groups.flatMap((g) => g.results);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (path: string) => {
    closeSearch();
    navigate(path);
  };

  const activate = (r: Result) => {
    if (r.kind === 'answer') go(`/du-an/${r.id}?hoi=${encodeURIComponent(r.rest)}`);
    else if (r.kind === 'project') go(`/du-an/${r.id}`);
    else if (r.kind === 'property') go(`/bds/${r.id}`);
    else if (r.kind === 'customer') go(`/khach/${r.id}`);
    else go(r.path);
  };

  if (!searchOpen) return null;

  let counter = -1;

  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-center sm:items-start sm:p-4 sm:pt-[8vh]">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" onClick={closeSearch} />
      <div className="relative flex h-dvh w-full animate-pop-in flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[80vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="pt-safe flex items-center gap-2 border-b border-slate-200 px-3 sm:px-4">
          <Search size={20} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(flat.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && flat[active]) {
                e.preventDefault();
                activate(flat[active]);
              }
            }}
            placeholder={privacy ? 'Tìm dự án, tài liệu, BĐS…' : 'Tìm dự án, tài liệu, BĐS, khách hàng…'}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
            enterKeyHint="search"
          />
          <button type="button" onClick={closeSearch} className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">
            <X size={18} className="sm:hidden" />
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {groups.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Search size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">{query ? `Không tìm thấy “${query}”` : 'Bắt đầu nhập để tìm kiếm'}</p>
              <p className="mt-1 text-xs text-slate-500">Tìm theo tên dự án, chủ đầu tư, tên tài liệu, mã căn, địa chỉ, tên hoặc SĐT khách…</p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="py-2">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {g.title}
                    {g.total ? ` · ${g.total}` : ''}
                  </h3>
                  {g.all && (g.total > g.results.length || !query) && (
                    <button type="button" onClick={() => go(g.all)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Xem tất cả <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                {g.results.map((r) => {
                  counter++;
                  const i = counter;
                  return (
                    <ResultRow key={`${r.kind}-${r.id}`} index={i} active={i === active} onHover={() => setActive(i)} onClick={() => activate(r)} result={r} />
                  );
                })}
              </section>
            ))
          )}
        </div>
        <div className="hidden items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 sm:flex">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-slate-300 bg-white px-1">↑</kbd>
            <kbd className="rounded border border-slate-300 bg-white px-1">↓</kbd> di chuyển
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={12} /> mở
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ResultRow({
  result,
  index,
  active,
  onHover,
  onClick,
}: {
  result: Result;
  index: number;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  let leading: ReactNode;
  let title: ReactNode;
  let subtitle: ReactNode;
  let trailing: ReactNode = null;

  if (result.kind === 'answer') {
    const a = result.answer;
    leading = (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
        <MessageCircleQuestion size={20} />
      </span>
    );
    const value = a ? (a.top.kind === 'faq' ? a.top.text : a.hits.map((h) => (a.top.kind === 'unitType' || a.top.kind === 'legal' ? `${h.title}: ${h.text}` : h.text)).join(' · ')) : '';
    title = result.verdict ? `${result.verdict.label} — ${result.verdict.detail}` : value || result.rest;
    subtitle = `“${result.rest}” · ${a ? (a.top.kind === 'faq' ? 'Hỏi đáp' : a.top.title) : 'Hồ sơ dự án'}`;
    trailing = <ArrowRight size={16} className="text-brand-600" />;
  } else if (result.kind === 'project') {
    const p = result.item;
    leading = <ImageView id={p.images[0]} placeholderIcon={Building2} className="size-11 shrink-0 rounded-xl" />;
    title = p.name;
    subtitle = [p.developer, p.province].filter(Boolean).join(' · ') || p.code;
    trailing = (
      <Badge tone={PROJECT_STAGE[p.stage].tone} size="sm">
        {PROJECT_STAGE[p.stage].label}
      </Badge>
    );
  } else if (result.kind === 'property') {
    const p = result.item;
    leading = <ImageView id={p.images[0]} placeholderIcon={House} className="size-11 shrink-0 rounded-xl" />;
    title = (
      <>
        <span className="mr-1.5 font-mono text-xs text-slate-400">{p.code}</span>
        {p.title || PROPERTY_TYPE_LABEL[p.type]}
      </>
    );
    subtitle = `${formatPrice(p.price, p.transaction)} · ${formatAddress(p, { hideNumber: true }) || PROPERTY_TYPE_LABEL[p.type]}`;
    trailing = (
      <Badge tone={PROPERTY_STATUS[p.status].tone} size="sm" dot>
        {propertyStatusLabel(p.status, p.transaction)}
      </Badge>
    );
  } else if (result.kind === 'customer') {
    const c = result.item;
    leading = <Avatar name={c.name} />;
    title = c.name;
    subtitle = [c.code, c.phone && formatPhone(c.phone)].filter(Boolean).join(' · ');
    trailing = (
      <Badge tone={CUSTOMER_STATUS[c.status].tone} size="sm">
        {CUSTOMER_STATUS[c.status].label}
      </Badge>
    );
  } else {
    const d = result.item;
    leading = <FileTypeIcon type={d.type} name={d.name} className="size-11" />;
    title = <span className={d.archived ? 'text-slate-400 line-through' : ''}>{d.name}</span>;
    subtitle = `${DOC_CATEGORY[d.category].label} · ${result.owner}`;
    trailing = (
      <div onClick={(e) => e.stopPropagation()}>
        <DocActions doc={d} compact />
      </div>
    );
  }

  return (
    <div
      data-index={index}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn('mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2', active ? 'bg-brand-50' : 'hover:bg-slate-50')}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-semibold text-slate-900', result.kind === 'answer' ? 'line-clamp-2' : 'truncate')}>{title}</div>
        <div className="truncate text-xs text-slate-500">{subtitle}</div>
      </div>
      <div className="shrink-0">{trailing}</div>
    </div>
  );
}
