import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zCents } from '../../common/validation.js';

const createSchema = z.object({
  ledger_id: zId,
  name: z.string().min(1),
  sku: z.string().nullable().optional(),
  cost_price: zCents.optional(),
  sale_price: zCents.optional(),
  unit: z.string().nullable().optional(),
  stock: z.coerce.number().int().nullable().optional(),
  remark: z.string().nullable().optional(),
});
const updateSchema = createSchema.omit({ ledger_id: true }).partial();

export function registerProductRoutes(app: FastifyInstance, c: Container): void {
  app.get('/products', async (req) => {
    const { ledger_id } = parse(z.object({ ledger_id: zId }), req.query);
    return c.product.list(req.userId, ledger_id);
  });

  app.get('/products/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    return c.product.get(req.userId, id);
  });

  app.post('/products', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.product.create(req.userId, body);
  });

  app.put('/products/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const body = parse(updateSchema, req.body);
    return c.product.update(req.userId, id, body);
  });

  app.delete('/products/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.product.remove(req.userId, id);
    return { ok: true };
  });
}
