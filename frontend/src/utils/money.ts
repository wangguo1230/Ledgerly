/**
 * 前端金额工具 —— 与后端口径一致：以「整数分」为真值，仅在展示/录入边界转换。
 * 字符串解析，杜绝 0.1 这类浮点误差。
 */

/** 「元」字符串/数字 -> 「整数分」 */
export function yuanToCents(yuan: number | string): number {
  const str = (typeof yuan === 'number' ? yuan.toString() : yuan).trim();
  if (str === '' || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`非法金额: ${yuan}`);
  }
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart, fracRaw = ''] = unsigned.split('.');
  if (fracRaw.length > 2) throw new Error(`金额最多两位小数: ${yuan}`);
  const frac = fracRaw.padEnd(2, '0');
  const cents = Number(intPart) * 100 + Number(frac);
  return negative ? -cents : cents;
}

/** 「整数分」-> 「元」字符串（固定两位小数） */
export function centsToYuan(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const yuan = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${yuan}.${frac}`;
}

/** 带千分位的展示字符串（不含币种符号） */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const [intStr, fracStr] = centsToYuan(Math.abs(cents)).split('.');
  const grouped = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${grouped}.${fracStr}`; // 真减号 U+2212
}

/** 带 ¥ 符号 */
export function formatYuan(cents: number): string {
  return `¥${formatCents(cents)}`;
}
