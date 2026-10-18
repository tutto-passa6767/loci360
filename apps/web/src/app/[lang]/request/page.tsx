import { Clock, FileText, MapPinned } from 'lucide-react';
import type { Metadata } from 'next';
import { RequestForm } from '@/components/request/request-form';
import { Headline } from '@/components/site/headline';
import { api } from '@/lib/api';
import { countryOptions } from '@/lib/countries';
import { dict, href } from '@/lib/i18n';
import { ManagerCard } from '@/components/site/manager-card';
import type { Lang } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const t = dict(lang).request;
  return { title: t.title, description: t.text, alternates: { canonical: href(lang, '/request'), languages: { en: '/request', ru: '/ru/request' } } };
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ locations?: string }> }) {
  const lang = (await params).lang as Lang;
  const pre = ((await searchParams).locations ?? '').split(',').filter(Boolean);
  const t = dict(lang).request;
  const [options, site] = await Promise.all([api.options(lang), api.site(lang).catch(() => null)]);
  const steps =
    lang === 'ru'
      ? [
          { icon: Clock, title: '2 рабочих дня', text: 'Ответ менеджера по локациям с вариантами и доступностью.' },
          { icon: FileText, title: 'Паспорта и разрешения', text: 'PDF-паспорта выбранных мест и план согласований.' },
          { icon: MapPinned, title: 'Скаутинг на месте', text: 'Выезд с фото- и видеоразведкой под ваш сценарий.' },
        ]
      : [
          { icon: Clock, title: '2 business days', text: 'A location manager replies with options and availability.' },
          { icon: FileText, title: 'Spec sheets & permits', text: 'PDF spec sheets for the shortlist and a permit plan.' },
          { icon: MapPinned, title: 'On-site scouting', text: 'A tech scout with photo and video recce for your script.' },
        ];

  return (
    <div className="pt-[var(--header-h)]">
      <div className="container-x grid gap-12 py-14 lg:grid-cols-[1fr_1.35fr] lg:gap-20 lg:py-20">
        <div>
          <p className="tag">{t.eyebrow}</p>
          <Headline as="h1" text={t.title} className="mt-5 text-5xl leading-[1.02] text-white sm:text-6xl" />
          <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">{t.text}</p>
          <ul className="mt-10 space-y-6">
            {steps.map((s) => (
              <li key={s.title} className="flex gap-4">
                <span className="glass flex size-11 shrink-0 items-center justify-center rounded-2xl text-accent-bright">
                  <s.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold text-white">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* Direct lines to the person who will answer */}
          <ManagerCard lang={lang} manager={site?.manager} request={false} className="mt-10 max-w-md" />
        </div>
        <div className="card p-6 sm:p-10">
          <RequestForm lang={lang} options={options.items} preselected={pre} countries={countryOptions(lang)} />
        </div>
      </div>
    </div>
  );
}
