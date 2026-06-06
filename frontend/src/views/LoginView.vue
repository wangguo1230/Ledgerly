<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const displayName = ref('');
const loading = ref(false);

const isLogin = computed(() => mode.value === 'login');
const title = computed(() => (isLogin.value ? '欢迎回来' : '创建账号'));
const cta = computed(() => (isLogin.value ? '登录' : '注册并开始记账'));

function switchMode() {
  mode.value = isLogin.value ? 'register' : 'login';
}

async function submit() {
  const u = username.value.trim();
  if (u.length < 3) return ElMessage.warning('用户名至少 3 个字符');
  if (password.value.length < 6) return ElMessage.warning('密码至少 6 位');
  loading.value = true;
  try {
    if (isLogin.value) {
      await auth.login(u, password.value);
    } else {
      await auth.register(u, password.value, displayName.value.trim() || undefined);
    }
    const redirect = (route.query.redirect as string) || '/dashboard';
    router.push(redirect);
  } catch {
    /* 错误提示已由拦截器处理 */
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card ul-rise">
      <div class="brand">
        <span class="brand-badge">¥</span>
        <div class="brand-text">
          <div class="brand-name">松松记账</div>
          <div class="brand-sub">把每一笔都理清楚</div>
        </div>
      </div>

      <h1 class="auth-title">{{ title }}</h1>
      <p class="auth-hint">
        {{ isLogin ? '登录后查看你的账本' : '注册即送一个默认账本，随手就能记' }}
      </p>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">用户名</span>
          <el-input v-model="username" size="large" placeholder="3 个字符以上" autocomplete="username" />
        </label>
        <label v-if="!isLogin" class="field">
          <span class="field-label">昵称（可选）</span>
          <el-input v-model="displayName" size="large" placeholder="怎么称呼你" />
        </label>
        <label class="field">
          <span class="field-label">密码</span>
          <el-input
            v-model="password"
            type="password"
            size="large"
            show-password
            placeholder="6 位以上"
            :autocomplete="isLogin ? 'current-password' : 'new-password'"
            @keyup.enter="submit"
          />
        </label>

        <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="submit">
          {{ cta }}
        </el-button>
      </form>

      <div class="switch-row">
        <span>{{ isLogin ? '还没有账号？' : '已经有账号了？' }}</span>
        <a class="switch-link" @click="switchMode">{{ isLogin ? '去注册' : '去登录' }}</a>
      </div>
    </div>

    <p class="foot-note">数据按账号隔离 · 仅你自己可见</p>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
  background-color: var(--desk);
  background-image:
    radial-gradient(140% 90% at 100% 0%, rgba(90, 70, 40, 0.1), transparent 55%),
    radial-gradient(120% 80% at 0% 100%, rgba(70, 50, 25, 0.08), transparent 55%);
}
.auth-card {
  width: 100%;
  max-width: 408px;
  background: #f0e9d5;
  border: 1px solid #d8cba9;
  border-top: 3px solid var(--terra);
  border-radius: 4px;
  box-shadow: 0 1px 0 #fff inset, 0 26px 56px -26px rgba(70, 50, 25, 0.55);
  padding: 32px 36px 28px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 26px;
}
.brand-badge {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: var(--terra);
  color: #f3ecd8;
  font-family: var(--font-display);
  font-size: 25px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.25);
}
.brand-name {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
}
.brand-sub {
  font-size: 12px;
  color: var(--ink-faint);
}
.auth-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 6px;
}
.auth-hint {
  color: var(--ink-soft);
  font-size: 14px;
  margin: 0 0 22px;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.field-label {
  font-size: 13px;
  color: var(--ink-soft);
  font-weight: 500;
}
.submit-btn {
  margin-top: 8px;
  height: 46px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  border-radius: 3px;
}
.switch-row {
  margin-top: 18px;
  text-align: center;
  font-size: 14px;
  color: var(--ink-soft);
}
.switch-link {
  color: var(--terra);
  font-weight: 600;
  cursor: pointer;
  margin-left: 4px;
}
.foot-note {
  color: var(--ink-faint);
  font-size: 12px;
  margin: 0;
}
</style>
