import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@nuriva/domain';
import { t, type MessageKey } from '@nuriva/i18n';

const translatable = (code: string): MessageKey | null => {
  const key = `errors.${code}` as MessageKey;
  try {
    t('en', key);
    return key;
  } catch {
    return null;
  }
};

/** Uniform JSON errors: `{ error: code, message: <localized>, fields? }`. Internal details are never leaked. */
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  const locale = req.locale ?? 'en';
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: 'validation',
      message: t(locale, 'errors.validation'),
      fields: err.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
  }
  if (err instanceof DomainError) {
    const key = translatable(err.code);
    return reply.status(err.status).send({ error: err.code, message: key ? t(locale, key) : err.message });
  }
  const status = (err as FastifyError).statusCode;
  if (status === 429) return reply.status(429).send({ error: 'rate_limited', message: t(locale, 'errors.rate_limited') });
  if (status && status >= 400 && status < 500) {
    return reply.status(status).send({ error: 'bad_request', message: t(locale, 'errors.validation') });
  }
  req.log.error({ err }, 'unhandled error');
  return reply.status(500).send({ error: 'internal', message: t(locale, 'errors.internal') });
}
