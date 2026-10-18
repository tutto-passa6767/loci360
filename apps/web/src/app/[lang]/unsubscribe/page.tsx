import type { Metadata } from 'next';
import { Unsubscribe } from '@/components/site/unsubscribe';
import { dict } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return { title: dict(lang).unsubscribe.title, robots: { index: false, follow: false } };
}

/** The link in every newsletter letter; a button press (not the visit) unsubscribes, so link scanners cannot */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const lang = (await params).lang as Lang;
  const { token } = await searchParams;
  const t = dict(lang).unsubscribe;
  return (
    <section className="container-x flex min-h-[70svh] items-center pt-[calc(var(--header-h)+48px)] pb-20">
      <div className="card max-w-xl p-8 sm:p-12">
        <h1 className="display text-4xl text-white sm:text-5xl">{t.title}</h1>
        <p className="mt-5 text-fg-muted">{t.text}</p>
        <Unsubscribe lang={lang} token={typeof token === 'string' ? token : ''} />
      </div>
    </section>
  );
}
