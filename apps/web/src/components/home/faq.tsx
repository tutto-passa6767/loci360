import { Plus } from 'lucide-react';
import { AskForm } from '@/components/site/ask-form';
import { Headline } from '@/components/site/headline';
import { ManagerCard } from '@/components/site/manager-card';
import { dict } from '@/lib/i18n';
import type { Lang, SiteData } from '@/lib/types';

/** Questions producers ask (an accordion, also as FAQPage structured data) next to a direct line to the manager */
export function Faq({ lang, site }: { lang: Lang; site: SiteData | null }) {
  const t = dict(lang).faq;
  const items = site?.faq ?? [];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
  };
  return (
    <section className="py-20 sm:py-28" aria-labelledby="faq-title">
      {items.length > 0 && (
        // JSON from our own CMS; '<' is escaped so it cannot close the script tag
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      )}
      <div className="container-x grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <div>
          <p className="tag">{t.eyebrow}</p>
          <Headline as="h2" id="faq-title" text={t.title} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
          <div className="mt-10 border-t border-white/[0.08]">
            {items.map((x, i) => (
              <details key={i} className="group border-b border-white/[0.08]" name="faq">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-lg text-white transition-colors hover:text-accent-bright [&::-webkit-details-marker]:hidden">
                  <span>{x.q}</span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong transition-transform duration-300 group-open:rotate-45 group-open:border-accent group-open:bg-accent">
                    <Plus className="size-4" />
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 leading-relaxed whitespace-pre-line text-fg-muted">{x.a}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:pt-16">
          <p className="font-mono text-xs tracking-[0.16em] text-fg-subtle uppercase">{t.more}</p>
          <ManagerCard lang={lang} manager={site?.manager} request={false} />
          <AskForm lang={lang} />
        </div>
      </div>
    </section>
  );
}
