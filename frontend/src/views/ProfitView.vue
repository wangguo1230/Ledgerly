<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLedgerStore } from '@/stores/ledger';
import { statsApi } from '@/api';
import type { ProductProfit } from '@/api/types';
import AmountText from '@/components/AmountText.vue';
import RangeBar from '@/components/RangeBar.vue';

const store = useLedgerStore();
const { currentId } = storeToRefs(store);

const list = ref<ProductProfit[]>([]);
const loading = ref(false);
const rng = ref<{ from?: string; to?: string }>({});

async function load() {
  if (!currentId.value) return;
  loading.value = true;
  try {
    list.value = await statsApi.profit({ ledger_id: currentId.value, ...rng.value });
  } finally {
    loading.value = false;
  }
}
function onRange(r: { from?: string; to?: string }) {
  rng.value = r;
  load();
}
watch(currentId, load);

const totals = computed(() =>
  list.value.reduce(
    (acc, x) => ({
      revenue: acc.revenue + x.revenue,
      cost: acc.cost + x.cost,
      profit: acc.profit + x.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  ),
);
</script>

<template>
  <div v-loading="loading" class="sheet">
    <div class="page-head">利润核算</div>
    <div class="toolbar">
      <RangeBar default="month" @change="onRange" />
    </div>

    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="8">
        <el-card shadow="never"><div class="lbl">销售收入</div><AmountText :cents="totals.revenue" variant="income" class="big" /></el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never"><div class="lbl">成本</div><AmountText :cents="totals.cost" variant="expense" class="big" /></el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never"><div class="lbl">毛利润</div><AmountText :cents="totals.profit" variant="balance" class="big" /></el-card>
      </el-col>
    </el-row>

    <el-table :data="list" stripe>
      <el-table-column prop="name" label="商品" min-width="140" />
      <el-table-column prop="quantity" label="销量" width="100" align="right" />
      <el-table-column label="销售收入" width="140" align="right">
        <template #default="{ row }"><AmountText :cents="row.revenue" variant="income" /></template>
      </el-table-column>
      <el-table-column label="成本" width="140" align="right">
        <template #default="{ row }"><AmountText :cents="row.cost" variant="expense" /></template>
      </el-table-column>
      <el-table-column label="毛利润" width="140" align="right">
        <template #default="{ row }"><AmountText :cents="row.profit" variant="balance" /></template>
      </el-table-column>
      <el-table-column label="毛利率" width="100" align="right">
        <template #default="{ row }">
          {{ row.revenue ? ((row.profit / row.revenue) * 100).toFixed(1) + '%' : '—' }}
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!list.length" :image-size="90">
      <template #description>
        <div class="profit-empty">
          <p>还没有可核算的销售。三步就能看到毛利：</p>
          <p>
            ① 去<router-link to="/products">商品管理</router-link>给商品填成本价/售价 →
            ② <router-link to="/quick">记一笔</router-link>收入时关联该商品 →
            ③ 回这里看每个商品赚多少
          </p>
        </div>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.lbl {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 6px;
}
.big {
  font-size: 22px;
  font-weight: 700;
}
.profit-empty {
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.9;
}
.profit-empty a {
  color: var(--terra);
  font-weight: 600;
  text-decoration: none;
}
</style>
