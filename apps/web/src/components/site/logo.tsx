import clsx from 'clsx';

/**
 * LOCI360 mark: a geo-pin with a play button (ТЗ: «Гео-пик с кнопкой Play»).
 * Placeholder drawing until the customer supplies the approved logo files.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 32" aria-hidden="true" className={clsx('shrink-0', className)}>
      <path d="M12 32S0 19.5 0 12a12 12 0 1 1 24 0c0 7.5-12 20-12 20Z" fill="var(--accent)" />
      <path d="M9.5 7v10l8-5-8-5Z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-7 w-auto" />
      {!compact && <span className="font-display text-[19px] font-bold tracking-[0.14em] text-white">LOCI360</span>}
    </span>
  );
}
