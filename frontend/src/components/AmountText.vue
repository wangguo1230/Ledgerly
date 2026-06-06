<script setup lang="ts">
/**
 * 金额展示组件 —— 整数分输入，Fraunces 衰线数字 + 千分位 + 红绿语义。
 * sign: 显示 +/− ；arrow: 显示 ▲/▼（收支语义更直观）。
 */
import { computed } from 'vue';
import { formatCents } from '@/utils/money';
import type { FlowType } from '@/api/types';

const props = withDefaults(
  defineProps<{
    cents: number;
    /** income=绿 expense=红 balance=随正负 none=默认色 */
    variant?: FlowType | 'balance' | 'none';
    sign?: boolean;
    arrow?: boolean;
    prefix?: string;
  }>(),
  { variant: 'none', sign: false, arrow: false, prefix: '¥' },
);

const cls = computed(() => {
  if (props.variant === 'income') return 'amount--income';
  if (props.variant === 'expense') return 'amount--expense';
  if (props.variant === 'balance') return props.cents < 0 ? 'amount--expense' : 'amount--balance';
  return '';
});

const isNeg = computed(() => props.variant === 'expense' || props.cents < 0);

const arrowChar = computed(() => {
  if (!props.arrow) return '';
  if (props.variant === 'income') return '▲ ';
  if (props.variant === 'expense') return '▼ ';
  return '';
});

const signChar = computed(() => {
  if (!props.sign) return '';
  return isNeg.value ? '−' : '+';
});

const body = computed(() => `${props.prefix}${formatCents(Math.abs(props.cents))}`);
</script>

<template>
  <span class="amount" :class="cls"
    ><span v-if="arrowChar" class="amount__arrow">{{ arrowChar }}</span
    >{{ signChar }}{{ body }}</span
  >
</template>

<style scoped>
.amount__arrow {
  font-size: 0.72em;
  vertical-align: 1px;
}
</style>
