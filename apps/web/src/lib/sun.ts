/**
 * Sun times and positions for the light planner (after V. Agafonkin's SunCalc / NOAA formulas, accurate to a minute).
 * All of Kazakhstan has been on UTC+5 since 1 March 2024, so local times are shown with a fixed offset.
 */

export const KZ_OFFSET_H = 5;

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // obliquity of the Earth
const J0 = 0.0009;

const toJulian = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (d: Date) => toJulian(d) - J2000;

const declination = (l: number) => Math.asin(Math.sin(E) * Math.sin(l));
const rightAscension = (l: number) => Math.atan2(Math.sin(l) * Math.cos(E), Math.cos(l));
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m: number) =>
  m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI;
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

/** Sun altitude and compass bearing (0° = north, 90° = east) at a moment */
export function sunPosition(date: Date, lat: number, lng: number) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const l = eclipticLongitude(solarMeanAnomaly(d));
  const dec = declination(l);
  const h = siderealTime(d, lw) - rightAscension(l);
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  return { altitude: altitude / RAD, bearing: (azimuth / RAD + 180 + 360) % 360 };
}

/** Moments when the sun crosses an altitude (degrees), morning and evening; null when it never does that day */
function crossing(date: Date, lat: number, lng: number, angle: number) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const transit = (j: number) => J2000 + j + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
  const noon = transit(ds);
  const cosW = (Math.sin(angle * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return { noon: fromJulian(noon), rise: null, set: null };
  const w = Math.acos(cosW);
  const set = transit(J0 + (w + lw) / (2 * Math.PI) + n);
  return { noon: fromJulian(noon), rise: fromJulian(noon - (set - noon)), set: fromJulian(set) };
}

export interface SunDay {
  noon: Date;
  noonAltitude: number;
  sunrise: Date | null;
  sunset: Date | null;
  sunriseBearing: number | null;
  sunsetBearing: number | null;
  /** golden hour: sun between the horizon and 6° */
  goldenMorningEnd: Date | null;
  goldenEveningStart: Date | null;
  /** blue hour: sun 4°–8° below the horizon */
  blueMorning: [Date, Date] | null;
  blueEvening: [Date, Date] | null;
  dayLengthMin: number | null;
}

/** The light of one local (UTC+5) calendar day at a place */
export function sunDay(isoDate: string, lat: number, lng: number): SunDay {
  const [y, mo, d] = isoDate.split('-').map(Number);
  // Local noon of that date, so the crossings belong to the right day
  const date = new Date(Date.UTC(y, mo - 1, d, 12 - KZ_OFFSET_H));
  const horizon = crossing(date, lat, lng, -0.833);
  const golden = crossing(date, lat, lng, 6);
  const blueHigh = crossing(date, lat, lng, -4);
  const blueLow = crossing(date, lat, lng, -8);
  const bearing = (t: Date | null) => (t ? sunPosition(t, lat, lng).bearing : null);
  const pair = (a: Date | null, b: Date | null): [Date, Date] | null => (a && b ? [a, b] : null);
  return {
    noon: horizon.noon,
    noonAltitude: sunPosition(horizon.noon, lat, lng).altitude,
    sunrise: horizon.rise,
    sunset: horizon.set,
    sunriseBearing: bearing(horizon.rise),
    sunsetBearing: bearing(horizon.set),
    goldenMorningEnd: golden.rise,
    goldenEveningStart: golden.set,
    blueMorning: pair(blueLow.rise, blueHigh.rise),
    blueEvening: pair(blueHigh.set, blueLow.set),
    dayLengthMin: horizon.rise && horizon.set ? Math.round((horizon.set.valueOf() - horizon.rise.valueOf()) / 60_000) : null,
  };
}

/** HH:MM in Kazakhstan time */
export function kzTime(d: Date | null) {
  if (!d) return '—';
  const t = new Date(d.valueOf() + KZ_OFFSET_H * 3_600_000);
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}

/** Minutes since local midnight (for placing moments on a 24-hour bar) */
export function kzMinutes(d: Date | null) {
  if (!d) return null;
  const t = new Date(d.valueOf() + KZ_OFFSET_H * 3_600_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** Today's date in Kazakhstan as YYYY-MM-DD */
export function kzToday() {
  return new Date(Date.now() + KZ_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

const POINTS_EN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const POINTS_RU = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];

/** 16-point compass name of a bearing */
export function compassPoint(bearing: number, lang: 'en' | 'ru') {
  return (lang === 'ru' ? POINTS_RU : POINTS_EN)[Math.round(bearing / 22.5) % 16];
}
