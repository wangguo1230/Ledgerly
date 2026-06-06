/**
 * Zod 校验助手 —— 将解析失败统一转换为领域 ValidationError（DRY）。
 */
import { z, type ZodTypeAny } from 'zod';
import { ValidationError } from './errors.js';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || '参数'}: ${i.message}`)
      .join('; ');
    throw new ValidationError(msg);
  }
  return result.data;
}

/** 复用的强制类型工具 */
export const zId = z.coerce.number().int().positive();
export const zOptionalId = z.coerce.number().int().positive().optional();
export const zCents = z.coerce.number().int().nonnegative();
export const zFlow = z.enum(['income', 'expense']);
export const zLedgerType = z.enum(['personal', 'business']);
