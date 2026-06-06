<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import {
  transactionApi,
  categoryApi,
  platformApi,
  productApi,
  type TransactionQuery,
  type TransactionPayload,
} from '@/api';
import type { Category, FlowType, Product, SourcePlatform, Transaction } from '@/api/types';
import { dayRangeToDateTime, now } from '@/utils/date';
import { formatCents } from '@/utils/money';
import AmountText from '@/components/AmountText.vue';
import AmountInput from '@/components/AmountInput.vue';
import CategoryPicker from '@/components/CategoryPicker.vue';
import RichTextEditor from '@/components/RichTextEditor.vue';
import RichContent from '@/components/RichContent.vue';

const store = useLedgerStore();
const { currentId, isBusiness } = storeToRefs(store);

const list = ref<Transaction[]>([]);
const total = ref(0);
const loading = ref(false);

const categories = ref<Category[]>([]);
const platforms = ref<SourcePlatform[]>([]);
const products = ref<Product[]>([]);

const catMap = computed(() => new Map(categories.value.map((c) => [c.id, c.name])));
const platMap = computed(() => new Map(platforms.value.map((p) => [p.id, p.name])));

const filters = reactive<{
  range: [Date, Date] | null;
  flow_type: FlowType | '';
  category_id: number | null;
  source_platform_id: number | null;
  search: string;
  page: number;
  pageSize: number;
}>({
  range: null,
  flow_type: '',
  category_id: null,
  source_platform_id: null,
  search: '',
  page: 1,
  pageSize: 20,
});

async function loadMeta() {
  if (!currentId.value) return;
  const [cats, plats] = await Promise.all([categoryApi.list(currentId.value), platformApi.list()]);
  categories.value = cats;
  platforms.value = plats;
  products.value = isBusiness.value ? await productApi.list(currentId.value) : [];
}

async function loadList() {
  if (!currentId.value) return;
  loading.value = true;
  const { from, to } = dayRangeToDateTime(filters.range);
  const query: TransactionQuery = {
    ledger_id: currentId.value,
    flow_type: filters.flow_type || undefined,
    category_id: filters.category_id ?? undefined,
    source_platform_id: filters.source_platform_id ?? undefined,
    search: filters.search || undefined,
    from,
    to,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  try {
    const res = await transactionApi.list(query);
    list.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function resetAndReload() {
  filters.page = 1;
  loadList();
}

watch(currentId, async () => {
  Object.assign(filters, { category_id: null, source_platform_id: null, page: 1 });
  await loadMeta();
  await loadList();
}, { immediate: true });

// —— 新增/编辑弹窗 ——
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<{
  flow_type: FlowType;
  amount: number | null;
  category_id: number | null;
  product_id: number | null;
  quantity: number | null;
  cost_snapshot: number | null;
  source_platform_id: number | null;
  occurred_at: string;
  remark: string;
}>({
  flow_type: 'income',
  amount: null,
  category_id: null,
  product_id: null,
  quantity: null,
  cost_snapshot: null,
  source_platform_id: null,
  occurred_at: now(),
  remark: '',
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    flow_type: 'income',
    amount: null,
    category_id: null,
    product_id: null,
    quantity: null,
    cost_snapshot: null,
    source_platform_id: null,
    occurred_at: now(),
    remark: '',
  });
  dialogVisible.value = true;
}

function openEdit(row: Transaction) {
  editingId.value = row.id;
  Object.assign(form, {
    flow_type: row.flow_type,
    amount: row.amount,
    category_id: row.category_id,
    product_id: row.product_id,
    quantity: row.quantity,
    cost_snapshot: row.cost_snapshot,
    source_platform_id: row.source_platform_id,
    occurred_at: row.occurred_at,
    remark: row.remark ?? '',
  });
  dialogVisible.value = true;
}

// 切换收支时清空类目（避免收支类型不一致）；离开收入则清掉商品关联
watch(
  () => form.flow_type,
  () => {
    if (!dialogVisible.value) return;
    form.category_id = null;
    if (form.flow_type !== 'income') {
      form.product_id = null;
      form.quantity = null;
    }
  },
);

async function submit() {
  if (!currentId.value) return;
  if (form.amount == null || form.amount <= 0) {
    ElMessage.warning('请输入正确金额');
    return;
  }
  const payload: TransactionPayload = {
    ledger_id: currentId.value,
    flow_type: form.flow_type,
    amount: form.amount,
    category_id: form.category_id,
    product_id: form.product_id,
    quantity: form.quantity,
    cost_snapshot: form.product_id ? form.cost_snapshot : null,
    source_platform_id: form.source_platform_id,
    occurred_at: form.occurred_at,
    remark: form.remark || null,
  };
  if (editingId.value) {
    await transactionApi.update(editingId.value, payload);
    ElMessage.success('已更新');
  } else {
    await transactionApi.create(payload);
    ElMessage.success('已新增');
  }
  dialogVisible.value = false;
  loadList();
}

async function remove(row: Transaction) {
  await ElMessageBox.confirm('确定删除这笔账目？', '提示', { type: 'warning' });
  await transactionApi.remove(row.id);
  ElMessage.success('已删除');
  loadList();
}

function productName(id: number | null): string {
  if (id == null) return '';
  return products.value.find((p) => p.id === id)?.name ?? '已删除商品';
}

// —— 卖货智能录入：选商品自动带出售价、当场算毛利 ——
const productMap = computed(() => new Map(products.value.map((p) => [p.id, p])));
const formProduct = computed(() =>
  form.product_id != null ? productMap.value.get(form.product_id) ?? null : null,
);

function autoFillAmount() {
  const p = formProduct.value;
  if (!p) return;
  form.amount = p.sale_price * (form.quantity ?? 1);
}
function onProductChange() {
  if (form.product_id == null) {
    form.cost_snapshot = null;
    return;
  }
  if (!form.quantity || form.quantity < 1) form.quantity = 1;
  // 默认带出商品当前成本，可改成本批实际进价
  form.cost_snapshot = formProduct.value?.cost_price ?? null;
  autoFillAmount();
}
function onQtyChange() {
  if (form.product_id != null) autoFillAmount();
}

/** 本笔毛利 = 售出金额 − 本笔成本 × 数量（本笔成本默认取商品成本价） */
const grossProfitCents = computed(() => {
  const p = formProduct.value;
  if (!p || form.amount == null) return null;
  const unitCost = form.cost_snapshot ?? p.cost_price;
  return form.amount - unitCost * (form.quantity ?? 1);
});

// 生意账本的收入：备注升级为「内容」富文本
const isContentMode = computed(() => isBusiness.value && form.flow_type === 'income');
</script>

<template>
  <div class="sheet">
    <div class="page-head">账目明细 · 流水</div>
    <!-- 筛选工具栏 -->
    <div class="toolbar">
      <el-date-picker
        v-model="filters.range"
        type="daterange"
        range-separator="至"
        start-placeholder="开始"
        end-placeholder="结束"
        @change="resetAndReload"
      />
      <el-select v-model="filters.flow_type" placeholder="收支" clearable style="width: 110px" @change="resetAndReload">
        <el-option label="收入" value="income" />
        <el-option label="支出" value="expense" />
      </el-select>
      <el-select v-model="filters.category_id" placeholder="类目" clearable filterable style="width: 150px" @change="resetAndReload">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="filters.source_platform_id" placeholder="来源平台" clearable style="width: 130px" @change="resetAndReload">
        <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-input v-model="filters.search" placeholder="备注搜索" clearable style="width: 160px" @keyup.enter="resetAndReload" @clear="resetAndReload" />
      <el-button type="primary" @click="resetAndReload">查询</el-button>
      <div class="flex-spacer" />
      <el-button type="primary" :icon="'Plus'" @click="openCreate">新增账目</el-button>
    </div>

    <!-- 列表 -->
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="occurred_at" label="时间" width="160" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="row.flow_type === 'income' ? 'success' : 'danger'" effect="plain" size="small">
            {{ row.flow_type === 'income' ? '收入' : '支出' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类目" min-width="120">
        <template #default="{ row }">{{ catMap.get(row.category_id) ?? '未分类' }}</template>
      </el-table-column>
      <el-table-column label="商品" min-width="120" v-if="isBusiness">
        <template #default="{ row }">
          <span v-if="row.product_id">{{ productName(row.product_id) }} ×{{ row.quantity ?? 1 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }">
          <AmountText :cents="row.amount" :variant="row.flow_type" sign />
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          <span>{{ platMap.get(row.source_platform_id) ?? '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="备注/内容" min-width="170">
        <template #default="{ row }">
          <RichContent v-if="row.remark" :html="row.remark" :clamp="2" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="filters.page"
        v-model:page-size="filters.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadList"
        @size-change="resetAndReload"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑账目' : '新增账目'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="收支">
          <el-radio-group v-model="form.flow_type">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额" required>
          <AmountInput v-model="form.amount" />
        </el-form-item>
        <el-form-item label="类目">
          <CategoryPicker
            v-model="form.category_id"
            :ledger-id="currentId!"
            :flow-type="form.flow_type"
          />
        </el-form-item>
        <template v-if="isBusiness && form.flow_type === 'income'">
          <el-form-item label="商品">
            <el-select
              v-model="form.product_id"
              clearable
              filterable
              placeholder="可选 · 关联后自动带出售价并算毛利"
              style="width: 100%"
              @change="onProductChange"
            >
              <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id">
                <span class="opt-name">{{ p.name }}</span>
                <span class="opt-meta">售¥{{ formatCents(p.sale_price) }} · 成本¥{{ formatCents(p.cost_price) }}</span>
              </el-option>
              <template v-if="!products.length" #empty>
                <div class="opt-empty">还没有商品，先去「商品管理」添加</div>
              </template>
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.product_id" label="本笔成本">
            <div class="cost-row">
              <div class="cost-input"><AmountInput v-model="form.cost_snapshot" /></div>
              <span class="cost-hint">默认商品成本，可改成这批实际进价</span>
            </div>
          </el-form-item>
          <el-form-item v-if="form.product_id" label="数量">
            <div class="qty-row">
              <el-input-number v-model="form.quantity" :min="1" @change="onQtyChange" />
              <span v-if="grossProfitCents != null" class="profit-hint">
                本笔毛利 ≈
                <b :class="grossProfitCents >= 0 ? 'pos' : 'neg'">¥{{ formatCents(grossProfitCents) }}</b>
              </span>
            </div>
          </el-form-item>
        </template>
        <el-form-item label="来源平台">
          <el-select v-model="form.source_platform_id" clearable placeholder="可选" style="width: 100%">
            <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="form.occurred_at"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="isContentMode ? '内容' : '备注'">
          <RichTextEditor
            v-if="isContentMode"
            v-model="form.remark"
            placeholder="商品内容 / 账号密码 / 订单详情…（支持加粗、列表、颜色）"
          />
          <el-input
            v-else
            v-model="form.remark"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 8 }"
            placeholder="可选"
          />
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
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.opt-name {
  float: left;
}
.opt-meta {
  float: right;
  color: var(--ink-faint);
  font-size: 12px;
}
.opt-empty {
  padding: 10px 0;
  color: var(--ink-faint);
  text-align: center;
}
.qty-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.cost-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.cost-input {
  width: 150px;
  flex-shrink: 0;
}
.cost-hint {
  font-size: 12px;
  color: var(--ink-faint);
}
.profit-hint {
  font-size: 13px;
  color: var(--ink-soft);
}
.profit-hint b {
  font-family: var(--font-display);
  font-size: 15px;
}
.profit-hint .pos {
  color: var(--income);
}
.profit-hint .neg {
  color: var(--expense);
}
</style>
