'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { KeyedMutator } from 'swr';
import { useAdminUser } from '@/components/admin/shell';
import { AssetPicker, AssetThumb } from '@/components/admin/assets';
import { Button, Card, errorText, Field, Input, Loading, PageHeader, Select, Toggle, useToast } from '@/components/admin/ui';
import { api, useApi, type AdminAsset } from '@/lib/admin';

interface Reel {
  key: string;
  labelEn: string;
  labelRu: string;
  assetId: string | null;
  asset?: AdminAsset | null;
  genreSlug: string | null;
  locationSlug: string | null;
  active: boolean;
}
interface Highlight {
  value: string;
  labelEn: string;
  labelRu: string;
}

export default function HomeAdminPage() {
  const { data: hero, mutate } = useApi<{ items: Reel[] }>('/admin/hero');
  const { data: settings, mutate: mutateSettings } = useApi<{ home: { highlights: Highlight[] } }>('/admin/settings');
  if (!hero || !settings) return <Loading />;
  return <HomeForm initialReels={hero.items} initialHighlights={settings.home.highlights} mutate={mutate} mutateSettings={mutateSettings} />;
}

function HomeForm({
  initialReels,
  initialHighlights,
  mutate,
  mutateSettings,
}: {
  initialReels: Reel[];
  initialHighlights: Highlight[];
  mutate: KeyedMutator<{ items: Reel[] }>;
  mutateSettings: KeyedMutator<{ home: { highlights: Highlight[] } }>;
}) {
  const toast = useToast();
  const user = useAdminUser();
  const { data: terms } = useApi<{ items: { kind: string; slug: string; labelEn: string }[] }>('/admin/terms');
  const { data: locations } = useApi<{ items: { slug: string; nameEn: string; status: string }[] }>('/admin/locations?limit=200');
  const [reels, setReels] = useState<Reel[]>(initialReels);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [picker, setPicker] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const upd = (i: number, patch: Partial<Reel>) => setReels((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) =>
    setReels((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });

  const saveHero = async () => {
    setBusy(true);
    try {
      const res = await api.put<{ items: Reel[] }>('/admin/hero', {
        items: reels.map(({ key, labelEn, labelRu, assetId, genreSlug, locationSlug, active }) => ({ key, labelEn, labelRu, assetId, genreSlug, locationSlug, active })),
      });
      await mutate(res, { revalidate: false });
      toast('ok', 'Главная обновлена');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveHighlights = async () => {
    try {
      await api.put('/admin/settings/home', { highlights });
      await mutateSettings();
      toast('ok', 'Цифры сохранены');
    } catch (e) {
      toast('error', errorText(e));
    }
  };

  const genres = (terms?.items ?? []).filter((t) => t.kind === 'GENRE');

  return (
    <div>
      <PageHeader title="Главная страница" subtitle="Полноэкранное видео с переключателем жанровых настроений и блок «Почему Казахстан»." />
      <Card
        title="Жанровые настроения (hero)"
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setReels((l) => [...l, { key: `mood-${l.length + 1}`, labelEn: '', labelRu: '', assetId: null, genreSlug: null, locationSlug: null, active: true }])}>
              <Plus className="size-4" /> Настроение
            </Button>
            <Button variant="primary" size="sm" onClick={saveHero} loading={busy}>
              Сохранить
            </Button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-fg-muted">
          Для каждого настроения выберите видео: обработчик сам сделает 15-секундный беззвучный луп в 1080p и постер. Кнопка «Смотреть локации» откроет каталог с выбранным жанром.
        </p>
        <div className="space-y-4">
          {reels.map((r, i) => (
            <div key={i} className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[200px_1fr_auto]">
              <button type="button" onClick={() => setPicker(i)} aria-label={`Выбрать видео для настроения ${r.labelRu || i + 1}`} className="relative overflow-hidden rounded-lg border border-dashed border-border-strong">
                {r.asset ? <AssetThumb asset={r.asset} className="aspect-video" /> : <div className="topo flex aspect-video items-center justify-center text-xs text-fg-muted">Выбрать видео</div>}
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Подпись EN">
                  <Input value={r.labelEn} onChange={(e) => upd(i, { labelEn: e.target.value })} placeholder="Western" />
                </Field>
                <Field label="Подпись RU">
                  <Input value={r.labelRu} onChange={(e) => upd(i, { labelRu: e.target.value })} placeholder="Вестерн" />
                </Field>
                <Field label="Жанр для кнопки">
                  <Select value={r.genreSlug ?? ''} onChange={(e) => upd(i, { genreSlug: e.target.value || null })} options={[{ value: '', label: '— весь каталог' }, ...genres.map((g) => ({ value: g.slug, label: g.labelEn }))]} />
                </Field>
                <Field label="Локация в кадре">
                  <Select
                    value={r.locationSlug ?? ''}
                    onChange={(e) => upd(i, { locationSlug: e.target.value || null })}
                    options={[{ value: '', label: '— не указывать' }, ...(locations?.items ?? []).map((l) => ({ value: l.slug, label: l.nameEn }))]}
                  />
                </Field>
                <Toggle checked={r.active} onChange={(v) => upd(i, { active: v })} label="Показывать" />
              </div>
              <div className="flex items-start gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 disabled:opacity-30" aria-label="Выше">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" disabled={i === reels.length - 1} onClick={() => move(i, 1)} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 disabled:opacity-30" aria-label="Ниже">
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" onClick={() => setReels((l) => l.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger" aria-label="Удалить">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Цифры в блоке «Почему Казахстан»"
        className="mt-6"
        actions={
          user.role === 'ADMIN' ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setHighlights((h) => [...h, { value: '', labelEn: '', labelRu: '' }])} disabled={highlights.length >= 6}>
                <Plus className="size-4" /> Добавить
              </Button>
              <Button variant="primary" size="sm" onClick={saveHighlights}>
                Сохранить
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {highlights.map((h, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
              <Input value={h.value} onChange={(e) => setHighlights((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="30%" maxLength={24} />
              <Input value={h.labelEn} onChange={(e) => setHighlights((l) => l.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)))} placeholder="Подпись EN" />
              <Input value={h.labelRu} onChange={(e) => setHighlights((l) => l.map((x, j) => (j === i ? { ...x, labelRu: e.target.value } : x)))} placeholder="Подпись RU" />
              <button type="button" onClick={() => setHighlights((l) => l.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger" aria-label="Удалить">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        {user.role !== 'ADMIN' && <p className="mt-3 text-xs text-fg-subtle">Цифры меняет администратор.</p>}
      </Card>

      <AssetPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        kind="VIDEO"
        onPick={([a]) => picker !== null && upd(picker, { assetId: a.id, asset: a })}
        title="Видео для настроения"
      />
    </div>
  );
}
