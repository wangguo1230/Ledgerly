/**
 * 商品模块 —— 仅生意账本。承载成本价/售价（整数分），支撑利润核算。
 * 所有操作先确认目标账本归属当前用户。
 */
import type { Db } from '../../db/connection.js';
import type { ProductRow, LedgerRow } from '../../common/types.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { assertNonNegativeCents } from '../../common/money.js';
import { assertLedgerOwned } from '../../common/authz.js';

export interface CreateProductInput {
  ledger_id: number;
  name: string;
  sku?: string | null;
  cost_price?: number;
  sale_price?: number;
  unit?: string | null;
  stock?: number | null;
  remark?: string | null;
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, 'ledger_id'>>;

export class ProductRepository {
  constructor(private readonly db: Db) {}

  findByLedger(ledgerId: number): Promise<ProductRow[]> {
    return this.db.query<ProductRow>('SELECT * FROM product WHERE ledger_id = $1 ORDER BY id DESC', [
      ledgerId,
    ]);
  }

  findById(id: number): Promise<ProductRow | undefined> {
    return this.db.one<ProductRow>('SELECT * FROM product WHERE id = $1', [id]);
  }

  async insert(input: CreateProductInput): Promise<number> {
    const row = await this.db.one<{ id: number }>(
      `INSERT INTO product (ledger_id, name, sku, cost_price, sale_price, unit, stock, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.ledger_id,
        input.name,
        input.sku ?? null,
        input.cost_price ?? 0,
        input.sale_price ?? 0,
        input.unit ?? null,
        input.stock ?? null,
        input.remark ?? null,
      ],
    );
    return row!.id;
  }

  async update(id: number, fields: UpdateProductInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.sku !== undefined) push('sku', fields.sku);
    if (fields.cost_price !== undefined) push('cost_price', fields.cost_price);
    if (fields.sale_price !== undefined) push('sale_price', fields.sale_price);
    if (fields.unit !== undefined) push('unit', fields.unit);
    if (fields.stock !== undefined) push('stock', fields.stock);
    if (fields.remark !== undefined) push('remark', fields.remark);
    if (sets.length === 0) return;
    sets.push("updated_at = to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')");
    values.push(id);
    await this.db.query(`UPDATE product SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM product WHERE id = $1', [id]);
  }
}

export class ProductService {
  private readonly repo: ProductRepository;
  constructor(private readonly db: Db) {
    this.repo = new ProductRepository(db);
  }

  async list(userId: number, ledgerId: number): Promise<ProductRow[]> {
    await assertLedgerOwned(this.db, userId, ledgerId);
    return this.repo.findByLedger(ledgerId);
  }

  async get(userId: number, id: number): Promise<ProductRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('商品', id);
    await assertLedgerOwned(this.db, userId, row.ledger_id);
    return row;
  }

  async create(userId: number, input: CreateProductInput): Promise<ProductRow> {
    if (!input.name || input.name.trim() === '') throw new ValidationError('商品名称不能为空');
    await this.assertBusinessLedger(userId, input.ledger_id);
    if (input.cost_price !== undefined) assertNonNegativeCents(input.cost_price, '成本价');
    if (input.sale_price !== undefined) assertNonNegativeCents(input.sale_price, '售价');
    const id = await this.repo.insert(input);
    return this.get(userId, id);
  }

  async update(userId: number, id: number, input: UpdateProductInput): Promise<ProductRow> {
    await this.get(userId, id);
    if (input.name !== undefined && input.name.trim() === '') {
      throw new ValidationError('商品名称不能为空');
    }
    if (input.cost_price !== undefined) assertNonNegativeCents(input.cost_price, '成本价');
    if (input.sale_price !== undefined) assertNonNegativeCents(input.sale_price, '售价');
    await this.repo.update(id, input);
    return this.get(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    await this.repo.delete(id);
  }

  private async assertBusinessLedger(userId: number, ledgerId: number): Promise<void> {
    await assertLedgerOwned(this.db, userId, ledgerId);
    const ledger = await this.db.one<LedgerRow>('SELECT * FROM ledger WHERE id = $1', [ledgerId]);
    if (!ledger) throw new NotFoundError('账本', ledgerId);
    if (ledger.type !== 'business') throw new ValidationError('商品仅可在「生意账本」中创建');
  }
}
