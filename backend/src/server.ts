/**
 * 启动入口 —— 初始化数据库结构后监听端口。
 * 用户数据按需在注册时播种，不再有全局种子。
 */
import { getDb, applySchema, closeDb } from './db/connection.js';
import { buildApp } from './app.js';

const db = getDb();
await applySchema(db);

const app = buildApp(db);
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  const addr = await app.listen({ port, host });
  console.log(`✅ 松松记账后端已启动: ${addr}`);
} catch (err) {
  console.error('❌ 启动失败:', err);
  await closeDb();
  process.exit(1);
}
