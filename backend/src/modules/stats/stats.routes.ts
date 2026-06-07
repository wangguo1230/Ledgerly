import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { parse, zId, zFlow } from '../../common/validation.js';

const rangeQuery = z.object({
  ledger_id: zId,
  from: z.string().optional(),
  to: z.string().optional(),
});

export function registerStatsRoutes(app: FastifyInstance, c: Container): void {
  app.get('/stats/summary', async (req) => {
    const q = parse(rangeQuery, req.query);
    return c.stats.summary(req.userId, q);
  });

  app.get('/stats/by-category', async (req) => {
    const q = parse(rangeQuery.extend({ flow_type: zFlow }), req.query);
    return c.stats.byCategory(req.userId, q, q.flow_type);
  });

  app.get('/stats/trend', async (req) => {
    const q = parse(
      rangeQuery.extend({ granularity: z.enum(['day', 'week', 'month']).optional() }),
      req.query,
    );
    return c.stats.trend(req.userId, q, q.granularity ?? 'month');
  });

  app.get('/stats/by-platform', async (req) => {
    const q = parse(rangeQuery, req.query);
    return c.stats.byPlatform(req.userId, q);
  });

  app.get('/stats/profit', async (req) => {
    const q = parse(rangeQuery, req.query);
    return c.stats.productProfit(req.userId, q);
  });
}
