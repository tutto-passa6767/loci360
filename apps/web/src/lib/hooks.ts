'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/** Always-current reference to a value, for callbacks registered once (map events, upload callbacks) */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';

/** The visitor asked the OS for less motion: no autoplay, no hover clips */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedQuery);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}
