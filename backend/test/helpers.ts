/**
 * 测试辅助 —— 连接独立的 PostgreSQL 测试库，每个用例前重建表，互不污染。
 * 多用户：提供「裸用户」（仅建用户、无默认数据）与「完整注册用户」两种起点。
 */
import { createDb, applySchema, type Db } from '../src/db/connection.js';
import { createContainer, type Container } from '../src/container.js';
import { buildApp } from '../src/app.js';

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ledger:ledger@127.0.0.1:5433/ledger_test';

let sharedDb: Db | null = null;

export function testDb(): Db {
  if (!sharedDb) sharedDb = createDb(TEST_URL);
  return sharedDb;
}

/** 删除所有表并重建结构（schema 含多用户字段，需整表重建） */
export async function resetDb(db: Db): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS txn, product, source_platform, category, ledger, users CASCADE');
  await applySchema(db);
}

/** 直接插入一个「裸用户」（不播种默认账本/类目/平台），返回 userId。 */
export async function bareUser(db: Db, username = 'tester'): Promise<number> {
  const row = await db.one<{ id: number }>(
    "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id",
    [username],
  );
  return row!.id;
}

/** 重置库 + 容器；seed=true 时注册一个含默认数据的用户。返回 userId。 */
export async function freshContainer(
  seed = false,
): Promise<{ db: Db; c: Container; userId: number }> {
  const db = testDb();
  await resetDb(db);
  const c = createContainer(db);
  let userId: number;
  if (seed) {
    const u = await c.user.register({ username: 'owner', password: 'secret123' });
    userId = u.id;
  } else {
    userId = await bareUser(db);
  }
  return { db, c, userId };
}

export async function freshApp() {
  const db = testDb();
  await resetDb(db);
  return buildApp(db);
}

/** 完整注册用户（含默认个人账本=id 1、5 个平台、22 个类目） */
export const SEED_PERSONAL_LEDGER_ID = 1;
