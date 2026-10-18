"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Star,
  Trash2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { KeyedMutator } from "swr";
import { api, useApi, type AdminAsset } from "@/lib/admin";
import {
  ACCESS,
  ASSET_STATE,
  CONNECTIVITY,
  DRONE,
  MEDIA_ROLE,
  options,
  POWER,
  PUBLISH_STATUS,
  SEASON,
  TERM_KIND,
  TIME_OF_DAY,
} from "@/lib/admin-labels";
import { AssetPicker, AssetThumb } from "./assets";
import { MapPicker } from "./map-picker";
import { useAdminUser } from "./shell";
import {
  Badge,
  Button,
  Card,
  errorText,
  Field,
  Input,
  Loading,
  Select,
  Textarea,
  Toggle,
  useToast,
} from "./ui";

type Media = {
  assetId: string;
  role: string;
  timeOfDay: string | null;
  labelEn: string | null;
  labelRu: string | null;
  asset: AdminAsset;
};

interface LocationData {
  id: string;
  slug: string;
  status: string;
  [key: string]: unknown;
  termIds: string[];
  seasons: string[];
  media: Media[];
  panoramaEmbeds: Embed[];
  cover: AdminAsset | null;
  og: AdminAsset | null;
  coverAssetId: string | null;
  ogAssetId: string | null;
}

/** A hosted 360° view: what the editor pasted (code or link) plus labels; the API returns the checked player URL */
interface Embed {
  id?: string;
  src?: string;
  provider?: string;
  code?: string;
  labelEn: string | null;
  labelRu: string | null;
  credit: string | null;
}

interface Term {
  id: string;
  kind: string;
  slug: string;
  labelEn: string;
  labelRu: string;
}

const TEXT = [
  "nameEn",
  "nameRu",
  "summaryEn",
  "summaryRu",
  "descriptionEn",
  "descriptionRu",
  "regionEn",
  "regionRu",
  "airportCode",
  "airportNameEn",
  "airportNameRu",
  "railStationEn",
  "railStationRu",
  "nearestTownEn",
  "nearestTownRu",
  "accessNotesEn",
  "accessNotesRu",
  "hotelsEn",
  "hotelsRu",
  "permitNotesEn",
  "permitNotesRu",
  "climateEn",
  "climateRu",
  "seoTitleEn",
  "seoTitleRu",
  "seoDescriptionEn",
  "seoDescriptionRu",
  "slug",
] as const;
const NUM = [
  "lat",
  "lng",
  "elevationM",
  "airportKm",
  "driveHours",
  "railKm",
  "townKm",
  "hotelKm",
  "sort",
] as const;

type Form = Record<(typeof TEXT)[number] | (typeof NUM)[number], string> & {
  status: string;
  clusterId: string;
  heavyAccess: string;
  connectivity: string;
  power: string;
  drone: string;
  nationalPark: boolean;
  borderZone: boolean;
  featured: boolean;
  seasons: string[];
  termIds: string[];
  coverAssetId: string | null;
  ogAssetId: string | null;
};

const empty: Form = {
  ...(Object.fromEntries([...TEXT, ...NUM].map((k) => [k, ""])) as Record<
    (typeof TEXT)[number] | (typeof NUM)[number],
    string
  >),
  status: "DRAFT",
  clusterId: "",
  heavyAccess: "LIMITED",
  connectivity: "G4",
  power: "GENERATOR",
  drone: "ALLOWED",
  nationalPark: false,
  borderZone: false,
  featured: false,
  seasons: [],
  termIds: [],
  coverAssetId: null,
  ogAssetId: null,
  sort: "0",
};

function toForm(d: LocationData): Form {
  const f = { ...empty };
  for (const k of TEXT) f[k] = (d[k] as string | null) ?? "";
  for (const k of NUM) f[k] = d[k] == null ? "" : String(d[k]);
  return {
    ...f,
    status: d.status,
    clusterId: (d.clusterId as string | null) ?? "",
    heavyAccess: d.heavyAccess as string,
    connectivity: d.connectivity as string,
    power: d.power as string,
    drone: d.drone as string,
    nationalPark: !!d.nationalPark,
    borderZone: !!d.borderZone,
    featured: !!d.featured,
    seasons: d.seasons,
    termIds: d.termIds,
    coverAssetId: d.coverAssetId,
    ogAssetId: d.ogAssetId,
  };
}

function toBody(f: Form) {
  const body: Record<string, unknown> = {};
  for (const k of TEXT)
    body[k] =
      f[k].trim() === ""
        ? k === "slug"
          ? undefined
          : k.startsWith("name") ||
              k.startsWith("summary") ||
              k.startsWith("description")
            ? ""
            : null
        : f[k].trim();
  for (const k of NUM)
    body[k] =
      f[k].trim() === ""
        ? k === "lat" || k === "lng"
          ? undefined
          : k === "sort"
            ? 0
            : null
        : Number(f[k].replace(",", "."));
  return {
    ...body,
    status: f.status,
    clusterId: f.clusterId || null,
    heavyAccess: f.heavyAccess,
    connectivity: f.connectivity,
    power: f.power,
    drone: f.drone,
    nationalPark: f.nationalPark,
    borderZone: f.borderZone,
    featured: f.featured,
    seasons: f.seasons,
    termIds: f.termIds,
    coverAssetId: f.coverAssetId,
    ogAssetId: f.ogAssetId,
  };
}

const TABS = [
  { key: "main", label: "Основное" },
  { key: "spec", label: "Технический паспорт" },
  { key: "media", label: "Медиа" },
  { key: "seo", label: "SEO" },
] as const;

/** Pair of inputs for a bilingual column: English (primary) and Russian */
function Bi({
  f,
  set,
  name,
  label,
  area,
  hint,
}: {
  f: Form;
  set: (k: keyof Form, v: string) => void;
  name: string;
  label: string;
  area?: number;
  hint?: string;
}) {
  const en = `${name}En` as keyof Form;
  const ru = `${name}Ru` as keyof Form;
  const C = area ? Textarea : Input;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} · EN`} hint={hint}>
        <C
          value={f[en] as string}
          onChange={(
            e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>,
          ) => set(en, e.target.value)}
          rows={area}
        />
      </Field>
      <Field label={`${label} · RU`}>
        <C
          value={f[ru] as string}
          onChange={(
            e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>,
          ) => set(ru, e.target.value)}
          rows={area}
        />
      </Field>
    </div>
  );
}

export function LocationEditor({ id }: { id?: string }) {
  const { data, mutate } = useApi<LocationData>(
    id ? `/admin/locations/${id}` : null,
  );
  if (id && !data) return <Loading />;
  return <EditorForm id={id} data={data ?? null} mutate={mutate} />;
}

function EditorForm({
  id,
  data,
  mutate,
}: {
  id?: string;
  data: LocationData | null;
  mutate: KeyedMutator<LocationData>;
}) {
  const router = useRouter();
  const toast = useToast();
  const user = useAdminUser();
  const { data: terms } = useApi<{ items: Term[] }>("/admin/terms");
  const { data: clusters } = useApi<{
    items: { id: string; nameEn: string }[];
  }>("/admin/clusters");
  const [f, setF] = useState<Form>(() => (data ? toForm(data) : empty));
  const [media, setMedia] = useState<Media[]>(data?.media ?? []);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("main");
  const [busy, setBusy] = useState(false);
  const [dirtyMedia, setDirtyMedia] = useState(false);
  const [embeds, setEmbeds] = useState<Embed[]>(data?.panoramaEmbeds ?? []);
  const [dirtyEmbeds, setDirtyEmbeds] = useState(false);
  const updateEmbed = (i: number, patch: Partial<Embed>) => {
    setEmbeds((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirtyEmbeds(true);
  };
  const [picker, setPicker] = useState<null | "media" | "og">(null);

  const set = (k: keyof Form, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const termGroups = useMemo(() => {
    const g: Record<string, Term[]> = {};
    for (const t of terms?.items ?? []) (g[t.kind] ??= []).push(t);
    return g;
  }, [terms]);

  const save = async () => {
    setBusy(true);
    try {
      if (!id) {
        const created = await api.post<LocationData>(
          "/admin/locations",
          toBody(f),
        );
        toast("ok", "Локация создана");
        router.replace(`/admin/locations/${created.id}`);
        return;
      }
      let saved = await api.patch<LocationData>(
        `/admin/locations/${id}`,
        toBody(f),
      );
      if (dirtyMedia) {
        saved = await api.put<LocationData>(`/admin/locations/${id}/media`, {
          items: media.map((m) => ({
            assetId: m.assetId,
            role: m.role,
            timeOfDay: m.timeOfDay,
            labelEn: m.labelEn,
            labelRu: m.labelRu,
          })),
        });
      }
      if (dirtyEmbeds) {
        saved = await api.put<LocationData>(`/admin/locations/${id}/embeds`, {
          items: embeds.map((e) => ({
            code: e.code ?? e.src ?? "",
            labelEn: e.labelEn || undefined,
            labelRu: e.labelRu || undefined,
            credit: e.credit || undefined,
          })),
        });
      }
      await mutate(saved, { revalidate: false });
      setMedia(saved.media);
      setDirtyMedia(false);
      setEmbeds(saved.panoramaEmbeds ?? []);
      setDirtyEmbeds(false);
      toast("ok", "Сохранено — сайт обновится сразу");
    } catch (e) {
      toast("error", errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm("Удалить локацию? Медиафайлы останутся в медиатеке."))
      return;
    try {
      await api.del(`/admin/locations/${id}`);
      router.replace("/admin/locations");
    } catch (e) {
      toast("error", errorText(e));
    }
  };

  const addMedia = (assets: AdminAsset[]) => {
    setMedia((list) => [
      ...list,
      ...assets
        .filter((a) => !list.some((m) => m.assetId === a.id))
        .map((a) => ({
          assetId: a.id,
          role:
            a.kind === "VIDEO"
              ? list.some((m) => m.role === "SHOWREEL")
                ? "BROLL"
                : "SHOWREEL"
              : a.kind,
          timeOfDay: a.kind === "PHOTO" ? "DAY" : null,
          labelEn: null,
          labelRu: null,
          asset: a,
        })),
    ]);
    setDirtyMedia(true);
  };
  const updateMedia = (i: number, patch: Partial<Media>) => {
    setMedia((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));
    setDirtyMedia(true);
  };
  const move = (i: number, d: number) => {
    setMedia((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
      return next;
    });
    setDirtyMedia(true);
  };

  const lat = f.lat ? Number(f.lat) : null;
  const lng = f.lng ? Number(f.lng) : null;

  return (
    <div>
      <Link
        href="/admin/locations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
      >
        <ArrowLeft className="size-4" /> Все локации
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display truncate text-3xl text-white">
            {f.nameEn || "Новая локация"}
          </h1>
          {data && (
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={PUBLISH_STATUS[data.status].tone}>
                {PUBLISH_STATUS[data.status].label}
              </Badge>
              {data.status === "PUBLISHED" && (
                <a
                  href={`/locations/${data.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs text-accent-bright hover:text-white"
                >
                  Открыть на сайте <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={f.status}
            onChange={(e) => set("status", e.target.value)}
            className="input h-10 w-auto rounded-full text-[13px]"
          >
            {options(
              Object.fromEntries(
                Object.entries(PUBLISH_STATUS).map(([k, v]) => [k, v.label]),
              ),
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={save} loading={busy}>
            {id ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>

      <div className="scrollbar-none mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((t) => id || t.key !== "media").map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
              tab === t.key
                ? "border-accent-bright text-white"
                : "border-transparent text-fg-muted hover:text-white",
            )}
          >
            {t.label}
            {t.key === "media" && (
              <span className="ml-1.5 font-mono text-[11px] text-fg-subtle">
                {media.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "main" && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card title="Описание">
            <div className="space-y-4">
              <Bi f={f} set={set} name="name" label="Название" />
              <Bi
                f={f}
                set={set}
                name="summary"
                label="Коротко (карточка каталога)"
                hint="Одна фраза до 300 символов"
              />
              <Bi
                f={f}
                set={set}
                name="description"
                label="Подробное описание"
                area={8}
                hint="Абзацы разделяйте пустой строкой"
              />
              <Bi f={f} set={set} name="region" label="Регион / область" />
            </div>
          </Card>
          <div className="space-y-6">
            <Card title="Публикация">
              <div className="space-y-4">
                <Field
                  label="Адрес страницы (slug)"
                  hint={
                    id
                      ? `loci360.kz/locations/${f.slug}`
                      : "Создаётся из английского названия, если оставить пустым"
                  }
                >
                  <Input
                    value={f.slug}
                    onChange={(e) => set("slug", e.target.value.toLowerCase())}
                    placeholder="charyn-canyon"
                  />
                </Field>
                <Field label="Кластер">
                  <Select
                    value={f.clusterId}
                    onChange={(e) => set("clusterId", e.target.value)}
                    options={[
                      { value: "", label: "— без кластера" },
                      ...(clusters?.items ?? []).map((c) => ({
                        value: c.id,
                        label: c.nameEn,
                      })),
                    ]}
                  />
                </Field>
                <Toggle
                  checked={f.featured}
                  onChange={(v) => set("featured", v)}
                  label="Избранная (подборка на главной, белый пин на карте)"
                />
                <Field
                  label="Порядок"
                  hint="Меньше — выше в списке «Рекомендуемые»"
                >
                  <Input
                    type="number"
                    value={f.sort}
                    onChange={(e) => set("sort", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
            <Card title="Жанры и типы">
              <div className="space-y-5">
                {Object.entries(termGroups).map(([kind, list]) => (
                  <div key={kind}>
                    <p className="mb-2 text-xs font-medium text-fg-subtle">
                      {TERM_KIND[kind]}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((t) => {
                        const on = f.termIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              set(
                                "termIds",
                                on
                                  ? f.termIds.filter((x) => x !== t.id)
                                  : [...f.termIds, t.id],
                              )
                            }
                            className={clsx(
                              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              on
                                ? "border-accent bg-accent text-white"
                                : "border-border-strong text-fg-muted hover:text-white",
                            )}
                          >
                            {t.labelRu || t.labelEn}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "spec" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="География">
            <div className="space-y-4">
              <MapPicker
                lat={lat}
                lng={lng}
                onChange={(la, ln) =>
                  setF((p) => ({ ...p, lat: String(la), lng: String(ln) }))
                }
              />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Широта">
                  <Input
                    value={f.lat}
                    onChange={(e) => set("lat", e.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Долгота">
                  <Input
                    value={f.lng}
                    onChange={(e) => set("lng", e.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Высота, м">
                  <Input
                    value={f.elevationM}
                    onChange={(e) => set("elevationM", e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <Field label="Сезоны">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(SEASON).map(([k, label]) => {
                    const on = f.seasons.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() =>
                          set(
                            "seasons",
                            on
                              ? f.seasons.filter((x) => x !== k)
                              : [...f.seasons, k],
                          )
                        }
                        className={clsx(
                          "rounded-full border px-3 py-1.5 text-xs font-medium",
                          on
                            ? "border-accent bg-accent text-white"
                            : "border-border-strong text-fg-muted hover:text-white",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Bi f={f} set={set} name="climate" label="Климат" area={3} />
            </div>
          </Card>
          <Card title="Логистика">
            <div className="space-y-4">
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <Field label="IATA">
                  <Input
                    value={f.airportCode}
                    onChange={(e) =>
                      set(
                        "airportCode",
                        e.target.value.toUpperCase().slice(0, 3),
                      )
                    }
                    placeholder="ALA"
                  />
                </Field>
                <Field label="До аэропорта, км">
                  <Input
                    value={f.airportKm}
                    onChange={(e) => set("airportKm", e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <Bi f={f} set={set} name="airportName" label="Аэропорт" />
              <Field label="Время в пути от аэропорта, ч">
                <Input
                  value={f.driveHours}
                  onChange={(e) => set("driveHours", e.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Bi f={f} set={set} name="railStation" label="Ж/д станция" />
              <Field label="До станции, км">
                <Input
                  value={f.railKm}
                  onChange={(e) => set("railKm", e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Bi f={f} set={set} name="nearestTown" label="Ближайший город" />
              <Field label="До города, км">
                <Input
                  value={f.townKm}
                  onChange={(e) => set("townKm", e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Подъезд тяжёлой техники">
                <Select
                  value={f.heavyAccess}
                  onChange={(e) => set("heavyAccess", e.target.value)}
                  options={options(ACCESS)}
                />
              </Field>
              <Bi
                f={f}
                set={set}
                name="accessNotes"
                label="Подробно о подъезде"
                area={3}
              />
            </div>
          </Card>
          <Card title="Инфраструктура">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Мобильная связь">
                  <Select
                    value={f.connectivity}
                    onChange={(e) => set("connectivity", e.target.value)}
                    options={options(CONNECTIVITY)}
                  />
                </Field>
                <Field label="Электричество">
                  <Select
                    value={f.power}
                    onChange={(e) => set("power", e.target.value)}
                    options={options(POWER)}
                  />
                </Field>
              </div>
              <Bi f={f} set={set} name="hotels" label="Проживание" area={2} />
              <Field label="До жилья, км">
                <Input
                  value={f.hotelKm}
                  onChange={(e) => set("hotelKm", e.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </Card>
          <Card title="Ограничения">
            <div className="space-y-4">
              <Toggle
                checked={f.nationalPark}
                onChange={(v) => set("nationalPark", v)}
                label="Национальный парк / заповедник"
              />
              <Toggle
                checked={f.borderZone}
                onChange={(v) => set("borderZone", v)}
                label="Пограничная зона"
              />
              <Field label="Дроны">
                <Select
                  value={f.drone}
                  onChange={(e) => set("drone", e.target.value)}
                  options={options(DRONE)}
                />
              </Field>
              <Bi
                f={f}
                set={set}
                name="permitNotes"
                label="Разрешения"
                area={3}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === "media" && id && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-2xl space-y-2 text-sm text-fg-muted">
              <p>
                Шоурилы — флагманские ролики; несколько шоурилов показываются
                как варианты окраса/настроения (подпишите их). Фото
                группируются на сайте по времени суток. Порядок — как в списке.
              </p>
              <p>
                Фото, шоурил и обложку проще менять в разделе{" "}
                <Link
                  href={`/admin/photos/${id}`}
                  className="text-accent-bright hover:text-white"
                >
                  «Фото и видео»
                </Link>{" "}
                — там можно просто перетащить файлы, и всё сохраняется сразу.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPicker("media")}
            >
              <ImagePlus className="size-4" /> Добавить из медиатеки
            </Button>
          </div>
          {media.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-fg-muted">
              Медиа ещё нет — добавьте видео, фото и панорамы из медиатеки.
            </div>
          ) : (
            <div className="card divide-y divide-border">
              {media.map((m, i) => (
                <div
                  key={m.assetId}
                  className="flex flex-wrap items-start gap-4 p-4"
                >
                  <div className="relative w-40 shrink-0">
                    <AssetThumb
                      asset={m.asset}
                      className="aspect-video rounded-lg"
                    />
                    {f.coverAssetId === m.assetId && (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-black">
                        Обложка
                      </span>
                    )}
                  </div>
                  <div className="min-w-[240px] flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-white">
                        {m.asset.title}
                      </p>
                      {m.asset.state !== "READY" && (
                        <Badge tone={ASSET_STATE[m.asset.state].tone}>
                          {ASSET_STATE[m.asset.state].label}
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Select
                        value={m.role}
                        onChange={(e) =>
                          updateMedia(i, {
                            role: e.target.value,
                            timeOfDay:
                              e.target.value === "PHOTO"
                                ? (m.timeOfDay ?? "DAY")
                                : null,
                          })
                        }
                        options={Object.entries(MEDIA_ROLE)
                          .filter(([r]) =>
                            m.asset.kind === "VIDEO"
                              ? r === "SHOWREEL" || r === "BROLL"
                              : r === m.asset.kind,
                          )
                          .map(([value, label]) => ({ value, label }))}
                        className="h-10"
                      />
                      {m.role === "PHOTO" && (
                        <Select
                          value={m.timeOfDay ?? ""}
                          onChange={(e) =>
                            updateMedia(i, {
                              timeOfDay: e.target.value || null,
                            })
                          }
                          options={[
                            { value: "", label: "— время суток" },
                            ...options(TIME_OF_DAY),
                          ]}
                          className="h-10"
                        />
                      )}
                      <Input
                        value={m.labelEn ?? ""}
                        onChange={(e) =>
                          updateMedia(i, { labelEn: e.target.value || null })
                        }
                        placeholder={
                          m.role === "SHOWREEL"
                            ? "Настроение EN, напр. Teal & orange"
                            : "Подпись EN"
                        }
                        className="h-10"
                      />
                      <Input
                        value={m.labelRu ?? ""}
                        onChange={(e) =>
                          updateMedia(i, { labelRu: e.target.value || null })
                        }
                        placeholder="Подпись RU"
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.asset.kind !== "VIDEO" || m.asset.thumb ? (
                      <button
                        type="button"
                        onClick={() => set("coverAssetId", m.assetId)}
                        title="Сделать обложкой"
                        className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 hover:text-warning"
                      >
                        <Star
                          className={clsx(
                            "size-4",
                            f.coverAssetId === m.assetId &&
                              "fill-warning text-warning",
                          )}
                        />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 disabled:opacity-30"
                      aria-label="Выше"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === media.length - 1}
                      className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 disabled:opacity-30"
                      aria-label="Ниже"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMedia((l) =>
                          l.filter((x) => x.assetId !== m.assetId),
                        );
                        if (f.coverAssetId === m.assetId)
                          set("coverAssetId", null);
                        setDirtyMedia(true);
                      }}
                      className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Убрать"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {dirtyMedia && (
            <p className="text-sm text-warning">
              Есть несохранённые изменения медиа — нажмите «Сохранить».
            </p>
          )}

          <Card title="360° по коду встраивания">
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-fg-muted">
              Панорамы, которые хранятся на сервисах 360°: купленный на
              360Cities «Hosted Embed» (код вида paid_embed_iframe), Kuula,
              Momento360, Matterport или Google Street View. Вставьте код
              &lt;iframe&gt; или ссылку на плеер. На сайте плеер грузится только
              по клику посетителя, в блоке 360° рядом с нашими панорамами.
            </p>
            <div className="space-y-4">
              {embeds.map((e, i) => (
                <div
                  key={e.id ?? i}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs text-fg-subtle">
                      {e.provider
                        ? `${e.provider} · ${e.src}`
                        : "Новая панорама"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEmbeds((l) => l.filter((_, j) => j !== i));
                        setDirtyEmbeds(true);
                      }}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Убрать"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Код встраивания или ссылка"
                      className="sm:col-span-2"
                    >
                      <Textarea
                        rows={2}
                        value={e.code ?? e.src ?? ""}
                        onChange={(ev) =>
                          updateEmbed(i, { code: ev.target.value })
                        }
                        placeholder='<iframe src="https://www.360cities.net/paid_embed_iframe/…"></iframe>'
                      />
                    </Field>
                    <Field label="Подпись EN">
                      <Input
                        value={e.labelEn ?? ""}
                        onChange={(ev) =>
                          updateEmbed(i, { labelEn: ev.target.value || null })
                        }
                      />
                    </Field>
                    <Field label="Подпись RU">
                      <Input
                        value={e.labelRu ?? ""}
                        onChange={(ev) =>
                          updateEmbed(i, { labelRu: ev.target.value || null })
                        }
                      />
                    </Field>
                    <Field
                      label="Автор / лицензия"
                      className="sm:col-span-2"
                      hint="Например «Имя Фамилия / 360Cities, лицензия до 2027»"
                    >
                      <Input
                        value={e.credit ?? ""}
                        onChange={(ev) =>
                          updateEmbed(i, { credit: ev.target.value || null })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                disabled={embeds.length >= 12}
                onClick={() => {
                  setEmbeds((l) => [
                    ...l,
                    { code: "", labelEn: null, labelRu: null, credit: null },
                  ]);
                  setDirtyEmbeds(true);
                }}
              >
                <Plus className="size-4" /> Добавить панораму по коду
              </Button>
            </div>
            {dirtyEmbeds && (
              <p className="mt-3 text-sm text-warning">
                Есть несохранённые изменения — нажмите «Сохранить».
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === "seo" && (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card title="Поисковые системы и соцсети">
            <div className="space-y-4">
              <Bi
                f={f}
                set={set}
                name="seoTitle"
                label="Title"
                hint="Если пусто — название локации"
              />
              <Bi
                f={f}
                set={set}
                name="seoDescription"
                label="Description"
                area={3}
                hint="Если пусто — краткое описание"
              />
              <Field
                label="Картинка для соцсетей (Open Graph)"
                hint="Если не выбрана — обложка локации"
              >
                <div className="flex items-center gap-3">
                  {data?.og && f.ogAssetId === data.og.id && (
                    <AssetThumb
                      asset={data.og}
                      className="aspect-[1.91/1] w-40 rounded-lg"
                    />
                  )}
                  <Button size="sm" onClick={() => setPicker("og")}>
                    {f.ogAssetId ? "Заменить" : "Выбрать"}
                  </Button>
                  {f.ogAssetId && (
                    <Button size="sm" onClick={() => set("ogAssetId", null)}>
                      Убрать
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </Card>
          <Card title="Как это выглядит в Google">
            <div className="rounded-xl bg-white p-4 text-left font-sans">
              <p className="truncate text-xs text-[#4d5156]">
                loci360.kz › locations › {f.slug || "…"}
              </p>
              <p className="mt-1 truncate text-lg text-[#1a0dab]">
                {(f.seoTitleEn || f.nameEn || "Название") + " — LOCI360"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-[#4d5156]">
                {f.seoDescriptionEn || f.summaryEn || "Описание локации"}
              </p>
            </div>
          </Card>
        </div>
      )}

      {id && user.role === "ADMIN" && (
        <div className="mt-10 border-t border-border pt-6">
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 className="size-4" /> Удалить локацию
          </Button>
        </div>
      )}

      <AssetPicker
        open={picker === "media"}
        onClose={() => setPicker(null)}
        multiple
        onPick={addMedia}
        title="Добавить медиа к локации"
      />
      <AssetPicker
        open={picker === "og"}
        onClose={() => setPicker(null)}
        kind="PHOTO"
        onPick={([a]) => set("ogAssetId", a.id)}
        title="Картинка для соцсетей"
      />
    </div>
  );
}
