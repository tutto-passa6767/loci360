"use client";

import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminUser } from "@/components/admin/shell";
import {
  Badge,
  Button,
  Card,
  errorText,
  Field,
  Loading,
  Select,
  Textarea,
  useToast,
} from "@/components/admin/ui";
import { api, fmtDate, useApi } from "@/lib/admin";
import {
  BUDGET,
  countryName,
  LEAD_STATUS,
  LEAD_STATUSES,
  PROJECT_TYPE,
} from "@/lib/admin-labels";

interface Lead {
  id: string;
  number: number;
  name: string;
  email: string;
  kind: "REQUEST" | "QUESTION";
  company: string;
  country: string;
  phone: string | null;
  projectType: string;
  budget: string;
  shootFrom: string | null;
  shootTo: string | null;
  message: string | null;
  locale: string;
  sourcePath: string | null;
  ip: string | null;
  status: string;
  createdAt: string;
  assignee: { id: string; name: string; email: string } | null;
  locations: { id: string; nameEn: string; slug: string; status: string }[];
  notes: {
    id: string;
    kind: "NOTE" | "STATUS" | "ASSIGN";
    body: string;
    createdAt: string;
    author: { id: string; name: string } | null;
  }[];
}

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useAdminUser();
  const toast = useToast();
  const { data: lead, mutate } = useApi<Lead>(`/admin/leads/${id}`);
  const { data: team } = useApi<{ items: { id: string; name: string }[] }>(
    "/admin/team",
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!lead) return <Loading />;

  const patch = async (body: Record<string, unknown>) => {
    try {
      await mutate(await api.patch<Lead>(`/admin/leads/${id}`, body), {
        revalidate: false,
      });
      toast("ok", "Сохранено");
    } catch (e) {
      toast("error", errorText(e));
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await mutate(
        await api.post<Lead>(`/admin/leads/${id}/notes`, { body: note.trim() }),
        { revalidate: false },
      );
      setNote("");
    } catch (e) {
      toast("error", errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Удалить заявку #${lead.number}? Это нельзя отменить.`))
      return;
    try {
      await api.del(`/admin/leads/${id}`);
      router.replace("/admin/leads");
    } catch (e) {
      toast("error", errorText(e));
    }
  };

  const statusText = (body: string) =>
    body.replace(/[A-Z_]+/g, (s) => LEAD_STATUS[s]?.label ?? s);
  const days =
    lead.shootFrom && lead.shootTo
      ? Math.round(
          (+new Date(lead.shootTo) - +new Date(lead.shootFrom)) / 86400_000,
        ) + 1
      : null;

  return (
    <div>
      <Link
        href="/admin/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
      >
        <ArrowLeft className="size-4" /> Все заявки
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-fg-subtle">
            {lead.kind === "QUESTION" ? "Вопрос" : "Заявка"} #{lead.number} ·{" "}
            {fmtDate(lead.createdAt)} · язык {lead.locale.toUpperCase()}
          </p>
          <h1 className="display mt-1 text-3xl text-white">
            {lead.kind === "QUESTION" ? lead.name : lead.company}
          </h1>
          <p className="mt-1 text-fg-muted">
            {lead.kind === "QUESTION"
              ? "Короткий вопрос с сайта — без проекта и бюджета"
              : `${lead.name} · ${countryName(lead.country)}`}
          </p>
        </div>
        <Badge tone={LEAD_STATUS[lead.status]?.tone}>
          {LEAD_STATUS[lead.status]?.label}
        </Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {lead.kind !== "QUESTION" && (
            <Card title="Проект">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-fg-subtle">Тип проекта</dt>
                  <dd className="mt-0.5 text-white">
                    {PROJECT_TYPE[lead.projectType]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Бюджет</dt>
                  <dd className="mt-0.5 text-white">{BUDGET[lead.budget]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Даты съёмок</dt>
                  <dd className="mt-0.5 text-white">
                    {lead.shootFrom
                      ? `${fmtDate(lead.shootFrom, false)} — ${fmtDate(lead.shootTo, false)}`
                      : "не указаны"}
                    {days ? (
                      <span className="text-fg-muted"> · {days} дн.</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">
                    Отправлена со страницы
                  </dt>
                  <dd className="mt-0.5 truncate text-white">
                    {lead.sourcePath ?? "—"}
                  </dd>
                </div>
              </dl>
              {lead.message && (
                <div className="mt-5 rounded-xl bg-bg-2 p-4 text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">
                  {lead.message}
                </div>
              )}
              <div className="mt-5">
                <p className="text-xs text-fg-subtle">Локации</p>
                {lead.locations.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {lead.locations.map((l) => (
                      <li key={l.id} className="chip">
                        <Link
                          href={`/admin/locations/${l.id}`}
                          className="hover:text-white"
                        >
                          {l.nameEn}
                        </Link>
                        <a
                          href={`/locations/${l.slug}`}
                          target="_blank"
                          aria-label="Открыть на сайте"
                          className="hover:text-white"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-fg-muted">
                    Не выбраны — смотрите описание проекта.
                  </p>
                )}
              </div>
            </Card>
          )}

          {lead.kind === "QUESTION" && (
            <Card title="Вопрос">
              <div className="rounded-xl bg-bg-2 p-4 text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">
                {lead.message}
              </div>
              <a
                href={`mailto:${lead.email}`}
                className="mt-4 inline-flex text-sm text-accent-bright hover:text-white"
              >
                Ответить на {lead.email}
              </a>
            </Card>
          )}

          <Card title="История и заметки">
            <ol className="space-y-4">
              {lead.notes.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-bright" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg-subtle">
                      {n.author?.name ?? "Система"} · {fmtDate(n.createdAt)}
                    </p>
                    <p
                      className={
                        n.kind === "NOTE"
                          ? "mt-0.5 text-sm whitespace-pre-wrap text-white"
                          : "mt-0.5 text-sm text-fg-muted"
                      }
                    >
                      {n.kind === "STATUS"
                        ? `Статус: ${statusText(n.body)}`
                        : n.kind === "ASSIGN"
                          ? `Ответственный: ${n.body}`
                          : n.body}
                    </p>
                  </div>
                </li>
              ))}
              {lead.notes.length === 0 && (
                <p className="text-sm text-fg-muted">Пока нет заметок.</p>
              )}
            </ol>
            <div className="mt-5 space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Заметка для команды: созвон, отправленные варианты, договорённости…"
                rows={3}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={addNote}
                loading={busy}
                disabled={!note.trim()}
              >
                Добавить заметку
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Работа с заявкой">
            <div className="space-y-4">
              <Field label="Статус">
                <Select
                  value={lead.status}
                  onChange={(e) => patch({ status: e.target.value })}
                  options={LEAD_STATUSES.map((s) => ({
                    value: s,
                    label: LEAD_STATUS[s].label,
                  }))}
                />
              </Field>
              <Field label="Ответственный">
                <Select
                  value={lead.assignee?.id ?? ""}
                  onChange={(e) =>
                    patch({ assigneeId: e.target.value || null })
                  }
                  options={[
                    { value: "", label: "— не назначен" },
                    ...(team?.items ?? []).map((u) => ({
                      value: u.id,
                      label: u.name,
                    })),
                  ]}
                />
              </Field>
              {!lead.assignee && (
                <Button
                  size="sm"
                  onClick={() =>
                    patch({
                      assigneeId: me.id,
                      ...(lead.status === "NEW"
                        ? { status: "IN_PROGRESS" }
                        : {}),
                    })
                  }
                >
                  Взять себе
                </Button>
              )}
            </div>
          </Card>
          <Card title="Контакты">
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href={`mailto:${lead.email}?subject=${encodeURIComponent(`LOCI360 — scouting request #${lead.number}`)}`}
                  className="flex items-center gap-2 text-white hover:text-accent-bright"
                >
                  <Mail className="size-4 text-accent-bright" /> {lead.email}
                </a>
              </li>
              {lead.phone && (
                <li>
                  <a
                    href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                    className="flex items-center gap-2 text-white hover:text-accent-bright"
                  >
                    <Phone className="size-4 text-accent-bright" /> {lead.phone}
                  </a>
                </li>
              )}
            </ul>
            {lead.ip && (
              <p className="mt-4 font-mono text-[11px] text-fg-subtle">
                IP {lead.ip}
              </p>
            )}
          </Card>
          {me.role === "ADMIN" && (
            <Button variant="danger" size="sm" onClick={remove}>
              Удалить заявку
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
