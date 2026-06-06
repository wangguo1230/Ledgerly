<script setup lang="ts">
/**
 * 富文本编辑器 —— 基于 Quill，v-model 绑定 HTML 字符串。
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const props = defineProps<{ modelValue: string | null; placeholder?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const el = ref<HTMLDivElement | null>(null);
let quill: Quill | null = null;
let internal = false;

function currentHtml(): string {
  if (!quill) return '';
  return quill.getText().trim() === '' ? '' : quill.root.innerHTML;
}

onMounted(() => {
  quill = new Quill(el.value!, {
    theme: 'snow',
    placeholder: props.placeholder ?? '在这里写内容…',
    modules: {
      toolbar: [
        [{ header: [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'clean'],
      ],
    },
  });
  if (props.modelValue) quill.clipboard.dangerouslyPasteHTML(props.modelValue);
  quill.on('text-change', () => {
    internal = true;
    emit('update:modelValue', currentHtml());
    internal = false;
  });
});

watch(
  () => props.modelValue,
  (v) => {
    if (internal || !quill) return;
    if ((v ?? '') !== currentHtml()) {
      quill.clipboard.dangerouslyPasteHTML(v ?? '');
    }
  },
);

onBeforeUnmount(() => {
  quill = null;
});
</script>

<template>
  <div class="rte">
    <div ref="el"></div>
  </div>
</template>

<style scoped>
.rte {
  width: 100%;
}
.rte :deep(.ql-toolbar) {
  border-radius: 10px 10px 0 0;
  border-color: var(--line);
  background: var(--surface-2);
}
.rte :deep(.ql-container) {
  border-radius: 0 0 10px 10px;
  border-color: var(--line);
  font-family: var(--font-sans);
  font-size: 14px;
  min-height: 140px;
}
.rte :deep(.ql-editor) {
  min-height: 140px;
  color: var(--ink);
}
.rte :deep(.ql-editor.ql-blank::before) {
  color: var(--ink-faint);
  font-style: normal;
}
.rte :deep(.ql-snow .ql-stroke) {
  stroke: var(--ink-soft);
}
.rte :deep(.ql-snow .ql-picker) {
  color: var(--ink-soft);
}
.rte :deep(.ql-snow.ql-toolbar button:hover .ql-stroke) {
  stroke: var(--terra);
}
.rte :deep(.ql-snow .ql-active .ql-stroke) {
  stroke: var(--terra) !important;
}
</style>
