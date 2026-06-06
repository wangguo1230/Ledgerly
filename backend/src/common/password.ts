/**
 * 密码哈希 —— Node 内置 scrypt 加盐（零依赖、抗暴力）。
 * 存储格式：`scrypt$<saltHex>$<hashHex>`。校验用 timingSafeEqual 防时序攻击。
 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
