/**
 * 类目模块 —— 收支区分 + 父子层级（自引用 parent_id），按账本隔离。
 * 所有操作先确认目标账本归属当前用户。
 */
import type { Db } from '../../db/connection.js';
import type { CategoryRow, FlowType } from '../../common/types.js';
import { FLOW_TYPES } from '../../common/types.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { assertLedgerOwned } from '../../common/authz.js';

export interface CreateCategoryInput {
  ledger_id: number;
  parent_id?: number | null;
  name: string;
  flow_type: FlowType;
  icon?: string | null;
  sort_order?: number;
}

export type UpdateCategoryInput = Partial<Omit<CreateCategoryInput, 'ledger_id'>>;

export interface CategoryNode extends CategoryRow {
  children: CategoryNode[];
}

export class CategoryRepository {
  constructor(private readonly db: Db) {}

  findByLedger(ledgerId: number, flowType?: FlowType): Promise<CategoryRow[]> {
    if (flowType) {
      return this.db.query<CategoryRow>(
        'SELECT * FROM category WHERE ledger_id = $1 AND flow_type = $2 ORDER BY sort_order, id',
        [ledgerId, flowType],
      );
    }
    return this.db.query<CategoryRow>(
      'SELECT * FROM category WHERE ledger_id = $1 ORDER BY sort_order, id',
      [ledgerId],
    );
  }

  findById(id: number): Promise<CategoryRow | undefined> {
    return this.db.one<CategoryRow>('SELECT * FROM category WHERE id = $1', [id]);
  }

  async insert(input: CreateCategoryInput): Promise<number> {
    const row = await this.db.one<{ id: number }>(
      `INSERT INTO category (ledger_id, parent_id, name, flow_type, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        input.ledger_id,
        input.parent_id ?? null,
        input.name,
        input.flow_type,
        input.icon ?? null,
        input.sort_order ?? 0,
      ],
    );
    return row!.id;
  }

  async update(id: number, fields: UpdateCategoryInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (fields.parent_id !== undefined) push('parent_id', fields.parent_id);
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.flow_type !== undefined) push('flow_type', fields.flow_type);
    if (fields.icon !== undefined) push('icon', fields.icon);
    if (fields.sort_order !== undefined) push('sort_order', fields.sort_order);
    if (sets.length === 0) return;
    values.push(id);
    await this.db.query(`UPDATE category SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM category WHERE id = $1', [id]);
  }
}

export class CategoryService {
  private readonly repo: CategoryRepository;
  constructor(private readonly db: Db) {
    this.repo = new CategoryRepository(db);
  }

  async list(userId: number, ledgerId: number, flowType?: FlowType): Promise<CategoryRow[]> {
    await assertLedgerOwned(this.db, userId, ledgerId);
    return this.repo.findByLedger(ledgerId, flowType);
  }

  async tree(userId: number, ledgerId: number, flowType?: FlowType): Promise<CategoryNode[]> {
    await assertLedgerOwned(this.db, userId, ledgerId);
    const flat = await this.repo.findByLedger(ledgerId, flowType);
    const map = new Map<number, CategoryNode>();
    flat.forEach((c) => map.set(c.id, { ...c, children: [] }));
    const roots: CategoryNode[] = [];
    for (const node of map.values()) {
      if (node.parent_id != null && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async get(userId: number, id: number): Promise<CategoryRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('类目', id);
    await assertLedgerOwned(this.db, userId, row.ledger_id);
    return row;
  }

  async create(userId: number, input: CreateCategoryInput): Promise<CategoryRow> {
    if (!input.name || input.name.trim() === '') throw new ValidationError('类目名称不能为空');
    if (!FLOW_TYPES.includes(input.flow_type)) throw new ValidationError(`非法收支类型: ${input.flow_type}`);
    await assertLedgerOwned(this.db, userId, input.ledger_id);
    if (input.parent_id != null) {
      const parent = await this.get(userId, input.parent_id);
      this.assertParentValid(parent, input.ledger_id, input.flow_type);
    }
    const id = await this.repo.insert(input);
    return this.get(userId, id);
  }

  async update(userId: number, id: number, input: UpdateCategoryInput): Promise<CategoryRow> {
    const current = await this.get(userId, id);
    if (input.flow_type !== undefined && !FLOW_TYPES.includes(input.flow_type)) {
      throw new ValidationError(`非法收支类型: ${input.flow_type}`);
    }
    if (input.name !== undefined && input.name.trim() === '') {
      throw new ValidationError('类目名称不能为空');
    }
    if (input.parent_id !== undefined && input.parent_id != null) {
      if (input.parent_id === id) throw new ValidationError('类目不能将自己设为父类目');
      const parent = await this.get(userId, input.parent_id);
      const flow = input.flow_type ?? current.flow_type;
      this.assertParentValid(parent, current.ledger_id, flow);
      if (await this.isDescendant(id, input.parent_id)) {
        throw new ValidationError('不能将子类目设为父类目（会形成环）');
      }
    }
    await this.repo.update(id, input);
    return this.get(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    await this.repo.delete(id);
  }

  private assertParentValid(parent: CategoryRow, ledgerId: number, flow: FlowType): void {
    if (parent.ledger_id !== ledgerId) throw new ValidationError('父类目必须属于同一账本');
    if (parent.flow_type !== flow) throw new ValidationError('父类目的收支类型必须一致');
    if (parent.parent_id != null) throw new ValidationError('仅支持两级类目，不能挂到子类目下');
  }

  private async isDescendant(id: number, candidateParentId: number): Promise<boolean> {
    let cursor: number | null = candidateParentId;
    const guard = new Set<number>();
    while (cursor != null) {
      if (cursor === id) return true;
      if (guard.has(cursor)) break;
      guard.add(cursor);
      const row: CategoryRow | undefined = await this.repo.findById(cursor);
      cursor = row?.parent_id ?? null;
    }
    return false;
  }
}
