/** Normalises Supabase / network errors into user-presentable messages. */
type MaybeSupabaseError = { message?: string; code?: string; details?: string; name?: string }

export class AppError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

const AUTH_EXPIRED_CODES = new Set(['PGRST301', 'PGRST303', 'session_expired'])

export function isAuthExpiredError(error: unknown): boolean {
  const e = error as MaybeSupabaseError | null
  if (!e) return false
  return (
    (e.code !== undefined && AUTH_EXPIRED_CODES.has(e.code)) ||
    /jwt expired|invalid jwt|refresh token/i.test(e.message ?? '')
  )
}

export function toAppError(error: unknown, fallback = 'Something went wrong. Please try again.'): AppError {
  if (error instanceof AppError) return error
  const e = (error ?? {}) as MaybeSupabaseError
  const code = e.code
  switch (code) {
    case '23505':
      return new AppError(
        /slug/.test(`${e.message} ${e.details}`)
          ? 'That slug is already used. Choose a different one.'
          : 'An entry with the same name already exists.',
        code,
      )
    case '23503':
      return new AppError('This item is still used by other content and cannot be removed.', code)
    case '23514':
      return new AppError(
        /Upload a CV/.test(e.message ?? '') ? 'Upload a CV before publishing it.' : 'Some values are not valid. Please review the form.',
        code,
      )
    case '42501':
      return new AppError('You do not have permission to perform this action.', code)
  }
  if (isAuthExpiredError(error)) return new AppError('Your session has expired. Please sign in again.', 'session_expired')
  if (e.name === 'TypeError' && /fetch/i.test(e.message ?? '')) {
    return new AppError('Network error. Check your connection and try again.', 'network')
  }
  return new AppError(fallback, code)
}

/** Unwraps a Supabase `{ data, error }` result, throwing an AppError on failure. */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R, fallback?: string): NonNullable<R['data']> {
  if (result.error) throw toAppError(result.error, fallback)
  return result.data as NonNullable<R['data']>
}

/** Like unwrap, for `.maybeSingle()` queries where "no row" is a valid result. */
export function unwrapMaybe<R extends { data: unknown; error: unknown }>(result: R, fallback?: string): R['data'] {
  if (result.error) throw toAppError(result.error, fallback)
  return result.data
}
