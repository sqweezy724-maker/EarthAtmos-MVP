from __future__ import annotations

import json
import math
import threading
import time
import logging
from datetime import datetime, timedelta
import os
import uvicorn
import joblib
import numpy as np
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pathlib import Path
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from fastapi.middleware.cors import CORSMiddleware

from shared.features import (
    BASE_LAG_COLS,
    LAPSE_RATE,
    normalize_pressure_series,
    circular_diff_deg,
    safe_float,
    last_valid_value,
    build_feature_columns,
)

# =========================
# SETUP
# =========================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("earthatmos")

BASE_DIR   = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

app = FastAPI(title="EarthAtmos API", version="4.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# =========================
# LOAD MODELS
# =========================

models_7day        = joblib.load(MODELS_DIR / "weather_7day_models.pkl")
feature_cols       = joblib.load(MODELS_DIR / "weather_feature_columns.pkl")
weather_type_model = joblib.load(MODELS_DIR / "weather_type.pkl")
weather_label_enc  = joblib.load(MODELS_DIR / "weather_label_encoder.pkl")
anomaly_model      = joblib.load(MODELS_DIR / "anomaly_model.pkl")
anomaly_scaler     = joblib.load(MODELS_DIR / "anomaly_scaler.pkl")

# =========================
# LOAD CALIBRATED THRESHOLDS
# =========================

_threshold_path = MODELS_DIR / "anomaly_thresholds.json"
if _threshold_path.exists():
    with open(_threshold_path) as _f:
        _thresholds = json.load(_f)
    ANOMALY_THRESHOLD_MILD   = _thresholds["mild"]
    ANOMALY_THRESHOLD_SEVERE = _thresholds["severe"]
    ANOMALY_SCORE_MIN        = _thresholds["min"]
    ANOMALY_SCORE_MAX        = _thresholds["max"]
    logger.info(
        f"Anomaly thresholds: mild={ANOMALY_THRESHOLD_MILD:.4f}, "
        f"severe={ANOMALY_THRESHOLD_SEVERE:.4f}"
    )
else:
    ANOMALY_THRESHOLD_MILD   = -0.15
    ANOMALY_THRESHOLD_SEVERE = -0.25
    ANOMALY_SCORE_MIN        = -0.60
    ANOMALY_SCORE_MAX        = -0.05
    logger.warning("anomaly_thresholds.json not found — using defaults")

# =========================
# CONSTANTS
# =========================

NASA_API_BASE    = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_PARAMS      = "T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,WD2M,PS,ALLSKY_SFC_SW_DWN"
NASA_TIMEOUT     = 30
CACHE_TTL        = 600          # seconds

OPEN_METEO_BASE    = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_TIMEOUT = 15

# Bias correction tuning
BIAS_WEIGHT        = 0.30   # 30 % ML correction blended into Open-Meteo temps
MIN_BIAS_C         = 0.5    # °C — don't apply tiny corrections
MIN_HOURLY_COVERAGE = 20    # minimum hours from Open-Meteo to trust the day

# WMO weather codes → our categories
WMO_TO_TYPE: dict[int, str] = {
    0: "clear",  1: "clear",  2: "cloudy", 3: "cloudy",
    45: "cloudy", 48: "cloudy",
    51: "rain",  53: "rain",  55: "rain",
    56: "rain",  57: "rain",
    61: "rain",  63: "rain",  65: "rain",
    66: "rain",  67: "rain",
    71: "snow",  73: "snow",  75: "snow",  77: "snow",
    80: "rain",  81: "rain",  82: "rain",
    85: "snow",  86: "snow",
    95: "storm", 96: "storm", 99: "storm",
}

# =========================
# THREAD-SAFE CACHES
# =========================

_cache_lock      = threading.Lock()
_geocode_cache:  dict[str, tuple[float, float]]        = {}
_nasa_cache:     dict[str, tuple[float, pd.DataFrame]] = {}
_elev_cache:     dict[str, float]                      = {}
_hourly_cache:   dict[str, tuple[float, dict]]         = {}


# =========================
# INPUT
# =========================

class ForecastRequest(BaseModel):
    city: str


# =========================
# HELPERS
# =========================

def decimal_to_hhmm(h: float) -> str:
    """Convert decimal hours to HH:MM, handles floating-point edge cases."""
    total_minutes = round(h * 60)
    hour, mins    = divmod(total_minutes, 60)
    hour          = hour % 24
    return f"{hour:02d}:{mins:02d}"


def safe_wmo_code(val) -> int:
    """Safely convert a raw WMO weather code value to int."""
    try:
        v = int(float(val))
        return v if 0 <= v <= 999 else 0
    except (TypeError, ValueError):
        return 0


def normalize_pressure_val(ps_value: float) -> float:
    if ps_value < 200:
        return ps_value * 10.0
    return ps_value


# =========================
# ELEVATION
# =========================

def get_elevation(lat: float, lon: float) -> float:
    cache_key = f"{lat:.3f}_{lon:.3f}"

    with _cache_lock:
        if cache_key in _elev_cache:
            return _elev_cache[cache_key]

    try:
        res = requests.get(
            f"https://api.open-meteo.com/v1/elevation"
            f"?latitude={lat}&longitude={lon}",
            timeout=10,
        )
        if res.ok:
            data = res.json()
            elev = float(data.get("elevation", [0])[0]) if "elevation" in data else 0.0
        else:
            elev = 0.0
    except Exception as exc:
        logger.warning(f"Elevation API failed: {exc}")
        elev = 0.0

    with _cache_lock:
        _elev_cache[cache_key] = elev

    logger.info(f"Elevation ({lat:.3f}, {lon:.3f}): {elev:.0f} m")
    return elev


def estimate_grid_elevation_from_pressure(ps_hpa: float) -> float:
    if ps_hpa <= 0 or ps_hpa > 1100:
        return 0.0
    P0, L, T0 = 1013.25, 0.0065, 288.15
    g, M, R   = 9.80665, 0.0289644, 8.3144598
    try:
        return max(0.0, (T0 / L) * (1.0 - (ps_hpa / P0) ** ((R * L) / (g * M))))
    except Exception:
        return 0.0


def compute_temperature_correction(city_elevation: float, grid_ps_hpa: float) -> float:
    grid_elevation = estimate_grid_elevation_from_pressure(grid_ps_hpa)
    correction     = (grid_elevation - city_elevation) * LAPSE_RATE / 1000.0
    logger.info(
        f"Elevation correction: city={city_elevation:.0f} m, "
        f"grid≈{grid_elevation:.0f} m, diff={grid_elevation - city_elevation:.0f} m, "
        f"T correction={correction:+.1f} °C"
    )
    return correction


def apply_temperature_correction(nasa_df: pd.DataFrame, correction: float) -> pd.DataFrame:
    df = nasa_df.copy()
    for col in ["T2M", "T2M_MAX", "T2M_MIN"]:
        if col in df.columns:
            df[col] = df[col] + correction
    return df


# =========================
# GEOCODING
# =========================

def geocode_city(city: str) -> tuple[float, float]:
    key = city.strip().lower()

    with _cache_lock:
        if key in _geocode_cache:
            return _geocode_cache[key]

    try:
        geolocator = Nominatim(user_agent="earthatmos/4.1", timeout=10)
        location   = geolocator.geocode(city)
        if location is None:
            raise ValueError(f"City not found: '{city}'")
        lat = round(location.latitude, 4)
        lon = round(location.longitude, 4)
    except GeocoderTimedOut:
        raise HTTPException(504, f"Geocoding timed out for '{city}'")
    except GeocoderServiceError as exc:
        raise HTTPException(502, f"Geocoding service error: {exc}")
    except ValueError as exc:
        raise HTTPException(404, str(exc))

    with _cache_lock:
        _geocode_cache[key] = (lat, lon)

    logger.info(f"Geocoded '{city}' → ({lat}, {lon})")
    return lat, lon


# =========================
# NASA POWER API
# =========================

def fetch_nasa_power(
    lat: float,
    lon: float,
    start_date: datetime,
    end_date: datetime,
) -> pd.DataFrame:
    url = (
        f"{NASA_API_BASE}?parameters={NASA_PARAMS}&community=RE"
        f"&longitude={lon}&latitude={lat}"
        f"&start={start_date.strftime('%Y%m%d')}"
        f"&end={end_date.strftime('%Y%m%d')}"
        f"&format=JSON"
    )
    logger.info(f"NASA API: ({lat}, {lon})")
    try:
        resp = requests.get(url, timeout=NASA_TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(504, "NASA POWER API timed out")
    except requests.exceptions.RequestException as exc:
        raise HTTPException(502, f"NASA POWER API error: {exc}")

    try:
        params_data = resp.json()["properties"]["parameter"]
    except KeyError:
        raise HTTPException(502, "Unexpected NASA response format")

    first_param = list(params_data.keys())[0]
    records = []
    for ds in params_data[first_param]:
        row = {"date": ds}
        for pn, dv in params_data.items():
            val     = dv.get(ds)
            row[pn] = float(val) if val is not None and val != -999 else np.nan
        records.append(row)

    df           = pd.DataFrame(records)
    df["date"]   = pd.to_datetime(df["date"], format="%Y%m%d")
    df           = df.sort_values("date").reset_index(drop=True)
    if "PS" in df.columns:
        df["PS"] = normalize_pressure_series(df["PS"])
    return df


def fetch_nasa_cached(lat: float, lon: float, days: int = 21) -> pd.DataFrame:
    cache_key = f"{lat:.4f}_{lon:.4f}_{days}"
    now       = time.time()

    with _cache_lock:
        if cache_key in _nasa_cache:
            ct, cdf = _nasa_cache[cache_key]
            if now - ct < CACHE_TTL:
                return cdf.copy()

    # Network call outside the lock so other threads aren't blocked
    end   = datetime.utcnow() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    df    = fetch_nasa_power(lat, lon, start, end)

    if len(df) < 14:
        end   = datetime.utcnow() - timedelta(days=2)
        start = end - timedelta(days=days + 5)
        df    = fetch_nasa_power(lat, lon, start, end)

    with _cache_lock:
        _nasa_cache[cache_key] = (now, df.copy())

    return df


# =========================
# OPEN-METEO HOURLY FORECAST
# =========================

def fetch_open_meteo_hourly(lat: float, lon: float, days: int = 7) -> dict[str, list]:
    cache_key = f"{lat:.4f}_{lon:.4f}"
    now       = time.time()

    with _cache_lock:
        if cache_key in _hourly_cache:
            ct, cached = _hourly_cache[cache_key]
            if now - ct < CACHE_TTL:
                logger.info("Open-Meteo cache hit")
                return cached

    url = (
        f"{OPEN_METEO_BASE}"
        f"?latitude={lat}&longitude={lon}"
        f"&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,"
        f"surface_pressure,precipitation_probability,weather_code"
        f"&forecast_days={days}"
        f"&timezone=auto"
    )
    logger.info(f"Open-Meteo hourly: ({lat}, {lon}), {days} days")

    try:
        resp = requests.get(url, timeout=OPEN_METEO_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.warning("Open-Meteo timed out — falling back to curves")
        return {}
    except requests.exceptions.RequestException as exc:
        logger.warning(f"Open-Meteo failed: {exc} — falling back to curves")
        return {}

    hourly_raw = data.get("hourly", {})
    times      = hourly_raw.get("time",                     [])
    temps      = hourly_raw.get("temperature_2m",            [])
    rhs        = hourly_raw.get("relative_humidity_2m",      [])
    winds      = hourly_raw.get("wind_speed_10m",            [])
    press      = hourly_raw.get("surface_pressure",          [])
    precip     = hourly_raw.get("precipitation_probability", [])
    codes      = hourly_raw.get("weather_code",              [])

    if not times:
        logger.warning("Open-Meteo returned no hourly data")
        return {}

    # ── Compute pressure mean once (not inside the loop) ─────────
    valid_press   = [safe_float(p) for p in press if p is not None]
    ps_local_mean = float(np.mean(valid_press)) if valid_press else 1013.0
    alt_offset    = 1013.0 - ps_local_mean

    classes       = list(weather_label_enc.classes_)
    precip_labels = ["rain", "storm", "snow"]
    result: dict[str, list] = {}

    for i, time_str in enumerate(times):
        date_part = time_str[:10]
        hour      = int(time_str[11:13])

        temp = safe_float(temps[i]  if i < len(temps)  else None, 15.0)
        rh   = safe_float(rhs[i]   if i < len(rhs)    else None, 50.0)
        ws   = safe_float(winds[i] if i < len(winds)   else None, 2.0)
        ps   = safe_float(press[i] if i < len(press)   else None, 1013.0)
        pp   = safe_float(precip[i] if i < len(precip) else None, 0.0)
        code = safe_wmo_code(codes[i] if i < len(codes) else None)

        weather_type  = WMO_TO_TYPE.get(code, "cloudy")
        ps_normalized = ps + alt_offset

        try:
            X_hour = pd.DataFrame([{
                "T2M": temp, "RH2M": rh, "WS2M": ws, "PS": ps_normalized,
            }])
            proba     = weather_type_model.predict_proba(X_hour)[0]
            prob_dict = {c: round(safe_float(p), 4) for c, p in zip(classes, proba)}
            ml_top    = str(classes[int(np.argmax(proba))])
            ml_conf   = round(safe_float(proba[int(np.argmax(proba))]), 4)
        except Exception as exc:
            logger.warning(f"ML classification failed hour {hour}: {exc}")
            prob_dict = {}
            ml_top    = weather_type
            ml_conf   = 0.5

        ml_precip    = sum(safe_float(prob_dict.get(lb, 0.0)) for lb in precip_labels) * 100
        final_precip = round(max(pp, ml_precip), 1)
        final_conf   = ml_conf if prob_dict else 0.5

        hour_data = {
            "hour":                      hour,
            "time":                      f"{hour:02d}:00",
            "temperature":               round(temp, 1),
            "humidity":                  round(rh, 1),
            "wind_speed":                round(ws, 1),
            "pressure":                  round(ps, 1),
            "weather_type":              weather_type,
            "weather_confidence":        final_conf,
            "weather_probabilities":     prob_dict,
            "precipitation_probability": final_precip,
            "wmo_code":                  code,
            "source":                    "open-meteo",
        }

        result.setdefault(date_part, []).append(hour_data)

    logger.info(f"Open-Meteo: {len(result)} days of hourly data")

    with _cache_lock:
        _hourly_cache[cache_key] = (now, result)

    return result


# =========================
# FALLBACK: MATH-BASED HOURLY CURVES
# =========================

def estimate_sunrise_sunset(lat: float, doy: int) -> tuple[float, float]:
    decl   = 23.45 * math.sin(math.radians((360 / 365) * (doy - 81)))
    cos_ha = -math.tan(math.radians(lat)) * math.tan(math.radians(decl))
    cos_ha = max(-1.0, min(1.0, cos_ha))
    ha     = math.degrees(math.acos(cos_ha))
    dl     = (2.0 * ha) / 15.0
    return max(0.0, 12.0 - dl / 2.0), min(24.0, 12.0 + dl / 2.0)


def hourly_temperature_curve(
    t_mean: float,
    t_min: float,
    t_max: float,
    sunrise: float,
    sunset: float,
) -> list[float]:
    t_min = safe_float(t_min, t_mean - 5.0)
    t_max = safe_float(t_max, t_mean + 5.0)
    if t_max <= t_min:
        t_max = t_min + 2.0

    t_peak = min(sunset - 0.5, 14.0)
    t_set  = t_min + 0.39 * (t_max - t_min)
    decay  = 2.0 / max(24.0 - (sunset - sunrise), 1.0)

    def night(hrs: float) -> float:
        return t_min + (t_set - t_min) * math.exp(-decay * hrs)

    def day(h: float) -> float:
        if h <= t_peak:
            p = max(0.0, min(1.0, (h - sunrise) / (t_peak - sunrise) if t_peak > sunrise else 0.0))
            return t_min + (t_max - t_min) * math.sin(p * math.pi / 2)
        p = max(0.0, min(1.0, (h - t_peak) / (sunset - t_peak) if sunset > t_peak else 1.0))
        return t_max - (t_max - t_set) * p

    result = []
    for h in range(24):
        hf = float(h)
        if sunrise <= hf <= sunset:
            t = day(hf)
        elif hf > sunset:
            t = night(hf - sunset)
        else:
            t = night((24.0 - sunset) + hf)
        result.append(round(safe_float(t, t_mean), 1))
    return result


def fallback_hourly_forecast(
    lat: float,
    nasa_df: pd.DataFrame,
    t_mean: float,
    horizon_day: int,
    target_date: pd.Timestamp,
    nasa_df_raw: pd.DataFrame,
) -> list[dict]:
    doy             = target_date.day_of_year
    sunrise, sunset = estimate_sunrise_sunset(lat, doy)

    # Min/max from recent history
    if "T2M_MAX" in nasa_df.columns and "T2M_MIN" in nasa_df.columns:
        rmax = nasa_df["T2M_MAX"].dropna()
        rmin = nasa_df["T2M_MIN"].dropna()
        if not rmax.empty and not rmin.empty:
            n     = min(7, len(rmax), len(rmin))
            rng   = safe_float((rmax.iloc[-n:] - rmin.iloc[-n:]).mean(), 10.0)
            t_min = round(t_mean - rng * 0.45, 1)
            t_max = round(t_mean + rng * 0.55, 1)
        else:
            t_min, t_max = t_mean - 5.0, t_mean + 5.0
    else:
        t_min, t_max = t_mean - 5.0, t_mean + 5.0

    n_back = min(horizon_day, len(nasa_df))
    rc     = nasa_df.iloc[-n_back:]
    rh_base = safe_float(rc["RH2M"].mean(), 50.0)
    ws_base = safe_float(rc["WS2M"].mean(), 2.0)
    ps_base = safe_float(rc["PS"].mean(), 1013.0)

    t_h   = hourly_temperature_curve(t_mean, t_min, t_max, sunrise, sunset)
    t_arr = np.array(t_h)
    rh_h  = np.clip(rh_base - 2.5 * (t_arr - t_arr.mean()), 5.0, 100.0).tolist()

    wind_pat = [
        0.70, 0.65, 0.62, 0.60, 0.58, 0.60, 0.65, 0.75,
        0.90, 1.05, 1.18, 1.28, 1.35, 1.40, 1.38, 1.32,
        1.22, 1.10, 0.98, 0.88, 0.82, 0.78, 0.75, 0.72,
    ]
    ws_h = [round(ws_base * p, 1) for p in wind_pat]
    ps_h = [round(ps_base + 1.5 * math.cos(2 * math.pi * (h - 10) / 12), 1) for h in range(24)]

    classes       = list(weather_label_enc.classes_)
    precip_labels = ["rain", "storm", "snow"]
    ps_mean_local = safe_float(nasa_df_raw["PS"].dropna().mean(), 1013.0)
    alt_offset    = 1013.0 - ps_mean_local

    hourly = []
    for h in range(24):
        try:
            X = pd.DataFrame([{
                "T2M": t_h[h], "RH2M": rh_h[h],
                "WS2M": ws_h[h], "PS": ps_h[h] + alt_offset,
            }])
            proba     = weather_type_model.predict_proba(X)[0]
            prob_dict = {c: round(safe_float(p), 4) for c, p in zip(classes, proba)}
            top       = str(classes[int(np.argmax(proba))])
            conf      = round(safe_float(proba[int(np.argmax(proba))]), 4)
            pp        = round(sum(safe_float(prob_dict.get(lb, 0.0)) for lb in precip_labels) * 100, 1)
        except Exception as exc:
            logger.warning(f"Fallback ML classification failed hour {h}: {exc}")
            prob_dict = {}
            top       = "unknown"
            conf      = 0.0
            pp        = 0.0

        hourly.append({
            "hour":                      h,
            "time":                      f"{h:02d}:00",
            "temperature":               round(t_h[h], 1),
            "humidity":                  round(rh_h[h], 1),
            "wind_speed":                ws_h[h],
            "pressure":                  ps_h[h],
            "weather_type":              top,
            "weather_confidence":        conf,
            "weather_probabilities":     prob_dict,
            "precipitation_probability": pp,
            "source":                    "fallback-curves",
        })

    return hourly


# =========================
# BUILD HOURLY FORECAST (HYBRID)
# =========================

def build_hourly_forecast(
    lat: float,
    lon: float,
    nasa_df: pd.DataFrame,
    t_mean_ml: float,
    horizon_day: int,
    target_date: pd.Timestamp,
    open_meteo_data: dict[str, list],
    nasa_df_raw: pd.DataFrame,
) -> list[dict]:
    date_key = target_date.strftime("%Y-%m-%d")

    if date_key in open_meteo_data:
        hourly = open_meteo_data[date_key]

        if len(hourly) >= MIN_HOURLY_COVERAGE:
            om_mean = float(np.mean([h["temperature"] for h in hourly]))
            bias    = (t_mean_ml - om_mean) * BIAS_WEIGHT

            if abs(bias) > MIN_BIAS_C:
                logger.info(
                    f"Bias correcting d+{horizon_day}: "
                    f"OM mean={om_mean:.1f}, ML={t_mean_ml:.1f}, bias={bias:+.1f} °C"
                )
                hourly = [
                    {**h, "temperature": round(h["temperature"] + bias, 1)}
                    for h in hourly
                ]

            # Pad to 24 hours if needed
            while len(hourly) < 24:
                last = hourly[-1].copy()
                last["hour"] = len(hourly)
                last["time"] = f"{len(hourly):02d}:00"
                hourly.append(last)

            return hourly[:24]

    logger.info(f"No Open-Meteo data for {date_key} — using fallback curves")
    return fallback_hourly_forecast(
        lat, nasa_df, t_mean_ml, horizon_day, target_date, nasa_df_raw
    )


# =========================
# ENGINEERED FEATURE BUILDER (inference)
# =========================

def build_engineered_features(
    lat: float,
    lon: float,
    nasa_df: pd.DataFrame,
    horizon_day: int = 1,
) -> pd.DataFrame:
    """
    Build the same feature vector used during training.
    Uses the CORRECTED nasa_df so temperature inputs already
    reflect city elevation — no further correction is applied
    to the model output.
    """
    df = nasa_df.copy()

    # Ensure minimum history for lag features
    if len(df) < 14:
        pad_rows = 14 - len(df)
        padding  = pd.concat([df.iloc[[0]]] * pad_rows, ignore_index=True)
        for i in range(pad_rows):
            padding.iloc[i, padding.columns.get_loc("date")] = (
                df["date"].iloc[0] - pd.Timedelta(days=pad_rows - i)
            )
        df = pd.concat([padding, df], ignore_index=True)

    ncols = ["T2M", "RH2M", "WS2M", "WD2M", "PS", "ALLSKY_SFC_SW_DWN"]
    for c in ncols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        else:
            df[c] = np.nan
    df[ncols] = df[ncols].ffill().bfill()

    defs = {"T2M": 15, "RH2M": 50, "WS2M": 2, "WD2M": 180, "PS": 1013, "ALLSKY_SFC_SW_DWN": 10}
    for c, d in defs.items():
        if df[c].isna().all():
            df[c] = d

    df = df.sort_values("date").reset_index(drop=True)

    td    = df["date"].iloc[-1] + pd.Timedelta(days=horizon_day)
    doy   = td.day_of_year
    month = td.month
    year  = td.year

    latest = df.iloc[-1]
    wd     = latest["WD2M"]
    if pd.isna(wd):
        WDs, WDc, wdm = 0.0, 0.0, 1.0
    else:
        r   = np.deg2rad(wd)
        WDs = float(np.sin(r))
        WDc = float(np.cos(r))
        wdm = 0.0

    wu = safe_float(latest["WS2M"]) * WDs
    wv = safe_float(latest["WS2M"]) * WDc

    td1   = df["T2M"].diff(1)
    td3   = df["T2M"].diff(3)
    pd1   = df["PS"].diff(1)
    rhd1  = df["RH2M"].diff(1)
    wsd1  = df["WS2M"].diff(1)
    wdd   = (
        circular_diff_deg(df["WD2M"])
        if "WD2M" in df.columns and not df["WD2M"].isna().all()
        else pd.Series(0.0, index=df.index)
    )

    pdv = safe_float((-pd1).clip(lower=0).iloc[-1])
    tdv = safe_float((-td1).clip(lower=0).iloc[-1])
    wdc = safe_float(wdd.fillna(0).iloc[-1])

    fs = (
        1.2 * tdv
        + 0.6 * pdv
        + 0.8 * safe_float(td3.abs().fillna(0).iloc[-1])
        + 0.2 * safe_float(rhd1.abs().fillna(0).iloc[-1])
        + 0.2 * safe_float(wsd1.abs().fillna(0).iloc[-1])
        + 0.1 * wdc
    )
    fa  = safe_float(td1.diff(1).abs().fillna(0).iloc[-1])
    ws_ = safe_float(wsd1.abs().fillna(0).iloc[-1]) + wdc

    def lag_roll(s: pd.Series, prefix: str) -> dict:
        out = {}
        for lag in [1, 2, 3, 7, 14]:
            out[f"{prefix}_lag{lag}"] = safe_float(
                s.iloc[-(lag + 1)] if len(s) > lag else s.iloc[0]
            )
        for win in [3, 7, 14]:
            wn = s.iloc[-win:] if len(s) >= win else s
            out[f"{prefix}_roll{win}_mean"] = safe_float(wn.mean())
            out[f"{prefix}_roll{win}_std"]  = safe_float(wn.std() if len(wn) > 1 else 0.0)
        return out

    feats: dict[str, float] = {
        "lat": safe_float(lat), "lon": safe_float(lon),
        "dayofyear": float(doy), "month": float(month), "year": float(year),
        "doy_sin":   safe_float(np.sin(2 * np.pi * doy / 366)),
        "doy_cos":   safe_float(np.cos(2 * np.pi * doy / 366)),
        "month_sin": safe_float(np.sin(2 * np.pi * month / 12)),
        "month_cos": safe_float(np.cos(2 * np.pi * month / 12)),
        "WD2M_sin": safe_float(WDs), "WD2M_cos": safe_float(WDc),
        "wind_u": safe_float(wu),    "wind_v": safe_float(wv),
        "wind_dir_missing": safe_float(wdm),
        "pressure_drop": safe_float(pdv), "temp_drop": safe_float(tdv),
        "wind_dir_change": safe_float(wdc),
        "front_signal": safe_float(fs),
        "front_accel":  safe_float(fa),
        "wind_shift":   safe_float(ws_),
    }
    for v in BASE_LAG_COLS:
        feats.update(lag_roll(df[v], v))

    row = pd.DataFrame([feats])[feature_cols]
    return row.replace([np.inf, -np.inf], np.nan).fillna(0.0).astype("float32")


# =========================
# RAW FEATURES + ANOMALY
# =========================

def build_raw_features(nasa_df: pd.DataFrame) -> pd.DataFrame:
    latest = nasa_df.iloc[-1]

    def get(col: str, default: float) -> float:
        v = safe_float(latest.get(col, np.nan), default=np.nan)
        if np.isfinite(v):
            return v
        vl = nasa_df[col].dropna()
        return safe_float(vl.iloc[-1], default) if not vl.empty else default

    return pd.DataFrame([{
        "T2M":  get("T2M",  15.0),
        "RH2M": get("RH2M", 50.0),
        "WS2M": get("WS2M", 2.0),
        "PS":   get("PS",   1013.0),
    }])


def compute_anomaly(nasa_df: pd.DataFrame) -> dict:
    X  = build_raw_features(nasa_df)
    rv = X.iloc[0].to_dict()
    try:
        Xs  = anomaly_scaler.transform(X.values)
        rs  = float(anomaly_model.score_samples(Xs)[0])
        sr  = ANOMALY_SCORE_MIN - ANOMALY_SCORE_MAX
        n   = float(np.clip((ANOMALY_SCORE_MAX - rs) / sr if sr > 0 else 0.0, 0.0, 1.0))
        lv  = (
            "severe" if rs < ANOMALY_THRESHOLD_SEVERE
            else "mild" if rs < ANOMALY_THRESHOLD_MILD
            else "normal"
        )
        return {
            "score":         round(n, 3),
            "level":         lv,
            "raw_if_score":  round(rs, 4),
            "is_anomaly":    lv in ("mild", "severe"),
            "observed":      {k: round(safe_float(v), 1) for k, v in rv.items()},
        }
    except Exception as exc:
        logger.warning(f"Anomaly detection failed: {exc}")
        return {
            "score": 0, "level": "unknown", "raw_if_score": 0,
            "is_anomaly": False, "observed": {},
        }


# =========================
# FORECAST ENDPOINT
# =========================

@app.post("/forecast")
def forecast(req: ForecastRequest):
    lat, lon = geocode_city(req.city)

    # ── NASA daily data ──────────────────────────────────────────
    nasa_df_raw = fetch_nasa_cached(lat, lon, days=21)
    if nasa_df_raw.empty:
        raise HTTPException(502, "No data from NASA POWER API")

    # ── Elevation correction ─────────────────────────────────────
    # Applied once to the NASA data used for feature building.
    # The ML model sees corrected temperatures, so its output is
    # already on the city's elevation scale — no second correction.
    city_elev = get_elevation(lat, lon)
    grid_ps   = safe_float(nasa_df_raw["PS"].mean(), 1013.0)
    t_corr    = compute_temperature_correction(city_elev, grid_ps)
    nasa_df   = apply_temperature_correction(nasa_df_raw, t_corr)

    logger.info(
        f"NASA for {req.city}: {len(nasa_df)} days, "
        f"T2M=[{safe_float(nasa_df['T2M'].min()):.1f}, "
        f"{safe_float(nasa_df['T2M'].max()):.1f} °C] "
        f"(correction {t_corr:+.1f} °C), elev={city_elev:.0f} m"
    )

    # ── Open-Meteo hourly data ───────────────────────────────────
    open_meteo = fetch_open_meteo_hourly(lat, lon, days=8)

    today   = pd.Timestamp.today()
    anomaly = compute_anomaly(nasa_df)

    sr_h, ss_h = estimate_sunrise_sunset(lat, today.day_of_year)

    forecast_days = []

    for h in range(1, 8):
        target = today + pd.Timedelta(days=h)

        # ML temperature prediction
        # Features are built from the elevation-corrected nasa_df,
        # so the prediction is already in city-scale °C.
        try:
            X     = build_engineered_features(lat, lon, nasa_df, horizon_day=h)
            model = models_7day[f"d{h}"]
            t_ml  = round(safe_float(model.predict(X)[0]), 1)   # ← no second +t_corr
        except Exception as exc:
            logger.error(f"Temp prediction d+{h}: {exc}")
            t_ml = round(last_valid_value(nasa_df, "T2M", 15.0), 1)

        # Build hourly (Open-Meteo primary, math curves fallback)
        hourly = build_hourly_forecast(
            lat, lon, nasa_df, t_ml, h, target, open_meteo, nasa_df_raw
        )

        # Daily summary
        temps   = [d["temperature"]               for d in hourly]
        precips = [d["precipitation_probability"] for d in hourly]
        winds   = [d["wind_speed"]                for d in hourly]

        type_counts: dict[str, int] = {}
        for d in hourly:
            type_counts[d["weather_type"]] = type_counts.get(d["weather_type"], 0) + 1
        dom_type = max(type_counts, key=type_counts.get)
        dom_confs = [d["weather_confidence"] for d in hourly if d["weather_type"] == dom_type]
        avg_conf  = round(sum(dom_confs) / len(dom_confs), 4) if dom_confs else 0.0

        sources     = {d.get("source", "unknown") for d in hourly}
        data_source = "open-meteo" if "open-meteo" in sources else "model-curves"

        forecast_days.append({
            "date":         target.strftime("%Y-%m-%d"),
            "hourly_source": data_source,
            "summary": {
                "temperature_mean": t_ml,
                "temperature_min":  round(min(temps), 1),
                "temperature_max":  round(max(temps), 1),
                "humidity_avg":     round(sum(d["humidity"] for d in hourly) / 24, 1),
                "wind_speed_avg":   round(sum(winds) / 24, 1),
                "wind_speed_max":   round(max(winds), 1),
                "pressure_avg":     round(sum(d["pressure"] for d in hourly) / 24, 1),
                "precipitation_probability": round(max(precips), 1),
                "weather_type":     dom_type,
                "weather_confidence": avg_conf,
            },
            "hourly": hourly,
        })

    return {
        "city":               req.city,
        "location":           {"lat": safe_float(lat), "lon": safe_float(lon)},
        "data_days":          len(nasa_df),
        "latest_observation": nasa_df["date"].iloc[-1].strftime("%Y-%m-%d"),
        "sunrise":            decimal_to_hhmm(sr_h),
        "sunset":             decimal_to_hhmm(ss_h),
        "elevation_m":        round(city_elev, 0),
        "temp_correction_c":  round(t_corr, 1),
        "anomaly":            anomaly,        # moved to top level — not repeated per day
        "forecast":           forecast_days,
    }


# =========================
# HEALTH
# =========================

@app.get("/health")
def health():
    return {
        "status":  "ok",
        "version": "4.1",
        "models": {
            "horizons": list(models_7day.keys()),
            "features": len(feature_cols),
            "classes":  list(weather_label_enc.classes_),
        },
        "anomaly": {
            "mild":   ANOMALY_THRESHOLD_MILD,
            "severe": ANOMALY_THRESHOLD_SEVERE,
        },
        "cache": {
            "geocode":   len(_geocode_cache),
            "nasa":      len(_nasa_cache),
            "elevation": len(_elev_cache),
            "hourly":    len(_hourly_cache),
        },
    }


# =========================
# DEBUG
# =========================

@app.get("/debug/features")
def debug_features(city: str):
    lat, lon  = geocode_city(city)
    nasa_raw  = fetch_nasa_cached(lat, lon, days=21)
    elev      = get_elevation(lat, lon)
    gps       = safe_float(nasa_raw["PS"].mean(), 1013.0)
    gelev     = estimate_grid_elevation_from_pressure(gps)
    corr      = compute_temperature_correction(elev, gps)
    nasa_df   = apply_temperature_correction(nasa_raw, corr)

    om        = fetch_open_meteo_hourly(lat, lon, days=2)
    om_days   = list(om.keys())
    om_sample: dict = {}
    if om_days:
        first_day = om[om_days[0]]
        om_sample = {
            "date":        om_days[0],
            "hours":       len(first_day),
            "sample_noon": first_day[12] if len(first_day) > 12 else (first_day[-1] if first_day else {}),
        }

    return {
        "city":                city,
        "lat":                 safe_float(lat),
        "lon":                 safe_float(lon),
        "city_elevation_m":    round(elev),
        "grid_elevation_m":    round(gelev),
        "grid_ps_hpa":         round(gps, 1),
        "temp_correction_c":   round(corr, 1),
        "nasa_t2m_raw":        f"[{safe_float(nasa_raw['T2M'].min()):.1f}, {safe_float(nasa_raw['T2M'].max()):.1f}]",
        "nasa_t2m_corrected":  f"[{safe_float(nasa_df['T2M'].min()):.1f}, {safe_float(nasa_df['T2M'].max()):.1f}]",
        "open_meteo_days":     om_days,
        "open_meteo_sample":   om_sample,
        "anomaly":             compute_anomaly(nasa_df),
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.backend:app", host="0.0.0.0", port=port)
