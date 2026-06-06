# 松松记账 · Unified Ledger

把分散在微信、支付宝等各平台聊天记录里的收入与支出，统一结构化管理。
**多用户**（各自注册、数据按账号隔离）、**账本分离**（个人 / 生意）、**类目管理**（收支分层）、
**商品管理与利润核算**（生意账本）、**来源平台标记**（解决“平台驳杂”），并提供统计与报表。
界面采用「温暖账本」视觉风格（米色纸感 + 赤陶点缀 + Fraunces 衰线数字）。

## 技术栈

| 端 | 技术 |
| --- | --- |
| 后端 | Node + TypeScript · Fastify · **PostgreSQL（node-postgres）** · **JWT 鉴权（@fastify/jwt + scrypt）** · Zod · Vitest |
| 前端 | Vue 3 · Vite · TypeScript · Element Plus · Pinia · Vue Router · ECharts |

设计原则：金额全链路以「整数分」存储计算（零浮点误差）、按用户+账本双重隔离、分层架构（Repository / Service / Route）。

> 说明：规划文档原定 NestJS + Prisma，落地时改用更轻量、同样可分层的 Fastify。
> 数据库采用 **PostgreSQL**；数据访问层为异步 `pg` 驱动 + 统一 `Db` 抽象（query/one/exec/tx）。详见 `.claude/plan/`。

## 目录结构

```
songsong_record/
├── backend/        # 后端 API（Fastify + PostgreSQL）
│   ├── src/
│   │   ├── common/     # money(整数分)/errors/types/validation/password(scrypt)/authz(归属校验)
│   │   ├── db/         # schema.sql / connection / migrate / seed(按用户播种)
│   │   ├── modules/    # user(注册登录) / ledger / category / product / source-platform / transaction / stats
│   │   ├── app.ts      # 应用装配（CORS + JWT + 限流 + 错误处理 + 路由）
│   │   └── server.ts   # 启动入口
│   └── test/       # Vitest（43 项：金额精度/跨用户隔离/利润核算/鉴权API）
├── frontend/       # 前端 SPA（Vue 3 + Element Plus）
│   └── src/
│       ├── api/        # 接口封装 + DTO 类型（axios 注入 JWT）
│       ├── components/ # AmountText / AmountInput / CategoryPicker
│       ├── stores/     # auth(令牌/用户) + 账本上下文（Pinia）
│       ├── views/      # 登录页 + 9 个功能页
│       └── layouts/    # 主框架（侧边导航 + 账本切换 + 用户菜单）
└── .claude/plan/   # 设计规划与 UI/UX 规范
```

## 快速开始

### 0) 启动 PostgreSQL（Docker，端口 5433）

```bash
docker compose up -d                       # 启动 dev 库 ledger
# 运行测试需要一个独立测试库（首次执行一次）：
docker exec ul-pg createdb -U ledger ledger_test
```

连接串通过环境变量配置（默认见 `backend/.env.example`）：
`DATABASE_URL=postgres://ledger:ledger@127.0.0.1:5433/ledger`

### 1) 启动后端（默认 http://localhost:3001）

```bash
cd backend
npm install
npm run dev        # 开发模式（首次自动建表 + 预置种子数据）
```

其他脚本：`npm test`（连 `TEST_DATABASE_URL` 测试库）、`npm run typecheck`、`npm run build` + `npm start`（生产）。

### 2) 启动前端（默认 http://localhost:5173）

```bash
cd frontend
npm install
npm run dev        # 已配置 /api 代理到 http://127.0.0.1:3001
```

浏览器打开 http://localhost:5173 → **首次进入注册一个账号**（用户名 + 密码），登录后即可记账。

## 核心数据模型

- **用户 User**：注册即哈希存密码（scrypt 加盐），并自动播种默认账本/类目/平台。
- **账本 Ledger**：归属用户，`personal` / `business`，数据完全隔离。
- **类目 Category**：归属账本，`flow_type` 区分收支，`parent_id` 自引用两级层级。
- **商品 Product**：仅生意账本，含成本价/售价（整数分）。
- **交易 Transaction**：核心事实表；关联商品时**快照成本价**（`cost_snapshot`），商品改价不回溯历史利润。
- **来源平台 SourcePlatform**：按用户隔离的字典，注册时预置微信/支付宝/银行卡/现金/其他。

## 关键设计保障

- 安全：密码 scrypt 加盐哈希；JWT 令牌鉴权；登录/注册接口限流防爆破。
- 隔离：**按用户 + 账本双重隔离**——每个请求都校验目标账本归属当前登录用户，杜绝越权（401/403）。
- 金额：DB 用 `INTEGER`（分），前后端各有 `money.ts` 字符串解析转换，杜绝 `0.1+0.2` 浮点误差。
- 完整性：删用户/账本级联子数据；删类目级联子类目；删平台/商品时交易引用 `SET NULL`；系统预置平台不可删；至少保留一个账本。
- 利润：`毛利润 = 销售金额 − 成本快照 × 数量`（数量缺省按 1）。

## 账号与安全（公网部署必读）

应用为**多用户**：每人注册独立账号，数据互不可见。要部署到公网，请务必：

1. **设置强 JWT 密钥**：`JWT_SECRET=$(openssl rand -hex 32)`（不设会用不安全的默认值）。
2. **限定 CORS 来源**：`ALLOWED_ORIGIN=https://你的前端域名`（不设则允许所有来源，仅适合本机/内网）。
3. **挂 HTTPS**：用 Nginx/Caddy 等反向代理为前端与 `/api` 提供 TLS（令牌经 Authorization 头传输，必须加密信道）。
4. 前端构建产物（`frontend/dist`）由静态服务器托管，并将 `/api` 反代到后端。

环境变量清单见 `backend/.env.example`。

## 镜像部署（GHCR + 1Panel）

推送到 `main` 后，GitHub Actions 会自动构建并发布镜像到 GHCR：
- `ghcr.io/wangguo1230/ledgerly-backend:latest`
- `ghcr.io/wangguo1230/ledgerly-frontend:latest`

服务器上（已装 Docker / 1Panel）：

```bash
# 1. 放置后端环境变量（参考 backend/.env.example，填好 DATABASE_URL / JWT_SECRET）
mkdir -p backend && vi backend/.env
# 2. 取得 docker-compose.prod.yml 后拉取并启动
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
# 3. 1Panel 反向代理域名 → 本机 8090 端口，开启 HTTPS
```

> 首次发布后，若镜像为私有，需在 GitHub Packages 设置中将其设为 public，或在服务器 `docker login ghcr.io` 后再 pull。

## 数据存储与备份

数据存于 PostgreSQL（Docker volume `ul_pg_data`，持久化）。备份/恢复：

```bash
# 备份
docker exec ul-pg pg_dump -U ledger ledger > backup.sql
# 恢复
cat backup.sql | docker exec -i ul-pg psql -U ledger -d ledger
```

> 金额一律以「整数分」存储；时间字段为文本 `YYYY-MM-DD HH:MM:SS`（UTC），便于按字符串区间比较。
