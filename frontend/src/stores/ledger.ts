/**
 * 账本上下文 store —— 全局当前账本，切换会驱动所有页面数据失效重载。
 * 当前账本 id 持久化到 localStorage，刷新后保持。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ledgerApi } from '@/api';
import type { Ledger, LedgerType } from '@/api/types';

const STORAGE_KEY = 'ul_current_ledger_id';

export const useLedgerStore = defineStore('ledger', () => {
  const ledgers = ref<Ledger[]>([]);
  const currentId = ref<number | null>(null);
  const loading = ref(false);

  const current = computed<Ledger | null>(
    () => ledgers.value.find((l) => l.id === currentId.value) ?? null,
  );
  const isBusiness = computed(() => current.value?.type === 'business');

  async function load() {
    loading.value = true;
    try {
      ledgers.value = await ledgerApi.list();
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved && ledgers.value.some((l) => l.id === saved)) {
        currentId.value = saved;
      } else if (ledgers.value.length > 0) {
        // 失效的 saved（如账本已删除）回退到首个账本，并清理脏值
        switchLedger(ledgers.value[0].id);
      }
    } finally {
      loading.value = false;
    }
  }

  function switchLedger(id: number) {
    currentId.value = id;
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  async function createLedger(data: { name: string; type: LedgerType; remark?: string | null }) {
    const created = await ledgerApi.create(data);
    await load();
    switchLedger(created.id);
    return created;
  }

  async function refresh() {
    ledgers.value = await ledgerApi.list();
  }

  return {
    ledgers,
    currentId,
    current,
    isBusiness,
    loading,
    load,
    switchLedger,
    createLedger,
    refresh,
  };
});
