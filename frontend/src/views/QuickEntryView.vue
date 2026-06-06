<script setup lang="ts">
/**
 * 快捷记账 —— 目标 10 秒一笔：选收支 → 输金额 → 点类目 → 保存。
 * 快捷键：Enter 保存并继续；E 切支出；I 切收入。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import { categoryApi, platformApi, productApi, transactionApi } from '@/api';
import type { Category, FlowType, Product, SourcePlatform } from '@/api/types';
import { yuanToCents, centsToYuan, formatCents } from '@/utils/money';
import { now } from '@/utils/date';
import RichTextEditor from '@/components/RichTextEditor.vue';

const store = useLedgerStore();
const { currentId, isBusiness } = storeToRefs(store);

const flow = ref<FlowType>('income');
const amountText = ref('');
const categoryId = ref<number | null>(null);
const platformId = ref<number | null>(null);
const remark = ref('');
const saving = ref(false);
const justSaved = ref(false);
const savedCount = ref(0);

const categories = ref<Category[]>([]);
const platforms = ref<SourcePlatform[]>([]);
const products = ref<Product[]>([]);
const productId = ref<number | null>(null);
const quantity = ref(1);

const flowCategories = computed(() => categories.value.filter((c) => c.flow_type === flow.value));

// 仅生意账本的收入才显示「关联商品」
const showProduct = computed(() => isBusiness.value && flow.value === 'income');
const formProduct = computed(() =>
  productId.value != null ? products.value.find((p) => p.id === productId.value) ?? null : null,
);
const grossProfitCents = computed(() => {
  const p = formProduct.value;
  if (!p) return null;
  let cents = 0;
  try {
    cents = yuanToCents(amountText.value);
  } catch {
    return null;
  }
  return cents - p.cost_price * quantity.value;
});

function onProductChange() {
  if (productId.value == null) return;
  if (quantity.value < 1) quantity.value = 1;
  fillFromProduct();
}
function onQtyChange() {
  if (productId.value != null) fillFromProduct();
}
function fillFromProduct() {
  const p = formProduct.value;
  if (p) amountText.value = centsToYuan(p.sale_price * quantity.value);
}

async function loadMeta() {
  if (!currentId.value) return;
  const [cats, plats] = await Promise.all([categoryApi.list(currentId.value), platformApi.list()]);
  categories.value = cats;
  platforms.value = plats;
  products.value = isBusiness.value ? await productApi.list(currentId.value) : [];
  ensureCategory();
}

function ensureCategory() {
  if (!flowCategories.value.some((c) => c.id === categoryId.value)) {
    categoryId.value = flowCategories.value[0]?.id ?? null;
  }
}

watch(currentId, loadMeta, { immediate: true });
watch(flow, () => {
  ensureCategory();
  if (flow.value !== 'income') {
    productId.value = null;
    quantity.value = 1;
  }
});

function setFlow(f: FlowType) {
  flow.value = f;
}

async function save(continueAfter: boolean) {
  if (!currentId.value) return;
  let cents: number;
  try {
    cents = yuanToCents(amountText.value);
  } catch {
    ElMessage.warning('请输入正确金额');
    return;
  }
  if (cents <= 0) {
    ElMessage.warning('金额需大于 0');
    return;
  }
  saving.value = true;
  try {
    const linkProduct = showProduct.value && productId.value != null;
    await transactionApi.create({
      ledger_id: currentId.value,
      flow_type: flow.value,
      amount: cents,
      category_id: categoryId.value,
      product_id: linkProduct ? productId.value : null,
      quantity: linkProduct ? quantity.value : null,
      source_platform_id: platformId.value,
      occurred_at: now(),
      remark: remark.value || null,
    });
    savedCount.value += 1;
    justSaved.value = true;
    setTimeout(() => (justSaved.value = false), 700);
    amountText.value = '';
    remark.value = '';
    productId.value = null;
    quantity.value = 1;
    if (!continueAfter) {
      platformId.value = null;
    }
    focusAmount();
  } finally {
    saving.value = false;
  }
}

const amountRef = ref<HTMLInputElement | null>(null);
function focusAmount() {
  requestAnimationFrame(() => amountRef.value?.focus());
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.key === 'Enter') {
    e.preventDefault();
    save(true);
  } else if (!typing && (e.key === 'e' || e.key === 'E')) {
    setFlow('expense');
  } else if (!typing && (e.key === 'i' || e.key === 'I')) {
    setFlow('income');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  focusAmount();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

const isIncome = computed(() => flow.value === 'income');
</script>

<template>
  <div class="quick-wrap ul-rise">
    <div class="receipt" :class="{ 'is-saved': justSaved, 'is-income': isIncome }">
      <div class="voucher-head">
        <span class="vh-title">记 账 凭 证</span>
        <span class="vh-sub">{{ isIncome ? '收 入' : '支 出' }}</span>
      </div>
      <!-- 收支切换 -->
      <div class="flow-toggle">
        <button :class="{ on: !isIncome }" @click="setFlow('expense')">支出</button>
        <button :class="{ on: isIncome }" @click="setFlow('income')">收入</button>
      </div>

      <!-- 金额 -->
      <div class="amount-stage">
        <span class="cny">¥</span>
        <input
          ref="amountRef"
          v-model="amountText"
          class="amount-field"
          inputmode="decimal"
          placeholder="0.00"
          @keyup.enter="save(true)"
        />
      </div>
      <div class="stage-rule" />

      <!-- 关联商品（仅生意账本收入）：选后自动带出售价并算毛利 -->
      <template v-if="showProduct">
        <div class="field-label">关联商品（算利润 · 可选）</div>
        <div class="prod-row">
          <el-select
            v-model="productId"
            clearable
            filterable
            placeholder="选商品自动带出售价"
            style="flex: 1"
            @change="onProductChange"
          >
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id">
              <span class="opt-name">{{ p.name }}</span>
              <span class="opt-meta">售¥{{ formatCents(p.sale_price) }} · 成本¥{{ formatCents(p.cost_price) }}</span>
            </el-option>
            <template v-if="!products.length" #empty>
              <div class="opt-empty">还没有商品，去「商品管理」添加</div>
            </template>
          </el-select>
          <el-input-number
            v-if="productId"
            v-model="quantity"
            :min="1"
            style="width: 128px"
            @change="onQtyChange"
          />
        </div>
        <div v-if="grossProfitCents != null" class="qprofit">
          本笔毛利 ≈
          <b :class="grossProfitCents >= 0 ? 'pos' : 'neg'">¥{{ formatCents(grossProfitCents) }}</b>
        </div>
      </template>

      <!-- 类目 -->
      <div class="field-label">选个类目</div>
      <div class="chips">
        <button
          v-for="c in flowCategories"
          :key="c.id"
          class="chip"
          :class="{ active: categoryId === c.id }"
          @click="categoryId = c.id"
        >
          {{ c.name }}
        </button>
        <span v-if="!flowCategories.length" class="empty-hint">
          暂无{{ isIncome ? '收入' : '支出' }}类目，请先到「类目管理」添加
        </span>
      </div>

      <!-- 来源 + 备注/内容 -->
      <div class="row-two" :class="{ single: showProduct }">
        <div class="mini-field">
          <div class="field-label">来源平台</div>
          <el-select v-model="platformId" clearable placeholder="可选" style="width: 100%">
            <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </div>
        <div v-if="!showProduct" class="mini-field">
          <div class="field-label">备注</div>
          <el-input v-model="remark" placeholder="可选" />
        </div>
      </div>
      <div v-if="showProduct" class="content-field">
        <div class="field-label">内容</div>
        <RichTextEditor v-model="remark" placeholder="商品内容 / 账号 / 订单详情…（支持加粗、列表、颜色）" />
      </div>

      <!-- 操作 -->
      <div class="actions">
        <el-button size="large" :loading="saving" @click="save(false)">保存</el-button>
        <el-button size="large" type="primary" :loading="saving" @click="save(true)">
          保存并继续
        </el-button>
      </div>
      <div class="foot-hint">
        <span>Enter 连续记 · E 支出 · I 收入</span>
        <span v-if="savedCount" class="saved-badge">本次已记 {{ savedCount }} 笔</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-wrap {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
.receipt {
  width: 100%;
  max-width: 540px;
  background: #f0e9d5;
  border: 1px solid #d8cba9;
  border-radius: 4px;
  box-shadow: 0 1px 0 #fff inset, 0 18px 42px -24px rgba(70, 50, 25, 0.45);
  padding: 22px 30px 22px;
  position: relative;
  transition: box-shadow 0.3s, transform 0.3s;
}
.receipt::before {
  /* 凭证顶线：支出红 / 收入蓝（账簿红蓝双色） */
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--terra);
  transition: background 0.3s;
}
.receipt.is-income::before {
  background: #2f5d7c;
}
/* 凭证抬头 */
.voucher-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1.5px solid #2a2418;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.vh-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 4px;
  color: #2a2418;
}
.vh-sub {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 3px;
  color: var(--terra);
}
.receipt.is-saved {
  animation: saved-pulse 0.7s ease;
}
@keyframes saved-pulse {
  0% {
    box-shadow: var(--shadow);
  }
  35% {
    box-shadow: 0 0 0 4px var(--income-tint), var(--shadow-lg);
    transform: translateY(-2px);
  }
  100% {
    box-shadow: var(--shadow);
  }
}

/* 收支切换 */
.flow-toggle {
  display: flex;
  gap: 3px;
  background: #e2d8be;
  border-radius: 3px;
  padding: 3px;
  width: fit-content;
  margin: 4px auto 4px;
}
.flow-toggle button {
  border: none;
  background: transparent;
  padding: 8px 28px;
  border-radius: 2px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #6f6450;
  cursor: pointer;
  transition: all 0.2s;
}
.flow-toggle button.on {
  background: #f6f0df;
  box-shadow: 0 1px 2px rgba(70, 50, 25, 0.2);
  color: #2a2418;
}

/* 金额舞台 */
.amount-stage {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  padding: 18px 0 10px;
  color: v-bind("isIncome ? '#2f5d7c' : '#b9472f'");
}
.cny {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
}
.amount-field {
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: var(--font-display);
  font-size: 60px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  width: 100%;
  max-width: 320px;
  text-align: left;
}
.amount-field::placeholder {
  color: color-mix(in srgb, currentColor 28%, transparent);
}
.stage-rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--line), transparent);
  margin: 2px 0 18px;
}

.field-label {
  font-size: 13px;
  color: var(--ink-soft);
  margin: 14px 0 9px;
  font-weight: 500;
}

/* 类目 chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.chip {
  border: 1px solid #c9bb9c;
  background: #f6f0df;
  color: #5b5142;
  padding: 8px 16px;
  border-radius: 3px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}
.chip:hover {
  border-color: var(--terra);
  color: var(--terra-deep);
}
.chip:active {
  transform: scale(0.96);
}
.chip.active {
  background: var(--terra);
  border-color: var(--terra-deep);
  color: #f3ecd8;
  box-shadow: none;
}
.empty-hint {
  color: var(--ink-faint);
  font-size: 13px;
}
.prod-row {
  display: flex;
  gap: 10px;
  align-items: center;
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
  padding: 8px 0;
  text-align: center;
  color: var(--ink-faint);
}
.qprofit {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ink-soft);
}
.qprofit b {
  font-family: var(--font-display);
  font-size: 15px;
}
.qprofit .pos {
  color: var(--income);
}
.qprofit .neg {
  color: var(--expense);
}

.row-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.row-two.single {
  grid-template-columns: 1fr;
}
.content-field {
  margin-top: 14px;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.actions .el-button {
  flex: 1;
}
.foot-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 12px;
  color: var(--ink-faint);
}
.saved-badge {
  color: var(--income);
  font-weight: 600;
}

@media (max-width: 560px) {
  .amount-field {
    font-size: 46px;
  }
  .row-two {
    grid-template-columns: 1fr;
  }
}
</style>
