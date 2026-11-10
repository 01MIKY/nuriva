/** A rule violation that maps to an HTTP status and a stable, translatable error code. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    /** Safe, non-sensitive details the client can show (e.g. which dates of a weekly booking are unavailable). */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
