import { describe, it, expect } from 'vitest';
import { yuanToCents, centsToYuan, assertNonNegativeCents } from '../src/common/money.js';
import { ValidationError } from '../src/common/errors.js';

describe('money 金额精度（成功标准 S6）', () => {
  it('元转分：常见值', () => {
    expect(yuanToCents('12.34')).toBe(1234);
    expect(yuanToCents('100')).toBe(10000);
    expect(yuanToCents('0.05')).toBe(5);
    expect(yuanToCents('0.1')).toBe(10);
    expect(yuanToCents(0.01)).toBe(1);
  });

  it('零浮点误差：0.1 + 0.2 = 0.30（关键反例）', () => {
    const sum = yuanToCents('0.1') + yuanToCents('0.2');
    expect(sum).toBe(30);
    expect(centsToYuan(sum)).toBe('0.30');
  });

  it('大量小数累加无误差', () => {
    let cents = 0;
    for (let i = 0; i < 1000; i++) cents += yuanToCents('0.01');
    expect(cents).toBe(1000); // 1000 × 0.01 = 10.00 元
    expect(centsToYuan(cents)).toBe('10.00');
  });

  it('分转元：补零与负数', () => {
    expect(centsToYuan(5)).toBe('0.05');
    expect(centsToYuan(1234)).toBe('12.34');
    expect(centsToYuan(0)).toBe('0.00');
    expect(centsToYuan(-150)).toBe('-1.50');
  });

  it('拒绝超过两位小数与非法输入', () => {
    expect(() => yuanToCents('1.234')).toThrow(ValidationError);
    expect(() => yuanToCents('abc')).toThrow(ValidationError);
    expect(() => yuanToCents('')).toThrow(ValidationError);
  });

  it('assertNonNegativeCents 拒绝负数与小数', () => {
    expect(() => assertNonNegativeCents(-1, '金额')).toThrow(ValidationError);
    expect(() => assertNonNegativeCents(1.5, '金额')).toThrow(ValidationError);
    expect(assertNonNegativeCents(100, '金额')).toBe(100);
  });
});
