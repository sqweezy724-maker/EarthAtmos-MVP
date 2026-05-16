export interface WeatherProbabilities {
  clear: number;
  cloudy: number;
  rain: number;
  snow: number;
  storm: number;
}

export interface HourlyData {
  hour: number;
  time: string;
  temperature: number;
  humidity: number;
  wind_speed: number;
  pressure: number;
  weather_type: string;
  weather_confidence: number;
  weather_probabilities: WeatherProbabilities;
  precipitation_probability: number;
}

export interface DailySummary {
  temperature_mean: number;
  temperature_min: number;
  temperature_max: number;
  humidity_avg: number;
  wind_speed_avg: number;
  wind_speed_max: number;
  pressure_avg: number;
  precipitation_probability: number;
  weather_type: string;
  weather_confidence: number;
}

export interface AnomalyData {
  score: number;
  level: "normal" | "mild" | "severe" | "unknown";
  raw_if_score: number;
  is_anomaly: boolean;
  observed: {
    T2M: number;
    RH2M: number;
    WS2M: number;
    PS: number;
  };
}

export interface DayForecast {
  date: string;
  anomaly: AnomalyData;
  summary: DailySummary;
  hourly: HourlyData[];
}

export interface ForecastResponse {
  city: string;
  location: { lat: number; lon: number };
  data_days: number;
  latest_observation: string;
  sunrise: string;
  sunset: string;
  forecast: DayForecast[];
}