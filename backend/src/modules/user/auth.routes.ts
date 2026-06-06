import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse } from '../../common/validation.js';

const credSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
const registerSchema = credSchema.extend({
  display_name: z.string().nullable().optional(),
});

export function registerAuthRoutes(app: FastifyInstance, c: Container): void {
  // 注册/登录加严格限流，防止公网爆破
  const authLimit = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };

  app.post('/auth/register', authLimit, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const user = await c.user.register(body);
    const token = await reply.jwtSign({ id: user.id, username: user.username });
    reply.status(201);
    return { token, user };
  });

  app.post('/auth/login', authLimit, async (req, reply) => {
    const body = parse(credSchema, req.body);
    const user = await c.user.authenticate(body.username, body.password);
    const token = await reply.jwtSign({ id: user.id, username: user.username });
    return { token, user };
  });

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await c.user.getPublic(req.userId);
    return { user };
  });
}
