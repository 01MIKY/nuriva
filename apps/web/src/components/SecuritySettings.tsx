'use client';
import type { Locale } from '@nuriva/i18n';
import { MfaSettings } from '@nuriva/ui/mfa';
import { makeSend } from '@/lib/client-api';

export function SecuritySettings({ locale, allowDisable }: { locale: Locale; allowDisable: boolean }) {
  return <MfaSettings locale={locale} send={makeSend(locale)} allowDisable={allowDisable} />;
}
