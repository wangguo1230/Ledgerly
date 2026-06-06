/**
 * 来源平台模块 —— 按用户隔离的字典（微信/支付宝/银行卡/现金…）。
 */
import type { Db } from '../../db/connection.js';
import type { SourcePlatformRow } from '../../common/types.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';

export interface CreatePlatformInput {
  name: string;
  icon?: string | null;
  sort_order?: number;
}

export type UpdatePlatformInput = Partial<CreatePlatformInput>;

export class SourcePlatformRepository {
  constructor(private readonly db: Db) {}

  findByUser(userId: number): Promise<SourcePlatformRow[]> {
    return this.db.query<SourcePlatformRow>(
      'SELECT * FROM source_platform WHERE user_id = $1 ORDER BY sort_order, id',
      [userId],
    );
  }

  findById(id: number): Promise<SourcePlatformRow | undefined> {
    return this.db.one<SourcePlatformRow>('SELECT * FROM source_platform WHERE id = $1', [id]);
  }

  findByName(userId: number, name: string): Promise<SourcePlatformRow | undefined> {
    return this.db.one<SourcePlatformRow>(
      'SELECT * FROM source_platform WHERE user_id = $1 AND name = $2',
      [userId, name],
    );
  }

  async insert(userId: number, input: CreatePlatformInput): Promise<number> {
    const row = await this.db.one<{ id: number }>(
      'INSERT INTO source_platform (user_id, name, icon, sort_order, is_system) VALUES ($1, $2, $3, $4, 0) RETURNING id',
      [userId, input.name, input.icon ?? null, input.sort_order ?? 0],
    );
    return row!.id;
  }

  async update(id: number, fields: UpdatePlatformInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.icon !== undefined) push('icon', fields.icon);
    if (fields.sort_order !== undefined) push('sort_order', fields.sort_order);
    if (sets.length === 0) return;
    values.push(id);
    await this.db.query(
      `UPDATE source_platform SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values,
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM source_platform WHERE id = $1', [id]);
  }
}

export class SourcePlatformService {
  private readonly repo: SourcePlatformRepository;
  constructor(db: Db) {
    this.repo = new SourcePlatformRepository(db);
  }

  list(userId: number): Promise<SourcePlatformRow[]> {
    return this.repo.findByUser(userId);
  }

  async get(userId: number, id: number): Promise<SourcePlatformRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('来源平台', id);
    if (row.user_id !== userId) throw new ForbiddenError('无权访问该平台');
    return row;
  }

  async create(userId: number, input: CreatePlatformInput): Promise<SourcePlatformRow> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError('平台名称不能为空');
    if (await this.repo.findByName(userId, name)) throw new ConflictError(`平台「${name}」已存在`);
    const id = await this.repo.insert(userId, { ...input, name });
    return this.get(userId, id);
  }

  async update(userId: number, id: number, input: UpdatePlatformInput): Promise<SourcePlatformRow> {
    await this.get(userId, id);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError('平台名称不能为空');
      const dup = await this.repo.findByName(userId, name);
      if (dup && dup.id !== id) throw new ConflictError(`平台「${name}」已存在`);
    }
    await this.repo.update(id, input);
    return this.get(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    const row = await this.get(userId, id);
    if (row.is_system === 1) throw new ConflictError('系统预置平台不可删除');
    await this.repo.delete(id);
  }
}
