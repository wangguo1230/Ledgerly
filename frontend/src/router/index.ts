import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useLedgerStore } from '@/stores/ledger';
import MainLayout from '@/layouts/MainLayout.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: MainLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '总览' } },
      { path: 'quick', name: 'quick', component: () => import('@/views/QuickEntryView.vue'), meta: { title: '快捷记账' } },
      { path: 'transactions', name: 'transactions', component: () => import('@/views/TransactionsView.vue'), meta: { title: '账目明细' } },
      { path: 'categories', name: 'categories', component: () => import('@/views/CategoriesView.vue'), meta: { title: '类目管理' } },
      { path: 'reports', name: 'reports', component: () => import('@/views/ReportsView.vue'), meta: { title: '报表' } },
      { path: 'products', name: 'products', component: () => import('@/views/ProductsView.vue'), meta: { title: '商品管理', business: true } },
      { path: 'profit', name: 'profit', component: () => import('@/views/ProfitView.vue'), meta: { title: '利润核算', business: true } },
      { path: 'platforms', name: 'platforms', component: () => import('@/views/PlatformsView.vue'), meta: { title: '来源平台' } },
      { path: 'ledgers', name: 'ledgers', component: () => import('@/views/LedgersView.vue'), meta: { title: '账本管理' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  // 未登录访问受保护页 → 去登录
  if (!to.meta.public && !auth.isAuthed) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined };
  }
  // 已登录访问登录页 → 回总览
  if (to.meta.public && auth.isAuthed) {
    return { name: 'dashboard' };
  }
  // 生意专属页在个人账本下重定向
  if (to.meta.business) {
    const ledger = useLedgerStore();
    if (ledger.current && !ledger.isBusiness) return { name: 'dashboard' };
  }
  return true;
});
