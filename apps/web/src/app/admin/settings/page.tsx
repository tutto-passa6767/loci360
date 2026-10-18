'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { KeyedMutator } from 'swr';
import { AssetPicker, AssetThumb } from '@/components/admin/assets';
import { Button, Card, errorText, Field, Input, Loading, PageHeader, Textarea, Toggle, useToast } from '@/components/admin/ui';
import { api, useApi, type AdminAsset } from '@/lib/admin';

interface Settings {
  contacts: { organisationEn: string; organisationRu: string; email: string; phone: string; addressEn: string; addressRu: string; website: string };
  leads: { notifyEmails: string[]; autoReply: boolean };
  seo: { titleEn: string; titleRu: string; descriptionEn: string; descriptionRu: string; ogAssetId: string | null };
  social: { instagram: string; youtube: string; vimeo: string; linkedin: string };
  analytics: { ga4Id: string; metrikaId: string };
  manager: { nameEn: string; nameRu: string; roleEn: string; roleRu: string; photoAssetId: string | null; phone: string; whatsapp: string; telegram: string };
  process: { steps: Step[] };
  faq: { items: Qa[] };
  ogAsset: AdminAsset | null;
  managerPhoto: AdminAsset | null;
}
type Step = { titleEn: string; titleRu: string; textEn: string; textRu: string; durationEn: string; durationRu: string };
type Qa = { qEn: string; qRu: string; aEn: string; aRu: string };

export default function SettingsPage() {
  const { data, mutate } = useApi<Settings>('/admin/settings');
  if (!data) return <Loading />;
  return <SettingsForm initial={data} mutate={mutate} />;
}

function SettingsForm({ initial, mutate }: { initial: Settings; mutate: KeyedMutator<Settings> }) {
  const toast = useToast();
  const [s, setS] = useState<Settings>(initial);
  const [emails, setEmails] = useState(initial.leads.notifyEmails.join('\n'));
  const [picker, setPicker] = useState<'og' | 'manager' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: 'contacts' | 'leads' | 'seo' | 'social' | 'analytics' | 'manager' | 'process' | 'faq', value: unknown) => {
    setBusy(key);
    try {
      await mutate(await api.put<Settings>(`/admin/settings/${key}`, value), { revalidate: false });
      toast('ok', 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const c = s.contacts;
  const setC = (k: keyof Settings['contacts'], v: string) => setS({ ...s, contacts: { ...c, [k]: v } });
  const seo = s.seo;
  const setSeo = (k: keyof Settings['seo'], v: string | null) => setS({ ...s, seo: { ...seo, [k]: v } });

  return (
    <div>
      <PageHeader title="Настройки и SEO" subtitle="Контакты офиса, получатели заявок, SEO, соцсети, аналитика, менеджер локаций, шаги работы и вопросы-ответы." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Заявки" actions={<Button variant="primary" size="sm" loading={busy === 'leads'} onClick={() => save('leads', { notifyEmails: emails.split(/[\s,;]+/).filter(Boolean), autoReply: s.leads.autoReply })}>Сохранить</Button>}>
          <div className="space-y-4">
            <Field label="Кому приходят новые заявки" hint="По одному адресу в строке. В письме есть все поля и ссылка на заявку в CMS.">
              <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4} />
            </Field>
            <Toggle checked={s.leads.autoReply} onChange={(v) => setS({ ...s, leads: { ...s.leads, autoReply: v } })} label="Отправлять продюсеру подтверждение на его языке" />
          </div>
        </Card>

        <Card title="Контакты офиса" actions={<Button variant="primary" size="sm" loading={busy === 'contacts'} onClick={() => save('contacts', c)}>Сохранить</Button>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Организация EN">
              <Input value={c.organisationEn} onChange={(e) => setC('organisationEn', e.target.value)} />
            </Field>
            <Field label="Организация RU">
              <Input value={c.organisationRu} onChange={(e) => setC('organisationRu', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={c.email} onChange={(e) => setC('email', e.target.value)} />
            </Field>
            <Field label="Телефон">
              <Input value={c.phone} onChange={(e) => setC('phone', e.target.value)} />
            </Field>
            <Field label="Адрес EN">
              <Input value={c.addressEn} onChange={(e) => setC('addressEn', e.target.value)} />
            </Field>
            <Field label="Адрес RU">
              <Input value={c.addressRu} onChange={(e) => setC('addressRu', e.target.value)} />
            </Field>
            <Field label="Сайт" className="sm:col-span-2">
              <Input value={c.website} onChange={(e) => setC('website', e.target.value)} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-fg-subtle">Контакты выводятся в подвале сайта и в PDF-паспортах.</p>
        </Card>

        <Card title="SEO по умолчанию" actions={<Button variant="primary" size="sm" loading={busy === 'seo'} onClick={() => save('seo', seo)}>Сохранить</Button>}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title EN">
                <Input value={seo.titleEn} onChange={(e) => setSeo('titleEn', e.target.value)} />
              </Field>
              <Field label="Title RU">
                <Input value={seo.titleRu} onChange={(e) => setSeo('titleRu', e.target.value)} />
              </Field>
              <Field label="Description EN">
                <Textarea value={seo.descriptionEn} onChange={(e) => setSeo('descriptionEn', e.target.value)} rows={4} />
              </Field>
              <Field label="Description RU">
                <Textarea value={seo.descriptionRu} onChange={(e) => setSeo('descriptionRu', e.target.value)} rows={4} />
              </Field>
            </div>
            <Field label="Картинка для соцсетей по умолчанию (Open Graph)">
              <div className="flex items-center gap-3">
                {s.ogAsset && seo.ogAssetId === s.ogAsset.id && <AssetThumb asset={s.ogAsset} className="aspect-[1.91/1] w-40 rounded-lg" />}
                <Button size="sm" onClick={() => setPicker('og')}>
                  {seo.ogAssetId ? 'Заменить' : 'Выбрать'}
                </Button>
                {seo.ogAssetId && (
                  <Button size="sm" onClick={() => setSeo('ogAssetId', null)}>
                    Убрать
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Соцсети" actions={<Button variant="primary" size="sm" loading={busy === 'social'} onClick={() => save('social', s.social)}>Сохранить</Button>}>
          <div className="space-y-4">
            {(['instagram', 'youtube', 'vimeo', 'linkedin'] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <Input value={s.social[k]} onChange={(e) => setS({ ...s, social: { ...s.social, [k]: e.target.value } })} placeholder="https://" />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Аналитика" actions={<Button variant="primary" size="sm" loading={busy === 'analytics'} onClick={() => save('analytics', s.analytics)}>Сохранить</Button>}>
          <div className="space-y-4">
            <Field label="Google Analytics 4 — Measurement ID" hint="Вида G-XXXXXXXXXX: Admin → Data streams → Web.">
              <Input value={s.analytics.ga4Id} onChange={(e) => setS({ ...s, analytics: { ...s.analytics, ga4Id: e.target.value.trim() } })} placeholder="G-…" />
            </Field>
            <Field label="Яндекс Метрика — номер счётчика" hint="Только цифры, без кода счётчика.">
              <Input value={s.analytics.metrikaId} onChange={(e) => setS({ ...s, analytics: { ...s.analytics, metrikaId: e.target.value.trim() } })} inputMode="numeric" placeholder="12345678" />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            Счётчики загружаются только после того, как посетитель разрешит аналитические cookie в баннере: пока поля пустые, баннера нет. Собственная анонимная статистика (раздел «Статистика») работает всегда и cookie не использует.
          </p>
        </Card>
        <Card title="Менеджер локаций" actions={<Button variant="primary" size="sm" loading={busy === 'manager'} onClick={() => save('manager', s.manager)}>Сохранить</Button>}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {s.managerPhoto && s.manager.photoAssetId === s.managerPhoto.id && <AssetThumb asset={s.managerPhoto} className="size-16 rounded-xl" />}
              <Button size="sm" onClick={() => setPicker('manager')}>
                {s.manager.photoAssetId ? 'Заменить фото' : 'Выбрать фото'}
              </Button>
              {s.manager.photoAssetId && (
                <Button size="sm" onClick={() => setS({ ...s, manager: { ...s.manager, photoAssetId: null } })}>
                  Убрать
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['nameEn', 'Имя EN'],
                  ['nameRu', 'Имя RU'],
                  ['roleEn', 'Должность EN'],
                  ['roleRu', 'Должность RU'],
                  ['phone', 'Телефон'],
                  ['whatsapp', 'WhatsApp (номер с кодом страны)'],
                  ['telegram', 'Telegram (без @)'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <Input value={s.manager[k]} onChange={(e) => setS({ ...s, manager: { ...s.manager, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            Карточка «Спросите менеджера» на главной и на странице заявки. Пока имя пустое, вместо человека показывается офис локаций с email из контактов.
          </p>
        </Card>

        <Card
          title="Как это работает — шаги"
          className="xl:col-span-2"
          actions={<Button variant="primary" size="sm" loading={busy === 'process'} onClick={() => save('process', s.process)}>Сохранить</Button>}
        >
          <Rows
            items={s.process.steps}
            setItems={(steps) => setS({ ...s, process: { steps } })}
            blank={{ titleEn: '', titleRu: '', textEn: '', textRu: '', durationEn: '', durationRu: '' }}
            max={8}
            addLabel="Добавить шаг"
            render={(x, set) => (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Название EN">
                  <Input value={x.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
                </Field>
                <Field label="Название RU">
                  <Input value={x.titleRu} onChange={(e) => set({ titleRu: e.target.value })} />
                </Field>
                <Field label="Текст EN">
                  <Textarea rows={3} value={x.textEn} onChange={(e) => set({ textEn: e.target.value })} />
                </Field>
                <Field label="Текст RU">
                  <Textarea rows={3} value={x.textRu} onChange={(e) => set({ textRu: e.target.value })} />
                </Field>
                <Field label="Срок EN" hint="Например «3–5 days»">
                  <Input value={x.durationEn} onChange={(e) => set({ durationEn: e.target.value })} />
                </Field>
                <Field label="Срок RU" hint="Например «3–5 дней»">
                  <Input value={x.durationRu} onChange={(e) => set({ durationRu: e.target.value })} />
                </Field>
              </div>
            )}
          />
        </Card>

        <Card
          title="Вопросы и ответы (FAQ)"
          className="xl:col-span-2"
          actions={<Button variant="primary" size="sm" loading={busy === 'faq'} onClick={() => save('faq', s.faq)}>Сохранить</Button>}
        >
          <Rows
            items={s.faq.items}
            setItems={(items) => setS({ ...s, faq: { items } })}
            blank={{ qEn: '', qRu: '', aEn: '', aRu: '' }}
            max={20}
            addLabel="Добавить вопрос"
            render={(x, set) => (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Вопрос EN">
                  <Input value={x.qEn} onChange={(e) => set({ qEn: e.target.value })} />
                </Field>
                <Field label="Вопрос RU">
                  <Input value={x.qRu} onChange={(e) => set({ qRu: e.target.value })} />
                </Field>
                <Field label="Ответ EN">
                  <Textarea rows={4} value={x.aEn} onChange={(e) => set({ aEn: e.target.value })} />
                </Field>
                <Field label="Ответ RU">
                  <Textarea rows={4} value={x.aRu} onChange={(e) => set({ aRu: e.target.value })} />
                </Field>
              </div>
            )}
          />
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">Вопросы показываются на главной и попадают в поисковики как разметка FAQPage.</p>
        </Card>
      </div>
      <AssetPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        kind="PHOTO"
        onPick={([a]) =>
          setS((p) =>
            picker === 'manager' ? { ...p, manager: { ...p.manager, photoAssetId: a.id }, managerPhoto: a } : { ...p, seo: { ...p.seo, ogAssetId: a.id }, ogAsset: a },
          )
        }
      />
    </div>
  );
}

/** Editable list rows with move up / down / delete */
function Rows<T>({
  items,
  setItems,
  blank,
  max,
  addLabel,
  render,
}: {
  items: T[];
  setItems: (items: T[]) => void;
  blank: T;
  max: number;
  addLabel: string;
  render: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-fg-subtle">#{i + 1}</span>
            <div className="flex gap-1">
              <button type="button" className="rounded-lg p-1.5 text-fg-subtle hover:bg-white/5 hover:text-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                <ArrowUp className="size-4" />
              </button>
              <button type="button" className="rounded-lg p-1.5 text-fg-subtle hover:bg-white/5 hover:text-white disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                <ArrowDown className="size-4" />
              </button>
              <button type="button" className="rounded-lg p-1.5 text-fg-subtle hover:bg-white/5 hover:text-danger" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Удалить">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          {render(item, (patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
        </div>
      ))}
      <Button size="sm" onClick={() => setItems([...items, blank])} disabled={items.length >= max}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}
