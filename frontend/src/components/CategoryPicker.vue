<script setup lang="ts">
/**
 * 类目选择器 —— 按账本+收支类型加载树，支持选择父/子类目。
 */
import { ref, watch } from 'vue';
import { categoryApi } from '@/api';
import type { CategoryNode, FlowType } from '@/api/types';

const props = defineProps<{
  modelValue: number | null;
  ledgerId: number;
  flowType: FlowType;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const tree = ref<CategoryNode[]>([]);

async function reload() {
  if (!props.ledgerId) {
    tree.value = [];
    return;
  }
  tree.value = await categoryApi.tree(props.ledgerId, props.flowType);
}

watch(() => [props.ledgerId, props.flowType], reload, { immediate: true });

const treeProps = { label: 'name', children: 'children', value: 'id' };
</script>

<template>
  <el-tree-select
    :model-value="modelValue"
    :data="tree"
    :props="treeProps"
    node-key="id"
    check-strictly
    :render-after-expand="false"
    clearable
    placeholder="选择类目"
    style="width: 100%"
    @update:model-value="(v: number | null) => emit('update:modelValue', v)"
  />
</template>
