/** Bỏ dấu tiếng Việt + chữ thường, để tìm "quan 7" vẫn ra "Quận 7". */
export function normalize(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOnly(input: string | undefined | null): string {
  return (input ?? '').replace(/\D/g, '');
}

/** Ghép các trường thành một chuỗi đã chuẩn hoá để tìm kiếm nhanh. */
export function buildHaystack(parts: Array<string | number | undefined | null>): string {
  const text = parts.filter((p) => p !== undefined && p !== null && p !== '').join(' ');
  // Thêm bản chỉ-chữ-số để tìm SĐT dù gõ có dấu cách hay không.
  const phoneLike = text.match(/[\d .-]{8,}/g)?.map(digitsOnly).join(' ') ?? '';
  return `${normalize(text)} ${phoneLike}`;
}

/** Mọi từ trong câu tìm kiếm đều phải xuất hiện trong haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return q.split(' ').every((token) => haystack.includes(token) || haystack.includes(digitsOnly(token) || '\u0000'));
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const last = words[words.length - 1];
  return last.charAt(0).toUpperCase();
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString('vi-VN')} ${noun}`;
}
