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
  item_name?: string | null; // 临时商品名（未进商品库时用，与 product_id 二选一）
  quantity?: number | null;
  cost_snapshot?: number | null; // 本笔成本（单价，分）；关联商品时不传则取商品当前成本价
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
       (ledger_id, flow_type, amount, category_id, product_id, item_name, quantity, cost_snapshot, source_platform_id, occurred_at, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        input.ledger_id,
        input.flow_type,
        input.amount,
        input.category_id ?? null,
        input.product_id ?? null,
        input.item_name ?? null,
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
    const costSnapshot = await this.resolveCostSnapshot(
      input.product_id,
      input.ledger_id,
      input.cost_snapshot,
    );
    if (input.source_platform_id != null) await this.assertPlatform(userId, input.source_platform_id);

    // 关联正式商品则不存临时名；否则存临时名（去空白）
    const itemName = input.product_id != null ? null : input.item_name?.trim() || null;
    // 有成本依据（关联商品或临时项带成本）则数量至少 1
    const hasCostBasis = input.product_id != null || costSnapshot != null;
    const quantity = hasCostBasis
      ? input.quantity && input.quantity > 0
        ? input.quantity
        : 1
      : input.quantity ?? null;

    const id = await this.repo.insert(
      { ...input, item_name: itemName, quantity, remark: cleanRemark(input.remark) },
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
    if (
      input.product_id !== undefined ||
      input.item_name !== undefined ||
      input.quantity !== undefined ||
      input.cost_snapshot !== undefined
    ) {
      const productId = input.product_id !== undefined ? input.product_id : current.product_id;
      fields.product_id = productId;
      // 临时名：关联正式商品则清空；否则用传入或保留原值
      fields.item_name =
        productId != null
          ? null
          : input.item_name !== undefined
            ? input.item_name?.trim() || null
            : current.item_name;

      // 本笔成本
      const productChanged = input.product_id !== undefined && input.product_id !== current.product_id;
      let cost: number | null;
      if (input.cost_snapshot !== undefined) {
        cost = await this.resolveCostSnapshot(productId, current.ledger_id, input.cost_snapshot);
      } else if (productChanged) {
        cost = await this.resolveCostSnapshot(productId, current.ledger_id);
      } else {
        cost = current.cost_snapshot; // 仅改数量/名称、未传成本：保留原成本
      }
      fields.cost_snapshot = cost;

      // 数量：有成本依据则至少 1
      const rawQty = input.quantity !== undefined ? input.quantity : current.quantity;
      const hasCostBasis = productId != null || cost != null;
      fields.quantity = hasCostBasis ? (rawQty && rawQty > 0 ? rawQty : 1) : rawQty ?? null;
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

  /**
   * 确定本笔成本快照（单价）。
   * - 关联正式商品：传 override 用它，否则取商品当前成本价（并校验归属）。
   * - 临时项（无 product_id）：传 override 用它，否则无成本(null)。
   * 一律快照存下，避免后续改价回溯历史利润。
   */
  private async resolveCostSnapshot(
    productId: number | null | undefined,
    ledgerId: number,
    override?: number | null,
  ): Promise<number | null> {
    if (productId == null) {
      if (override != null) {
        assertNonNegativeCents(override, '成本');
        return override;
      }
      return null;
    }
    const product = await this.db.one<ProductRow>('SELECT * FROM product WHERE id = $1', [productId]);
    if (!product) throw new NotFoundError('商品', productId);
    if (product.ledger_id !== ledgerId) throw new ValidationError('商品不属于该账本（账本隔离）');
    if (override != null) {
      assertNonNegativeCents(override, '成本');
      return override;
    }
    return product.cost_price;
  }
}
