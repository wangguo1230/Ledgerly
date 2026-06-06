/**
 * 全局领域类型与枚举（单一数据源，DRY）
 */

/** 账本类型：个人 / 生意 */
export type LedgerType = 'personal' | 'business';
export const LEDGER_TYPES: readonly LedgerType[] = ['personal', 'business'];

/** 资金流向：收入 / 支出 */
export type FlowType = 'income' | 'expense';
export const FLOW_TYPES: readonly FlowType[] = ['income', 'expense'];

/** 用户 */
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
}

/** 数据库行实体 —— 金额字段统一为「整数分」 */
export interface LedgerRow {
  id: number;
  user_id: number;
  name: string;
  type: LedgerType;
  currency: string;
  remark: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  ledger_id: number;
  parent_id: number | null;
  name: string;
  flow_type: FlowType;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface SourcePlatformRow {
  id: number;
  user_id: number;
  name: string;
  icon: string | null;
  sort_order: number;
  is_system: number; // SQLite 无布尔，0/1
  created_at: string;
}

export interface ProductRow {
  id: number;
  ledger_id: number;
  name: string;
  sku: string | null;
  cost_price: number; // 分
  sale_price: number; // 分
  unit: string | null;
  stock: number | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: number;
  ledger_id: number;
  flow_type: FlowType;
  amount: number; // 分
  category_id: number | null;
  product_id: number | null;
  quantity: number | null;
  cost_snapshot: number | null; // 成交时成本价快照（分），避免商品改价回溯历史利润
  source_platform_id: number | null;
  occurred_at: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
}
