"use client";

import clsx from "clsx";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  Badge,
  Empty,
  Input,
  Loading,
  PageHeader,
} from "@/components/admin/ui";
import { fmtDate, useApi } from "@/lib/admin";
import {
  BUDGET,
  countryName,
  LEAD_STATUS,
  LEAD_STATUSES,
  PROJECT_TYPE,
} from "@/lib/admin-labels";

interface LeadRow {
  id: string;
  number: number;
  name: string;
  email: string;
  kind: "REQUEST" | "QUESTION";
  company: string;
  country: string;
  projectType: string;
  budget: string;
  shootFrom: string | null;
  shootTo: string | null;
  status: string;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  locations: { id: string; nameEn: string; slug: string }[];
  notes: number;
}

function Leads() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [q, setQ] = useState(params.get("q") ?? "");
  const query = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    page: String(page),
    limit: "50",
  });
  const { data } = useApi<{
    items: LeadRow[];
    total: number;
    pages: number;
    counts: Record<string, number>;
  }>(`/admin/leads?${query}`, { refreshInterval: 30_000 });

  const nav = (changes: Record<string, string | null>) => {
    const s = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    if (!("page" in changes)) s.delete("page");
    router.replace(`/admin/leads${s.toString() ? `?${s}` : ""}`);
  };
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) nav({ q: q.trim() || null });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const all = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0);
  const exportUrl = `/api/admin/leads/export.csv?${new URLSearchParams({ ...(status ? { status } : {}), ...(params.get("q") ? { q: params.get("q")! } : {}) })}`;

  return (
    <div>
      <PageHeader
        title="Заявки на скаутинг"
        subtitle="Заявки с формы сайта. Письмо о новой заявке уходит на адреса из «Настроек»."
        actions={
          <a href={exportUrl} className="btn-ghost btn-sm">
            <Download className="size-4" /> Экспорт CSV
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-full border border-border-strong p-1">
          {["", ...LEAD_STATUSES].map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => nav({ status: s || null })}
              className={clsx(
                "rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                status === s
                  ? "bg-white text-black"
                  : "text-fg-muted hover:text-white",
              )}
            >
              {s ? LEAD_STATUS[s].label : "Все"}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">
                {s ? (data?.counts[s] ?? 0) : all}
              </span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Номер, имя, компания, email"
            className="h-10 pl-10"
          />
        </label>
      </div>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty
          title="Заявок нет"
          text="Измените фильтр или дождитесь новых заявок с сайта."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-fg-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">№</th>
                <th className="px-4 py-3 font-medium">Компания / контакт</th>
                <th className="px-4 py-3 font-medium">Проект</th>
                <th className="px-4 py-3 font-medium">Даты</th>
                <th className="px-4 py-3 font-medium">Локации</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Получена</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => router.push(`/admin/leads/${l.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    <Link
                      href={`/admin/leads/${l.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{l.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {l.kind === "QUESTION" ? (
                      <>
                        <p className="font-medium text-white">{l.name}</p>
                        <p className="text-xs text-fg-muted">{l.email}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-white">{l.company}</p>
                        <p className="text-xs text-fg-muted">
                          {l.name} · {countryName(l.country)}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {l.kind === "QUESTION" ? (
                      <Badge tone="blue">Вопрос</Badge>
                    ) : (
                      <>
                        <p>{PROJECT_TYPE[l.projectType]}</p>
                        <p className="text-xs text-fg-subtle">
                          {BUDGET[l.budget]}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    {l.shootFrom
                      ? `${fmtDate(l.shootFrom, false)} — ${fmtDate(l.shootTo, false)}`
                      : "—"}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-xs text-fg-muted">
                    <span className="line-clamp-2">
                      {l.locations.map((x) => x.nameEn).join(", ") || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={LEAD_STATUS[l.status]?.tone}>
                      {LEAD_STATUS[l.status]?.label}
                    </Badge>
                    {l.assignee && (
                      <p className="mt-1 text-xs text-fg-subtle">
                        {l.assignee.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-fg-subtle">
                    {fmtDate(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => nav({ page: String(n) })}
              className={clsx(
                "size-9 rounded-full font-mono text-sm",
                n === page
                  ? "bg-white text-black"
                  : "text-fg-muted hover:bg-white/10",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Leads />
    </Suspense>
  );
}
