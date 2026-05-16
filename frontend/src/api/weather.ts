import type { ForecastResponse } from "../types/weather";

export async function fetchForecast(city: string): Promise<ForecastResponse> {
  const res = await fetch("/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getTimezone(lat: number, lon: number) {
  try {
    const res = await fetch(
      `https://timeapi.io/api/time/current/coordinate?latitude=${lat}&longitude=${lon}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const d = await res.json();
      return {
        timezone: d.timeZone ?? "UTC",
        offset: d.utcOffset ? parseOffset(d.utcOffset) : 0,
        localTime: d.dateTime ? fmtTime(d.dateTime) : "--:--",
      };
    }
  } catch {}
  const offset = Math.round(lon / 15);
  const now = new Date();
  const local = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offset * 3600000);
  return {
    timezone: `UTC${offset >= 0 ? "+" : ""}${offset}`,
    offset,
    localTime: local.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function parseOffset(s: string): number {
  const m = s.match(/^([+-]?)(\d{1,2}):?(\d{2})?$/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (parseInt(m[2]) + parseInt(m[3] ?? "0") / 60);
}

function fmtTime(s: string): string {
  try {
    return new Date(s).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return s;
  }
}