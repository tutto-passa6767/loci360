'use client';

import clsx from 'clsx';
import {
  BookOpen,
  Building2,
  Camera,
  ChartColumn,
  Clapperboard,
  ExternalLink,
  FileText,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  LogOut,
  MailCheck,
  MapPinned,
  Menu,
  Settings,
  Tags,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { Logo } from '@/components/site/logo';
import { api, useApi, type AdminUser } from '@/lib/admin';
import { ApiError } from '@/lib/client-api';
import { refreshAssets } from './assets';
import { Loading, ToastProvider } from './ui';
import { UploadsProvider } from './uploader';

const UserCtx = createContext<AdminUser | null>(null);
export const useAdminUser = () => useContext(UserCtx)!;

const NAV: { href: string; label: string; icon: typeof Inbox; admin?: boolean }[] = [
  { href: '/admin', label: 'Обзор', icon: LayoutDashboard },
  { href: '/admin/leads', label: 'Заявки', icon: Inbox },
  { href: '/admin/stats', label: 'Статистика', icon: ChartColumn },
  { href: '/admin/subscribers', label: 'Подписчики', icon: MailCheck },
  { href: '/admin/locations', label: 'Локации', icon: MapPinned },
  { href: '/admin/photos', label: 'Фото и видео', icon: Camera },
  { href: '/admin/media', label: 'Медиатека', icon: Images },
  { href: '/admin/taxonomy', label: 'Жанры и кластеры', icon: Tags },
  { href: '/admin/home', label: 'Главная', icon: Clapperboard },
  { href: '/admin/pages', label: 'Страницы', icon: FileText },
  { href: '/admin/services', label: 'Сервисные компании', icon: Building2 },
  { href: '/admin/settings', label: 'Настройки и SEO', icon: Settings, admin: true },
  { href: '/admin/users', label: 'Команда', icon: Users, admin: true },
  { href: '/admin/audit', label: 'Журнал', icon: History, admin: true },
];

/** CMS frame: checks the session, shows the sidebar, sends anonymous visitors to the sign-in page */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const isLogin = pathname === '/admin/login';
  const { data, error, isLoading, mutate } = useApi<{ user: AdminUser }>(isLogin ? null : '/auth/me', { shouldRetryOnError: false });
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (fn: (v: boolean) => boolean) => setOpenOn(fn(open) ? pathname : null);

  useEffect(() => {
    if (!isLogin && error instanceof ApiError && error.status === 401) router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }, [error, isLogin, pathname, router]);

  if (isLogin) return <ToastProvider>{children}</ToastProvider>;
  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {error && !(error instanceof ApiError && error.status === 401) ? <p className="text-fg-muted">API недоступен. Обновите страницу.</p> : <Loading />}
      </div>
    );
  }

  const user = data.user;
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    await mutate(undefined, { revalidate: false });
    router.replace('/admin/login');
  };

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.admin || user.role === 'ADMIN').map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={clsx(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            active(n.href) ? 'bg-white/10 text-white' : 'text-fg-muted hover:bg-white/5 hover:text-white',
          )}
        >
          <n.icon className={clsx('size-4', active(n.href) ? 'text-accent-bright' : '')} />
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t border-border pt-4">
      <a href="/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-white/5 hover:text-white">
        <ExternalLink className="size-4" /> Открыть сайт
      </a>
      <Link href="/admin/help" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-white/5 hover:text-white">
        <BookOpen className="size-4" /> Как работать с CMS
      </Link>
      <Link href="/admin/account" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-white/5 hover:text-white">
        <UserCog className="size-4" />
        <span className="min-w-0 flex-1 truncate">{user.name}</span>
      </Link>
      <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-white/5 hover:text-white">
        <LogOut className="size-4" /> Выйти
      </button>
    </div>
  );

  return (
    <UserCtx.Provider value={user}>
      <ToastProvider>
        <UploadsProvider onUploaded={() => void refreshAssets()}>
        <div className="min-h-screen lg:pl-64">
          <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-border bg-bg-2 p-4 lg:flex">
            <Link href="/admin" className="px-2 pt-2">
              <Logo />
              <span className="mt-1 block font-mono text-[10px] tracking-[0.2em] text-fg-subtle uppercase">CMS</span>
            </Link>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {footer}
          </aside>
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
            <Link href="/admin">
              <Logo />
            </Link>
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex size-10 items-center justify-center" aria-label="Меню">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </header>
          {open && (
            <div className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col gap-4 overflow-y-auto bg-bg p-4 lg:hidden">
              {nav}
              {footer}
            </div>
          )}
          <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
        </UploadsProvider>
      </ToastProvider>
    </UserCtx.Provider>
  );
}
