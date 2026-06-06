import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zFlow } from '../../common/validation.js';

const listQuery = z.object({
  ledger_id: zId,
  flow_type: zFlow.optional(),
  tree: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

const createSchema = z.object({
  ledger_id: zId,
  parent_id: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  flow_type: zFlow,
  icon: z.string().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
});
const updateSchema = createSchema.omit({ ledger_id: true }).partial();

export function registerCategoryRoutes(app: FastifyInstance, c: Container): void {
  app.get('/categories', async (req) => {
    const q = parse(listQuery, req.query);
    return q.tree
      ? c.category.tree(req.userId, q.ledger_id, q.flow_type)
      : c.category.list(req.userId, q.ledger_id, q.flow_type);
  });

  app.get('/categories/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    return c.category.get(req.userId, id);
  });

  app.post('/categories', async (req, reply) => {
    const body = parse(createSchema, req.body);
    reply.status(201);
    return c.category.create(req.userId, body);
  });

  app.put('/categories/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    const body = parse(updateSchema, req.body);
    return c.category.update(req.userId, id, body);
  });

  app.delete('/categories/:id', async (req) => {
    const { id } = parse(z.object({ id: zId }), req.params);
    await c.category.remove(req.userId, id);
    return { ok: true };
  });
}
