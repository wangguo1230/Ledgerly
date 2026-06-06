<script setup lang="ts">
import { ref, reactive } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import { ledgerApi } from '@/api';
import type { Ledger, LedgerType } from '@/api/types';

const store = useLedgerStore();
const { ledgers, currentId } = storeToRefs(store);

const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<{ name: string; type: LedgerType; remark: string }>({
  name: '',
  type: 'personal',
  remark: '',
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, { name: '', type: 'personal', remark: '' });
  dialogVisible.value = true;
}
function openEdit(row: Ledger) {
  editingId.value = row.id;
  Object.assign(form, { name: row.name, type: row.type, remark: row.remark ?? '' });
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入账本名称');
    return;
  }
  if (editingId.value) {
    await ledgerApi.update(editingId.value, { name: form.name, type: form.type, remark: form.remark || null });
    ElMessage.success('已更新');
    await store.refresh();
  } else {
    await store.createLedger({ name: form.name, type: form.type, remark: form.remark || null });
    ElMessage.success('已创建并切换到新账本');
  }
  dialogVisible.value = false;
}

async function remove(row: Ledger) {
  await ElMessageBox.confirm(
    `确定删除账本「${row.name}」？该账本下的所有类目、商品、账目都将被永久删除！`,
    '高危操作',
    { type: 'warning', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' },
  );
  await ledgerApi.remove(row.id);
  ElMessage.success('已删除');
  await store.load();
}
</script>

<template>
  <div>
    <div class="toolbar">
      <el-text type="info">账本用于隔离“个人”与“生意”账目，互不影响统计。生意账本才有商品与利润核算。</el-text>
      <div class="flex-spacer" />
      <el-button type="primary" @click="openCreate">新建账本</el-button>
    </div>
    <el-row :gutter="16">
      <el-col v-for="lg in ledgers" :key="lg.id" :xs="24" :sm="12" :md="8">
        <el-card shadow="never" class="ledger-card" :class="{ active: lg.id === currentId }">
          <div class="lc-head">
            <span class="lc-name">{{ lg.name }}</span>
            <el-tag :type="lg.type === 'business' ? 'success' : 'info'" size="small" effect="plain">
              {{ lg.type === 'business' ? '生意' : '个人' }}
            </el-tag>
          </div>
          <div class="lc-remark">{{ lg.remark || '无备注' }}</div>
          <div class="lc-actions">
            <el-button
              v-if="lg.id !== currentId"
              size="small"
              type="primary"
              plain
              @click="store.switchLedger(lg.id)"
            >
              切换
            </el-button>
            <el-tag v-else size="small" type="primary">当前账本</el-tag>
            <div class="flex-spacer" />
            <el-button size="small" link type="primary" @click="openEdit(lg)">编辑</el-button>
            <el-button
              size="small"
              link
              type="danger"
              :disabled="ledgers.length <= 1"
              @click="remove(lg)"
            >
              删除
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑账本' : '新建账本'" width="400px">
      <el-form label-width="70px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="50" placeholder="如：个人账本 / 水果店" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio-button value="personal">个人</el-radio-button>
            <el-radio-button value="business">生意</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ledger-card {
  border-radius: 12px;
  margin-bottom: 16px;
}
.ledger-card.active {
  border-color: var(--terra);
  box-shadow: 0 0 0 3px var(--terra-tint);
}
.lc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lc-name {
  font-size: 16px;
  font-weight: 600;
}
.lc-remark {
  color: #9ca3af;
  font-size: 13px;
  margin: 8px 0 16px;
  min-height: 18px;
}
.lc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
