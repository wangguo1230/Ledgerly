import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zCents } from '../../common/validation.js';

const createSchema = z.object({
  from_platform_id: zId,
  to_platform_id: zId,
  amount: zCents,
  occurred_at: z.string().min(1),
  remark: z.string().max(255).nullable().optional(),
});

export function registerTransferRoutes(app: FastifyInstance, c: Container): void {
  app.get('/transfers', async (req) => c.transfer.list(req.userId));

  app.post('/transfers', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.transfer.create(req.userId, body);
  });

  app.delete('/transfers/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.transfer.remove(req.userId, id);
    return { ok: true };
  });
}
