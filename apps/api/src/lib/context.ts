import type { Db, FieldCipher } from '@nuriva/db';
import type { AccountRole, StaffRole } from '@nuriva/domain';
import type { Locale } from '@nuriva/i18n';
import type { Config } from '../config.js';

export interface Deps {
  config: Config;
  db: Db;
  cipher: FieldCipher;
}

export interface SessionUser {
  id: number;
  email: string;
  role: AccountRole;
  name: string;
  locale: Locale;
  staffRoles: StaffRole[];
  mfaEnabled: boolean;
  sessionId: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    locale: Locale;
  }
}
