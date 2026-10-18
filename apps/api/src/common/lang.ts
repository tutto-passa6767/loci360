/** Content languages. English is primary; Russian falls back to English when a field is empty. */
export type Lang = 'en' | 'ru';

export const LANGS: Lang[] = ['en', 'ru'];

export const langOf = (v: unknown): Lang => (v === 'ru' ? 'ru' : 'en');

type Bilingual<F extends string> = { [K in `${F}En` | `${F}Ru`]?: string | null };

/** Localised value of a bilingual column pair, e.g. tr(location, 'name', 'ru') → nameRu || nameEn */
export function tr<F extends string>(row: Bilingual<F>, field: F, lang: Lang): string {
  const en = (row as Record<string, string | null | undefined>)[`${field}En`] ?? '';
  if (lang === 'en') return en;
  const ru = (row as Record<string, string | null | undefined>)[`${field}Ru`];
  return ru && ru.trim() ? ru : en;
}

/** Same as tr, but null when both languages are empty */
export function trOpt<F extends string>(row: Bilingual<F>, field: F, lang: Lang): string | null {
  const v = tr(row, field, lang);
  return v ? v : null;
}
