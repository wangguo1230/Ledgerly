/**
 * 归属校验 —— 多用户越权防护的核心。
 * 任何携带 ledger_id 的操作都必须先确认该账本属于当前登录用户。
 */
import type { Db } from '../db/connection.js';
import { ForbiddenError, NotFoundError } from './errors.js';

/** 确认账本存在且归属该用户，否则抛错（404/403）。 */
export async function assertLedgerOwned(
  db: Db,
  userId: number,
  ledgerId: number,
): Promise<void> {
  const row = await db.one<{ user_id: number }>('SELECT user_id FROM ledger WHERE id = $1', [
    ledgerId,
  ]);
  if (!row) throw new NotFoundError('账本', ledgerId);
  if (row.user_id !== userId) throw new ForbiddenError('无权访问该账本');
}
