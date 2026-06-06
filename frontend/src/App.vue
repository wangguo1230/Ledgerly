<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
// 启动时校验既有令牌（失效则自动登出）
onMounted(() => auth.restore());
</script>

<template>
  <router-view />
</template>
