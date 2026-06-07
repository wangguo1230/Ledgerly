/**
 * 依赖容器 —— 集中装配各服务，便于路由层与测试共享同一份 db（DIP）。
 */
import type { Db } from './db/connection.js';
import { UserService } from './modules/user/user.service.js';
import { LedgerService } from './modules/ledger/ledger.service.js';
import { CategoryService } from './modules/category/category.service.js';
import { SourcePlatformService } from './modules/source-platform/source-platform.service.js';
import { ProductService } from './modules/product/product.service.js';
import { TransactionService } from './modules/transaction/transaction.service.js';
import { TransferService } from './modules/transfer/transfer.service.js';
import { StatsService } from './modules/stats/stats.service.js';

export interface Container {
  db: Db;
  user: UserService;
  ledger: LedgerService;
  category: CategoryService;
  platform: SourcePlatformService;
  product: ProductService;
  transaction: TransactionService;
  transfer: TransferService;
  stats: StatsService;
}

export function createContainer(db: Db): Container {
  return {
    db,
    user: new UserService(db),
    ledger: new LedgerService(db),
    category: new CategoryService(db),
    platform: new SourcePlatformService(db),
    product: new ProductService(db),
    transaction: new TransactionService(db),
    transfer: new TransferService(db),
    stats: new StatsService(db),
  };
}
