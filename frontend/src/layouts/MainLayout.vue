<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLedgerStore } from '@/stores/ledger';
import { useAuthStore } from '@/stores/auth';
import { ElMessageBox } from 'element-plus';
import {
  Odometer,
  Plus,
  List,
  Collection,
  TrendCharts,
  Goods,
  Money,
  Wallet,
  Notebook,
  ArrowDown,
} from '@element-plus/icons-vue';

const store = useLedgerStore();
const auth = useAuthStore();
const { ledgers, currentId, current, isBusiness } = storeToRefs(store);
const { user } = storeToRefs(auth);
const route = useRoute();
const router = useRouter();

onMounted(() => store.load());

async function logout() {
  await ElMessageBox.confirm('确定退出登录？', '提示', { type: 'warning' });
  auth.logout();
  router.push('/login');
}

const userInitial = computed(() => (user.value?.username ?? '?').charAt(0).toUpperCase());

interface NavItem {
  index: string;
  title: string;
  icon: unknown;
  business?: boolean;
}

const navItems: NavItem[] = [
  { index: '/dashboard', title: '总览', icon: Odometer },
  { index: '/quick', title: '快捷记账', icon: Plus },
  { index: '/transactions', title: '账目明细', icon: List },
  { index: '/categories', title: '类目管理', icon: Collection },
  { index: '/products', title: '商品管理', icon: Goods, business: true },
  { index: '/profit', title: '利润核算', icon: Money, business: true },
  { index: '/reports', title: '报表', icon: TrendCharts },
  { index: '/platforms', title: '来源平台', icon: Wallet },
  { index: '/ledgers', title: '账本管理', icon: Notebook },
];

const visibleNav = computed(() => navItems.filter((n) => !n.business || isBusiness.value));
const activeIndex = computed(() => route.path);
const pageTitle = computed(() => (route.meta.title as string) ?? '');

function onSelect(index: string) {
  router.push(index);
}

const CN_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'];
function ordinal(i: number): string {
  return CN_ORD[i] ?? String(i + 1);
}
function onLedgerCommand(cmd: number | string) {
  if (cmd === '__new__') {
    router.push('/ledgers');
    return;
  }
  store.switchLedger(cmd as number);
  if (route.meta.business && !isBusiness.value) router.push('/dashboard');
}
</script>

<template>
  <div class="shell">
    <!-- 侧栏：账册目录 -->
    <aside class="toc">
      <div class="cover-label">
        <div class="cover-name">松松记账</div>
        <div class="cover-sub">流水账 · 目录</div>
      </div>
      <nav class="toc-list">
        <a
          v-for="(item, i) in visibleNav"
          :key="item.index"
          class="toc-item"
          :class="{ active: activeIndex === item.index }"
          @click="onSelect(item.index)"
        >
          <span class="toc-ord">{{ ordinal(i) }}</span>
          <span class="toc-name">{{ item.title }}</span>
          <span class="toc-dots" />
          <span class="toc-page num">{{ i + 1 }}</span>
        </a>
      </nav>
      <div class="toc-foot"><span class="dot" /> 数据存于本地 · {{ ledgers.length }} 本</div>
    </aside>

    <!-- 主区 -->
    <div class="main-col">
      <header class="topbar">
        <h1 class="topbar-title"><span class="title-mark" />{{ pageTitle }}</h1>
        <div class="flex-spacer" />
        <el-button class="ink-btn" type="primary" :icon="Plus" @click="router.push('/quick')">
          记一笔
        </el-button>
        <el-dropdown trigger="click" @command="onLedgerCommand">
          <span class="ledger-switcher">
            <span class="ledger-kind" :class="isBusiness ? 'is-biz' : 'is-personal'">
              {{ isBusiness ? '生意' : '个人' }}
            </span>
            <span class="ledger-name">{{ current?.name ?? '加载中…' }}</span>
            <el-icon class="ledger-caret"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="lg in ledgers"
                :key="lg.id"
                :command="lg.id"
                :disabled="lg.id === currentId"
              >
                {{ lg.name }}（{{ lg.type === 'business' ? '生意' : '个人' }}）
              </el-dropdown-item>
              <el-dropdown-item divided command="__new__">
                ＋ 新建账本（生意账本可管商品 / 利润）
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-dropdown trigger="click" @command="(cmd: string) => cmd === 'logout' && logout()">
          <span class="user-chip">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-name">{{ user?.username }}</span>
            <el-icon class="ledger-caret"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="content">
        <router-view v-if="current" v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" :key="currentId ?? 0" />
          </transition>
        </router-view>
        <el-empty v-else description="正在打开账本…" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
}

/* —— 侧栏：账册目录页 —— */
.toc {
  --toc-ink: #2a2418;
  --toc-red: #b9472f;
  --toc-rule: #c9bb9c;
  width: 244px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 26px 22px 16px 26px;
  color: var(--toc-ink);
  background: #ebe2cb;
  background-image: radial-gradient(120% 80% at 0% 0%, rgba(160, 120, 60, 0.05), transparent 60%);
  border-right: 2px solid var(--toc-red);
  box-shadow: inset -10px 0 18px -14px rgba(70, 50, 25, 0.45);
}

/* 封面贴标 */
.cover-label {
  border: 1.5px solid var(--toc-ink);
  border-radius: 3px;
  padding: 12px 10px;
  text-align: center;
  background: #f3ecd8;
  box-shadow: 0 1px 0 #fff inset, 0 3px 8px -5px rgba(70, 50, 25, 0.5);
  margin-bottom: 22px;
}
.cover-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 4px;
}
.cover-sub {
  margin-top: 3px;
  font-size: 12px;
  letter-spacing: 3px;
  color: #6f6450;
}

/* 目录条目 */
.toc-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toc-item {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 9px 6px 9px 8px;
  cursor: pointer;
  color: var(--toc-ink);
  transition: color 0.15s;
}
.toc-ord {
  font-family: var(--font-display);
  font-size: 13px;
  color: #8a7f6c;
  width: 22px;
  flex-shrink: 0;
}
.toc-name {
  font-size: 15.5px;
  letter-spacing: 1px;
  white-space: nowrap;
}
.toc-dots {
  flex: 1;
  border-bottom: 1.5px dotted #bcae8d;
  transform: translateY(-4px);
  min-width: 14px;
}
.toc-page {
  font-size: 13px;
  color: #8a7f6c;
  flex-shrink: 0;
}
.toc-item:hover .toc-name {
  color: var(--toc-red);
}

/* 当前页：红书签丝带 + 墨线加粗 */
.toc-item.active .toc-name {
  color: var(--toc-red);
  font-weight: 700;
}
.toc-item.active .toc-page {
  color: var(--toc-red);
}
.toc-item.active::before {
  content: '';
  position: absolute;
  left: -26px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 30px;
  background: var(--toc-red);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 74%, 0 100%);
  box-shadow: 1px 1px 2px rgba(70, 30, 20, 0.35);
}

.toc-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1.5px solid var(--toc-rule);
  font-size: 12px;
  color: #8a7f6c;
  display: flex;
  align-items: center;
  gap: 6px;
}
.toc-foot .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2f5d7c;
  box-shadow: 0 0 0 3px rgba(47, 93, 124, 0.18);
}

/* —— 主区 —— */
.main-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* 页眉：账册书眉 */
.topbar {
  height: 66px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 28px;
  background: #e8dfc6;
  border-bottom: 2px solid var(--terra);
}
.topbar-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 4px;
  color: #2a2418;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-mark {
  width: 9px;
  height: 18px;
  background: var(--terra);
  display: inline-block;
}
/* 记一笔：红印按钮（方正、无圆软） */
.ink-btn.el-button {
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 2px;
  box-shadow: none;
  border: 1px solid var(--terra-deep);
}
/* 账本切换：墨色标签 */
.ledger-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 11px 6px 7px;
  border-radius: 3px;
  background: #f3ecd8;
  border: 1px solid #c9bb9c;
  outline: none;
  transition: border-color 0.2s;
}
.ledger-switcher:hover {
  border-color: var(--terra);
}
.ledger-kind {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 2px;
  letter-spacing: 1px;
}
.ledger-kind.is-personal {
  color: #fff;
  background: #2f5d7c;
}
.ledger-kind.is-biz {
  color: #fff;
  background: var(--terra);
}
.ledger-name {
  font-weight: 600;
  color: #2a2418;
  letter-spacing: 1px;
}
.ledger-caret {
  color: #8a7f6c;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  padding: 5px 10px 5px 5px;
  border-radius: 3px;
  outline: none;
  transition: background 0.2s;
}
.user-chip:hover {
  background: rgba(185, 71, 47, 0.08);
}
/* 用户：红印章式 */
.user-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--terra);
  color: #f3ecd8;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.user-name {
  font-weight: 500;
  color: #2a2418;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 内容：书桌台面，账页摊放其上 */
.content {
  flex: 1;
  overflow-y: auto;
  padding: 30px 32px 44px;
  background-color: var(--desk);
  background-image:
    radial-gradient(140% 90% at 100% 0%, rgba(90, 70, 40, 0.08), transparent 55%),
    radial-gradient(120% 80% at 0% 100%, rgba(70, 50, 25, 0.06), transparent 55%);
}

/* —— 页面切换动效 —— */
.page-enter-active {
  transition: all 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.page-leave-active {
  transition: all 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.page-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .toc {
    width: 188px;
    padding: 18px 12px 14px 16px;
  }
  .toc-ord,
  .toc-page {
    display: none;
  }
  .toc-dots {
    display: none;
  }
}
</style>
