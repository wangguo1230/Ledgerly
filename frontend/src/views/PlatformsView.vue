<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { accountApi, platformApi, transferApi } from '@/api';
import type { AccountBalance, Transfer } from '@/api/types';
import { now } from '@/utils/date';
import AmountText from '@/components/AmountText.vue';
import AmountInput from '@/components/AmountInput.vue';

const accounts = ref<AccountBalance[]>([]);
const transfers = ref<Transfer[]>([]);
const loading = ref(false);

const totalBalance = computed(() => accounts.value.reduce((s, a) => s + a.balance, 0));

async function load() {
  loading.value = true;
  try {
    [accounts.value, transfers.value] = await Promise.all([accountApi.balances(), transferApi.list()]);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function nameOf(id: number) {
  return accounts.value.find((a) => a.id === id)?.name ?? '—';
}

// —— 账户增改 ——
const acctDlg = ref(false);
const editingId = ref<number | null>(null);
const acctForm = reactive<{ name: string; initial_balance: number | null }>({
  name: '',
  initial_balance: 0,
});
function openCreateAcct() {
  editingId.value = null;
  Object.assign(acctForm, { name: '', initial_balance: 0 });
  acctDlg.value = true;
}
function openEditAcct(a: AccountBalance) {
  editingId.value = a.id;
  Object.assign(acctForm, { name: a.name, initial_balance: a.initial_balance });
  acctDlg.value = true;
}
async function submitAcct() {
  if (!acctForm.name.trim()) return ElMessage.warning('请输入账户名称');
  const data = { name: acctForm.name, initial_balance: acctForm.initial_balance ?? 0 };
  if (editingId.value) {
    await platformApi.update(editingId.value, data);
    ElMessage.success('已更新');
  } else {
    await platformApi.create(data);
    ElMessage.success('已新增');
  }
  acctDlg.value = false;
  load();
}
async function removeAcct(a: AccountBalance) {
  await ElMessageBox.confirm(`确定删除账户「${a.name}」？该账户相关的转账记录也会删除。`, '提示', {
    type: 'warning',
  });
  await platformApi.remove(a.id);
  ElMessage.success('已删除');
  load();
}

// —— 转账 ——
const transferDlg = ref(false);
const tForm = reactive<{
  from_platform_id: number | null;
  to_platform_id: number | null;
  amount: number | null;
  occurred_at: string;
  remark: string;
}>({ from_platform_id: null, to_platform_id: null, amount: null, occurred_at: now(), remark: '' });

function openTransfer() {
  Object.assign(tForm, {
    from_platform_id: null,
    to_platform_id: null,
    amount: null,
    occurred_at: now(),
    remark: '',
  });
  transferDlg.value = true;
}
async function submitTransfer() {
  if (!tForm.from_platform_id || !tForm.to_platform_id)
    return ElMessage.warning('请选择转出/转入账户');
  if (tForm.from_platform_id === tForm.to_platform_id)
    return ElMessage.warning('转出与转入账户不能相同');
  if (tForm.amount == null || tForm.amount <= 0) return ElMessage.warning('请输入转账金额');
  await transferApi.create({
    from_platform_id: tForm.from_platform_id,
    to_platform_id: tForm.to_platform_id,
    amount: tForm.amount,
    occurred_at: tForm.occurred_at,
    remark: tForm.remark || null,
  });
  ElMessage.success('转账已记录');
  transferDlg.value = false;
  load();
}
async function removeTransfer(t: Transfer) {
  await ElMessageBox.confirm('确定删除这笔转账？', '提示', { type: 'warning' });
  await transferApi.remove(t.id);
  ElMessage.success('已删除');
  load();
}
</script>

<template>
  <div v-loading="loading" class="sheet">
    <div class="page-head">账户 · 余额</div>

    <div class="toolbar">
      <span class="total-tag">
        总余额 <AmountText :cents="totalBalance" variant="balance" class="total-num" />
      </span>
      <span class="hint">余额 = 期初 + 收入 − 支出 + 转入 − 转出（按你的真实钱包，跨账本汇总）</span>
      <div class="flex-spacer" />
      <el-button @click="openTransfer">记一笔转账</el-button>
      <el-button type="primary" @click="openCreateAcct">新增账户</el-button>
    </div>

    <el-table :data="accounts" stripe>
      <el-table-column prop="name" label="账户" min-width="140" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.is_system ? 'info' : 'success'" effect="plain">
            {{ row.is_system ? '系统预置' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="期初余额" width="140" align="right">
        <template #default="{ row }"><AmountText :cents="row.initial_balance" /></template>
      </el-table-column>
      <el-table-column label="当前余额" width="160" align="right">
        <template #default="{ row }">
          <AmountText :cents="row.balance" variant="balance" class="bal" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditAcct(row)">编辑</el-button>
          <el-button link type="danger" :disabled="!!row.is_system" @click="removeAcct(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 转账记录 -->
    <div class="sub-head">转账记录</div>
    <el-table v-if="transfers.length" :data="transfers" stripe>
      <el-table-column prop="occurred_at" label="时间" width="160" />
      <el-table-column label="从 → 到" min-width="200">
        <template #default="{ row }">
          <span class="tf-from">{{ nameOf(row.from_platform_id) }}</span>
          <span class="tf-arrow">→</span>
          <span class="tf-to">{{ nameOf(row.to_platform_id) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }"><AmountText :cents="row.amount" /></template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="removeTransfer(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else :image-size="70" description="还没有转账记录" />

    <!-- 账户增改弹窗 -->
    <el-dialog v-model="acctDlg" :title="editingId ? '编辑账户' : '新增账户'" width="380px">
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="acctForm.name" maxlength="20" placeholder="如：微信 / 支付宝 / 银行卡" />
        </el-form-item>
        <el-form-item label="期初余额">
          <AmountInput v-model="acctForm.initial_balance" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="acctDlg = false">取消</el-button>
        <el-button type="primary" @click="submitAcct">保存</el-button>
      </template>
    </el-dialog>

    <!-- 转账弹窗 -->
    <el-dialog v-model="transferDlg" title="记一笔转账" width="420px">
      <el-form label-width="80px">
        <el-form-item label="从账户" required>
          <el-select v-model="tForm.from_platform_id" placeholder="转出账户" style="width: 100%">
            <el-option v-for="a in accounts" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="到账户" required>
          <el-select v-model="tForm.to_platform_id" placeholder="转入账户" style="width: 100%">
            <el-option v-for="a in accounts" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" required>
          <AmountInput v-model="tForm.amount" />
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="tForm.occurred_at"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="tForm.remark" placeholder="可选（如：微信提现到银行卡）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDlg = false">取消</el-button>
        <el-button type="primary" @click="submitTransfer">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.total-tag {
  font-size: 14px;
  color: var(--ink-soft);
}
.total-num {
  font-size: 18px;
  margin-left: 4px;
}
.hint {
  font-size: 12px;
  color: var(--ink-faint);
  margin-left: 12px;
}
.bal {
  font-size: 16px;
  font-weight: 600;
}
.sub-head {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #2a2418;
  border-bottom: 1.5px solid #2a2418;
  padding-bottom: 8px;
  margin: 26px 0 12px;
}
.tf-arrow {
  margin: 0 10px;
  color: var(--terra);
  font-weight: 700;
}
</style>
