/**
 * 种子数据 —— 按用户播种（注册时调用）。
 * 为新用户建立：默认来源平台字典 + 默认「生意账本」及其常用类目。
 * 类目按账本类型区分：生意账本给进货/卖货那套，个人账本给餐饮/工资那套。
 */
import type { Db } from './connection.js';
import type { LedgerType } from '../common/types.js';

interface SeedCategory {
  name: string;
  flow: 'income' | 'expense';
  children?: string[];
}

const DEFAULT_PLATFORMS = ['微信', '支付宝', '银行卡', '现金', '其他'];

// 个人账本默认类目
const PERSONAL_CATEGORIES: SeedCategory[] = [
  { name: '餐饮', flow: 'expense', children: ['外卖', '买菜', '下馆子'] },
  { name: '交通', flow: 'expense', children: ['打车', '公共交通', '加油'] },
  { name: '购物', flow: 'expense', children: ['日用', '服饰', '数码'] },
  { name: '居住', flow: 'expense', children: ['房租', '水电', '物业'] },
  { name: '娱乐', flow: 'expense' },
  { name: '医疗', flow: 'expense' },
  { name: '工资', flow: 'income' },
  { name: '兼职', flow: 'income' },
  { name: '红包', flow: 'income' },
  { name: '理财', flow: 'income' },
];

// 生意账本默认类目
const BUSINESS_CATEGORIES: SeedCategory[] = [
  { name: '进货', flow: 'expense' },
  { name: '房租', flow: 'expense' },
  { name: '水电', flow: 'expense' },
  { name: '工资', flow: 'expense' },
  { name: '物流快递', flow: 'expense' },
  { name: '包装耗材', flow: 'expense' },
  { name: '推广', flow: 'expense' },
  { name: '杂费', flow: 'expense' },
  { name: '卖货', flow: 'income' },
  { name: '其他收入', flow: 'income' },
];

/** 为用户预置默认来源平台（按用户幂等）。 */
export async function seedPlatformsForUser(db: Db, userId: number): Promise<void> {
  const row = await db.one<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM source_platform WHERE user_id = $1',
    [userId],
  );
  if ((row?.c ?? 0) > 0) return;
  await db.tx(async (tx) => {
    for (let i = 0; i < DEFAULT_PLATFORMS.length; i++) {
      await tx.query(
        'INSERT INTO source_platform (user_id, name, sort_order, is_system) VALUES ($1, $2, $3, 1)',
        [userId, DEFAULT_PLATFORMS[i], i],
      );
    }
  });
}

/** 为指定账本预置默认类目（按账本类型选用类目集，按账本幂等）。 */
export async function seedCategoriesForLedger(
  db: Db,
  ledgerId: number,
  type: LedgerType = 'personal',
): Promise<void> {
  const row = await db.one<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM category WHERE ledger_id = $1',
    [ledgerId],
  );
  if ((row?.c ?? 0) > 0) return;

  const set = type === 'business' ? BUSINESS_CATEGORIES : PERSONAL_CATEGORIES;
  await db.tx(async (tx) => {
    for (let i = 0; i < set.length; i++) {
      const cat = set[i];
      const parent = await tx.one<{ id: number }>(
        'INSERT INTO category (ledger_id, parent_id, name, flow_type, sort_order) VALUES ($1, NULL, $2, $3, $4) RETURNING id',
        [ledgerId, cat.name, cat.flow, i],
      );
      const parentId = parent!.id;
      if (cat.children) {
        for (let j = 0; j < cat.children.length; j++) {
          await tx.query(
            'INSERT INTO category (ledger_id, parent_id, name, flow_type, sort_order) VALUES ($1, $2, $3, $4, $5)',
            [ledgerId, parentId, cat.children[j], cat.flow, j],
          );
        }
      }
    }
  });
}

/** 为新用户建立默认「生意账本」，返回其 id。 */
export async function createDefaultLedger(db: Db, userId: number): Promise<number> {
  const created = await db.one<{ id: number }>(
    "INSERT INTO ledger (user_id, name, type, currency) VALUES ($1, '我的账本', 'business', 'CNY') RETURNING id",
    [userId],
  );
  return created!.id;
}

/** 注册后为新用户一键播种：平台字典 + 默认生意账本 + 默认类目。 */
export async function seedNewUser(db: Db, userId: number): Promise<void> {
  await seedPlatformsForUser(db, userId);
  const ledgerId = await createDefaultLedger(db, userId);
  await seedCategoriesForLedger(db, ledgerId, 'business');
}
