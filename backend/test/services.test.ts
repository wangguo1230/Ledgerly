import { describe, it, expect } from 'vitest';
import { freshContainer, bareUser, SEED_PERSONAL_LEDGER_ID } from './helpers.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../src/common/errors.js';

describe('账本 Ledger', () => {
  it('注册用户含一个默认生意账本与默认类目', async () => {
    const { c, userId } = await freshContainer(true);
    const ledgers = await c.ledger.list(userId);
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].type).toBe('business');
    expect((await c.category.list(userId, SEED_PERSONAL_LEDGER_ID)).length).toBeGreaterThan(0);
  });

  it('新建账本自动预置类目', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '小店', type: 'business' });
    expect((await c.category.list(userId, biz.id)).length).toBeGreaterThan(0);
  });

  it('不能删除最后一个账本', async () => {
    const { c, userId } = await freshContainer(true);
    await expect(c.ledger.remove(userId, SEED_PERSONAL_LEDGER_ID)).rejects.toThrow(ValidationError);
  });

  it('删除账本级联类目与交易', async () => {
    const { c, db, userId } = await freshContainer(true);
    const biz = await c.ledger.create(userId, { name: '小店', type: 'business' });
    const cat = (await c.category.list(userId, biz.id))[0];
    await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: cat.flow_type,
      amount: 1000,
      category_id: cat.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    await c.ledger.remove(userId, biz.id);
    const remain = await db.one<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM txn WHERE ledger_id = $1',
      [biz.id],
    );
    expect(remain?.c).toBe(0);
  });
});

describe('跨用户隔离（多租户核心）', () => {
  it('A 无法读取/统计/操作 B 的账本数据', async () => {
    const { db, c, userId: A } = await freshContainer(false);
    const B = await bareUser(db, 'userB');
    const lgA = await c.ledger.create(A, { name: 'A的账本', type: 'personal' });
    await c.transaction.create(A, {
      ledger_id: lgA.id,
      flow_type: 'expense',
      amount: 500,
      occurred_at: '2026-06-01 10:00:00',
    });

    await expect(c.ledger.get(B, lgA.id)).rejects.toThrow(ForbiddenError);
    await expect(c.category.list(B, lgA.id)).rejects.toThrow(ForbiddenError);
    await expect(c.transaction.list(B, { ledger_id: lgA.id })).rejects.toThrow(ForbiddenError);
    await expect(c.stats.summary(B, { ledger_id: lgA.id })).rejects.toThrow(ForbiddenError);
    // B 的账本列表里看不到 A 的账本
    expect(await c.ledger.list(B)).toHaveLength(0);
  });

  it('A 不能把账目记到 B 的账本', async () => {
    const { db, c, userId: A } = await freshContainer(false);
    const B = await bareUser(db, 'userB');
    const lgB = await c.ledger.create(B, { name: 'B的账本', type: 'personal' });
    await expect(
      c.transaction.create(A, {
        ledger_id: lgB.id,
        flow_type: 'expense',
        amount: 100,
        occurred_at: '2026-06-01 10:00:00',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('平台按用户隔离，不能引用他人平台', async () => {
    const { db, c, userId: A } = await freshContainer(false);
    const B = await bareUser(db, 'userB');
    const platB = await c.platform.create(B, { name: '微信' });
    const lgA = await c.ledger.create(A, { name: 'A', type: 'personal' });
    await expect(
      c.transaction.create(A, {
        ledger_id: lgA.id,
        flow_type: 'income',
        amount: 100,
        source_platform_id: platB.id,
        occurred_at: '2026-06-01 10:00:00',
      }),
    ).rejects.toThrow(ForbiddenError);
    // 同名平台在不同用户下互不冲突
    expect(await c.platform.create(A, { name: '微信' })).toBeTruthy();
  });
});

describe('类目 Category 层级（成功标准 A1.2）', () => {
  it('创建两级类目并生成树', async () => {
    const { c, db, userId } = await freshContainer(false);
    const lg = await db.one<{ id: number }>(
      "INSERT INTO ledger (user_id, name, type, currency) VALUES ($1, '个人', 'personal', 'CNY') RETURNING id",
      [userId],
    );
    const lgId = lg!.id;
    const parent = await c.category.create(userId, { ledger_id: lgId, name: '餐饮', flow_type: 'expense' });
    await c.category.create(userId, {
      ledger_id: lgId,
      name: '外卖',
      flow_type: 'expense',
      parent_id: parent.id,
    });
    const tree = await c.category.tree(userId, lgId, 'expense');
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('外卖');
  });

  it('父类目收支类型必须一致', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: '个人', type: 'personal' });
    const income = await c.category.create(userId, { ledger_id: lg.id, name: '工资x', flow_type: 'income' });
    await expect(
      c.category.create(userId, {
        ledger_id: lg.id,
        name: '外卖x',
        flow_type: 'expense',
        parent_id: income.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('不支持三级类目', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: '个人', type: 'personal' });
    const p = await c.category.create(userId, { ledger_id: lg.id, name: '餐饮x', flow_type: 'expense' });
    const child = await c.category.create(userId, {
      ledger_id: lg.id,
      name: '外卖x',
      flow_type: 'expense',
      parent_id: p.id,
    });
    await expect(
      c.category.create(userId, {
        ledger_id: lg.id,
        name: '麦当劳',
        flow_type: 'expense',
        parent_id: child.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('交易 Transaction 与账本隔离（成功标准 S2）', () => {
  it('账本之间数据完全隔离', async () => {
    const { c, userId } = await freshContainer(false);
    const a = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const b = await c.ledger.create(userId, { name: 'B', type: 'personal' });
    const catA = await c.category.create(userId, { ledger_id: a.id, name: '餐饮z', flow_type: 'expense' });
    const catB = await c.category.create(userId, { ledger_id: b.id, name: '餐饮z', flow_type: 'expense' });
    await c.transaction.create(userId, {
      ledger_id: a.id,
      flow_type: 'expense',
      amount: 5000,
      category_id: catA.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    await c.transaction.create(userId, {
      ledger_id: b.id,
      flow_type: 'expense',
      amount: 9900,
      category_id: catB.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    expect((await c.transaction.list(userId, { ledger_id: a.id })).total).toBe(1);
    expect((await c.stats.summary(userId, { ledger_id: a.id })).expense).toBe(5000);
    expect((await c.stats.summary(userId, { ledger_id: b.id })).expense).toBe(9900);
  });

  it('拒绝跨账本引用类目', async () => {
    const { c, userId } = await freshContainer(false);
    const a = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const b = await c.ledger.create(userId, { name: 'B', type: 'personal' });
    const catB = await c.category.create(userId, { ledger_id: b.id, name: '餐饮q', flow_type: 'expense' });
    await expect(
      c.transaction.create(userId, {
        ledger_id: a.id,
        flow_type: 'expense',
        amount: 100,
        category_id: catB.id,
        occurred_at: '2026-06-01 10:00:00',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('类目收支类型必须与账目一致', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const income = await c.category.create(userId, { ledger_id: lg.id, name: '工资w', flow_type: 'income' });
    await expect(
      c.transaction.create(userId, {
        ledger_id: lg.id,
        flow_type: 'expense',
        amount: 100,
        category_id: income.id,
        occurred_at: '2026-06-01 10:00:00',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('拒绝负金额', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    await expect(
      c.transaction.create(userId, {
        ledger_id: lg.id,
        flow_type: 'expense',
        amount: -100,
        occurred_at: '2026-06-01 10:00:00',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('按时间区间与类型筛选', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'income',
      amount: 100,
      occurred_at: '2026-05-01 10:00:00',
    });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 200,
      occurred_at: '2026-06-15 10:00:00',
    });
    const june = await c.transaction.list(userId, {
      ledger_id: lg.id,
      from: '2026-06-01 00:00:00',
      to: '2026-06-30 23:59:59',
    });
    expect(june.total).toBe(1);
    expect(june.items[0].amount).toBe(200);
    expect((await c.transaction.list(userId, { ledger_id: lg.id, flow_type: 'income' })).total).toBe(1);
  });
});

describe('商品与利润核算（成功标准 A2.1 / A2.2）', () => {
  it('商品仅可在生意账本创建', async () => {
    const { c, userId } = await freshContainer(false);
    const personal = await c.ledger.create(userId, { name: '个人', type: 'personal' });
    await expect(c.product.create(userId, { ledger_id: personal.id, name: '苹果' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('利润 = 售价 - 成本×数量，且成本快照不随改价回溯', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '水果店', type: 'business' });
    const incomeCat = await c.category.create(userId, { ledger_id: biz.id, name: '卖货', flow_type: 'income' });
    const apple = await c.product.create(userId, {
      ledger_id: biz.id,
      name: '苹果',
      cost_price: 300,
      sale_price: 500,
      unit: '斤',
    });
    await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: 'income',
      amount: 5000,
      category_id: incomeCat.id,
      product_id: apple.id,
      quantity: 10,
      occurred_at: '2026-06-01 10:00:00',
    });
    await c.product.update(userId, apple.id, { cost_price: 400 });

    const profit = await c.stats.productProfit(userId, { ledger_id: biz.id });
    expect(profit).toHaveLength(1);
    expect(profit[0].revenue).toBe(5000);
    expect(profit[0].cost).toBe(3000);
    expect(profit[0].profit).toBe(2000);
  });

  it('关联商品但未填数量时按 1 计，成本不被归零', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '店', type: 'business' });
    const cat = await c.category.create(userId, { ledger_id: biz.id, name: '卖货', flow_type: 'income' });
    const prod = await c.product.create(userId, {
      ledger_id: biz.id,
      name: '橙子',
      cost_price: 200,
      sale_price: 600,
    });
    const tx = await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: 'income',
      amount: 600,
      category_id: cat.id,
      product_id: prod.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    expect(tx.quantity).toBe(1);
    const profit = await c.stats.productProfit(userId, { ledger_id: biz.id });
    expect(profit[0].cost).toBe(200);
    expect(profit[0].profit).toBe(400);
  });
});

describe('每笔单独填成本（成本随批变化）', () => {
  it('显式传 cost_snapshot 覆盖商品默认成本，利润按本笔成本算', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '店', type: 'business' });
    const cat = await c.category.create(userId, { ledger_id: biz.id, name: '卖货', flow_type: 'income' });
    const prod = await c.product.create(userId, {
      ledger_id: biz.id,
      name: '卡',
      cost_price: 300,
      sale_price: 500,
    });
    // 这批实际进价 3.50（350分），单独填
    const tx = await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: 'income',
      amount: 5000,
      category_id: cat.id,
      product_id: prod.id,
      quantity: 10,
      cost_snapshot: 350,
      occurred_at: '2026-06-01 10:00:00',
    });
    expect(tx.cost_snapshot).toBe(350);
    const profit = await c.stats.productProfit(userId, { ledger_id: biz.id });
    expect(profit[0].cost).toBe(3500);
    expect(profit[0].profit).toBe(1500);
  });

  it('不传成本时仍取商品当前成本价（默认行为不变）', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '店', type: 'business' });
    const prod = await c.product.create(userId, {
      ledger_id: biz.id,
      name: '卡',
      cost_price: 300,
      sale_price: 500,
    });
    const tx = await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: 'income',
      amount: 500,
      product_id: prod.id,
      quantity: 1,
      occurred_at: '2026-06-01 10:00:00',
    });
    expect(tx.cost_snapshot).toBe(300);
  });

  it('只改数量不改成本时，保留原本笔成本不被重置', async () => {
    const { c, userId } = await freshContainer(false);
    const biz = await c.ledger.create(userId, { name: '店', type: 'business' });
    const prod = await c.product.create(userId, {
      ledger_id: biz.id,
      name: '卡',
      cost_price: 300,
      sale_price: 500,
    });
    const tx = await c.transaction.create(userId, {
      ledger_id: biz.id,
      flow_type: 'income',
      amount: 5000,
      product_id: prod.id,
      quantity: 10,
      cost_snapshot: 350,
      occurred_at: '2026-06-01 10:00:00',
    });
    const updated = await c.transaction.update(userId, tx.id, { quantity: 8 });
    expect(updated.quantity).toBe(8);
    expect(updated.cost_snapshot).toBe(350); // 仍是本笔成本，未被商品成本重置
  });
});

describe('交易更新一致性', () => {
  it('仅改收支方向而未改类目时，自动置空不一致的旧类目', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const expenseCat = await c.category.create(userId, { ledger_id: lg.id, name: '餐饮m', flow_type: 'expense' });
    const tx = await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 100,
      category_id: expenseCat.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    const updated = await c.transaction.update(userId, tx.id, { flow_type: 'income' });
    expect(updated.flow_type).toBe('income');
    expect(updated.category_id).toBeNull();
  });
});

describe('内容清洗（富文本安全）', () => {
  it('入库剔除脚本/事件，保留安全排版标签', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: '店', type: 'business' });
    const cat = await c.category.create(userId, { ledger_id: lg.id, name: '卖货', flow_type: 'income' });
    const tx = await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'income',
      amount: 100,
      category_id: cat.id,
      occurred_at: '2026-06-01 10:00:00',
      remark:
        '<p><strong>账号</strong>：abc</p><ul><li>项</li></ul><script>alert(1)</script><img src=x onerror="alert(2)">',
    });
    expect(tx.remark).toContain('<strong>账号</strong>');
    expect(tx.remark).toContain('<li>项</li>');
    expect(tx.remark).not.toContain('<script');
    expect(tx.remark).not.toContain('onerror');
    expect(tx.remark).not.toContain('<img');
  });

  it('纯文本备注不被改动', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const tx = await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 100,
      occurred_at: '2026-06-01 10:00:00',
      remark: '买菜 3 斤',
    });
    expect(tx.remark).toBe('买菜 3 斤');
  });
});

describe('统计聚合 Stats', () => {
  it('byCategory 将子类目金额归并到父类目', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const food = await c.category.create(userId, { ledger_id: lg.id, name: '餐饮n', flow_type: 'expense' });
    const takeout = await c.category.create(userId, {
      ledger_id: lg.id,
      name: '外卖n',
      flow_type: 'expense',
      parent_id: food.id,
    });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 10000,
      category_id: food.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 20000,
      category_id: takeout.id,
      occurred_at: '2026-06-02 10:00:00',
    });
    const stats = await c.stats.byCategory(userId, { ledger_id: lg.id }, 'expense');
    const food行 = stats.find((s) => s.name === '餐饮n');
    expect(food行?.amount).toBe(30000);
  });

  it('trend 按月聚合收支', async () => {
    const { c, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'income',
      amount: 5000,
      occurred_at: '2026-05-10 10:00:00',
    });
    await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'expense',
      amount: 3000,
      occurred_at: '2026-06-10 10:00:00',
    });
    const trend = await c.stats.trend(userId, { ledger_id: lg.id }, 'month');
    expect(trend).toEqual([
      { period: '2026-05', income: 5000, expense: 0 },
      { period: '2026-06', income: 0, expense: 3000 },
    ]);
  });
});

describe('来源平台字典（按用户）', () => {
  it('系统预置平台不可删除', async () => {
    const { c, userId } = await freshContainer(true);
    const wechat = (await c.platform.list(userId)).find((p) => p.name === '微信')!;
    await expect(c.platform.remove(userId, wechat.id)).rejects.toThrow(ConflictError);
  });

  it('同一用户重名平台报冲突', async () => {
    const { c, userId } = await freshContainer(true);
    await expect(c.platform.create(userId, { name: '微信' })).rejects.toThrow(ConflictError);
  });

  it('删除自定义平台后交易引用置空', async () => {
    const { c, db, userId } = await freshContainer(false);
    const lg = await c.ledger.create(userId, { name: 'A', type: 'personal' });
    const plat = await c.platform.create(userId, { name: '抖音' });
    const tx = await c.transaction.create(userId, {
      ledger_id: lg.id,
      flow_type: 'income',
      amount: 100,
      source_platform_id: plat.id,
      occurred_at: '2026-06-01 10:00:00',
    });
    await c.platform.remove(userId, plat.id);
    const row = await db.one<{ source_platform_id: number | null }>(
      'SELECT source_platform_id FROM txn WHERE id = $1',
      [tx.id],
    );
    expect(row?.source_platform_id).toBeNull();
  });

  it('获取不存在的账目抛 NotFound', async () => {
    const { c, userId } = await freshContainer(false);
    await expect(c.transaction.get(userId, 9999)).rejects.toThrow(NotFoundError);
  });
});

describe('用户注册与登录', () => {
  it('注册成功并能登录；重复用户名冲突；错误密码拒绝', async () => {
    const { c } = await freshContainer(false);
    const u = await c.user.register({ username: 'alice', password: 'pw123456' });
    expect(u.username).toBe('alice');
    expect((u as unknown as { password_hash?: string }).password_hash).toBeUndefined();
    await expect(c.user.register({ username: 'alice', password: 'pw123456' })).rejects.toThrow(
      ConflictError,
    );
    expect((await c.user.authenticate('alice', 'pw123456')).id).toBe(u.id);
    await expect(c.user.authenticate('alice', 'wrong')).rejects.toThrow();
    // 注册即播种：默认账本 + 平台
    expect((await c.ledger.list(u.id)).length).toBe(1);
    expect((await c.platform.list(u.id)).length).toBe(5);
  });

  it('密码过短被拒绝', async () => {
    const { c } = await freshContainer(false);
    await expect(c.user.register({ username: 'bob', password: '123' })).rejects.toThrow(
      ValidationError,
    );
  });
});
