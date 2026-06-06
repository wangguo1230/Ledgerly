<script setup lang="ts">
/**
 * 金额输入组件 —— 以「元」录入，对外吐「整数分」。零浮点误差（字符串解析）。
 */
import { ref, watch } from 'vue';
import { yuanToCents, centsToYuan } from '@/utils/money';

const props = defineProps<{ modelValue: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const text = ref(props.modelValue == null ? '' : centsToYuan(props.modelValue));

// 外部值变化时同步显示（避免与内部编辑冲突：仅当数值不等时刷新）
watch(
  () => props.modelValue,
  (v) => {
    const current = text.value === '' ? null : safeCents(text.value);
    if (v !== current) text.value = v == null ? '' : centsToYuan(v);
  },
);

function safeCents(s: string): number | null {
  try {
    return yuanToCents(s);
  } catch {
    return null;
  }
}

function commit() {
  const t = text.value.trim();
  if (t === '') {
    emit('update:modelValue', null);
    return;
  }
  const cents = safeCents(t);
  if (cents == null) {
    // 非法输入回退到上次合法值
    text.value = props.modelValue == null ? '' : centsToYuan(props.modelValue);
    return;
  }
  text.value = centsToYuan(cents);
  emit('update:modelValue', cents);
}
</script>

<template>
  <el-input
    v-model="text"
    placeholder="0.00"
    inputmode="decimal"
    @blur="commit"
    @keyup.enter="commit"
  >
    <template #prepend>¥</template>
  </el-input>
</template>
