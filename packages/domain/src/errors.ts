/** A rule violation that maps to an HTTP status and a stable, translatable error code. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
