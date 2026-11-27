export interface WeatherSnapshot {
  tempC: number;
  condition: string;
  wmoCode: number;
  city: string;
  lat: number;
  lon: number;
  source: 'open-meteo' | 'fallback';
  fetchedAtIso: string;
  /** LVGL-safe ASCII string for Even G2 lens top bar, e.g. "24C Clear" */
  g2Label: string;
  /** Rich Unicode label for Web Optical Studio, e.g. "24°C Clear" */
  webLabel: string;
}

const DEFAULT_CITY = 'Dubai';
const DEFAULT_LAT = 25.2048;
const DEFAULT_LON = 55.2708;
const CACHE_TTL_MS = 15 * 60_000;

export function decodeWmoCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1 || code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow';
  if (code >= 95) return 'Storm';
  return 'Fair';
}

export function formatWeatherCompact(tempC: number, condition: string): { g2Label: string; webLabel: string } {
  const t = Math.round(tempC);
  const shortCond = condition === 'Partly Cloudy' ? 'Cloudy' : condition;
  return {
    g2Label: `${t}C ${shortCond}`,
    webLabel: `${t}°C ${shortCond}`,
  };
}

export class LiveWeatherService {
  private cache = new Map<string, { snap: WeatherSnapshot; expiresAtMs: number }>();

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getWeather(opts: { city?: string; lat?: number; lon?: number } = {}): Promise<WeatherSnapshot> {
    const city = (opts.city?.trim() || DEFAULT_CITY).slice(0, 32);
    const lat = Number.isFinite(opts.lat) ? Number(opts.lat) : DEFAULT_LAT;
    const lon = Number.isFinite(opts.lon) ? Number(opts.lon) : DEFAULT_LON;
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && now < hit.expiresAtMs) {
      return hit.snap;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&current=temperature_2m,weather_code&timezone=auto`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      try {
        const res = await this.fetchImpl(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          current?: { temperature_2m?: number; weather_code?: number };
        };
        const tempC = Number(json.current?.temperature_2m);
        const wmoCode = Number(json.current?.weather_code ?? 0);
        if (!Number.isFinite(tempC)) throw new Error('Missing temperature_2m');
        const condition = decodeWmoCondition(wmoCode);
        const { g2Label, webLabel } = formatWeatherCompact(tempC, condition);
        const snap: WeatherSnapshot = {
          tempC: Math.round(tempC * 10) / 10,
          condition,
          wmoCode,
          city,
          lat,
          lon,
          source: 'open-meteo',
          fetchedAtIso: new Date(now).toISOString(),
          g2Label,
          webLabel,
        };
        this.cache.set(key, { snap, expiresAtMs: now + CACHE_TTL_MS });
        return snap;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      const { g2Label, webLabel } = formatWeatherCompact(24, 'Clear');
      const fallback: WeatherSnapshot = {
        tempC: 24,
        condition: 'Clear',
        wmoCode: 0,
        city,
        lat,
        lon,
        source: 'fallback',
        fetchedAtIso: new Date(now).toISOString(),
        g2Label,
        webLabel,
      };
      this.cache.set(key, { snap: fallback, expiresAtMs: now + 60_000 });
      return fallback;
    }
  }
}
