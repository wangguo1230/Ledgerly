<script setup lang="ts">
/**
 * 区间选择条 —— 今日/本周/本月/近30天 快捷预设 + 自定义日期。
 * 挂载即按 default 预设发出一次 change。
 */
import { ref, onMounted } from 'vue';
import { presetRange, formatDate, type RangePreset } from '@/utils/date';

type Mode = RangePreset | 'custom';
const props = withDefaults(defineProps<{ default?: RangePreset }>(), { default: 'month' });
const emit = defineEmits<{ change: [{ from?: string; to?: string }] }>();

const active = ref<Mode>(props.default);
const custom = ref<[Date, Date] | null>(null);

const presets: { key: RangePreset; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'last30', label: '近30天' },
];

function pick(p: RangePreset) {
  active.value = p;
  custom.value = null;
  emit('change', presetRange(p));
}
function onCustom(v: [Date, Date] | null) {
  if (!v) return;
  active.value = 'custom';
  emit('change', { from: `${formatDate(v[0])} 00:00:00`, to: `${formatDate(v[1])} 23:59:59` });
}

onMounted(() => emit('change', presetRange(props.default)));
</script>

<template>
  <div class="range-bar">
    <div class="presets">
      <button
        v-for="p in presets"
        :key="p.key"
        class="rb-btn"
        :class="{ on: active === p.key }"
        @click="pick(p.key)"
      >
        {{ p.label }}
      </button>
    </div>
    <el-date-picker
      v-model="custom"
      type="daterange"
      range-separator="至"
      start-placeholder="自定义起"
      end-placeholder="止"
      :clearable="false"
      @change="onCustom"
    />
  </div>
</template>

<style scoped>
.range-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.presets {
  display: flex;
  gap: 3px;
  background: #e2d8be;
  border-radius: 3px;
  padding: 3px;
}
.rb-btn {
  border: none;
  background: transparent;
  padding: 7px 16px;
  border-radius: 2px;
  font-size: 14px;
  font-weight: 600;
  color: #6f6450;
  cursor: pointer;
  transition: all 0.15s;
}
.rb-btn:hover {
  color: var(--terra-deep);
}
.rb-btn.on {
  background: #f6f0df;
  box-shadow: 0 1px 2px rgba(70, 50, 25, 0.2);
  color: #2a2418;
}
</style>
