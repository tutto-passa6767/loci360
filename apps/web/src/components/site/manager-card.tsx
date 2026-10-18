import clsx from 'clsx';
import { ArrowUpRight, Mail, MessageCircle, Phone, Send } from 'lucide-react';
import Link from 'next/link';
import { Picture } from '@/components/media/picture';
import { dict, href } from '@/lib/i18n';
import type { Lang, SiteData } from '@/lib/types';
import { Logo } from './logo';

type Manager = NonNullable<SiteData['manager']>;

/**
 * "Talk to the location manager": photo, name and the direct lines (phone, WhatsApp, Telegram, email).
 * Until the CMS has a name the card speaks for the location office.
 */
export function ManagerCard({ lang, manager, className, request = true }: { lang: Lang; manager: Manager | undefined; className?: string; request?: boolean }) {
  const t = dict(lang).manager;
  if (!manager) return null;
  const channels = [
    manager.phone && { href: `tel:${manager.phone.replace(/[^\d+]/g, '')}`, label: t.call, icon: Phone },
    manager.whatsapp && { href: `https://wa.me/${manager.whatsapp}`, label: t.whatsapp, icon: MessageCircle, external: true },
    manager.telegram && { href: `https://t.me/${manager.telegram}`, label: t.telegram, icon: Send, external: true },
    manager.email && { href: `mailto:${manager.email}`, label: t.email, icon: Mail },
  ].filter((c): c is { href: string; label: string; icon: typeof Phone; external?: boolean } => !!c);

  return (
    <div className={clsx('card flex flex-col gap-5 p-5 sm:p-6', className)}>
      <div className="flex items-center gap-4">
        <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white/[0.04]">
          {manager.photo ? <Picture image={manager.photo} sizes="64px" className="absolute inset-0 size-full" /> : <Logo compact />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-medium text-white">{manager.name ?? t.office}</span>
          <span className="block text-sm text-fg-muted">{manager.role ?? t.officeRole}</span>
        </span>
      </div>
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <a
              key={c.label}
              href={c.href}
              {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-strong px-3.5 text-[13px] text-white/85 transition-colors hover:border-white/40 hover:text-white"
            >
              <c.icon className="size-3.5" /> {c.label}
            </a>
          ))}
        </div>
      )}
      {request && (
        <Link href={href(lang, '/request')} className="group btn-primary h-11 self-start pr-1.5 pl-5">
          {t.request}
          <span className="btn-dot ml-1 size-8">
            <ArrowUpRight className="size-4" />
          </span>
        </Link>
      )}
    </div>
  );
}
