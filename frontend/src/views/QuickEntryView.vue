<script setup lang="ts">
/**
 * 快捷记账 —— 目标 10 秒一笔：选收支 → 输金额 → 点类目 → 保存。
 * 快捷键：Enter 保存并继续；E 切支出；I 切收入。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessage } from 'element-plus';
import { useLedgerStore } from '@/stores/ledger';
import { categoryApi, platformApi, productApi, transactionApi, transferApi } from '@/api';
import type { Category, FlowType, Product, SourcePlatform } from '@/api/types';
import { yuanToCents, centsToYuan, formatCents } from '@/utils/money';
import { now } from '@/utils/date';
import RichTextEditor from '@/components/RichTextEditor.vue';
import AmountInput from '@/components/AmountInput.vue';

const store = useLedgerStore();
const { currentId, isBusiness } = storeToRefs(store);

const flow = ref<FlowType>('income');
const transferMode = ref(false); // 转账模式
const transferFrom = ref<number | null>(null);
const transferTo = ref<number | null>(null);
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
// 数字=已有商品 id；字符串=临时新建的商品名
const productSel = ref<number | string | null>(null);
const quantity = ref(1);
const cost = ref<number | null>(null); // 本笔成本(单价，分)
const saveAsProduct = ref(false); // 临时商品是否存进商品库

const flowCategories = computed(() => categories.value.filter((c) => c.flow_type === flow.value));

// 仅生意账本的收入才显示「商品」
const showProduct = computed(() => isBusiness.value && flow.value === 'income');
const selectedProduct = computed(() =>
  typeof productSel.value === 'number'
    ? products.value.find((p) => p.id === productSel.value) ?? null
    : null,
);
const isAdhoc = computed(
  () => typeof productSel.value === 'string' && productSel.value.trim() !== '',
);
const hasItem = computed(() => selectedProduct.value != null || isAdhoc.value);

const grossProfitCents = computed(() => {
  if (!hasItem.value) return null;
  const unitCost = cost.value ?? selectedProduct.value?.cost_price ?? null;
  if (unitCost == null) return null;
  let cents = 0;
  try {
    cents = yuanToCents(amountText.value);
  } catch {
    return null;
  }
  return cents - unitCost * quantity.value;
});

function onProductChange() {
  saveAsProduct.value = false;
  if (productSel.value == null || productSel.value === '') {
    cost.value = null;
    return;
  }
  if (quantity.value < 1) quantity.value = 1;
  if (selectedProduct.value) {
    // 选了已有商品：自动带出成本与售价
    cost.value = selectedProduct.value.cost_price;
    fillFromProduct();
  }
  // 临时新建：成本/金额由用户自己填
}
function onQtyChange() {
  if (selectedProduct.value) fillFromProduct();
}
function fillFromProduct() {
  const p = selectedProduct.value;
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
    productSel.value = null;
    quantity.value = 1;
    cost.value = null;
    saveAsProduct.value = false;
  }
});

function setFlow(f: FlowType) {
  flow.value = f;
}
function pickMode(m: 'expense' | 'income' | 'transfer') {
  if (m === 'transfer') {
    transferMode.value = true;
  } else {
    transferMode.value = false;
    setFlow(m);
  }
}

async function saveTransfer() {
  if (!currentId.value) return;
  if (!transferFrom.value || !transferTo.value)
    return ElMessage.warning('请选择转出 / 转入账户');
  if (transferFrom.value === transferTo.value)
    return ElMessage.warning('转出与转入账户不能相同');
  let cents: number;
  try {
    cents = yuanToCents(amountText.value);
  } catch {
    return ElMessage.warning('请输入正确金额');
  }
  if (cents <= 0) return ElMessage.warning('金额需大于 0');
  saving.value = true;
  try {
    await transferApi.create({
      from_platform_id: transferFrom.value,
      to_platform_id: transferTo.value,
      amount: cents,
      occurred_at: now(),
      remark: remark.value || null,
    });
    savedCount.value += 1;
    justSaved.value = true;
    setTimeout(() => (justSaved.value = false), 700);
    amountText.value = '';
    remark.value = '';
    focusAmount();
  } finally {
    saving.value = false;
  }
}

async function save(continueAfter: boolean) {
  if (transferMode.value) return saveTransfer();
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
    let productId: number | null = typeof productSel.value === 'number' ? productSel.value : null;
    let itemName: string | null = isAdhoc.value ? (productSel.value as string).trim() : null;
    // 可选：把临时商品存进商品库并改为关联
    if (showProduct.value && isAdhoc.value && saveAsProduct.value && itemName) {
      try {
        const created = await productApi.create({
          ledger_id: currentId.value,
          name: itemName,
          cost_price: cost.value ?? 0,
          sale_price: cents,
        });
        products.value.push(created);
        productId = created.id;
        itemName = null;
      } catch {
        /* 创建失败则仍按临时项记账 */
      }
    }
    const linkItem = showProduct.value && hasItem.value;
    await transactionApi.create({
      ledger_id: currentId.value,
      flow_type: flow.value,
      amount: cents,
      category_id: categoryId.value,
      product_id: linkItem ? productId : null,
      item_name: linkItem ? itemName : null,
      quantity: linkItem ? quantity.value : null,
      cost_snapshot: linkItem ? cost.value : null,
      source_platform_id: platformId.value,
      occurred_at: now(),
      remark: remark.value || null,
    });
    savedCount.value += 1;
    justSaved.value = true;
    setTimeout(() => (justSaved.value = false), 700);
    amountText.value = '';
    remark.value = '';
    productSel.value = null;
    quantity.value = 1;
    cost.value = null;
    saveAsProduct.value = false;
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
    pickMode('expense');
  } else if (!typing && (e.key === 'i' || e.key === 'I')) {
    pickMode('income');
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
    <div
      class="receipt"
      :class="{ 'is-saved': justSaved, 'is-income': isIncome && !transferMode, 'is-transfer': transferMode }"
    >
      <div class="voucher-head">
        <span class="vh-title">记 账 凭 证</span>
        <span class="vh-sub">{{ transferMode ? '转 账' : isIncome ? '收 入' : '支 出' }}</span>
      </div>
      <!-- 收支 / 转账切换 -->
      <div class="flow-toggle">
        <button :class="{ on: !transferMode && !isIncome }" @click="pickMode('expense')">支出</button>
        <button :class="{ on: !transferMode && isIncome }" @click="pickMode('income')">收入</button>
        <button :class="{ on: transferMode }" @click="pickMode('transfer')">转账</button>
      </div>

      <!-- 转账：从账户 → 到账户 -->
      <div v-if="transferMode" class="transfer-row">
        <el-select v-model="transferFrom" placeholder="从账户" style="flex: 1">
          <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <span class="tf-arrow">→</span>
        <el-select v-model="transferTo" placeholder="到账户" style="flex: 1">
          <el-option v-for="p in platforms" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
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

      <!-- 转账：备注 -->
      <template v-if="transferMode">
        <div class="field-label">备注</div>
        <el-input v-model="remark" placeholder="可选（如：微信提现到银行卡）" />
      </template>

      <!-- 商品（选已有 或 直接打字新建临时商品）：填成本即算毛利 -->
      <template v-if="!transferMode && showProduct">
        <div class="field-label">商品（选已有 · 或直接打字新建 · 算利润可选）</div>
        <div class="prod-row">
          <el-select
            v-model="productSel"
            clearable
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="选商品，或直接输入临时商品名"
            style="flex: 1"
            @change="onProductChange"
          >
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id">
              <span class="opt-name">{{ p.name }}</span>
              <span class="opt-meta">售¥{{ formatCents(p.sale_price) }} · 成本¥{{ formatCents(p.cost_price) }}</span>
            </el-option>
          </el-select>
          <el-input-number
            v-if="hasItem"
            v-model="quantity"
            :min="1"
            style="width: 128px"
            @change="onQtyChange"
          />
        </div>
        <div v-if="hasItem" class="cost-line">
          <span class="cost-tag">本笔成本</span>
          <div class="cost-input"><AmountInput v-model="cost" /></div>
          <span class="cost-note">{{ selectedProduct ? '默认商品成本，可改成这批进价' : '填了才算利润' }}</span>
        </div>
        <el-checkbox v-if="isAdhoc" v-model="saveAsProduct" class="save-prod">
          把「{{ productSel }}」存进商品库，以后可复用
        </el-checkbox>
        <div v-if="grossProfitCents != null" class="qprofit">
          本笔毛利 ≈
          <b :class="grossProfitCents >= 0 ? 'pos' : 'neg'">¥{{ formatCents(grossProfitCents) }}</b>
        </div>
      </template>

      <template v-if="!transferMode">
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
      </template>

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
.receipt.is-transfer::before {
  background: #2a2418;
}
.transfer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 2px;
}
.transfer-row .tf-arrow {
  color: var(--terra);
  font-weight: 700;
  font-size: 18px;
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
  color: v-bind("transferMode ? '#2a2418' : isIncome ? '#2f5d7c' : '#b9472f'");
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
.cost-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.cost-tag {
  font-size: 13px;
  color: var(--ink-soft);
  flex-shrink: 0;
}
.cost-input {
  width: 140px;
  flex-shrink: 0;
}
.cost-note {
  font-size: 12px;
  color: var(--ink-faint);
}
.save-prod {
  margin-top: 8px;
  color: var(--ink-soft);
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
