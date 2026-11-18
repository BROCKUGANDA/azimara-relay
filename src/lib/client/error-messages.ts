// Friendly, user-facing messages keyed by API error code.
// Fall back to the server-provided message when no mapping exists.
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  MFA_REQUIRED: 'Multi-factor authentication is required.',
  INVALID_MFA: 'Invalid verification code.',
  MFA_NOT_CONFIGURED: 'Multi-factor authentication is not configured.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  INVALID_INPUT: 'Some fields are invalid. Please review and retry.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'This conflicts with an existing record.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  EMPTY_RESPONSE: 'The server returned no data. Please retry.',
}

export function resolveErrorMessage(code: string, fallback: string): string {
  return ERROR_MESSAGES[code] ?? fallback
}