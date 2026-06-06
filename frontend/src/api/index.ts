/**
 * API 端点封装 —— 按领域分组，单一数据源（DRY）。
 */
import { http } from './http';
import type {
  AuthResult,
  User,
  Ledger,
  LedgerType,
  Category,
  CategoryNode,
  FlowType,
  SourcePlatform,
  Product,
  Transaction,
  Paged,
  Summary,
  CategoryStat,
  TrendPoint,
  PlatformStat,
  ProductProfit,
} from './types';

// —— 鉴权 ——
export const authApi = {
  register: (data: { username: string; password: string; display_name?: string | null }) =>
    http.post<AuthResult>('/auth/register', data).then((r) => r.data),
  login: (data: { username: string; password: string }) =>
    http.post<AuthResult>('/auth/login', data).then((r) => r.data),
  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data.user),
};

// —— 账本 ——
export const ledgerApi = {
  list: () => http.get<Ledger[]>('/ledgers').then((r) => r.data),
  create: (data: { name: string; type: LedgerType; remark?: string | null }) =>
    http.post<Ledger>('/ledgers', data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; type: LedgerType; remark: string | null }>) =>
    http.put<Ledger>(`/ledgers/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/ledgers/${id}`).then((r) => r.data),
};

// —— 类目 ——
export const categoryApi = {
  list: (ledgerId: number, flowType?: FlowType) =>
    http
      .get<Category[]>('/categories', { params: { ledger_id: ledgerId, flow_type: flowType } })
      .then((r) => r.data),
  tree: (ledgerId: number, flowType?: FlowType) =>
    http
      .get<CategoryNode[]>('/categories', {
        params: { ledger_id: ledgerId, flow_type: flowType, tree: 'true' },
      })
      .then((r) => r.data),
  create: (data: {
    ledger_id: number;
    name: string;
    flow_type: FlowType;
    parent_id?: number | null;
    icon?: string | null;
  }) => http.post<Category>('/categories', data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; parent_id: number | null; icon: string | null }>) =>
    http.put<Category>(`/categories/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/categories/${id}`).then((r) => r.data),
};

// —— 来源平台 ——
export const platformApi = {
  list: () => http.get<SourcePlatform[]>('/platforms').then((r) => r.data),
  create: (data: { name: string; icon?: string | null }) =>
    http.post<SourcePlatform>('/platforms', data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; icon: string | null }>) =>
    http.put<SourcePlatform>(`/platforms/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/platforms/${id}`).then((r) => r.data),
};

// —— 商品 ——
export const productApi = {
  list: (ledgerId: number) =>
    http.get<Product[]>('/products', { params: { ledger_id: ledgerId } }).then((r) => r.data),
  create: (data: {
    ledger_id: number;
    name: string;
    sku?: string | null;
    cost_price?: number;
    sale_price?: number;
    unit?: string | null;
    stock?: number | null;
    remark?: string | null;
  }) => http.post<Product>('/products', data).then((r) => r.data),
  update: (id: number, data: Partial<Omit<Product, 'id' | 'ledger_id' | 'created_at' | 'updated_at'>>) =>
    http.put<Product>(`/products/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/products/${id}`).then((r) => r.data),
};

export interface TransactionQuery {
  ledger_id: number;
  flow_type?: FlowType;
  category_id?: number;
  product_id?: number;
  source_platform_id?: number;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionPayload {
  ledger_id: number;
  flow_type: FlowType;
  amount: number;
  category_id?: number | null;
  product_id?: number | null;
  quantity?: number | null;
  source_platform_id?: number | null;
  occurred_at: string;
  remark?: string | null;
}

// —— 交易 ——
export const transactionApi = {
  list: (query: TransactionQuery) =>
    http.get<Paged<Transaction>>('/transactions', { params: query }).then((r) => r.data),
  get: (id: number) => http.get<Transaction>(`/transactions/${id}`).then((r) => r.data),
  create: (data: TransactionPayload) =>
    http.post<Transaction>('/transactions', data).then((r) => r.data),
  update: (id: number, data: Partial<Omit<TransactionPayload, 'ledger_id'>>) =>
    http.put<Transaction>(`/transactions/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/transactions/${id}`).then((r) => r.data),
};

export interface StatRangeQuery {
  ledger_id: number;
  from?: string;
  to?: string;
}

// —— 统计/报表 ——
export const statsApi = {
  summary: (q: StatRangeQuery) =>
    http.get<Summary>('/stats/summary', { params: q }).then((r) => r.data),
  byCategory: (q: StatRangeQuery & { flow_type: FlowType }) =>
    http.get<CategoryStat[]>('/stats/by-category', { params: q }).then((r) => r.data),
  trend: (q: StatRangeQuery & { granularity?: 'day' | 'month' }) =>
    http.get<TrendPoint[]>('/stats/trend', { params: q }).then((r) => r.data),
  byPlatform: (q: StatRangeQuery) =>
    http.get<PlatformStat[]>('/stats/by-platform', { params: q }).then((r) => r.data),
  profit: (q: StatRangeQuery) =>
    http.get<ProductProfit[]>('/stats/profit', { params: q }).then((r) => r.data),
};
