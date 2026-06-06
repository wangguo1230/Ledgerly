<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import { productApi } from '@/api';
import type { Product } from '@/api/types';
import AmountText from '@/components/AmountText.vue';
import AmountInput from '@/components/AmountInput.vue';

const store = useLedgerStore();
const { currentId } = storeToRefs(store);

const list = ref<Product[]>([]);
const loading = ref(false);

async function load() {
  if (!currentId.value) return;
  loading.value = true;
  try {
    list.value = await productApi.list(currentId.value);
  } finally {
    loading.value = false;
  }
}
watch(currentId, load, { immediate: true });

const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<{
  name: string;
  sku: string;
  cost_price: number | null;
  sale_price: number | null;
  unit: string;
  stock: number | null;
  remark: string;
}>({ name: '', sku: '', cost_price: 0, sale_price: 0, unit: '', stock: null, remark: '' });

function openCreate() {
  editingId.value = null;
  Object.assign(form, { name: '', sku: '', cost_price: 0, sale_price: 0, unit: '', stock: null, remark: '' });
  dialogVisible.value = true;
}
function openEdit(row: Product) {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    sku: row.sku ?? '',
    cost_price: row.cost_price,
    sale_price: row.sale_price,
    unit: row.unit ?? '',
    stock: row.stock,
    remark: row.remark ?? '',
  });
  dialogVisible.value = true;
}

async function submit() {
  if (!currentId.value) return;
  if (!form.name.trim()) {
    ElMessage.warning('请输入商品名称');
    return;
  }
  const payload = {
    name: form.name,
    sku: form.sku || null,
    cost_price: form.cost_price ?? 0,
    sale_price: form.sale_price ?? 0,
    unit: form.unit || null,
    stock: form.stock,
    remark: form.remark || null,
  };
  if (editingId.value) {
    await productApi.update(editingId.value, payload);
    ElMessage.success('已更新');
  } else {
    await productApi.create({ ledger_id: currentId.value, ...payload });
    ElMessage.success('已新增');
  }
  dialogVisible.value = false;
  load();
}

async function remove(row: Product) {
  await ElMessageBox.confirm(`确定删除商品「${row.name}」？`, '提示', { type: 'warning' });
  await productApi.remove(row.id);
  ElMessage.success('已删除');
  load();
}
</script>

<template>
  <div v-loading="loading" class="sheet">
    <div class="page-head">商品管理</div>
    <div class="guide-card">
      <span class="guide-step"><b>①</b> 给商品填成本价 / 售价</span>
      <span class="guide-arrow">→</span>
      <span class="guide-step"><b>②</b> 记销售时关联这个商品 + 数量</span>
      <span class="guide-arrow">→</span>
      <span class="guide-step"><b>③</b> 到 <router-link to="/profit">利润核算</router-link> 看毛利</span>
      <span class="guide-note">你的「成本」就填在这里 ↓</span>
    </div>
    <div class="toolbar">
      <div class="flex-spacer" />
      <el-button type="primary" @click="openCreate">新增商品</el-button>
    </div>
    <el-table :data="list" stripe>
      <el-table-column prop="name" label="商品名" min-width="140" />
      <el-table-column prop="sku" label="编码" width="120" />
      <el-table-column label="成本价" width="120" align="right">
        <template #default="{ row }"><AmountText :cents="row.cost_price" /></template>
      </el-table-column>
      <el-table-column label="售价" width="120" align="right">
        <template #default="{ row }"><AmountText :cents="row.sale_price" /></template>
      </el-table-column>
      <el-table-column label="单位利润" width="120" align="right">
        <template #default="{ row }">
          <AmountText :cents="row.sale_price - row.cost_price" variant="balance" />
        </template>
      </el-table-column>
      <el-table-column prop="unit" label="单位" width="80" />
      <el-table-column prop="stock" label="库存" width="80" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!list.length" description="暂无商品" />

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑商品' : '新增商品'" width="440px">
      <el-form label-width="80px">
        <el-form-item label="商品名" required>
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="编码">
          <el-input v-model="form.sku" />
        </el-form-item>
        <el-form-item label="成本价">
          <AmountInput v-model="form.cost_price" />
        </el-form-item>
        <el-form-item label="售价">
          <AmountInput v-model="form.sale_price" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="件/斤/盒…" style="width: 140px" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="form.stock" :min="0" />
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
.guide-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 14px;
  color: var(--ink-soft);
}
.guide-step b {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: 4px;
  border-radius: 50%;
  background: var(--terra);
  color: #fff;
  font-size: 12px;
  vertical-align: middle;
}
.guide-arrow {
  color: var(--ink-faint);
}
.guide-step a {
  color: var(--terra);
  font-weight: 600;
  text-decoration: none;
}
.guide-note {
  margin-left: auto;
  color: var(--terra-deep);
  font-weight: 600;
}
</style>

