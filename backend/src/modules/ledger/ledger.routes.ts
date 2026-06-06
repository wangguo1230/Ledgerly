import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zLedgerType } from '../../common/validation.js';

const createSchema = z.object({
  name: z.string().min(1),
  type: zLedgerType,
  currency: z.string().optional(),
  remark: z.string().nullable().optional(),
});
const updateSchema = createSchema.partial();

export function registerLedgerRoutes(app: FastifyInstance, c: Container): void {
  app.get('/ledgers', async (req) => c.ledger.list(req.userId));

  app.get('/ledgers/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    return c.ledger.get(req.userId, id);
  });

  app.post('/ledgers', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.ledger.create(req.userId, body);
  });

  app.put('/ledgers/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const body = parse(updateSchema, req.body);
    return c.ledger.update(req.userId, id, body);
  });

  app.delete('/ledgers/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.ledger.remove(req.userId, id);
    return { ok: true };
  });
}
