<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VChart from 'vue-echarts';
import { storeToRefs } from 'pinia';
import { useLedgerStore } from '@/stores/ledger';
import { statsApi } from '@/api';
import type { CategoryStat, PlatformStat, TrendPoint } from '@/api/types';
import { centsToYuan } from '@/utils/money';
import RangeBar from '@/components/RangeBar.vue';

const store = useLedgerStore();
const { currentId } = storeToRefs(store);

const rng = ref<{ from?: string; to?: string }>({});
const granularity = ref<'day' | 'week' | 'month'>('day');
const trend = ref<TrendPoint[]>([]);
const expenseByCat = ref<CategoryStat[]>([]);
const byPlatform = ref<PlatformStat[]>([]);
const loading = ref(false);

const fmt = (v: number) => `¥${centsToYuan(v)}`;

async function load() {
  if (!currentId.value) return;
  loading.value = true;
  const base = { ledger_id: currentId.value, ...rng.value };
  try {
    const [t, c, p] = await Promise.all([
      statsApi.trend({ ...base, granularity: granularity.value }),
      statsApi.byCategory({ ...base, flow_type: 'expense' }),
      statsApi.byPlatform(base),
    ]);
    trend.value = t;
    expenseByCat.value = c;
    byPlatform.value = p;
  } finally {
    loading.value = false;
  }
}
function onRange(r: { from?: string; to?: string }) {
  rng.value = r;
  load();
}
watch([currentId, granularity], load);

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis', valueFormatter: fmt },
  legend: { data: ['收入', '支出'] },
  grid: { left: 60, right: 20, top: 36, bottom: 28 },
  xAxis: { type: 'category', data: trend.value.map((p) => p.period) },
  yAxis: { type: 'value', axisLabel: { formatter: fmt } },
  series: [
    { name: '收入', type: 'line', smooth: true, data: trend.value.map((p) => p.income), itemStyle: { color: '#2f5d7c' } },
    { name: '支出', type: 'line', smooth: true, data: trend.value.map((p) => p.expense), itemStyle: { color: '#b9472f' } },
  ],
}));

// 暖色大地色板，与「温暖账本」主题统一（不复用收入绿/支出红语义色）
const WARM_PALETTE = [
  '#C2683C',
  '#D9A14B',
  '#7E9B6B',
  '#B5764A',
  '#8C6E54',
  '#C99B7A',
  '#A85B43',
  '#6E8B7B',
];

const pieOption = computed(() => ({
  color: WARM_PALETTE,
  tooltip: { trigger: 'item', valueFormatter: fmt },
  legend: { type: 'scroll', bottom: 0, textStyle: { color: '#6b6357' } },
  series: [
    {
      name: '支出占比',
      type: 'pie',
      radius: ['40%', '68%'],
      data: expenseByCat.value.map((c) => ({ name: c.name, value: c.amount })),
      label: { formatter: '{b}\n{d}%' },
    },
  ],
}));

const barOption = computed(() => ({
  tooltip: { trigger: 'axis', valueFormatter: fmt },
  legend: { data: ['收入', '支出'] },
  grid: { left: 60, right: 20, top: 36, bottom: 28 },
  xAxis: { type: 'category', data: byPlatform.value.map((p) => p.name) },
  yAxis: { type: 'value', axisLabel: { formatter: fmt } },
  series: [
    { name: '收入', type: 'bar', data: byPlatform.value.map((p) => p.income), itemStyle: { color: '#2f5d7c' } },
    { name: '支出', type: 'bar', data: byPlatform.value.map((p) => p.expense), itemStyle: { color: '#b9472f' } },
  ],
}));

const hasTrend = computed(() => trend.value.length > 0);
const hasCat = computed(() => expenseByCat.value.length > 0);
const hasPlat = computed(() => byPlatform.value.length > 0);
</script>

<template>
  <div v-loading="loading">
    <div class="toolbar">
      <RangeBar default="month" @change="onRange" />
      <div class="flex-spacer" />
      <el-radio-group v-model="granularity">
        <el-radio-button value="month">按月</el-radio-button>
        <el-radio-button value="week">按周</el-radio-button>
        <el-radio-button value="day">按日</el-radio-button>
      </el-radio-group>
    </div>

    <el-card shadow="never" style="margin-bottom: 16px">
      <template #header>收支趋势</template>
      <v-chart v-if="hasTrend" :option="trendOption" style="height: 320px" autoresize />
      <el-empty v-else description="暂无数据" />
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>支出类目占比</template>
          <v-chart v-if="hasCat" :option="pieOption" style="height: 320px" autoresize />
          <el-empty v-else description="暂无支出数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>来源平台汇总</template>
          <v-chart v-if="hasPlat" :option="barOption" style="height: 320px" autoresize />
          <el-empty v-else description="暂无数据" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
