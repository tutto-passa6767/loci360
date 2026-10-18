'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AssetPicker, AssetThumb } from '@/components/admin/assets';
import { Button, Card, errorText, Field, Input, Loading, Modal, PageHeader, Select, Textarea, useToast } from '@/components/admin/ui';
import { api, useApi, type AdminAsset } from '@/lib/admin';
import { options, TERM_KIND } from '@/lib/admin-labels';

interface Term {
  id: string;
  kind: string;
  slug: string;
  labelEn: string;
  labelRu: string;
  sort: number;
  usage: number;
}
interface Cluster {
  id: string;
  slug: string;
  nameEn: string;
  nameRu: string;
  taglineEn: string;
  taglineRu: string;
  descriptionEn: string | null;
  descriptionRu: string | null;
  lat: number;
  lng: number;
  zoom: number;
  sort: number;
  cover: AdminAsset | null;
  coverAssetId: string | null;
  usage: number;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function TaxonomyPage() {
  const toast = useToast();
  const { data: terms, mutate: mutateTerms } = useApi<{ items: Term[] }>('/admin/terms');
  const { data: clusters, mutate: mutateClusters } = useApi<{ items: Cluster[] }>('/admin/clusters');
  const [term, setTerm] = useState<Partial<Term> | null>(null);
  const [cluster, setCluster] = useState<Partial<Cluster> | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!terms || !clusters) return <Loading />;

  const saveTerm = async () => {
    if (!term) return;
    setBusy(true);
    try {
      const body = { kind: term.kind, slug: term.slug, labelEn: term.labelEn, labelRu: term.labelRu ?? '', sort: Number(term.sort ?? 0) };
      if (term.id) await api.patch(`/admin/terms/${term.id}`, body);
      else await api.post('/admin/terms', body);
      await mutateTerms();
      setTerm(null);
      toast('ok', 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const deleteTerm = async (t: Term) => {
    if (!confirm(`Удалить «${t.labelRu || t.labelEn}»?${t.usage ? ` Он снимется с ${t.usage} локаций.` : ''}`)) return;
    try {
      await api.del(`/admin/terms/${t.id}`);
      await mutateTerms();
    } catch (e) {
      toast('error', errorText(e));
    }
  };
  const saveCluster = async () => {
    if (!cluster) return;
    setBusy(true);
    try {
      const body = {
        slug: cluster.slug,
        nameEn: cluster.nameEn,
        nameRu: cluster.nameRu ?? '',
        taglineEn: cluster.taglineEn ?? '',
        taglineRu: cluster.taglineRu ?? '',
        descriptionEn: cluster.descriptionEn ?? null,
        descriptionRu: cluster.descriptionRu ?? null,
        coverAssetId: cluster.coverAssetId ?? null,
        lat: Number(cluster.lat),
        lng: Number(cluster.lng),
        zoom: Number(cluster.zoom ?? 6),
        sort: Number(cluster.sort ?? 0),
      };
      if (cluster.id) await api.patch(`/admin/clusters/${cluster.id}`, body);
      else await api.post('/admin/clusters', body);
      await mutateClusters();
      setCluster(null);
      toast('ok', 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const groups = Object.keys(TERM_KIND).map((kind) => ({ kind, items: terms.items.filter((t) => t.kind === kind) }));

  return (
    <div>
      <PageHeader title="Жанры и кластеры" subtitle="Фильтры каталога, быстрые теги на главной и региональные кластеры. Подписи — на двух языках." />

      <Card
        title="Кластеры"
        className="mb-6"
        actions={
          <Button size="sm" onClick={() => setCluster({ zoom: 6, sort: clusters.items.length + 1 })}>
            <Plus className="size-4" /> Кластер
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {clusters.items.map((c) => (
            <button key={c.id} type="button" onClick={() => setCluster(c)} className="overflow-hidden rounded-xl border border-border text-left hover:border-white/25">
              {c.cover ? <AssetThumb asset={c.cover} className="aspect-video" /> : <div className="topo aspect-video" />}
              <div className="p-3">
                <p className="font-medium text-white">{c.nameRu || c.nameEn}</p>
                <p className="text-xs text-fg-muted">
                  {c.taglineRu || c.taglineEn} · {c.usage} лок.
                </p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map((g) => (
          <Card
            key={g.kind}
            title={TERM_KIND[g.kind]}
            actions={
              <Button size="sm" onClick={() => setTerm({ kind: g.kind, sort: g.items.length })}>
                <Plus className="size-4" /> Добавить
              </Button>
            }
          >
            <ul className="divide-y divide-border">
              {g.items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      {t.labelEn} <span className="text-fg-muted">/ {t.labelRu}</span>
                    </p>
                    <p className="font-mono text-[11px] text-fg-subtle">
                      {t.slug} · {t.usage} лок.
                    </p>
                  </div>
                  <button type="button" onClick={() => setTerm(t)} className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-white/10" aria-label="Изменить">
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteTerm(t)} className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger" aria-label="Удалить">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Modal open={!!term} onClose={() => setTerm(null)} title={term?.id ? 'Изменить' : 'Новый элемент'}>
        {term && (
          <div className="space-y-4">
            <Field label="Группа">
              <Select value={term.kind} onChange={(e) => setTerm({ ...term, kind: e.target.value })} options={options(TERM_KIND)} disabled={!!term.id} />
            </Field>
            <Field label="Название EN">
              <Input value={term.labelEn ?? ''} onChange={(e) => setTerm({ ...term, labelEn: e.target.value, ...(term.id ? {} : { slug: slugify(e.target.value) }) })} />
            </Field>
            <Field label="Название RU">
              <Input value={term.labelRu ?? ''} onChange={(e) => setTerm({ ...term, labelRu: e.target.value })} />
            </Field>
            <Field label="Код в адресе (slug)" hint="Используется в ссылках фильтров: /locations?genre=sci-fi">
              <Input value={term.slug ?? ''} onChange={(e) => setTerm({ ...term, slug: slugify(e.target.value) })} />
            </Field>
            <Field label="Порядок">
              <Input type="number" value={term.sort ?? 0} onChange={(e) => setTerm({ ...term, sort: Number(e.target.value) })} />
            </Field>
            <Button variant="primary" onClick={saveTerm} loading={busy}>
              Сохранить
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!cluster} onClose={() => setCluster(null)} title={cluster?.id ? 'Кластер' : 'Новый кластер'} wide>
        {cluster && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название EN">
              <Input value={cluster.nameEn ?? ''} onChange={(e) => setCluster({ ...cluster, nameEn: e.target.value })} />
            </Field>
            <Field label="Название RU">
              <Input value={cluster.nameRu ?? ''} onChange={(e) => setCluster({ ...cluster, nameRu: e.target.value })} />
            </Field>
            <Field label="Слоган EN" hint="Например Alpine & Canyon">
              <Input value={cluster.taglineEn ?? ''} onChange={(e) => setCluster({ ...cluster, taglineEn: e.target.value })} />
            </Field>
            <Field label="Слоган RU">
              <Input value={cluster.taglineRu ?? ''} onChange={(e) => setCluster({ ...cluster, taglineRu: e.target.value })} />
            </Field>
            <Field label="Описание EN">
              <Textarea value={cluster.descriptionEn ?? ''} onChange={(e) => setCluster({ ...cluster, descriptionEn: e.target.value })} rows={4} />
            </Field>
            <Field label="Описание RU">
              <Textarea value={cluster.descriptionRu ?? ''} onChange={(e) => setCluster({ ...cluster, descriptionRu: e.target.value })} rows={4} />
            </Field>
            <Field label="Slug">
              <Input value={cluster.slug ?? ''} onChange={(e) => setCluster({ ...cluster, slug: slugify(e.target.value) })} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Широта">
                <Input value={cluster.lat ?? ''} onChange={(e) => setCluster({ ...cluster, lat: e.target.value as unknown as number })} />
              </Field>
              <Field label="Долгота">
                <Input value={cluster.lng ?? ''} onChange={(e) => setCluster({ ...cluster, lng: e.target.value as unknown as number })} />
              </Field>
              <Field label="Масштаб">
                <Input value={cluster.zoom ?? 6} onChange={(e) => setCluster({ ...cluster, zoom: e.target.value as unknown as number })} />
              </Field>
            </div>
            <Field label="Обложка" className="sm:col-span-2">
              <div className="flex items-center gap-3">
                {cluster.cover && cluster.coverAssetId === cluster.cover.id && <AssetThumb asset={cluster.cover} className="aspect-video w-40 rounded-lg" />}
                {cluster.coverAssetId && (!cluster.cover || cluster.coverAssetId !== cluster.cover.id) && <span className="text-sm text-fg-muted">Выбрана новая обложка</span>}
                <Button size="sm" onClick={() => setPicker(true)}>
                  Выбрать фото
                </Button>
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" onClick={saveCluster} loading={busy}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <AssetPicker open={picker} onClose={() => setPicker(false)} kind="PHOTO" onPick={([a]) => setCluster((c) => (c ? { ...c, coverAssetId: a.id, cover: a } : c))} />
    </div>
  );
}
