/**
 * 交易模块 —— 系统核心事实表（一笔收入或支出）。
 * 约束：金额整数分、账本/平台归属当前用户、类目收支一致、关联商品时快照成本价。
 */
import type { Db } from '../../db/connection.js';
import type { CategoryRow, FlowType, ProductRow, TransactionRow } from '../../common/types.js';
import { FLOW_TYPES } from '../../common/types.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';
import { assertNonNegativeCents } from '../../common/money.js';
import { assertLedgerOwned } from '../../common/authz.js';
import { cleanRemark } from '../../common/sanitize.js';

export interface CreateTransactionInput {
  ledger_id: number;
  flow_type: FlowType;
  amount: number;
  category_id?: number | null;
  product_id?: number | null;
  quantity?: number | null;
  source_platform_id?: number | null;
  occurred_at: string;
  remark?: string | null;
}

export type UpdateTransactionInput = Partial<Omit<CreateTransactionInput, 'ledger_id'>>;

export interface TransactionFilter {
  ledger_id: number;
  flow_type?: FlowType;
  category_id?: number;
  product_id?: number;
  source_platform_id?: number;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionListResult {
  items: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export class TransactionRepository {
  constructor(private readonly db: Db) {}

  findById(id: number): Promise<TransactionRow | undefined> {
    return this.db.one<TransactionRow>('SELECT * FROM txn WHERE id = $1', [id]);
  }

  private buildWhere(f: TransactionFilter): { clause: string; params: unknown[] } {
    const conds: string[] = [];
    const params: unknown[] = [];
    const ph = (val: unknown) => {
      params.push(val);
      return `$${params.length}`;
    };
    conds.push(`ledger_id = ${ph(f.ledger_id)}`);
    if (f.flow_type) conds.push(`flow_type = ${ph(f.flow_type)}`);
    if (f.category_id !== undefined) {
      conds.push(
        `(category_id = ${ph(f.category_id)} OR category_id IN (SELECT id FROM category WHERE parent_id = ${ph(
          f.category_id,
        )}))`,
      );
    }
    if (f.product_id !== undefined) conds.push(`product_id = ${ph(f.product_id)}`);
    if (f.source_platform_id !== undefined)
      conds.push(`source_platform_id = ${ph(f.source_platform_id)}`);
    if (f.from) conds.push(`occurred_at >= ${ph(f.from)}`);
    if (f.to) conds.push(`occurred_at <= ${ph(f.to)}`);
    if (f.search) conds.push(`remark LIKE ${ph(`%${f.search}%`)}`);
    return { clause: conds.join(' AND '), params };
  }

  async list(f: TransactionFilter): Promise<TransactionListResult> {
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 20));
    const { clause, params } = this.buildWhere(f);
    const countRow = await this.db.one<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM txn WHERE ${clause}`,
      params,
    );
    const items = await this.db.query<TransactionRow>(
      `SELECT * FROM txn WHERE ${clause} ORDER BY occurred_at DESC, id DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { items, total: countRow?.c ?? 0, page, pageSize };
  }

  async insert(input: CreateTransactionInput, costSnapshot: number | null): Promise<number> {
    const row = await this.db.one<{ id: number }>(
      `INSERT INTO txn
       (ledger_id, flow_type, amount, category_id, product_id, quantity, cost_snapshot, source_platform_id, occurred_at, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        input.ledger_id,
        input.flow_type,
        input.amount,
        input.category_id ?? null,
        input.product_id ?? null,
        input.quantity ?? null,
        costSnapshot,
        input.source_platform_id ?? null,
        input.occurred_at,
        input.remark ?? null,
      ],
    );
    return row!.id;
  }

  async update(id: number, fields: Record<string, unknown>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [col, val] of Object.entries(fields)) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')");
    values.push(id);
    await this.db.query(`UPDATE txn SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM txn WHERE id = $1', [id]);
  }
}

export class TransactionService {
  private readonly repo: TransactionRepository;
  constructor(private readonly db: Db) {
    this.repo = new TransactionRepository(db);
  }

  async list(userId: number, filter: TransactionFilter): Promise<TransactionListResult> {
    await assertLedgerOwned(this.db, userId, filter.ledger_id);
    return this.repo.list(filter);
  }

  async get(userId: number, id: number): Promise<TransactionRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('账目', id);
    await assertLedgerOwned(this.db, userId, row.ledger_id);
    return row;
  }

  async create(userId: number, input: CreateTransactionInput): Promise<TransactionRow> {
    this.assertFlow(input.flow_type);
    assertNonNegativeCents(input.amount, '金额');
    if (!input.occurred_at) throw new ValidationError('发生时间不能为空');
    await assertLedgerOwned(this.db, userId, input.ledger_id);

    if (input.category_id != null) {
      await this.assertCategory(input.category_id, input.ledger_id, input.flow_type);
    }
    const costSnapshot = await this.resolveCostSnapshot(input.product_id, input.ledger_id);
    if (input.source_platform_id != null) await this.assertPlatform(userId, input.source_platform_id);

    const quantity = this.normalizeQuantity(input.product_id, input.quantity);
    const id = await this.repo.insert(
      { ...input, quantity, remark: cleanRemark(input.remark) },
      costSnapshot,
    );
    return this.get(userId, id);
  }

  async update(userId: number, id: number, input: UpdateTransactionInput): Promise<TransactionRow> {
    const current = await this.get(userId, id);
    const flow = input.flow_type ?? current.flow_type;
    if (input.flow_type !== undefined) this.assertFlow(input.flow_type);
    if (input.amount !== undefined) assertNonNegativeCents(input.amount, '金额');

    const fields: Record<string, unknown> = {};
    if (input.flow_type !== undefined) fields.flow_type = input.flow_type;
    if (input.amount !== undefined) fields.amount = input.amount;
    if (input.occurred_at !== undefined) {
      if (!input.occurred_at) throw new ValidationError('发生时间不能为空');
      fields.occurred_at = input.occurred_at;
    }
    if (input.remark !== undefined) fields.remark = cleanRemark(input.remark);

    if (input.category_id !== undefined) {
      if (input.category_id != null) await this.assertCategory(input.category_id, current.ledger_id, flow);
      fields.category_id = input.category_id;
    } else if (
      input.flow_type !== undefined &&
      input.flow_type !== current.flow_type &&
      current.category_id != null
    ) {
      const cat = await this.db.one<{ flow_type: FlowType }>(
        'SELECT flow_type FROM category WHERE id = $1',
        [current.category_id],
      );
      if (cat && cat.flow_type !== flow) fields.category_id = null;
    }
    if (input.source_platform_id !== undefined) {
      if (input.source_platform_id != null) await this.assertPlatform(userId, input.source_platform_id);
      fields.source_platform_id = input.source_platform_id;
    }
    if (input.product_id !== undefined || input.quantity !== undefined) {
      const productId = input.product_id !== undefined ? input.product_id : current.product_id;
      const rawQty = input.quantity !== undefined ? input.quantity : current.quantity;
      fields.product_id = productId;
      fields.quantity = this.normalizeQuantity(productId, rawQty);
      fields.cost_snapshot = await this.resolveCostSnapshot(productId, current.ledger_id);
    }

    await this.repo.update(id, fields);
    return this.get(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    await this.repo.delete(id);
  }

  private assertFlow(flow: FlowType): void {
    if (!FLOW_TYPES.includes(flow)) throw new ValidationError(`非法收支类型: ${flow}`);
  }

  private async assertCategory(categoryId: number, ledgerId: number, flow: FlowType): Promise<void> {
    const cat = await this.db.one<CategoryRow>('SELECT * FROM category WHERE id = $1', [categoryId]);
    if (!cat) throw new NotFoundError('类目', categoryId);
    if (cat.ledger_id !== ledgerId) throw new ValidationError('类目不属于该账本（账本隔离）');
    if (cat.flow_type !== flow) throw new ValidationError('类目收支类型与账目不一致');
  }

  private async assertPlatform(userId: number, platformId: number): Promise<void> {
    const p = await this.db.one<{ user_id: number }>(
      'SELECT user_id FROM source_platform WHERE id = $1',
      [platformId],
    );
    if (!p) throw new NotFoundError('来源平台', platformId);
    if (p.user_id !== userId) throw new ForbiddenError('无权使用该平台');
  }

  /** 关联商品时按单位成本价快照，避免改价回溯历史利润。 */
  private async resolveCostSnapshot(
    productId: number | null | undefined,
    ledgerId: number,
  ): Promise<number | null> {
    if (productId == null) return null;
    const product = await this.db.one<ProductRow>('SELECT * FROM product WHERE id = $1', [productId]);
    if (!product) throw new NotFoundError('商品', productId);
    if (product.ledger_id !== ledgerId) throw new ValidationError('商品不属于该账本（账本隔离）');
    return product.cost_price;
  }

  private normalizeQuantity(
    productId: number | null | undefined,
    quantity: number | null | undefined,
  ): number | null {
    if (productId == null) return quantity ?? null;
    return quantity != null && quantity > 0 ? quantity : 1;
  }
}
