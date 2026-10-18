import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { Headline } from '@/components/site/headline';
import { dict } from '@/lib/i18n';
import type { Lang, SiteData } from '@/lib/types';

/** "How it works": the steps from the brief to the rebate, alternating sides like a production schedule */
export function Process({ lang, steps }: { lang: Lang; steps: NonNullable<SiteData['process']> }) {
  const t = dict(lang).process;
  if (!steps.length) return null;
  return (
    <section className="py-20 sm:py-28" aria-labelledby="process-title">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#0b0b0b] px-6 py-14 sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_100%_0%,rgba(230,30,50,.18),transparent_65%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="tag">{t.eyebrow}</p>
              <Headline as="h2" id="process-title" text={t.title} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
            </div>
            <p className="max-w-md text-fg-muted">{t.text}</p>
          </div>

          <ol className="relative mt-14 space-y-4 lg:mt-20 lg:space-y-0">
            {/* the schedule line */}
            <span aria-hidden="true" className="absolute top-2 bottom-2 left-[19px] w-px bg-gradient-to-b from-accent via-white/15 to-transparent lg:left-1/2" />
            {steps.map((s, i) => {
              const right = i % 2 === 1;
              return (
                <li key={i} className="relative grid gap-3 pl-14 lg:grid-cols-2 lg:gap-16 lg:pl-0">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 left-[13px] size-3.5 rounded-full border-2 border-accent bg-[#0b0b0b] shadow-[0_0_0_6px_rgba(230,30,50,.12)] lg:left-1/2 lg:-translate-x-1/2"
                  />
                  <div className={clsx('lg:py-10', right ? 'lg:col-start-2 lg:pl-4' : 'lg:pr-4 lg:text-right')}>
                    <h3 className="display text-4xl text-white uppercase sm:text-5xl">{s.title}</h3>
                    <p className={clsx('mt-4 max-w-md leading-relaxed text-fg-muted', !right && 'lg:ml-auto')}>{s.text}</p>
                    {s.duration && (
                      <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-white/80 uppercase">
                        <Clock className="size-3.5 text-accent-bright" /> {s.duration}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
