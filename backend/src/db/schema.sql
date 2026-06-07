-- 统一记账系统 数据库结构（PostgreSQL）
-- 约定：所有金额字段单位为「分」(INTEGER)，禁止浮点。
-- 时间字段统一为文本 'YYYY-MM-DD HH24:MI:SS'，与应用层字符串区间比较一致。
-- 多用户：数据按 user 隔离。账本与来源平台归属到用户；类目/商品/交易经账本间接归属。

-- 用户
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

-- 账本：个人/生意分离的顶层容器，归属用户
CREATE TABLE IF NOT EXISTS ledger (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('personal','business')),
  currency   TEXT    NOT NULL DEFAULT 'CNY',
  remark     TEXT,
  created_at TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);

-- 类目：归属账本，支持收支区分与父子层级
CREATE TABLE IF NOT EXISTS category (
  id         SERIAL PRIMARY KEY,
  ledger_id  INTEGER NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES category(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  flow_type  TEXT    NOT NULL CHECK (flow_type IN ('income','expense')),
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_category_ledger ON category(ledger_id);
CREATE INDEX IF NOT EXISTS idx_category_parent ON category(parent_id);
CREATE INDEX IF NOT EXISTS idx_category_flow   ON category(ledger_id, flow_type);

-- 来源平台：按用户隔离的字典（微信/支付宝/银行卡/现金…）
CREATE TABLE IF NOT EXISTS source_platform (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT     NOT NULL,
  icon       TEXT,
  sort_order INTEGER  NOT NULL DEFAULT 0,
  is_system  SMALLINT NOT NULL DEFAULT 0,
  created_at TEXT     NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_platform_user ON source_platform(user_id, sort_order);
-- 账户期初余额（开始记账时该账户已有的钱，分）；幂等迁移，兼容已建表
ALTER TABLE source_platform ADD COLUMN IF NOT EXISTS initial_balance INTEGER NOT NULL DEFAULT 0;

-- 转账：账户间资金转移（不计入收支统计）
CREATE TABLE IF NOT EXISTS transfer (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_platform_id INTEGER NOT NULL REFERENCES source_platform(id) ON DELETE CASCADE,
  to_platform_id   INTEGER NOT NULL REFERENCES source_platform(id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL CHECK (amount > 0),
  occurred_at      TEXT    NOT NULL,
  remark           TEXT,
  created_at       TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_transfer_user ON transfer(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transfer_from ON transfer(from_platform_id);
CREATE INDEX IF NOT EXISTS idx_transfer_to   ON transfer(to_platform_id);

-- 商品：仅生意账本，承载成本价/售价用于利润核算
CREATE TABLE IF NOT EXISTS product (
  id         SERIAL PRIMARY KEY,
  ledger_id  INTEGER NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sku        TEXT,
  cost_price INTEGER NOT NULL DEFAULT 0,
  sale_price INTEGER NOT NULL DEFAULT 0,
  unit       TEXT,
  stock      INTEGER,
  remark     TEXT,
  created_at TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_product_ledger ON product(ledger_id);

-- 交易：核心事实表（一笔收入或支出）
CREATE TABLE IF NOT EXISTS txn (
  id                 SERIAL PRIMARY KEY,
  ledger_id          INTEGER NOT NULL REFERENCES ledger(id) ON DELETE CASCADE,
  flow_type          TEXT    NOT NULL CHECK (flow_type IN ('income','expense')),
  amount             INTEGER NOT NULL CHECK (amount >= 0),
  category_id        INTEGER REFERENCES category(id) ON DELETE SET NULL,
  product_id         INTEGER REFERENCES product(id) ON DELETE SET NULL,
  quantity           INTEGER,
  cost_snapshot      INTEGER,
  source_platform_id INTEGER REFERENCES source_platform(id) ON DELETE SET NULL,
  occurred_at        TEXT    NOT NULL,
  remark             TEXT,
  created_at         TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at         TEXT    NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);
-- 临时商品名（直接录入、未进商品库的商品标签）；幂等迁移，兼容已建表
ALTER TABLE txn ADD COLUMN IF NOT EXISTS item_name TEXT;

CREATE INDEX IF NOT EXISTS idx_txn_ledger_time ON txn(ledger_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_txn_category    ON txn(category_id);
CREATE INDEX IF NOT EXISTS idx_txn_flow        ON txn(ledger_id, flow_type);
CREATE INDEX IF NOT EXISTS idx_txn_product     ON txn(product_id);
CREATE INDEX IF NOT EXISTS idx_txn_platform    ON txn(source_platform_id);
