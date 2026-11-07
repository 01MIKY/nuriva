'use client';
import { usePathname, useRouter } from 'next/navigation';
import type { Locale } from '@nuriva/i18n';

/** Switches /en/... ↔ /es/... keeping the current page, and remembers the choice. */
export function LanguageSwitch({ target, label }: { target: Locale; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <button
      type="button"
      className="lang-switch"
      lang={target}
      onClick={() => {
        document.cookie = `nuriva_locale=${target}; path=/; max-age=31536000; samesite=lax`;
        router.push(pathname.replace(/^\/(en|es)(?=\/|$)/, `/${target}`));
      }}
    >
      {label}
    </button>
  );
}
