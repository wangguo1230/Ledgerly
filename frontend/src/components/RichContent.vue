<script setup lang="ts">
/**
 * 富文本只读展示 —— DOMPurify 清洗后渲染；可选 clamp 行数。
 */
import { computed } from 'vue';
import { safeHtml } from '@/utils/html';

const props = withDefaults(defineProps<{ html: string | null; clamp?: number }>(), {
  clamp: 0,
});
const rendered = computed(() => safeHtml(props.html));
</script>

<template>
  <div
    class="rich-content"
    :class="{ clamped: clamp > 0 }"
    :style="clamp > 0 ? { '--clamp': clamp } : {}"
    v-html="rendered"
  />
</template>

<style scoped>
.rich-content {
  word-break: break-word;
}
.rich-content.clamped {
  display: -webkit-box;
  -webkit-line-clamp: var(--clamp);
  line-clamp: var(--clamp);
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.rich-content :deep(p) {
  margin: 0 0 4px;
}
.rich-content :deep(p:last-child) {
  margin-bottom: 0;
}
.rich-content :deep(ul),
.rich-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.rich-content :deep(a) {
  color: var(--terra);
}
</style>
