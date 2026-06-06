/**
 * 领域错误类型 —— 由路由层统一转换为 HTTP 响应（关注点分离）
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 资源不存在 -> 404 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: number | string) {
    super(
      id === undefined ? `${resource} 不存在` : `${resource}(id=${id}) 不存在`,
      404,
      'NOT_FOUND',
    );
  }
}

/** 业务校验失败 -> 400 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/** 违反业务约束（如删除被引用数据）-> 409 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/** 未认证（未登录/令牌无效）-> 401 */
export class UnauthorizedError extends AppError {
  constructor(message = '未登录或登录已过期') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** 无权访问他人数据 -> 403 */
export class ForbiddenError extends AppError {
  constructor(message = '无权访问该数据') {
    super(message, 403, 'FORBIDDEN');
  }
}
