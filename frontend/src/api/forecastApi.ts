export type ForecastPoint = {
  date: string;
  temperature: number;
  precipitation: number;
  wind_speed: number;
  weather_type?: string;
  anomaly_score?: number;
};

export type ForecastResponse = {
  city: string;
  forecast: ForecastPoint[];
};

const API_BASE = "http://localhost:8000";

export async function getForecast(city: string): Promise<ForecastResponse> {
  const res = await fetch(`${API_BASE}/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      city,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch forecast");
  }

  return await res.json();
}