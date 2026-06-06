import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { freshApp } from './helpers.js';

describe('REST API 端到端（含鉴权）', () => {
  let app: FastifyInstance;
  let token = '';

  const auth = () => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await freshApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'tester', password: 'pw123456' },
    });
    token = res.json().token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('健康检查（公开）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('注册返回 token 与用户信息（不含密码）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'newbie', password: 'pw123456' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.username).toBe('newbie');
    expect(body.user.password_hash).toBeUndefined();
  });

  it('登录成功', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tester', password: 'pw123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });

  it('登录密码错误返回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tester', password: 'bad' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('未携带令牌访问受保护接口返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ledgers' });
    expect(res.statusCode).toBe(401);
  });

  it('/auth/me 返回当前用户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('tester');
  });

  it('完整记账流程：建账本→建类目→记账→统计', async () => {
    const ledgerRes = await app.inject({
      method: 'POST',
      url: '/api/ledgers',
      headers: auth(),
      payload: { name: '我的小店', type: 'business' },
    });
    expect(ledgerRes.statusCode).toBe(201);
    const ledger = ledgerRes.json();

    const catRes = await app.inject({
      method: 'POST',
      url: '/api/categories',
      headers: auth(),
      payload: { ledger_id: ledger.id, name: '卖货收入', flow_type: 'income' },
    });
    const cat = catRes.json();

    const txRes = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(),
      payload: {
        ledger_id: ledger.id,
        flow_type: 'income',
        amount: 8888,
        category_id: cat.id,
        occurred_at: '2026-06-06 12:00:00',
      },
    });
    expect(txRes.statusCode).toBe(201);

    const sumRes = await app.inject({
      method: 'GET',
      url: `/api/stats/summary?ledger_id=${ledger.id}`,
      headers: auth(),
    });
    expect(sumRes.json().income).toBe(8888);
  });

  it('跨用户越权访问返回 403', async () => {
    // 另一个用户
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'intruder', password: 'pw123456' },
    });
    const otherToken = reg.json().token;
    // tester 的默认个人账本 id=1
    const res = await app.inject({
      method: 'GET',
      url: '/api/ledgers/1',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('非法参数返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ledgers',
      headers: auth(),
      payload: { name: '', type: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('不存在资源返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ledgers/99999', headers: auth() });
    expect(res.statusCode).toBe(404);
  });
});
