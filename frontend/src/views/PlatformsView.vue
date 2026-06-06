<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { platformApi } from '@/api';
import type { SourcePlatform } from '@/api/types';

const list = ref<SourcePlatform[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await platformApi.list();
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<{ name: string }>({ name: '' });

function openCreate() {
  editingId.value = null;
  form.name = '';
  dialogVisible.value = true;
}
function openEdit(row: SourcePlatform) {
  editingId.value = row.id;
  form.name = row.name;
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入平台名称');
    return;
  }
  if (editingId.value) {
    await platformApi.update(editingId.value, { name: form.name });
    ElMessage.success('已更新');
  } else {
    await platformApi.create({ name: form.name });
    ElMessage.success('已新增');
  }
  dialogVisible.value = false;
  load();
}

async function remove(row: SourcePlatform) {
  await ElMessageBox.confirm(`确定删除平台「${row.name}」？已使用该平台的账目将变为「未标记」。`, '提示', {
    type: 'warning',
  });
  await platformApi.remove(row.id);
  ElMessage.success('已删除');
  load();
}
</script>

<template>
  <div v-loading="loading" class="sheet">
    <div class="page-head">来源平台</div>
    <div class="toolbar">
      <el-text type="info">来源平台用于标记每笔账目来自微信/支付宝/银行卡等，解决“平台驳杂”问题。</el-text>
      <div class="flex-spacer" />
      <el-button type="primary" @click="openCreate">新增平台</el-button>
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="name" label="平台名称" min-width="160" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.is_system ? 'info' : 'success'" effect="plain">
            {{ row.is_system ? '系统预置' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">重命名</el-button>
          <el-button link type="danger" :disabled="!!row.is_system" @click="remove(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '重命名平台' : '新增平台'" width="360px">
      <el-input v-model="form.name" placeholder="平台名称" maxlength="20" @keyup.enter="submit" />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
