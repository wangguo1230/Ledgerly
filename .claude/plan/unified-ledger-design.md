# 统一记账系统（Unified Ledger）设计与开发规划

> 文档版本：v1.0
> 创建日期：2026-06-06
> 文档性质：项目总体设计与实施规划（开发依据）
> 工程原则：SOLID / KISS / DRY / YAGNI

---

## 0. 已确认的关键决策（规划前提，严格遵循）

| 决策项 | 结论 | 说明 |
| --- | --- | --- |
| 应用形态 | **Web 应用** | 浏览器访问，前后端分离，支持多设备（PC / 移动端浏览器）访问 |
| 数据录入方式 | **手动录入 + 快捷记账** | 起步阶段不做平台自动抓取、不做聊天记录自动解析（YAGNI）。"批量文本粘贴解析"列入 P2 可选迭代方向 |
| 业务场景 | **个人日常收支 + 小生意/微商经营** | 数据模型必须支持"账本（Ledger）分离"，个人账本与生意账本互不干扰；生意账本具备商品管理与利润核算能力 |

---

## 1. 目标定义

### 1.1 要解决的痛点

用户当前将大量收入/支出记录分散在微信、各类平台的聊天记录中，存在三大问题：

1. **平台驳杂**：记录散落在微信、支付宝、银行卡等多个渠道，没有统一入口。
2. **格式不统一**：聊天记录是非结构化文本，无法分类、无法汇总、无法核算。
3. **难以梳理**：个人开销与小生意经营账目混在一起，既算不清个人花了多少，也算不清生意赚了多少。

### 1.2 最终达成的效果

一个集中、结构化的记账系统，将所有账目统一管理；通过"账本分离"区分个人与生意；通过"类目/商品/来源平台"维度让每一笔账可分类、可追溯、可统计；让用户随时能回答"我这个月花了多少 / 赚了多少 / 这笔货赚了多少利润"。

### 1.3 可量化的成功标准

| 编号 | 成功标准 | 验证方式 |
| --- | --- | --- |
| S1 | 用户能在 **10 秒内** 完成一笔账目录入（快捷记账） | 实测录入耗时 |
| S2 | 个人账本与生意账本数据 **100% 隔离**，互不影响统计 | 切换账本，统计结果只反映当前账本 |
| S3 | 任意时间区间内，可一键得到 **收入总额 / 支出总额 / 结余** | 统计页数字与手工核对一致 |
| S4 | 生意账本可按商品核算 **进货成本 / 销售收入 / 毛利润** | 利润核算数字与手工核对一致 |
| S5 | 每一笔账目可标记 **来源平台**，并可按来源平台筛选汇总 | 按平台筛选得到正确子集 |
| S6 | 金额计算 **零精度误差**（整数分存储） | 大量小数金额累加无浮点误差 |

---

## 2. 核心概念与领域模型

### 2.1 实体定义

#### 账本 Ledger
区隔不同业务场景的顶层容器。一个用户拥有多个账本，至少包含一个"个人账本"和（可选）若干"生意账本"。账本之间数据完全隔离。

- 关键字段建议：`id`、`name`（账本名）、`type`（`personal` 个人 / `business` 生意）、`currency`（币种，默认 CNY）、`remark`、`created_at`
- 设计要点：`type=business` 的账本才启用商品管理与利润核算能力；`type=personal` 隐藏商品相关功能（界面层按 type 收敛）。

#### 类目 Category
对收入/支出进行业务分类，**支持层级**（如 餐饮 > 外卖）。

- 关键字段建议：`id`、`ledger_id`（归属账本）、`parent_id`（父类目，顶级为 NULL）、`name`、`flow_type`（`income` 收入 / `expense` 支出）、`icon`、`sort_order`、`created_at`
- 设计要点：类目归属账本（不同账本可有不同分类体系）；用 `parent_id` 自引用实现树形层级；收入类目与支出类目用 `flow_type` 区分，避免混用。

#### 商品 Product（仅生意场景）
生意账本中进货/卖货的商品，承载成本价与售价，用于利润核算。

- 关键字段建议：`id`、`ledger_id`、`name`、`sku`（可选编码）、`cost_price`（成本价，分）、`sale_price`（售价，分）、`unit`（单位，如 件/斤）、`stock`（库存数量，可选，P1 简化可不强约束）、`remark`、`created_at`
- 设计要点：商品只属于生意账本；成本价/售价均以"分"为单位的整数存储；P0 不引入，P1 引入。

#### 账目 / 交易 Transaction
一笔收入或支出，是系统核心事实表。

- 关键字段建议：`id`、`ledger_id`、`flow_type`（`income`/`expense`）、`amount`（金额，整数分）、`category_id`（关联类目）、`product_id`（可选，关联商品）、`quantity`（可选，商品数量）、`source_platform_id`（可选，来源平台）、`occurred_at`（发生时间）、`remark`、`created_at`、`updated_at`
- 设计要点：金额一律整数分存储；`flow_type` 冗余存储便于直接统计；商品相关字段可空（个人账本不用）。

#### 来源平台 SourcePlatform
标记账目来源渠道（微信、支付宝、银行卡、现金等），直接对应"平台驳杂"痛点。

- 关键字段建议：`id`、`name`、`icon`、`sort_order`、`is_system`（是否内置预设）、`created_at`
- 设计要点：可设计为全局共享字典（跨账本复用），系统预置常用平台，用户可自行新增。

### 2.2 实体关系（ER）说明

```
User (隐含, P0 单用户可省略实体)
  │ 1
  │
  ▼ N
Ledger ──1──< N──► Category   (类目归属账本，Category 自引用 parent_id 形成层级树)
  │                   ▲
  │ 1                 │ N
  │                   │ (可选关联)
  ▼ N                 │
Transaction ──────────┘
  │  ▲
  │  │ N (可选关联 product_id, 仅生意账本)
  │  └──────────── Product ──N──1── Ledger
  │
  │ N (可选关联 source_platform_id)
  ▼
SourcePlatform (全局字典)

Ledger ──1──< N──► Product   (商品归属生意账本)
```

关系要点：

- 一个 **Ledger** 拥有多个 **Category**、多个 **Product**、多个 **Transaction**（一对多）。
- **Category** 通过 `parent_id` 自引用，形成"父类目 > 子类目"的层级树。
- **Transaction** 必关联一个 **Category**；可选关联一个 **Product**（仅生意账本）；可选关联一个 **SourcePlatform**。
- **SourcePlatform** 为全局字典表，被多个账本的交易共享引用（多对一）。
- 删除策略：账本删除应级联其类目/商品/交易（或软删除）；类目/平台被交易引用时禁止物理删除，建议软删除或置空引用，避免脏数据。

---

## 3. 功能分解（MVP 优先级划分）

> 原则：YAGNI 优先，先交付最小可用闭环，再迭代增强。

### P0 — MVP 必做（最小可用闭环）

| 编号 | 功能 | 描述 |
| --- | --- | --- |
| P0-1 | 账本管理 | 创建/编辑/删除/切换账本；区分个人/生意类型；默认初始化一个个人账本 |
| P0-2 | 类目管理 | 在当前账本下增删改查类目，支持收入/支出区分与父子层级 |
| P0-3 | 账目增删改查 | 录入收入/支出（金额、类目、时间、备注），列表查看、编辑、删除 |
| P0-4 | 快捷记账 | 常用类目/金额快速录入，减少操作步数，目标 10 秒内完成一笔 |
| P0-5 | 基础统计 | 按时间区间统计当前账本的收入总额、支出总额、结余 |
| P0-6 | 账目筛选与列表 | 按时间区间、收支类型、类目筛选账目列表 |

### P1 — 增强

| 编号 | 功能 | 描述 |
| --- | --- | --- |
| P1-1 | 商品管理 | 生意账本下商品增删改查，维护成本价/售价/单位 |
| P1-2 | 生意利润核算 | 关联商品的交易自动计算毛利润（售出金额 − 成本 × 数量），按商品/时间汇总 |
| P1-3 | 来源平台标记 | 来源平台字典管理；交易可标记来源平台；按平台筛选与汇总 |
| P1-4 | 收支报表/图表 | 收支趋势折线图、类目占比饼图、月度对比柱状图 |
| P1-5 | 账目搜索 | 按备注关键字、金额范围搜索 |

### P2 — 可选未来方向

| 编号 | 功能 | 描述 |
| --- | --- | --- |
| P2-1 | 批量文本粘贴智能解析 | 粘贴聊天记录/流水文本，解析为结构化账目候选项供确认（直接回应原始痛点） |
| P2-2 | 多平台数据导入 | 导入支付宝/微信账单 CSV/Excel |
| P2-3 | 预算管理 | 按类目/账本设置预算，超支预警 |
| P2-4 | 数据导出 | 导出 Excel/CSV/PDF 报表 |
| P2-5 | 多用户与权限 | 引入用户体系、登录鉴权、账本共享协作 |

---

## 4. 技术架构选型建议

### 4.1 推荐技术栈

| 层 | 选型 | 理由（贴合个人项目 / 轻量 / 可维护 / KISS） |
| --- | --- | --- |
| 前端框架 | **Vue 3 + Vite + TypeScript** | 上手快、生态成熟、Vite 启动构建极快；TS 提供类型安全减少低级错误 |
| UI 组件库 | **Element Plus**（PC 优先）或 **Naive UI** | 开箱即用的表单/表格/弹窗，记账系统以表单与列表为主，能大幅减少自研 UI 成本（DRY） |
| 图表 | **ECharts**（vue-echarts） | P1 报表所需，社区成熟、文档完善 |
| 状态管理 | **Pinia** | Vue 3 官方推荐，轻量直观 |
| 后端框架 | **NestJS（Node + TypeScript）** | 与前端同语言，降低心智切换；模块化/依赖注入天然契合 SOLID；个人项目易维护 |
| ORM | **Prisma** | 类型安全、迁移工具完善、schema 即文档，开发体验佳 |
| 数据库 | **SQLite（起步）→ PostgreSQL（成长后）** | 个人项目起步 SQLite 零运维、文件即数据库、易备份；Prisma 可平滑切换到 PostgreSQL |
| 接口风格 | **RESTful JSON** | 简单直观，满足 CRUD 为主的业务（KISS，无需 GraphQL） |

> 备选：若希望全栈一体、减少前后端协作成本，可用 **Nuxt 3**（同 Vue 生态，server routes 内置后端）。本规划默认采用 Vue + NestJS 前后端分离，结构更清晰、职责更分明。

### 4.2 前后端目录结构示意

```
songsong_record/
├── frontend/                      # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/                   # 接口封装（按领域：ledger.ts / category.ts / transaction.ts ...）
│   │   ├── assets/
│   │   ├── components/            # 通用组件（AmountInput 金额输入、CategoryPicker 类目选择 ...）
│   │   ├── views/                # 页面（账本/类目/账目/统计/商品）
│   │   ├── stores/               # Pinia 状态（currentLedger 等）
│   │   ├── router/
│   │   ├── utils/                # money.ts（分/元换算）、date.ts 等
│   │   ├── types/                # 与后端共享的 DTO 类型定义
│   │   └── main.ts
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                       # 后端（NestJS）
│   ├── src/
│   │   ├── modules/
│   │   │   ├── ledger/            # 账本（controller/service/dto）
│   │   │   ├── category/          # 类目
│   │   │   ├── transaction/       # 账目
│   │   │   ├── product/           # 商品（P1）
│   │   │   ├── source-platform/   # 来源平台（P1）
│   │   │   └── stats/             # 统计/报表
│   │   ├── common/               # 拦截器/异常过滤/金额转换管道
│   │   ├── prisma/               # PrismaService
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma          # 数据模型定义
│   │   └── migrations/
│   └── package.json
│
├── .claude/plan/                  # 本规划文档所在
└── README.md
```

---

## 5. 数据库表结构设计（P0 + P1）

> 通用约定：所有金额字段为 **整数（单位：分）**，禁止浮点；主键统一 `id`（自增整型或 cuid）；时间字段统一带 `created_at`，可变实体加 `updated_at`。

### 5.1 ledger（账本）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| name | VARCHAR(50) | 账本名称 |
| type | VARCHAR(20) | `personal` / `business` |
| currency | VARCHAR(10) | 币种，默认 `CNY` |
| remark | VARCHAR(255) | 备注，可空 |
| created_at | DATETIME | 创建时间 |

索引：`idx_ledger_type(type)`

### 5.2 category（类目）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| ledger_id | INTEGER FK→ledger.id | 归属账本 |
| parent_id | INTEGER FK→category.id NULL | 父类目，顶级为 NULL（自引用） |
| name | VARCHAR(50) | 类目名 |
| flow_type | VARCHAR(20) | `income` / `expense` |
| icon | VARCHAR(50) | 图标标识，可空 |
| sort_order | INTEGER | 排序权重，默认 0 |
| created_at | DATETIME | 创建时间 |

索引：`idx_category_ledger(ledger_id)`、`idx_category_parent(parent_id)`、`idx_category_flow(ledger_id, flow_type)`
外键：`ledger_id → ledger.id`（级联删除）；`parent_id → category.id`

### 5.3 source_platform（来源平台，P1，全局字典）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| name | VARCHAR(50) | 平台名（微信/支付宝/银行卡/现金…） |
| icon | VARCHAR(50) | 图标，可空 |
| sort_order | INTEGER | 排序 |
| is_system | BOOLEAN | 是否系统预置 |
| created_at | DATETIME | 创建时间 |

索引：`idx_platform_sort(sort_order)`

### 5.4 product（商品，P1，仅生意账本）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| ledger_id | INTEGER FK→ledger.id | 归属生意账本 |
| name | VARCHAR(100) | 商品名 |
| sku | VARCHAR(50) | 商品编码，可空 |
| cost_price | INTEGER | 成本价（分） |
| sale_price | INTEGER | 售价（分） |
| unit | VARCHAR(20) | 单位（件/斤/盒…） |
| stock | INTEGER | 库存数量，可空（P1 简化可不强约束） |
| remark | VARCHAR(255) | 备注，可空 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

索引：`idx_product_ledger(ledger_id)`
外键：`ledger_id → ledger.id`（级联删除）

### 5.5 transaction（账目/交易，核心表）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| ledger_id | INTEGER FK→ledger.id | 归属账本 |
| flow_type | VARCHAR(20) | `income` / `expense` |
| amount | INTEGER | 金额（分），始终为正，方向由 flow_type 决定 |
| category_id | INTEGER FK→category.id | 关联类目 |
| product_id | INTEGER FK→product.id NULL | 关联商品（P1，可空，仅生意账本） |
| quantity | INTEGER NULL | 商品数量（P1，配合 product 使用），可空 |
| source_platform_id | INTEGER FK→source_platform.id NULL | 来源平台（P1，可空） |
| occurred_at | DATETIME | 账目发生时间 |
| remark | VARCHAR(255) | 备注，可空 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

索引：
- `idx_tx_ledger_time(ledger_id, occurred_at)` — 列表/时间区间统计主查询
- `idx_tx_category(category_id)` — 按类目汇总
- `idx_tx_flow(ledger_id, flow_type)` — 收支汇总
- `idx_tx_product(product_id)` — 商品利润核算
- `idx_tx_platform(source_platform_id)` — 按平台筛选

外键：`ledger_id → ledger.id`（级联删除）；`category_id → category.id`（限制删除/置空）；`product_id → product.id`（置空）；`source_platform_id → source_platform.id`（置空）

> 利润核算逻辑（P1）：某交易毛利润 = `amount`（售出金额）− `product.cost_price × quantity`。按商品/时间聚合即得商品维度利润报表。建议核算时快照成本价或在交易表冗余 `cost_snapshot` 字段，避免商品成本价后续变动影响历史利润（**实现时确认，见第 8 章风险**）。

---

## 6. 实施步骤（里程碑拆解）

> 标注：`[需先经 UI/UX 设计]` 表示该前端任务需先产出界面设计稿/交互方案再开发。

### 阶段 0 — 项目脚手架（基础设施）

| 任务 | 内容 | 依赖 |
| --- | --- | --- |
| T0.1 | 初始化仓库、目录结构、Git、README、约定 lint/prettier | — |
| T0.2 | 后端 NestJS 脚手架 + Prisma 接入 SQLite | T0.1 |
| T0.3 | 定义 `schema.prisma`（P0 表：ledger/category/transaction）并生成首版迁移 | T0.2 |
| T0.4 | 前端 Vue 3 + Vite + TS + Element Plus + Pinia + Router 脚手架 | T0.1 |
| T0.5 | 前后端联调基线（CORS、统一响应格式、金额分/元转换工具 money.ts） | T0.2, T0.4 |

### 阶段 1 — MVP（P0）

| 任务 | 内容 | 依赖 |
| --- | --- | --- |
| T1.1 | 后端：账本 CRUD 接口 + 初始化默认个人账本 | T0.3 |
| T1.2 | 后端：类目 CRUD 接口（层级、flow_type） | T1.1 |
| T1.3 | 后端：账目 CRUD + 列表筛选接口（时间/类型/类目） | T1.2 |
| T1.4 | 后端：基础统计接口（区间收入/支出/结余） | T1.3 |
| T1.5 | `[需先经 UI/UX 设计]` 前端：全局布局 + 账本切换 + 账本管理页 | T1.1 |
| T1.6 | `[需先经 UI/UX 设计]` 前端：类目管理页（树形展示、增删改） | T1.2, T1.5 |
| T1.7 | `[需先经 UI/UX 设计]` 前端：账目录入页 + 快捷记账组件（10 秒目标） | T1.3, T1.5 |
| T1.8 | `[需先经 UI/UX 设计]` 前端：账目列表 + 筛选 + 编辑/删除 | T1.3, T1.5 |
| T1.9 | `[需先经 UI/UX 设计]` 前端：基础统计页（收入/支出/结余卡片） | T1.4, T1.5 |

### 阶段 2 — 增强（P1）

| 任务 | 内容 | 依赖 |
| --- | --- | --- |
| T2.1 | 后端：迁移新增 product / source_platform 表 + 交易表新增字段 | T1.3 |
| T2.2 | 后端：商品 CRUD 接口（仅生意账本） | T2.1 |
| T2.3 | 后端：来源平台字典 CRUD + 预置数据 | T2.1 |
| T2.4 | 后端：利润核算接口（商品/时间维度毛利润聚合） | T2.2 |
| T2.5 | 后端：报表聚合接口（趋势/类目占比/平台汇总） | T2.1 |
| T2.6 | `[需先经 UI/UX 设计]` 前端：商品管理页（生意账本可见） | T2.2 |
| T2.7 | `[需先经 UI/UX 设计]` 前端：账目录入扩展（商品选择、数量、来源平台） | T2.2, T2.3 |
| T2.8 | `[需先经 UI/UX 设计]` 前端：利润核算页 | T2.4 |
| T2.9 | `[需先经 UI/UX 设计]` 前端：报表/图表页（ECharts 折线/饼/柱） | T2.5 |

> UI/UX 设计说明：所有标注 `[需先经 UI/UX 设计]` 的前端任务，开发前需补充界面设计稿与交互规范（信息架构、布局、表单字段顺序、快捷记账操作流、响应式断点、空状态/错误态）。建议针对核心高频路径"快捷记账"重点设计，以达成 10 秒录入目标。设计产出后再并入对应任务的开发说明。

### 关键路径

`T0.1 → T0.2 → T0.3 → T1.1 → T1.2 → T1.3`（后端数据与账目链路）是关键路径，决定 MVP 可用时间点；前端页面任务（T1.5–T1.9）依赖对应后端接口完成。阶段 2 整体依赖阶段 1 的交易链路（T1.3）。

---

## 7. 验收标准

### 阶段 0 验收

- 前后端均可本地 `dev` 启动；前端能成功调用后端一个示例接口并展示返回；数据库迁移成功生成表结构；money.ts 单测通过（元→分、分→元无误差）。

### 阶段 1（MVP）验收

| 编号 | 验收点 |
| --- | --- |
| A1.1 | 能创建个人/生意两类账本并在界面切换，切换后所有数据仅展示当前账本（账本隔离） |
| A1.2 | 能创建"餐饮 > 外卖"这类两级类目，支持收入/支出类目区分 |
| A1.3 | 能录入一笔支出（金额、类目、时间、备注）并在列表看到；能编辑、删除 |
| A1.4 | 快捷记账可在 10 秒内完成一笔常用账目录入 |
| A1.5 | 选择时间区间后，正确显示收入总额、支出总额、结余，且与手工核对一致 |
| A1.6 | 列表可按时间区间/收支类型/类目筛选，结果正确 |
| A1.7 | 录入 0.1 + 0.2 等金额，累加结果精确（无 0.30000004 类浮点误差） |

### 阶段 2（增强）验收

| 编号 | 验收点 |
| --- | --- |
| A2.1 | 生意账本可维护商品（成本价/售价/单位）；个人账本不显示商品入口 |
| A2.2 | 录入关联商品的销售交易后，利润核算页正确显示该商品毛利润（售价 − 成本×数量） |
| A2.3 | 每笔交易可标记来源平台；按平台筛选/汇总结果正确 |
| A2.4 | 报表页正确展示收支趋势、类目占比、月度对比图表，数据与统计一致 |

---

## 8. 风险与注意事项

| 类别 | 风险/事项 | 应对措施 |
| --- | --- | --- |
| 金额精度 | 浮点运算导致金额误差（财务系统不可接受） | **全链路用整数分存储与计算**；DB 字段为 INTEGER（分）；前端仅在展示层做分/元转换（统一 money.ts，禁止业务逻辑用 float） |
| 数据安全/隐私 | 财务数据高度敏感，泄露风险 | 起步单用户本地部署可降低风险；后续上公网必须加 HTTPS + 登录鉴权（P2-5）；敏感配置走环境变量，不入库明文密码 |
| 数据备份 | SQLite 文件损坏/误删导致账目全失 | 定时备份数据库文件（每日快照）；提供数据导出（P2-4）作为冷备；重要操作前自动备份 |
| 数据完整性 | 删除类目/商品/平台导致历史交易引用断裂 | 被引用的字典数据禁止物理删除，采用软删除或删除时置空交易引用；账本删除走级联或软删除并二次确认 |
| 利润核算准确性 | 商品成本价后续变动会影响历史交易利润计算 | **实现时确认策略**：建议在交易上快照成本价（`cost_snapshot`），历史利润以快照为准，不随商品改价回溯 |
| 账本隔离 | 跨账本数据串读导致统计错误 | 所有查询强制带 `ledger_id` 约束；后端 service 层统一注入当前账本上下文校验 |
| 过度设计 | 起步阶段引入用户体系/微服务等增加复杂度 | 严守 YAGNI：P0 单用户、单体应用、SQLite；待真实需求出现再演进（PostgreSQL、鉴权、导入解析） |
| 时区/时间 | `occurred_at` 跨时区或前后端时区不一致 | 统一以 UTC 存储、本地时区展示；或明确单一本地时区，文档约定一致 |

---

## 附：后续可深化（待与用户确认的开放点）

1. 利润核算成本快照策略（实时计算 vs 交易时快照）—— 倾向"交易时快照"，待确认。
2. 是否需要"转账/账户余额"概念（如某平台余额管理）—— 当前规划聚焦收支流水，未纳入，按需求确认是否进 P1/P2。
3. 部署方式（纯本地单机 vs 自有服务器公网访问）—— 影响安全与鉴权优先级，待确认。

---

## 附二：实现说明（v1.1 · 落地记录）

> 实现已完成 P0（MVP）+ P1（增强）全部功能，详见仓库根 `README.md`。

**技术栈微调（经工程权衡）**：后端由规划的 `NestJS + Prisma` 调整为 **`Fastify + Zod`**，
数据库采用 **PostgreSQL**（`node-postgres` 异步驱动 + 统一 `Db` 抽象：query/one/exec/tx）。
原因：NestJS 偏重；数据库按用户要求用 PG（生产级、并发与一致性更好，对应规划第 4 章"成长后 PostgreSQL"）。
架构意图完全不变：分层（Repository/Service/Route，符合 SOLID）、类型安全、金额整数分、账本隔离。前端保持 `Vue 3 + Element Plus + Pinia`。

> PG 适配要点：自增主键 `SERIAL`、`RETURNING id` 取插入 id、`$n` 占位、聚合 `int8` 经类型解析器统一转 `number`（避免 SUM/COUNT 变字符串）、时间字段存文本 `YYYY-MM-DD HH24:MI:SS(UTC)`。开发库经 `docker compose up -d` 启动，测试用独立 `ledger_test` 库并按用例 TRUNCATE 隔离。

**实现要点**：
- 利润核算采用「交易时快照成本价」（`txn.cost_snapshot`），开放点 1 按倾向落地；数量缺省按 1。
- 数据库表名 `transaction` 因 SQL 保留字改为 `txn`，字段与索引与第 5 章一致。
- 来源平台为全局字典，系统预置 5 项（微信/支付宝/银行卡/现金/其他）。

**已落地决策快照**（来自需求澄清）：应用形态 = Web；录入 = 手动 + 快捷记账；场景 = 个人 + 生意（账本分离）。

**测试**：后端 Vitest 43 项通过，覆盖金额精度(S6)、账本隔离(S2)、跨用户隔离、类目层级(A1.2)、利润核算(A2.x)、鉴权 API 端到端。

### v1.2 · 多用户与鉴权（P2-5 落地）

按用户诉求「各自独立 + 公网部署」实现多租户：

- **账号体系**：`users` 表；密码 **scrypt 加盐哈希**（零依赖）；**JWT** 令牌鉴权（`@fastify/jwt`，30 天）；登录/注册接口限流（`@fastify/rate-limit`，12 次/分）。
- **按用户隔离**：`ledger` 与 `source_platform` 增 `user_id`；类目/商品/交易经账本间接归属。所有服务方法 threading `userId`，统一 `assertLedgerOwned` 校验，越权返回 403、未登录 401。来源平台改为**按用户**字典（`UNIQUE(user_id, name)`）。
- **注册即播种**：新用户自动获得默认个人账本 + 22 类目 + 5 来源平台。
- **前端**：登录/注册页（温暖账本风）、Pinia `auth` store、axios 注入 Bearer 令牌、路由守卫、401 自动跳登录、头部用户菜单/退出。
- **公网安全**：`JWT_SECRET` / `ALLOWED_ORIGIN` 走环境变量，文档强调必须挂 HTTPS。详见 `README.md`「账号与安全」。

开放点 2（账户余额/转账）仍未纳入，按需归入后续迭代。
