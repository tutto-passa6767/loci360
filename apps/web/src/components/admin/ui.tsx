'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';

// Small component kit for the CMS: forms, cards, modals, toasts.

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'size-4')} />;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'light' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }) {
  const base =
    variant === 'primary' ? 'btn-primary' : variant === 'light' ? 'btn-light' : variant === 'danger' ? 'btn border border-danger/40 bg-danger-soft text-danger hover:bg-danger/20' : 'btn-ghost';
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} className={clsx(base, size === 'sm' && 'btn-sm', className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('input', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input', props.className)} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={clsx('input', props.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-fg-muted select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={clsx('absolute top-0.5 left-0 size-5 rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-5 sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-semibold text-white">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl text-white">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-fg-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-success-soft text-success',
  yellow: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  blue: 'bg-accent-soft text-accent-bright',
  gray: 'bg-white/5 text-fg-muted',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', BADGE[tone])}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:p-10" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div className={clsx('relative w-full rounded-2xl border border-border-strong bg-surface shadow-2xl', wide ? 'max-w-5xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center">
      <p className="font-semibold text-white">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-fg-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-fg-muted">
      <Spinner className="size-6" />
    </div>
  );
}

// ---------------------------------------------------------------- toasts

type Toast = { id: number; tone: 'ok' | 'error'; text: string };
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex flex-col gap-2" aria-live="polite">
        {list.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur',
              t.tone === 'ok' ? 'border-success/30 bg-[#0f1f18]/95 text-white' : 'border-danger/40 bg-[#2a1214]/95 text-white',
            )}
          >
            {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Human-readable Russian text for API error codes */
const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  INVALID_CODE: 'Неверный код',
  MFA_EXPIRED: 'Время на ввод кода истекло — войдите заново',
  ACCOUNT_BLOCKED: 'Аккаунт заблокирован',
  SLUG_TAKEN: 'Такой адрес (slug) уже занят',
  ALREADY_EXISTS: 'Такая запись уже есть',
  INVALID_SLUG: 'Адрес: только латиница, цифры и дефисы',
  NAME_REQUIRED: 'Укажите название на английском',
  COORDINATES_REQUIRED: 'Поставьте точку на карте',
  FIELDS_REQUIRED: 'Заполните обязательные поля',
  ROLE_KIND_MISMATCH: 'Тип файла не подходит для этой роли',
  COVER_NOT_PHOTO: 'Обложкой может быть только фото',
  FORMAT_NOT_ALLOWED: 'Формат не поддерживается: загрузите видео (MP4, MOV, MXF) или фото (JPEG, PNG, TIFF, HEIC)',
  FILE_TOO_LARGE: 'Файл слишком большой',
  PARTS_MISSING: 'Не все части файла дошли — загрузка продолжится',
  NOT_A_VIDEO: 'Для настроений главной нужны видео',
  PASSWORD_TOO_SHORT: 'Пароль — не короче 10 символов',
  INVALID_EMAIL: 'Проверьте email',
  CANNOT_DEMOTE_SELF: 'Нельзя заблокировать себя или снять с себя роль администратора',
  CANNOT_DELETE_SELF: 'Нельзя удалить себя',
  FORBIDDEN: 'Недостаточно прав',
  CSRF_FAILED: 'Обновите страницу и повторите',
  UNAUTHENTICATED: 'Сессия завершена — войдите снова',
  INVALID_IATA: 'Код аэропорта — три латинские буквы (IATA)',
  INVALID_URL: 'Адрес сайта должен начинаться с http:// или https://',
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERRORS[e.code] ?? e.message;
  return (e as Error)?.message ?? 'Ошибка';
}
