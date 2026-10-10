import type { ApiErrorCode } from '../contracts/index.ts';
export class BackendError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) { super(message); this.name = 'BackendError'; this.code = code; }
}
export const HTTP_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401, NOT_FOUND: 404, INVALID_INPUT: 422, CONFLICT: 409, UNAVAILABLE: 503,
};
