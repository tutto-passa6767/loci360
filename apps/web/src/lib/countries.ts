/** ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames in the visitor's language */
export const COUNTRY_CODES =
  'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'.split(' ');

/** Countries most international producers come from — shown first */
export const TOP_COUNTRIES = ['US', 'GB', 'FR', 'DE', 'IT', 'ES', 'KR', 'JP', 'CN', 'IN', 'TR', 'AE', 'KZ'];

export function countryOptions(lang: 'en' | 'ru') {
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  const name = (c: string) => names.of(c) ?? c;
  const top = TOP_COUNTRIES.map((c) => ({ code: c, name: name(c) }));
  const rest = COUNTRY_CODES.filter((c) => !TOP_COUNTRIES.includes(c))
    .map((c) => ({ code: c, name: name(c) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  return { top, rest };
}
