/**
 * 鉴权 store —— 令牌 + 当前用户；登录/注册/登出/会话恢复。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';
import { TOKEN_KEY } from '@/api/http';
import type { User } from '@/api/types';

const USER_KEY = 'ul_user';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<User | null>(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));

  const isAuthed = computed(() => !!token.value);

  function persist(t: string, u: User) {
    token.value = t;
    user.value = u;
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }

  async function login(username: string, password: string) {
    const res = await authApi.login({ username, password });
    persist(res.token, res.user);
  }

  async function register(username: string, password: string, displayName?: string) {
    const res = await authApi.register({ username, password, display_name: displayName || null });
    persist(res.token, res.user);
  }

  /** 应用启动时校验既有令牌是否仍有效 */
  async function restore() {
    if (!token.value) return;
    try {
      user.value = await authApi.me();
      localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    } catch {
      logout();
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return { token, user, isAuthed, login, register, restore, logout };
});
