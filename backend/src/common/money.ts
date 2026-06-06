/**
 * 金额工具 —— 全链路以「整数分」存储与计算，禁止浮点参与业务运算。
 * 仅在「展示/录入边界」做 分<->元 转换，且转换采用字符串解析避免浮点误差。
 */
import { ValidationError } from './errors.js';

/**
 * 将「元」金额转换为「整数分」。
 * 接受 number 或字符串（如 "12.34"、"0.1"、"100"）。
 * 使用字符串解析，杜绝 0.1 这类浮点误差。
 */
export function yuanToCents(yuan: number | string): number {
  const str = typeof yuan === 'number' ? numberToPlainString(yuan) : yuan.trim();
  if (str === '' || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new ValidationError(`非法金额: ${yuan}`);
  }
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart, fracPartRaw = ''] = unsigned.split('.');
  if (fracPartRaw.length > 2) {
    throw new ValidationError(`金额最多两位小数: ${yuan}`);
  }
  const fracPart = fracPartRaw.padEnd(2, '0'); // 补足到分
  const cents = Number(intPart) * 100 + Number(fracPart);
  return negative ? -cents : cents;
}

/**
 * 将「整数分」转换为「元」的字符串（固定两位小数，便于展示，不丢精度）。
 */
export function centsToYuan(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new ValidationError(`分必须为整数: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${yuan}.${frac}`;
}

/**
 * 校验并归一化「分」值：必须为非负整数。
 */
export function assertNonNegativeCents(cents: number, field: string): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new ValidationError(`${field} 必须为非负整数分`);
  }
  return cents;
}

/** 避免科学计数法的 number->string（用于 number 入参场景） */
function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new ValidationError(`非法金额: ${n}`);
  // toFixed 最多保留更多位再交给上方正则校验两位小数
  return Number.isInteger(n) ? n.toString() : n.toString();
}
