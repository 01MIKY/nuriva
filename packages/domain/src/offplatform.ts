/**
 * Signals that a chat message moves the relationship outside NURIVA (direct contact or off-app payment).
 * Used only to show a friendly reminder — never to block a message (docs/RETENTION.md).
 * Tuned to avoid false positives on times, prices, ages, dates and street addresses.
 */
export type OffPlatformSignal = 'phone' | 'email' | 'link' | 'payment';

const PHONE = /(?:\+?\d[\s().-]*){10,}|(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b/;
const EMAIL_AT = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}|\b[\w.-]+\s+(?:arroba|at)\s+[\w-]+\s*(?:\.|punto|dot)\s*(?:com|net|org|es|us)\b/i;
const LINK = /\bhttps?:\/\/|\bwww\.|\bwa\.me\b|\bt\.me\b|\b[\w-]+\.(?:com|net|org|me|io|app|co)\b/i;
const PAYMENT = /\b(zelle|venmo|cash\s?app|paypal|efectivo|en\s+cash|pago\s+directo|p[aá]game\s+(?:a\s+m[ií]|directo)|fuera\s+de\s+(?:la\s+)?app|outside\s+(?:the\s+)?app|pay\s+(?:me\s+)?direct(?:ly)?)\b/i;
const CONTACT_APPS = /\b(whats\s?app|telegram|signal\s+app|instagram|insta|ig|facebook|messenger|snapchat|tiktok|ll[aá]mame|escr[ií]beme\s+al|call\s+me|text\s+me)\b/i;

export function offPlatformSignals(text: string): OffPlatformSignal[] {
  const out = new Set<OffPlatformSignal>();
  if (PHONE.test(text)) out.add('phone');
  if (EMAIL.test(text)) out.add('email');
  // An email's domain (gmail.com) is not a link.
  if (LINK.test(text.replace(EMAIL_AT, ' '))) out.add('link');
  if (CONTACT_APPS.test(text)) out.add('phone');
  if (PAYMENT.test(text)) out.add('payment');
  return [...out].sort();
}
