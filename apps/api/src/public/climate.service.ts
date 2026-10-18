import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@loci/db';
import { PrismaService } from '../common/prisma.service';
import { RevalidateService } from '../common/revalidate.service';

/** One calendar month of normals at a location */
export interface ClimateMonth {
  /** average daily maximum / minimum, °C */
  tmax: number;
  tmin: number;
  /** average monthly total, mm */
  precip: number;
  /** average days with ≥ 1 mm */
  rainDays: number;
  /** average bright sunshine per day, hours */
  sunHours: number;
  /** average monthly snowfall, cm */
  snowCm: number;
}

export interface ClimateMonthly {
  months: ClimateMonth[];
  period: string;
  source: string;
  computedAt: string;
}

const FROM_YEAR = 2020;
const TO_YEAR = 2024;
class RateLimited extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits;
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export const isClimate = (v: unknown): v is ClimateMonthly =>
  !!v && typeof v === 'object' && Array.isArray((v as ClimateMonthly).months) && (v as ClimateMonthly).months.length === 12;

/**
 * Monthly weather normals for each location: five years of daily ERA5 reanalysis from Open-Meteo, corrected to the
 * location's elevation, averaged per calendar month. Computed once on the first visit, stored on the location and
 * recomputed when the CMS moves the pin (the field is reset to null there).
 */
@Injectable()
export class ClimateService {
  private readonly log = new Logger('Climate');
  private readonly inflight = new Set<string>();
  /** Open-Meteo counts every 2 weeks of a long request as a call (5 years ≈ 130), so locations go one at a time */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  /** Stored normals, or null while they are being computed in the background */
  read(row: { id: string; lat: number; lng: number; elevationM: number | null; climateMonthly: Prisma.JsonValue | null }): ClimateMonthly | null {
    if (isClimate(row.climateMonthly)) return row.climateMonthly;
    this.schedule(row);
    return null;
  }

  private schedule(row: { id: string; lat: number; lng: number; elevationM: number | null }) {
    if (this.inflight.has(row.id)) return;
    this.inflight.add(row.id);
    this.queue = this.queue.then(async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const data = await this.compute(row.lat, row.lng, row.elevationM);
            await this.prisma.location.update({ where: { id: row.id }, data: { climateMonthly: data as unknown as Prisma.InputJsonValue } });
            this.revalidate.tags('locations');
            break;
          } catch (e) {
            // Rate limited: wait out the minute/hour window and try again, a few times
            if (!(e instanceof RateLimited) || attempt === 5) throw e;
            await sleep(5 * 60_000);
          }
        }
      } catch (e) {
        this.log.warn(`location ${row.id}: ${(e as Error).message}`);
      } finally {
        this.inflight.delete(row.id);
        await sleep(15_000);
      }
    });
  }

  async compute(lat: number, lng: number, elevationM: number | null): Promise<ClimateMonthly> {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    Object.entries({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      ...(elevationM != null ? { elevation: String(elevationM) } : {}),
      start_date: `${FROM_YEAR}-01-01`,
      end_date: `${TO_YEAR}-12-31`,
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,sunshine_duration',
      timezone: 'Asia/Almaty',
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 429) throw new RateLimited('Open-Meteo rate limit');
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const d = ((await res.json()) as { daily?: unknown }).daily as {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      precipitation_sum: (number | null)[];
      snowfall_sum: (number | null)[];
      sunshine_duration: (number | null)[];
    };
    if (!d?.time?.length) throw new Error('Open-Meteo returned no data');

    const acc = Array.from({ length: 12 }, () => ({ tmax: [] as number[], tmin: [] as number[], sun: [] as number[], precip: {} as Record<number, number>, snow: {} as Record<number, number>, rain: {} as Record<number, number> }));
    d.time.forEach((day, i) => {
      const [y, m] = day.split('-').map(Number);
      const a = acc[m - 1];
      const num = (v: number | null) => (v == null || Number.isNaN(v) ? null : v);
      const tx = num(d.temperature_2m_max[i]);
      const tn = num(d.temperature_2m_min[i]);
      const p = num(d.precipitation_sum[i]) ?? 0;
      const s = num(d.snowfall_sum[i]) ?? 0;
      const sun = num(d.sunshine_duration[i]);
      if (tx != null) a.tmax.push(tx);
      if (tn != null) a.tmin.push(tn);
      if (sun != null) a.sun.push(sun / 3600);
      a.precip[y] = (a.precip[y] ?? 0) + p;
      a.snow[y] = (a.snow[y] ?? 0) + s;
      a.rain[y] = (a.rain[y] ?? 0) + (p >= 1 ? 1 : 0);
    });
    return {
      months: acc.map((a) => ({
        tmax: round(avg(a.tmax), 1),
        tmin: round(avg(a.tmin), 1),
        precip: round(avg(Object.values(a.precip))),
        rainDays: round(avg(Object.values(a.rain)), 1),
        sunHours: round(avg(a.sun), 1),
        snowCm: round(avg(Object.values(a.snow))),
      })),
      period: `${FROM_YEAR}–${TO_YEAR}`,
      source: 'Open-Meteo (ERA5 reanalysis)',
      computedAt: new Date().toISOString(),
    };
  }
}
