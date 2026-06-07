/**
 * 统计/报表/利润核算 —— 只读聚合，全部基于整数分计算。
 * 聚合结果（SUM/COUNT 返回 int8）经连接层 int8 解析器转为 number。
 */
import type { Db } from '../../db/connection.js';
import type { FlowType } from '../../common/types.js';
import { assertLedgerOwned } from '../../common/authz.js';

export interface StatRange {
  ledger_id: number;
  from?: string;
  to?: string;
}

export interface Summary {
  income: number; // 分
  expense: number; // 分
  balance: number; // 分
  count: number;
}

export interface CategoryStat {
  category_id: number | null;
  name: string;
  flow_type: FlowType;
  amount: number; // 分
}

export interface TrendPoint {
  period: string; // YYYY-MM 或 YYYY-MM-DD
  income: number;
  expense: number;
}

export interface PlatformStat {
  source_platform_id: number | null;
  name: string;
  income: number;
  expense: number;
}

export interface ProductProfit {
  product_id: number;
  name: string;
  quantity: number;
  revenue: number; // 销售收入(分)
  cost: number; // 成本(分)
  profit: number; // 毛利润(分)
}

export class StatsService {
  constructor(private readonly db: Db) {}

  /** 构建时间范围过滤；alias 为表别名（如 't'），用于含 JOIN 的查询消歧。 */
  private rangeClause(r: StatRange, alias = ''): { clause: string; params: unknown[] } {
    const p = alias ? `${alias}.` : '';
    const conds: string[] = [];
    const params: unknown[] = [];
    const ph = (val: unknown) => {
      params.push(val);
      return `$${params.length}`;
    };
    conds.push(`${p}ledger_id = ${ph(r.ledger_id)}`);
    if (r.from) conds.push(`${p}occurred_at >= ${ph(r.from)}`);
    if (r.to) conds.push(`${p}occurred_at <= ${ph(r.to)}`);
    return { clause: conds.join(' AND '), params };
  }

  /** 收入/支出/结余 概览 */
  async summary(userId: number, r: StatRange): Promise<Summary> {
    await assertLedgerOwned(this.db, userId, r.ledger_id);
    const { clause, params } = this.rangeClause(r);
    const row = await this.db.one<{ income: number; expense: number; count: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN flow_type='income'  THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN flow_type='expense' THEN amount END), 0) AS expense,
         COUNT(*) AS count
       FROM txn WHERE ${clause}`,
      params,
    );
    const income = row?.income ?? 0;
    const expense = row?.expense ?? 0;
    return { income, expense, balance: income - expense, count: row?.count ?? 0 };
  }

  /** 按顶级类目汇总（子类目金额归并到父类目），用于占比图 */
  async byCategory(userId: number, r: StatRange, flowType: FlowType): Promise<CategoryStat[]> {
    await assertLedgerOwned(this.db, userId, r.ledger_id);
    const { clause, params } = this.rangeClause(r, 't');
    params.push(flowType);
    const flowPh = `$${params.length}`;
    return this.db.query<CategoryStat>(
      `SELECT
         COALESCE(top.id, c.id) AS category_id,
         COALESCE(top.name, c.name, '未分类') AS name,
         t.flow_type AS flow_type,
         SUM(t.amount) AS amount
       FROM txn t
       LEFT JOIN category c   ON t.category_id = c.id
       LEFT JOIN category top ON c.parent_id   = top.id
       WHERE ${clause} AND t.flow_type = ${flowPh}
       GROUP BY COALESCE(top.id, c.id), COALESCE(top.name, c.name, '未分类'), t.flow_type
       ORDER BY amount DESC`,
      params,
    );
  }

  /** 收支趋势（按日/按周/按月） */
  async trend(
    userId: number,
    r: StatRange,
    granularity: 'day' | 'week' | 'month' = 'month',
  ): Promise<TrendPoint[]> {
    await assertLedgerOwned(this.db, userId, r.ledger_id);
    const { clause, params } = this.rangeClause(r);
    // 周用 ISO 年-周（如 2026-W23），日/月用字符串截取
    const periodExpr =
      granularity === 'day'
        ? 'substr(occurred_at, 1, 10)'
        : granularity === 'week'
          ? `to_char(occurred_at::timestamp, 'IYYY-"W"IW')`
          : 'substr(occurred_at, 1, 7)';
    return this.db.query<TrendPoint>(
      `SELECT
         ${periodExpr} AS period,
         COALESCE(SUM(CASE WHEN flow_type='income'  THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN flow_type='expense' THEN amount END), 0) AS expense
       FROM txn WHERE ${clause}
       GROUP BY period ORDER BY period ASC`,
      params,
    );
  }

  /** 按来源平台汇总 */
  async byPlatform(userId: number, r: StatRange): Promise<PlatformStat[]> {
    await assertLedgerOwned(this.db, userId, r.ledger_id);
    const { clause, params } = this.rangeClause(r, 't');
    return this.db.query<PlatformStat>(
      `SELECT
         t.source_platform_id AS source_platform_id,
         COALESCE(p.name, '未标记') AS name,
         COALESCE(SUM(CASE WHEN t.flow_type='income'  THEN t.amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.flow_type='expense' THEN t.amount END), 0) AS expense
       FROM txn t
       LEFT JOIN source_platform p ON t.source_platform_id = p.id
       WHERE ${clause}
       GROUP BY t.source_platform_id, COALESCE(p.name, '未标记')
       ORDER BY (
         COALESCE(SUM(CASE WHEN t.flow_type='income' THEN t.amount END),0) +
         COALESCE(SUM(CASE WHEN t.flow_type='expense' THEN t.amount END),0)
       ) DESC`,
      params,
    );
  }

  /**
   * 商品利润核算：毛利润 = 销售收入 - 成本快照×数量。
   * 仅统计「收入(销售)」且关联了商品的交易。
   */
  async productProfit(userId: number, r: StatRange): Promise<ProductProfit[]> {
    await assertLedgerOwned(this.db, userId, r.ledger_id);
    const { clause, params } = this.rangeClause(r, 't');
    const rows = await this.db.query<Omit<ProductProfit, 'profit'>>(
      `SELECT
         t.product_id AS product_id,
         COALESCE(pr.name, '已删除商品') AS name,
         COALESCE(SUM(t.quantity), 0) AS quantity,
         COALESCE(SUM(t.amount), 0) AS revenue,
         COALESCE(SUM(COALESCE(t.cost_snapshot,0) * COALESCE(t.quantity,0)), 0) AS cost
       FROM txn t
       LEFT JOIN product pr ON t.product_id = pr.id
       WHERE ${clause} AND t.flow_type = 'income' AND t.product_id IS NOT NULL
       GROUP BY t.product_id, COALESCE(pr.name, '已删除商品')
       ORDER BY revenue DESC`,
      params,
    );
    return rows.map((x) => ({ ...x, profit: x.revenue - x.cost }));
  }
}
