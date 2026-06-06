/**
 * 应用装配 —— Fastify + CORS + JWT 鉴权 + 限流 + 统一错误处理 + 路由。
 * 公网部署：JWT 密钥与允许的前端来源均来自环境变量。
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { Db } from './db/connection.js';
import { createContainer } from './container.js';
import { AppError } from './common/errors.js';
import { registerAuthRoutes } from './modules/user/auth.routes.js';
import { registerLedgerRoutes } from './modules/ledger/ledger.routes.js';
import { registerCategoryRoutes } from './modules/category/category.routes.js';
import { registerPlatformRoutes } from './modules/source-platform/source-platform.routes.js';
import { registerProductRoutes } from './modules/product/product.routes.js';
import { registerTransactionRoutes } from './modules/transaction/transaction.routes.js';
import { registerStatsRoutes } from './modules/stats/stats.routes.js';

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false });
  const c = createContainer(db);

  const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  if (JWT_SECRET === 'dev-insecure-secret-change-me' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  未设置 JWT_SECRET，正在使用不安全的默认密钥，生产环境务必配置！');
  }

  // CORS：公网部署时通过 ALLOWED_ORIGIN 限定前端域名（逗号分隔）
  const allowed = process.env.ALLOWED_ORIGIN;
  app.register(cors, { origin: allowed ? allowed.split(',').map((s) => s.trim()) : true });

  app.register(jwt, { secret: JWT_SECRET, sign: { expiresIn: '30d' } });
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // 鉴权装饰器：校验 JWT 并注入 req.userId
  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
      req.userId = req.user.id;
    } catch {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: '未登录或登录已过期' } });
    }
  });

  // 统一错误处理
  app.setErrorHandler((err, _req, reply) => {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      reply.status(429).send({ error: { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' } });
      return;
    }
    if (message.includes('SQLITE_CONSTRAINT') || message.includes('duplicate key')) {
      reply.status(409).send({ error: { code: 'CONSTRAINT', message: '违反数据约束' } });
      return;
    }
    app.log.error(err);
    reply.status(500).send({ error: { code: 'INTERNAL', message: message || '服务器内部错误' } });
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.register(
    async (api) => {
      // 公开：注册 / 登录 /（me 自带鉴权）
      registerAuthRoutes(api, c);

      // 受保护：以下全部需要登录，统一注入 req.userId
      api.register(async (secured) => {
        secured.addHook('preHandler', app.authenticate);
        registerLedgerRoutes(secured, c);
        registerCategoryRoutes(secured, c);
        registerPlatformRoutes(secured, c);
        registerProductRoutes(secured, c);
        registerTransactionRoutes(secured, c);
        registerStatsRoutes(secured, c);
      });
    },
    { prefix: '/api' },
  );

  return app;
}
