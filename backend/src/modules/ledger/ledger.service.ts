/**
 * 账本模块 —— 数据隔离的顶层容器（个人/生意分离），归属用户。
 * 账本是「按用户隔离」的根：所有查询强制带 user_id。
 */
import type { Db } from '../../db/connection.js';
import type { LedgerRow, LedgerType } from '../../common/types.js';
import { LEDGER_TYPES } from '../../common/types.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';
import { seedCategoriesForLedger } from '../../db/seed.js';

export interface CreateLedgerInput {
  name: string;
  type: LedgerType;
  currency?: string;
  remark?: string | null;
}

export type UpdateLedgerInput = Partial<CreateLedgerInput>;

export class LedgerRepository {
  constructor(private readonly db: Db) {}

  findByUser(userId: number): Promise<LedgerRow[]> {
    return this.db.query<LedgerRow>('SELECT * FROM ledger WHERE user_id = $1 ORDER BY id', [userId]);
  }

  findById(id: number): Promise<LedgerRow | undefined> {
    return this.db.one<LedgerRow>('SELECT * FROM ledger WHERE id = $1', [id]);
  }

  async insert(userId: number, input: CreateLedgerInput): Promise<number> {
    const row = await this.db.one<{ id: number }>(
      'INSERT INTO ledger (user_id, name, type, currency, remark) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, input.name, input.type, input.currency ?? 'CNY', input.remark ?? null],
    );
    return row!.id;
  }

  async update(id: number, fields: UpdateLedgerInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.type !== undefined) push('type', fields.type);
    if (fields.currency !== undefined) push('currency', fields.currency);
    if (fields.remark !== undefined) push('remark', fields.remark);
    if (sets.length === 0) return;
    values.push(id);
    await this.db.query(`UPDATE ledger SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM ledger WHERE id = $1', [id]);
  }

  async countByUser(userId: number): Promise<number> {
    const row = await this.db.one<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM ledger WHERE user_id = $1',
      [userId],
    );
    return row?.c ?? 0;
  }
}

export class LedgerService {
  private readonly repo: LedgerRepository;
  constructor(private readonly db: Db) {
    this.repo = new LedgerRepository(db);
  }

  list(userId: number): Promise<LedgerRow[]> {
    return this.repo.findByUser(userId);
  }

  async get(userId: number, id: number): Promise<LedgerRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('账本', id);
    if (row.user_id !== userId) throw new ForbiddenError('无权访问该账本');
    return row;
  }

  async create(userId: number, input: CreateLedgerInput): Promise<LedgerRow> {
    this.validate(input);
    const id = await this.repo.insert(userId, input);
    await seedCategoriesForLedger(this.db, id, input.type);
    return this.get(userId, id);
  }

  async update(userId: number, id: number, input: UpdateLedgerInput): Promise<LedgerRow> {
    await this.get(userId, id);
    if (input.type !== undefined && !LEDGER_TYPES.includes(input.type)) {
      throw new ValidationError(`非法账本类型: ${input.type}`);
    }
    if (input.name !== undefined && input.name.trim() === '') {
      throw new ValidationError('账本名称不能为空');
    }
    await this.repo.update(id, input);
    return this.get(userId, id);
  }

  /** 删除账本（级联类目/商品/交易）。保护：不允许删除自己的最后一个账本。 */
  async remove(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    if ((await this.repo.countByUser(userId)) <= 1) {
      throw new ValidationError('至少需要保留一个账本，无法删除');
    }
    await this.repo.delete(id);
  }

  private validate(input: CreateLedgerInput): void {
    if (!input.name || input.name.trim() === '') {
      throw new ValidationError('账本名称不能为空');
    }
    if (!LEDGER_TYPES.includes(input.type)) {
      throw new ValidationError(`非法账本类型: ${input.type}`);
    }
  }
}
