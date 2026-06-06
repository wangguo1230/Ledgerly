<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import { categoryApi } from '@/api';
import type { CategoryNode, FlowType } from '@/api/types';

const store = useLedgerStore();
const { currentId } = storeToRefs(store);

const activeFlow = ref<FlowType>('expense');
const tree = ref<CategoryNode[]>([]);
const loading = ref(false);

async function load() {
  if (!currentId.value) return;
  loading.value = true;
  try {
    tree.value = await categoryApi.tree(currentId.value, activeFlow.value);
  } finally {
    loading.value = false;
  }
}

watch([currentId, activeFlow], load, { immediate: true });

const dialogVisible = ref(false);
const editing = ref<CategoryNode | null>(null);
const form = reactive<{ name: string; parent_id: number | null }>({ name: '', parent_id: null });

function openCreateTop() {
  editing.value = null;
  form.name = '';
  form.parent_id = null;
  dialogVisible.value = true;
}
function openCreateChild(parent: CategoryNode) {
  editing.value = null;
  form.name = '';
  form.parent_id = parent.id;
  dialogVisible.value = true;
}
function openEdit(node: CategoryNode) {
  editing.value = node;
  form.name = node.name;
  form.parent_id = node.parent_id;
  dialogVisible.value = true;
}

async function submit() {
  if (!currentId.value) return;
  if (!form.name.trim()) {
    ElMessage.warning('请输入类目名称');
    return;
  }
  if (editing.value) {
    await categoryApi.update(editing.value.id, { name: form.name });
    ElMessage.success('已更新');
  } else {
    await categoryApi.create({
      ledger_id: currentId.value,
      name: form.name,
      flow_type: activeFlow.value,
      parent_id: form.parent_id,
    });
    ElMessage.success('已新增');
  }
  dialogVisible.value = false;
  load();
}

async function remove(node: CategoryNode) {
  const tip = node.children.length
    ? `删除「${node.name}」将同时删除其 ${node.children.length} 个子类目，确定？`
    : `确定删除「${node.name}」？`;
  await ElMessageBox.confirm(tip, '提示', { type: 'warning' });
  await categoryApi.remove(node.id);
  ElMessage.success('已删除');
  load();
}

const treeProps = { label: 'name', children: 'children' };
</script>

<template>
  <div v-loading="loading" class="sheet">
    <div class="page-head">类目管理</div>
    <div class="toolbar">
      <el-radio-group v-model="activeFlow">
        <el-radio-button value="expense">支出类目</el-radio-button>
        <el-radio-button value="income">收入类目</el-radio-button>
      </el-radio-group>
      <div class="flex-spacer" />
      <el-button type="primary" @click="openCreateTop">新增顶级类目</el-button>
    </div>

    <div class="cat-tree">
      <el-tree
        :data="tree"
        :props="treeProps"
        node-key="id"
        default-expand-all
        :expand-on-click-node="false"
      >
        <template #default="{ data }">
          <div class="tree-row">
            <span class="tree-name">{{ data.name }}</span>
            <span class="tree-actions">
              <el-button v-if="!data.parent_id" link type="primary" @click.stop="openCreateChild(data)">
                添加子类目
              </el-button>
              <el-button link type="primary" @click.stop="openEdit(data)">重命名</el-button>
              <el-button link type="danger" @click.stop="remove(data)">删除</el-button>
            </span>
          </div>
        </template>
      </el-tree>
      <el-empty v-if="!tree.length" description="暂无类目，点击右上角新增" />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '重命名类目' : form.parent_id ? '新增子类目' : '新增顶级类目'"
      width="380px"
    >
      <el-input v-model="form.name" placeholder="类目名称" maxlength="20" @keyup.enter="submit" />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cat-tree :deep(.el-tree) {
  background: transparent;
  color: var(--ink);
}
.cat-tree :deep(.el-tree-node__content) {
  height: 38px;
  border-bottom: 1px solid rgba(70, 110, 130, 0.16);
}
.cat-tree :deep(.el-tree-node__content:hover) {
  background: rgba(185, 71, 47, 0.06);
}
.tree-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 8px;
}
.tree-name {
  font-size: 15px;
}
.tree-actions {
  opacity: 0;
  transition: opacity 0.15s;
}
.tree-row:hover .tree-actions {
  opacity: 1;
}
</style>
