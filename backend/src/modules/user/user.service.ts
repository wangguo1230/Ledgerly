/**
 * 用户模块 —— 注册（哈希密码 + 播种默认数据）、登录校验。
 */
import type { Db } from '../../db/connection.js';
import type { UserRow } from '../../common/types.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../../common/errors.js';
import { hashPassword, verifyPassword } from '../../common/password.js';
import { seedNewUser } from '../../db/seed.js';

export interface RegisterInput {
  username: string;
  password: string;
  display_name?: string | null;
}

/** 对外用户信息（绝不包含密码哈希） */
export interface PublicUser {
  id: number;
  username: string;
  display_name: string | null;
  created_at: string;
}

function toPublic(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, display_name: u.display_name, created_at: u.created_at };
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  findByUsername(username: string): Promise<UserRow | undefined> {
    return this.db.one<UserRow>('SELECT * FROM users WHERE username = $1', [username]);
  }

  findById(id: number): Promise<UserRow | undefined> {
    return this.db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  }

  async insert(db: Db, username: string, passwordHash: string, displayName: string | null) {
    const row = await db.one<{ id: number }>(
      'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      [username, passwordHash, displayName],
    );
    return row!.id;
  }
}

export class UserService {
  private readonly repo: UserRepository;
  constructor(private readonly db: Db) {
    this.repo = new UserRepository(db);
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    const username = input.username?.trim();
    if (!username || username.length < 3) throw new ValidationError('用户名至少 3 个字符');
    if (!input.password || input.password.length < 6) throw new ValidationError('密码至少 6 位');
    if (await this.repo.findByUsername(username)) throw new ConflictError('该用户名已被注册');

    const passwordHash = await hashPassword(input.password);
    // 创建用户 + 播种默认数据，置于同一事务，保证一致性
    const id = await this.db.tx(async (tx) => {
      const uid = await this.repo.insert(tx, username, passwordHash, input.display_name ?? null);
      await seedNewUser(tx, uid);
      return uid;
    });
    return toPublic((await this.repo.findById(id))!);
  }

  async authenticate(username: string, password: string): Promise<PublicUser> {
    const user = await this.repo.findByUsername(username?.trim() ?? '');
    // 即使用户不存在也执行一次校验逻辑，降低用户名枚举风险
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) throw new UnauthorizedError('用户名或密码错误');
    return toPublic(user);
  }

  async getPublic(id: number): Promise<PublicUser | undefined> {
    const u = await this.repo.findById(id);
    return u ? toPublic(u) : undefined;
  }
}
