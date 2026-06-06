/**
 * Axios 实例 —— 统一 baseURL、注入 JWT 令牌、统一错误提示、401 跳登录。
 */
import axios, { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';

export const TOKEN_KEY = 'ul_token';

export const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截：附带 Bearer 令牌
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ApiErrorBody {
  error?: { code: string; message: string };
}

// 响应拦截：错误提示；401 清除令牌并跳转登录
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiErrorBody>) => {
    const status = err.response?.status;
    const code = err.response?.data?.error?.code;
    const msg = err.response?.data?.error?.message ?? err.message ?? '请求失败';

    if (status === 401 && code === 'UNAUTHORIZED') {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.hash.startsWith('#/login')) {
        location.hash = '#/login';
      }
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  },
);
