'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AssetPicker, AssetThumb } from '@/components/admin/assets';
import { Badge, Button, Empty, errorText, Field, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, useToast } from '@/components/admin/ui';
import { api, useApi, type AdminAsset } from '@/lib/admin';
import { options, SERVICE_CATEGORY } from '@/lib/admin-labels';

interface Company {
  id?: string;
  name: string;
  category: string;
  cityEn: string;
  cityRu: string;
  descriptionEn: string;
  descriptionRu: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  logoAssetId: string | null;
  logo?: AdminAsset | null;
  published: boolean;
  sort: number;
}

const blank: Company = { name: '', category: 'PRODUCTION_SERVICES', cityEn: '', cityRu: '', descriptionEn: '', descriptionRu: '', website: null, email: null, phone: null, logoAssetId: null, published: true, sort: 0 };

export default function ServicesAdminPage() {
  const toast = useToast();
  const { data, mutate } = useApi<{ items: Company[] }>('/admin/services');
  const [edit, setEdit] = useState<Company | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const { id } = edit;
      // Only the editable columns: the API rejects unknown fields such as createdAt
      const clean = {
        name: edit.name,
        category: edit.category,
        cityEn: edit.cityEn,
        cityRu: edit.cityRu,
        descriptionEn: edit.descriptionEn,
        descriptionRu: edit.descriptionRu,
        website: edit.website || null,
        email: edit.email || null,
        phone: edit.phone || null,
        logoAssetId: edit.logoAssetId,
        published: edit.published,
        sort: Number(edit.sort) || 0,
      };
      if (id) await api.patch(`/admin/services/${id}`, clean);
      else await api.post('/admin/services', clean);
      await mutate();
      setEdit(null);
      toast('ok', 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Company) => {
    if (!confirm(`Удалить «${c.name}» из реестра?`)) return;
    try {
      await api.del(`/admin/services/${c.id}`);
      await mutate();
    } catch (e) {
      toast('error', errorText(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Сервисные компании"
        subtitle="Реестр продакшн-сервисов, проката, кейтеринга и кастинга на странице «Сервисы»."
        actions={
          <Button variant="primary" size="sm" onClick={() => setEdit({ ...blank, sort: data.items.length })}>
            <Plus className="size-4" /> Компания
          </Button>
        }
      />
      {data.items.length === 0 ? (
        <Empty title="Реестр пуст" />
      ) : (
        <div className="card divide-y divide-border">
          {data.items.map((c) => (
            <div key={c.id} className="flex items-center gap-4 p-4">
              {c.logo ? <AssetThumb asset={c.logo} className="size-12 rounded-lg" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-accent-soft font-bold text-accent-bright">{c.name[0]}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{c.name}</p>
                <p className="text-xs text-fg-muted">
                  {SERVICE_CATEGORY[c.category]} · {c.cityRu || c.cityEn}
                </p>
              </div>
              {!c.published && <Badge>Скрыта</Badge>}
              <button type="button" onClick={() => setEdit(c)} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10" aria-label="Изменить">
                <Pencil className="size-4" />
              </button>
              <button type="button" onClick={() => remove(c)} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger" aria-label="Удалить">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.name : 'Новая компания'} wide>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Категория">
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} options={options(SERVICE_CATEGORY)} />
            </Field>
            <Field label="Город EN">
              <Input value={edit.cityEn} onChange={(e) => setEdit({ ...edit, cityEn: e.target.value })} />
            </Field>
            <Field label="Город RU">
              <Input value={edit.cityRu} onChange={(e) => setEdit({ ...edit, cityRu: e.target.value })} />
            </Field>
            <Field label="Описание EN">
              <Textarea value={edit.descriptionEn} onChange={(e) => setEdit({ ...edit, descriptionEn: e.target.value })} rows={4} />
            </Field>
            <Field label="Описание RU">
              <Textarea value={edit.descriptionRu} onChange={(e) => setEdit({ ...edit, descriptionRu: e.target.value })} rows={4} />
            </Field>
            <Field label="Сайт">
              <Input value={edit.website ?? ''} onChange={(e) => setEdit({ ...edit, website: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Email">
              <Input value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <Field label="Телефон">
              <Input value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Логотип">
              <div className="flex items-center gap-3">
                {edit.logo && <AssetThumb asset={edit.logo} className="size-11 rounded-lg" />}
                <Button size="sm" onClick={() => setPicker(true)}>
                  Выбрать
                </Button>
                {edit.logoAssetId && (
                  <Button size="sm" onClick={() => setEdit({ ...edit, logoAssetId: null, logo: null })}>
                    Убрать
                  </Button>
                )}
              </div>
            </Field>
            <Toggle checked={edit.published} onChange={(v) => setEdit({ ...edit, published: v })} label="Показывать на сайте" />
            <div className="sm:col-span-2">
              <Button variant="primary" onClick={save} loading={busy}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <AssetPicker open={picker} onClose={() => setPicker(false)} kind="PHOTO" onPick={([a]) => setEdit((e) => (e ? { ...e, logoAssetId: a.id, logo: a } : e))} title="Логотип" />
    </div>
  );
}
