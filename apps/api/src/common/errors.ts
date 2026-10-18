import { HttpException } from '@nestjs/common';

/**
 * API error with a machine-readable code. The web app shows a localised text by `code`;
 * `message` is an English fallback for logs and API clients.
 */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

export const notFound = (what = 'Object') => new AppError(404, 'NOT_FOUND', `${what} not found`);
