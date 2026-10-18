'use client';

import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { KeyedMutator } from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Card, errorText, Field, Input, Loading, Textarea, Toggle, useToast } from '@/components/admin/ui';
import { api, useApi } from '@/lib/admin';

interface Page {
  slug: string;
  titleEn: string;
  titleRu: string;
  leadEn: string;
  leadRu: string;
  bodyEn: string;
  bodyRu: string;
  seoTitleEn: string | null;
  seoTitleRu: string | null;
  seoDescriptionEn: string | null;
  seoDescriptionRu: string | null;
  published: boolean;
}

const EDITABLE = ['titleEn', 'titleRu', 'leadEn', 'leadRu', 'bodyEn', 'bodyRu', 'seoTitleEn', 'seoTitleRu', 'seoDescriptionEn', 'seoDescriptionRu', 'published'] as const;

export default function PageEditor() {
  const { slug } = useParams<{ slug: string }>();
  const { data, mutate } = useApi<Page>(`/admin/pages/${slug}`);
  if (!data) return <Loading />;
  return <PageForm initial={data} slug={slug} mutate={mutate} />;
}

function PageForm({ initial, slug, mutate }: { initial: Page; slug: string; mutate: KeyedMutator<Page> }) {
  const toast = useToast();
  const [f, setF] = useState<Page>(initial);
  const [lang, setLang] = useState<'En' | 'Ru'>('En');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Page, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(EDITABLE.map((k) => [k, f[k]]));
      await mutate(await api.patch<Page>(`/admin/pages/${slug}`, body), { revalidate: false });
      toast('ok', 'Страница сохранена');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const k = (base: string) => `${base}${lang}` as keyof Page;

  return (
    <div>
      <Link href="/admin/pages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white">
        <ArrowLeft className="size-4" /> Все страницы
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl text-white">{f.titleRu || f.titleEn}</h1>
        <div className="flex items-center gap-3">
          <Toggle checked={f.published} onChange={(v) => set('published', v)} label="Опубликована" />
          <Button variant="primary" onClick={save} loading={busy}>
            Сохранить
          </Button>
        </div>
      </div>
      <div className="mb-4 flex gap-1 rounded-full border border-border-strong p-1 sm:inline-flex">
        {(['En', 'Ru'] as const).map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)} className={clsx('rounded-full px-4 py-1.5 text-sm font-medium', lang === l ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}>
            {l === 'En' ? 'English' : 'Русский'}
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="space-y-4">
            <Field label="Заголовок">
              <Input value={(f[k('title')] as string) ?? ''} onChange={(e) => set(k('title'), e.target.value)} />
            </Field>
            <Field label="Лид (под заголовком)">
              <Textarea value={(f[k('lead')] as string) ?? ''} onChange={(e) => set(k('lead'), e.target.value)} rows={3} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">Текст (Markdown)</span>
                <button type="button" onClick={() => setPreview((v) => !v)} className="text-xs text-accent-bright hover:text-white">
                  {preview ? 'Редактировать' : 'Предпросмотр'}
                </button>
              </div>
              {preview ? (
                <div className="prose-loci max-w-none rounded-xl border border-border bg-bg-2 p-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{(f[k('body')] as string) ?? ''}</ReactMarkdown>
                </div>
              ) : (
                <Textarea value={(f[k('body')] as string) ?? ''} onChange={(e) => set(k('body'), e.target.value)} rows={26} className="font-mono text-[13px]" />
              )}
              <p className="mt-1 text-xs text-fg-subtle">## Заголовок · **жирный** · - список · 1. нумерация · &gt; врезка · [ссылка](https://…)</p>
            </div>
          </div>
        </Card>
        <Card title="SEO">
          <div className="space-y-4">
            <Field label="Title" hint="Если пусто — заголовок страницы">
              <Input value={(f[k('seoTitle')] as string) ?? ''} onChange={(e) => set(k('seoTitle'), e.target.value)} />
            </Field>
            <Field label="Description" hint="Если пусто — лид">
              <Textarea value={(f[k('seoDescription')] as string) ?? ''} onChange={(e) => set(k('seoDescription'), e.target.value)} rows={4} />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
