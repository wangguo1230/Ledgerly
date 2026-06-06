/**
 * 日期工具 —— 统一本地时间字符串格式 'YYYY-MM-DD HH:mm:ss'，与后端字符串比较一致。
 */

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Date -> 'YYYY-MM-DD HH:mm:ss' */
export function formatDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/** Date -> 'YYYY-MM-DD' */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 当前时间字符串 */
export function now(): string {
  return formatDateTime(new Date());
}

/** 本月起止 [from, to]（含边界） */
export function monthRange(base = new Date()): [string, string] {
  const first = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59);
  return [formatDateTime(first), formatDateTime(last)];
}

/** 把日期选择器的 [startDate, endDate] 转为含边界的 datetime 区间 */
export function dayRangeToDateTime(range: [Date, Date] | null): {
  from?: string;
  to?: string;
} {
  if (!range) return {};
  const [s, e] = range;
  const from = `${formatDate(s)} 00:00:00`;
  const to = `${formatDate(e)} 23:59:59`;
  return { from, to };
}
