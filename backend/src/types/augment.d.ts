/**
 * 类型增强 —— JWT 载荷与 app.authenticate 装饰器。
 */
import '@fastify/jwt';
import 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; username: string };
    user: { id: number; username: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: number;
  }
}
