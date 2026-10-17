import { LEGAL_CHECKLIST } from '../constants';
import type { LegalItem, Project } from '../types';

export type ResolvedLegalItem = LegalItem & { hint?: string; scope?: 'all' | 'ch' | 'dn' };

/** Hạng mục chuẩn (luôn đủ 12 mục) + hạng mục tự thêm. */
export function resolveChecklist(project: Project): ResolvedLegalItem[] {
  const stored = new Map(project.legalChecklist.map((i) => [i.key, i]));
  const standard = LEGAL_CHECKLIST.map((def) => {
    const s = stored.get(def.key);
    return {
      key: def.key,
      label: def.label,
      status: s?.status ?? ('chua_ro' as const),
      note: s?.note ?? '',
      docId: s?.docId,
      hint: def.hint,
      scope: def.scope,
    };
  });
  const custom = project.legalChecklist.filter((i) => i.custom);
  return [...standard, ...custom];
}

export function legalProgress(project: Project): { done: number; total: number; checked: number } {
  const items = resolveChecklist(project).filter((i) => i.status !== 'khong_ap_dung');
  return {
    done: items.filter((i) => i.status === 'co').length,
    total: items.length,
    checked: items.filter((i) => i.status !== 'chua_ro').length,
  };
}
