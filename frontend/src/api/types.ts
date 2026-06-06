/**
 * 与后端共享的 DTO 类型（金额字段均为「整数分」）。
 */
export type LedgerType = 'personal' | 'business';
export type FlowType = 'income' | 'expense';

export interface User {
  id: number;
  username: string;
  display_name: string | null;
  created_at: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface Ledger {
  id: number;
  name: string;
  type: LedgerType;
  currency: string;
  remark: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  ledger_id: number;
  parent_id: number | null;
  name: string;
  flow_type: FlowType;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface SourcePlatform {
  id: number;
  name: string;
  icon: string | null;
  sort_order: number;
  is_system: number;
  created_at: string;
}

export interface Product {
  id: number;
  ledger_id: number;
  name: string;
  sku: string | null;
  cost_price: number;
  sale_price: number;
  unit: string | null;
  stock: number | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  ledger_id: number;
  flow_type: FlowType;
  amount: number;
  category_id: number | null;
  product_id: number | null;
  quantity: number | null;
  cost_snapshot: number | null;
  source_platform_id: number | null;
  occurred_at: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Summary {
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface CategoryStat {
  category_id: number | null;
  name: string;
  flow_type: FlowType;
  amount: number;
}

export interface TrendPoint {
  period: string;
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
  revenue: number;
  cost: number;
  profit: number;
}
