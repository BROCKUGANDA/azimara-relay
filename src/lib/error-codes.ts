// Shared error codes used across API responses and client handling.
// Keep in sync with server-side thrown errors (lib/auth, lib/api, etc.).
export const ErrorCode = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  INVALID_MFA: 'INVALID_MFA',
  MFA_NOT_CONFIGURED: 'MFA_NOT_CONFIGURED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  HTTP_400: 'HTTP_400',
  HTTP_401: 'HTTP_401',
  HTTP_403: 'HTTP_403',
  HTTP_404: 'HTTP_404',
  HTTP_429: 'HTTP_429',
  HTTP_500: 'HTTP_500',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]