/**
 * 数据库连接 —— PostgreSQL（node-postgres）。
 * 提供异步 Db 抽象（query/one/exec/tx），便于 repository 复用与测试注入（DIP）。
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool, types } = pg;

// PG 的 int8(bigint, oid=20) 默认以字符串返回；COUNT(*)/SUM(int) 结果均为 int8。
// 金额为整数分、数量级远小于 2^53，统一解析为 number，避免聚合结果变字符串。
types.setTypeParser(20, (v) => parseInt(v, 10));

const moduleDir = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(moduleDir, 'schema.sql');

/** 数据访问抽象（被 Pool 与事务内 Client 共同实现） */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

class PoolDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async one<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const res = await this.pool.query(sql, params);
    return res.rows[0] as T | undefined;
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new ClientDb(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  get raw(): pg.Pool {
    return this.pool;
  }
}

/** 事务内的 Db：复用同一连接；嵌套 tx 直接复用当前事务。 */
class ClientDb implements Db {
  constructor(private readonly client: pg.PoolClient) {}
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(sql, params);
    return res.rows as T[];
  }
  async one<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const res = await this.client.query(sql, params);
    return res.rows[0] as T | undefined;
  }
  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const DEFAULT_URL = 'postgres://ledger:ledger@127.0.0.1:5433/ledger';

/** 创建一个连接池 Db（应用与测试均可用）。 */
export function createDb(connectionString = process.env.DATABASE_URL ?? DEFAULT_URL): Db {
  // allowExitOnIdle：空闲时不阻塞进程退出（利于测试与优雅停止）
  const pool = new Pool({ connectionString, max: 10, allowExitOnIdle: true });
  return new PoolDb(pool);
}

/** 应用表结构（幂等，全部 IF NOT EXISTS）。 */
export async function applySchema(db: Db): Promise<void> {
  const sql = readFileSync(SCHEMA_PATH, 'utf-8');
  await db.exec(sql);
}

let singleton: Db | null = null;

/** 获取应用级单例连接。 */
export function getDb(): Db {
  if (!singleton) singleton = createDb();
  return singleton;
}

/** 关闭单例连接池（优雅退出/测试清理）。 */
export async function closeDb(): Promise<void> {
  if (singleton && singleton instanceof PoolDb) {
    await singleton.raw.end();
    singleton = null;
  }
}
