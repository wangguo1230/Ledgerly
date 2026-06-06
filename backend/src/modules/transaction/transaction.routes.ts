import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zCents, zFlow } from '../../common/validation.js';

const listQuery = z.object({
  ledger_id: zId,
  flow_type: zFlow.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  product_id: z.coerce.number().int().positive().optional(),
  source_platform_id: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  ledger_id: zId,
  flow_type: zFlow,
  amount: zCents,
  category_id: z.coerce.number().int().positive().nullable().optional(),
  product_id: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int().nullable().optional(),
  cost_snapshot: zCents.nullable().optional(),
  source_platform_id: z.coerce.number().int().positive().nullable().optional(),
  occurred_at: z.string().min(1),
  remark: z.string().max(20000).nullable().optional(),
});
const updateSchema = createSchema.omit({ ledger_id: true }).partial();

export function registerTransactionRoutes(app: FastifyInstance, c: Container): void {
  app.get('/transactions', async (req) => {
    const q = parse(listQuery, req.query);
    return c.transaction.list(req.userId, q);
  });

  app.get('/transactions/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    return c.transaction.get(req.userId, id);
  });

  app.post('/transactions', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.transaction.create(req.userId, body);
  });

  app.put('/transactions/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const body = parse(updateSchema, req.body);
    return c.transaction.update(req.userId, id, body);
  });

  app.delete('/transactions/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.transaction.remove(req.userId, id);
    return { ok: true };
  });
}
