/**
 * 转账模块 —— 账户(来源平台)间资金转移，不计入收支统计。
 */
import type { Db } from '../../db/connection.js';
import type { TransferRow } from '../../common/types.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';
import { assertNonNegativeCents } from '../../common/money.js';

export interface CreateTransferInput {
  from_platform_id: number;
  to_platform_id: number;
  amount: number;
  occurred_at: string;
  remark?: string | null;
}

/** 列表项（带账户名） */
export interface TransferView extends TransferRow {
  from_name: string;
  to_name: string;
}

export class TransferService {
  constructor(private readonly db: Db) {}

  list(userId: number): Promise<TransferView[]> {
    return this.db.query<TransferView>(
      `SELECT tr.*, f.name AS from_name, t.name AS to_name
       FROM transfer tr
       JOIN source_platform f ON tr.from_platform_id = f.id
       JOIN source_platform t ON tr.to_platform_id = t.id
       WHERE tr.user_id = $1
       ORDER BY tr.occurred_at DESC, tr.id DESC
       LIMIT 200`,
      [userId],
    );
  }

  async get(userId: number, id: number): Promise<TransferRow> {
    const row = await this.db.one<TransferRow>('SELECT * FROM transfer WHERE id = $1', [id]);
    if (!row) throw new NotFoundError('转账', id);
    if (row.user_id !== userId) throw new ForbiddenError('无权访问该转账');
    return row;
  }

  async create(userId: number, input: CreateTransferInput): Promise<TransferRow> {
    assertNonNegativeCents(input.amount, '金额');
    if (input.amount <= 0) throw new ValidationError('转账金额需大于 0');
    if (!input.occurred_at) throw new ValidationError('发生时间不能为空');
    if (input.from_platform_id === input.to_platform_id) {
      throw new ValidationError('转出与转入账户不能相同');
    }
    await this.assertPlatformOwned(userId, input.from_platform_id);
    await this.assertPlatformOwned(userId, input.to_platform_id);

    const row = await this.db.one<{ id: number }>(
      `INSERT INTO transfer (user_id, from_platform_id, to_platform_id, amount, occurred_at, remark)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        userId,
        input.from_platform_id,
        input.to_platform_id,
        input.amount,
        input.occurred_at,
        input.remark ?? null,
      ],
    );
    return this.get(userId, row!.id);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    await this.db.query('DELETE FROM transfer WHERE id = $1', [id]);
  }

  private async assertPlatformOwned(userId: number, platformId: number): Promise<void> {
    const p = await this.db.one<{ user_id: number }>(
      'SELECT user_id FROM source_platform WHERE id = $1',
      [platformId],
    );
    if (!p) throw new NotFoundError('账户', platformId);
    if (p.user_id !== userId) throw new ForbiddenError('无权使用该账户');
  }
}
