/** Identity verification boundary (Stripe Identity). NURIVA stores only the session id and its status. */
export type IdentityStatus = 'requires_input' | 'processing' | 'verified' | 'canceled';

export interface IdentityProvider {
  readonly name: 'stripe' | 'fake';
  /** Document + matching live selfie. Returns the hosted URL to send the caregiver to. */
  createVerification(input: { reference: string; returnUrl: string }): Promise<{ sessionId: string; url: string }>;
  /** Hosted URL for an existing session (resume). */
  resumeUrl(sessionId: string): Promise<string | null>;
  getVerification(sessionId: string): Promise<{ status: IdentityStatus; errorCode: string | null }>;
}
