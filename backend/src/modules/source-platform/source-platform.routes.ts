import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId } from '../../common/validation.js';

const createSchema = z.object({
  name: z.string().min(1),
  icon: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
  initial_balance: z.coerce.number().int().optional(), // 期初余额（分，可负=负债）
});
const updateSchema = createSchema.partial();

export function registerPlatformRoutes(app: FastifyInstance, c: Container): void {
  app.get('/platforms', async (req) => c.platform.list(req.userId));

  // 账户余额（= 来源平台 + 当前余额）
  app.get('/accounts', async (req) => c.platform.balances(req.userId));

  app.post('/platforms', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.platform.create(req.userId, body);
  });

  app.put('/platforms/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const body = parse(updateSchema, req.body);
    return c.platform.update(req.userId, id, body);
  });

  app.delete('/platforms/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.platform.remove(req.userId, id);
    return { ok: true };
  });
}
