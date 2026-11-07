import { redirect } from 'next/navigation';
import { resolveLocale } from '@/lib/i18n';

export default async function Index({ params }: { params: Promise<{ locale: string }> }) {
  redirect(`/${await resolveLocale(params)}/caregivers`);
}
