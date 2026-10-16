export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Dự phòng cho ngữ cảnh không bảo mật (http trong mạng LAN).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sinh mã kế tiếp, ví dụ ['BDS-0001', 'BDS-0007'] → 'BDS-0008'. */
export function nextCode(prefix: string, existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = /(\d+)\s*$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
