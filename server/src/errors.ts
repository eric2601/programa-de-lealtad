export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, detail?: unknown) => new AppError(400, code, message, detail);
export const unauthorized = (message = 'No autorizado') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unprocessable = (code: string, message: string, detail?: unknown) => new AppError(422, code, message, detail);
export const tooMany = (code: string, message: string) => new AppError(429, code, message);
