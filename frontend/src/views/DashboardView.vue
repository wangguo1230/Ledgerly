<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VChart from 'vue-echarts';
import { storeToRefs } from 'pinia';
import { useLedgerStore } from '@/stores/ledger';
import { statsApi, transactionApi, categoryApi } from '@/api';
import type { Summary, TrendPoint, Transaction, Category } from '@/api/types';
import { monthRange } from '@/utils/date';
import { centsToYuan, formatCents } from '@/utils/money';
import { stripHtml } from '@/utils/html';

const store = useLedgerStore();
const { currentId } = storeToRefs(store);

const summary = ref<Summary>({ income: 0, expense: 0, balance: 0, count: 0 });
const trend = ref<TrendPoint[]>([]);
const recent = ref<Transaction[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(false);

const catMap = computed(() => new Map(categories.value.map((c) => [c.id, c.name])));

// 中文年月（账簿抬头）
const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const cnDate = computed(() => {
  const d = new Date();
  const y = String(d.getFullYear()).split('').map((n) => CN[+n]).join('');
  const m = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][d.getMonth()];
  return { y, m };
});

async function load() {
  if (!currentId.value) return;
  loading.value = true;
  const [from, to] = monthRange();
  const id = currentId.value;
  try {
    const [s, t, r, cats] = await Promise.all([
      statsApi.summary({ ledger_id: id, from, to }),
      statsApi.trend({ ledger_id: id, granularity: 'month' }),
      transactionApi.list({ ledger_id: id, pageSize: 8, page: 1 }),
      categoryApi.list(id),
    ]);
    summary.value = s;
    trend.value = t;
    recent.value = r.items;
    categories.value = cats;
  } finally {
    loading.value = false;
  }
}
watch(currentId, load, { immediate: true });

function abstractOf(t: Transaction): string {
  return stripHtml(t.remark) || catMap.value.get(t.category_id ?? -1) || '—';
}
function dayOf(s: string): string {
  return s.slice(5, 10).replace('-', '/');
}

// 墨水线趋势（钢笔画在账簿纸上）
const trendOption = computed(() => ({
  tooltip: { trigger: 'axis', valueFormatter: (v: number) => `¥${centsToYuan(v)}` },
  legend: { data: ['收入', '支出'], right: 0, top: 0, textStyle: { color: '#5b5142' } },
  grid: { left: 56, right: 10, top: 30, bottom: 24 },
  xAxis: {
    type: 'category',
    data: trend.value.map((p) => p.period),
    axisLine: { lineStyle: { color: '#b9472f' } },
    axisTick: { show: false },
    axisLabel: { color: '#8a7f6c' },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: 'rgba(120,140,150,0.18)' } },
    axisLabel: { color: '#8a7f6c', formatter: (v: number) => `¥${centsToYuan(v)}` },
  },
  series: [
    {
      name: '收入',
      type: 'line',
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      data: trend.value.map((p) => p.income),
      lineStyle: { color: '#2f5d7c', width: 2 },
      itemStyle: { color: '#2f5d7c' },
    },
    {
      name: '支出',
      type: 'line',
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      data: trend.value.map((p) => p.expense),
      lineStyle: { color: '#b9472f', width: 2 },
      itemStyle: { color: '#b9472f' },
    },
  ],
}));
</script>

<template>
  <div class="ledger-page" v-loading="loading">
    <!-- 红色装订边 + 装订孔 -->
    <div class="binding">
      <span v-for="i in 7" :key="i" class="hole" />
    </div>

    <!-- 橡皮图章 -->
    <div class="stamp" :class="{ red: summary.balance >= 0 }">
      {{ summary.balance >= 0 ? '本月盈余' : '本月赤字' }}
    </div>

    <div class="page-inner">
      <!-- 抬头 -->
      <header class="ledger-head">
        <div class="book-title">流水账</div>
        <div class="book-date">{{ cnDate.y }} 年 · {{ cnDate.m }} 月</div>
      </header>

      <!-- 结存总计行（莱德点引线） -->
      <div class="balance-line">
        <span class="bl-label">本月结存</span>
        <span class="bl-dots" />
        <span class="bl-amount num" :class="{ red: summary.balance < 0 }">
          ¥{{ formatCents(summary.balance) }}
        </span>
      </div>
      <div class="totals">
        <span class="t-in">收入合计 <b class="num">¥{{ formatCents(summary.income) }}</b></span>
        <span class="t-sep">│</span>
        <span class="t-out">支出合计 <b class="num">¥{{ formatCents(summary.expense) }}</b></span>
        <span class="t-sep">│</span>
        <span class="t-cnt">本月 {{ summary.count }} 笔</span>
      </div>

      <!-- 流水表（真账簿横纹 + 红蓝双色） -->
      <div class="ledger-table">
        <div class="lt-head">
          <span class="c-date">日期</span>
          <span class="c-abs">摘要</span>
          <span class="c-num">收入</span>
          <span class="c-num">支出</span>
        </div>
        <div v-for="t in recent" :key="t.id" class="lt-row">
          <span class="c-date num">{{ dayOf(t.occurred_at) }}</span>
          <span class="c-abs">{{ abstractOf(t) }}</span>
          <span class="c-num num in">{{ t.flow_type === 'income' ? formatCents(t.amount) : '' }}</span>
          <span class="c-num num out">{{ t.flow_type === 'expense' ? formatCents(t.amount) : '' }}</span>
        </div>
        <div v-if="!recent.length" class="lt-empty">— 本页暂无记录，去「记一笔」开张 —</div>
        <router-link v-else to="/transactions" class="lt-more">翻看全部流水 →</router-link>
      </div>

      <!-- 墨线趋势 -->
      <div class="trend-block">
        <div class="trend-title">收支趋势 · 墨迹</div>
        <v-chart v-if="trend.length" :option="trendOption" style="height: 220px" autoresize />
        <div v-else class="trend-empty">— 暂无趋势 —</div>
      </div>

      <footer class="page-foot">松松记账 · 流水账 — 第 {{ cnDate.m }} 月页 —</footer>
    </div>
  </div>
</template>

<style scoped>
.ledger-page {
  position: relative;
  max-width: 960px;
  margin: 0 auto;
  background: #efe7d2;
  background-image:
    repeating-linear-gradient(transparent, transparent 33px, rgba(70, 110, 130, 0.07) 34px),
    radial-gradient(120% 90% at 100% 0%, rgba(160, 120, 60, 0.06), transparent 60%);
  border: 1px solid #ddd0b2;
  border-radius: 2px;
  box-shadow:
    0 1px 0 #fff inset,
    0 22px 50px -28px rgba(70, 50, 25, 0.5);
  padding: 30px 40px 26px 78px;
  overflow: hidden;
}

/* 红色装订边 + 装订孔 */
.binding {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 46px;
  width: 0;
  border-left: 2px solid #b9472f;
  box-shadow: 3px 0 0 -1px rgba(185, 71, 47, 0.35);
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding: 30px 0;
}
.hole {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  margin-left: -29px;
  background: #f7f3ea;
  box-shadow:
    inset 0 1px 2px rgba(70, 50, 25, 0.5),
    0 1px 0 rgba(255, 255, 255, 0.6);
}

/* 橡皮图章 */
.stamp {
  position: absolute;
  top: 30px;
  right: 38px;
  transform: rotate(-9deg);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 3px;
  color: #b9472f;
  border: 2.5px solid #b9472f;
  border-radius: 6px;
  padding: 7px 14px;
  opacity: 0.62;
  mix-blend-mode: multiply;
  box-shadow: inset 0 0 0 2px rgba(185, 71, 47, 0.25);
}
.stamp::after {
  content: '';
  position: absolute;
  inset: -3px;
  border: 1px solid rgba(185, 71, 47, 0.4);
  border-radius: 8px;
}

.page-inner {
  position: relative;
  color: #2a2418;
}

/* 抬头 */
.ledger-head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  border-bottom: 2px solid #2a2418;
  padding-bottom: 10px;
  margin-bottom: 18px;
}
.book-title {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 6px;
}
.book-date {
  font-family: var(--font-display);
  font-size: 15px;
  color: #6f6450;
  letter-spacing: 2px;
}

/* 结存行 + 引线 */
.balance-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.bl-label {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 2px;
  white-space: nowrap;
}
.bl-dots {
  flex: 1;
  border-bottom: 2px dotted #b3a888;
  transform: translateY(-4px);
}
.bl-amount {
  font-size: 40px;
  font-weight: 700;
  color: #28506b;
  font-feature-settings: 'onum' 1, 'tnum' 1;
  white-space: nowrap;
}
.bl-amount.red {
  color: #b9472f;
}
.num {
  font-family: var(--font-display);
  font-feature-settings: 'onum' 1, 'tnum' 1;
}
.totals {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 14px;
  color: #6f6450;
  margin-bottom: 22px;
}
.totals b {
  font-size: 16px;
}
.t-in b {
  color: #28506b;
}
.t-out b {
  color: #b9472f;
}
.t-sep {
  color: #cabd9d;
}

/* 流水表 */
.ledger-table {
  margin-bottom: 8px;
}
.lt-head,
.lt-row {
  display: grid;
  grid-template-columns: 70px 1fr 130px 130px;
  align-items: center;
}
.lt-head {
  font-size: 13px;
  color: #8a7f6c;
  letter-spacing: 2px;
  border-bottom: 1.5px solid #2a2418;
  padding-bottom: 6px;
}
.lt-row {
  padding: 9px 0;
  border-bottom: 1px solid rgba(70, 110, 130, 0.22);
  font-size: 15px;
}
.c-num {
  text-align: right;
  font-size: 15px;
}
.lt-head .c-num {
  text-align: right;
}
.c-abs {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 14px;
}
.c-num.in {
  color: #28506b;
}
.c-num.out {
  color: #b9472f;
}
.lt-empty,
.trend-empty {
  padding: 22px 0;
  text-align: center;
  color: #9a8f78;
  font-style: italic;
}
.lt-more {
  display: inline-block;
  margin-top: 12px;
  color: #b9472f;
  font-size: 14px;
  text-decoration: none;
  letter-spacing: 1px;
}

/* 趋势 */
.trend-block {
  margin-top: 26px;
  padding-top: 16px;
  border-top: 2px solid #2a2418;
}
.trend-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 3px;
  margin-bottom: 6px;
}

.page-foot {
  margin-top: 22px;
  text-align: center;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 3px;
  color: #9a8f78;
}

@media (max-width: 720px) {
  .ledger-page {
    padding-left: 64px;
  }
  .lt-head,
  .lt-row {
    grid-template-columns: 54px 1fr 90px 90px;
  }
  .bl-amount {
    font-size: 32px;
  }
}
</style>
