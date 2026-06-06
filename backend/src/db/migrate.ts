/**
 * 迁移入口 —— 应用表结构（幂等）。供 `npm run migrate` 调用。
 */
import { getDb, applySchema, closeDb } from './connection.js';

const db = getDb();
await applySchema(db);
console.log('✅ 数据库结构已就绪');
await closeDb();
