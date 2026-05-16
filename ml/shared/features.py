from __future__ import annotations

import numpy as np
import pandas as pd

BASE_LAG_COLS = ["T2M", "RH2M", "WS2M", "PS", "ALLSKY_SFC_SW_DWN"]
LAPSE_RATE    = 6.5   # °C per 1000 m


# =========================
# PRESSURE
# =========================

def normalize_pressure(val: float) -> float:
    if val < 200:
        return val * 10.0
    return val


def normalize_pressure_series(series: pd.Series) -> pd.Series:
    return series.apply(lambda x: normalize_pressure(x) if pd.notna(x) else x)


# =========================
# WIND DIRECTION
# =========================

def circular_diff_deg(series: pd.Series) -> pd.Series:
    rad   = np.deg2rad(pd.to_numeric(series, errors="coerce"))
    delta = rad.diff()
    return np.rad2deg(np.arctan2(np.sin(delta), np.cos(delta))).abs()


# =========================
# SAFE HELPERS
# =========================

def safe_float(value, default: float = 0.0) -> float:
    try:
        v = float(value)
        return v if np.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def last_valid_value(data: pd.DataFrame, column: str, default: float = 0.0) -> float:
    if column not in data.columns:
        return default
    valid = data[column].dropna()
    return safe_float(valid.iloc[-1], default) if not valid.empty else default


# =========================
# MEMORY
# =========================

def optimize_memory(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        if df[col].dtype == "float64":
            df[col] = df[col].astype("float32")
        elif df[col].dtype == "int64":
            df[col] = df[col].astype("int32")
    return df


# =========================
# PRESSURE PERCENTILE
# =========================

def compute_pressure_percentile(df: pd.DataFrame) -> pd.Series:
    """
    Relative pressure percentile within each 2° grid cell.
    0 = lowest observed pressure, 1 = highest.
    Works at both train time (with lat/lon cols) and inference time.
    """
    if "lat" in df.columns and "lon" in df.columns:
        lat_bin = (df["lat"] / 2).round() * 2
        lon_bin = (df["lon"] / 2).round() * 2
        key     = lat_bin.astype(str) + "_" + lon_bin.astype(str)
        return df.groupby(key)["PS"].transform(lambda x: x.rank(pct=True))
    return df["PS"].rank(pct=True)


# =========================
# FEATURE COLUMNS
# =========================

def build_feature_columns() -> list[str]:
    cols = [
        "lat", "lon", "dayofyear", "month", "year",
        "doy_sin", "doy_cos",
        "month_sin", "month_cos",
        "WD2M_sin", "WD2M_cos",
        "wind_u", "wind_v",
        "wind_dir_missing",
        "pressure_drop", "temp_drop",
        "wind_dir_change", "front_signal", "front_accel", "wind_shift",
    ]
    for col in BASE_LAG_COLS:
        for lag in [1, 2, 3, 7, 14]:
            cols.append(f"{col}_lag{lag}")
        for win in [3, 7, 14]:
            cols.append(f"{col}_roll{win}_mean")
            cols.append(f"{col}_roll{win}_std")
    return cols


# =========================
# LOCATION FEATURE BUILDER  (used by train.py)
# =========================

def build_location_features(loc_df: pd.DataFrame) -> pd.DataFrame:
    df = loc_df.copy()

    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d", errors="coerce")
    df = df.sort_values("date").reset_index(drop=True)

    numeric_cols = ["lat", "lon", "T2M", "RH2M", "WS2M", "WD2M", "PS", "ALLSKY_SFC_SW_DWN"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.replace(-999, np.nan)

    # ── Time features ─────────────────────────────────────────────
    df["dayofyear"] = df["date"].dt.dayofyear
    df["month"]     = df["date"].dt.month
    df["year"]      = df["date"].dt.year

    df["doy_sin"]   = np.sin(2 * np.pi * df["dayofyear"] / 366)
    df["doy_cos"]   = np.cos(2 * np.pi * df["dayofyear"] / 366)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    # ── Wind ──────────────────────────────────────────────────────
    if "WD2M" in df.columns:
        wd_rad           = np.deg2rad(df["WD2M"])
        df["WD2M_sin"]   = np.sin(wd_rad)
        df["WD2M_cos"]   = np.cos(wd_rad)
        df["wind_dir_missing"] = df["WD2M"].isna().astype("float32")
    else:
        df["WD2M_sin"]         = 0.0
        df["WD2M_cos"]         = 0.0
        df["wind_dir_missing"] = 1.0

    df["wind_u"] = df["WS2M"] * df["WD2M_sin"]
    df["wind_v"] = df["WS2M"] * df["WD2M_cos"]

    # ── Lags + rolling ────────────────────────────────────────────
    for col in BASE_LAG_COLS:
        if col not in df.columns:
            df[col] = np.nan
        for lag in [1, 2, 3, 7, 14]:
            df[f"{col}_lag{lag}"] = df[col].shift(lag)
        for win in [3, 7, 14]:
            roll = df[col].rolling(win)
            df[f"{col}_roll{win}_mean"] = roll.mean()
            df[f"{col}_roll{win}_std"]  = roll.std()

    # ── Front signals ─────────────────────────────────────────────
    tdiff1  = df["T2M"].diff(1)
    tdiff3  = df["T2M"].diff(3)
    pdiff1  = df["PS"].diff(1)
    rhdiff1 = df["RH2M"].diff(1)
    wsdiff1 = df["WS2M"].diff(1)
    wddiff  = (
        circular_diff_deg(df["WD2M"])
        if "WD2M" in df.columns
        else pd.Series(0.0, index=df.index)
    )

    pressure_drop = (-pdiff1).clip(lower=0)
    temp_drop     = (-tdiff1).clip(lower=0)

    df["pressure_drop"]   = pressure_drop
    df["temp_drop"]       = temp_drop
    df["wind_dir_change"] = wddiff.fillna(0)

    df["front_signal"] = (
        1.2 * temp_drop.fillna(0)
        + 0.6 * pressure_drop.fillna(0)
        + 0.8 * tdiff3.abs().fillna(0)
        + 0.2 * rhdiff1.abs().fillna(0)
        + 0.2 * wsdiff1.abs().fillna(0)
        + 0.1 * df["wind_dir_change"]
    )

    df["front_accel"] = tdiff1.diff(1).abs()
    df["wind_shift"]  = wsdiff1.abs().fillna(0) + df["wind_dir_change"]

    # ── Sample weights ────────────────────────────────────────────
    raw = df["front_signal"].fillna(0)
    q90 = raw.quantile(0.90)
    df["sample_weight"] = (
        1.0 + np.clip(raw / q90, 0, 6)
        if (np.isfinite(q90) and q90 > 0)
        else 1.0
    )

    # ── Targets ───────────────────────────────────────────────────
    for h in [1, 2, 3, 4, 5, 6, 7]:
        df[f"target_{h}"]      = df["T2M"].shift(-h)
        df[f"target_date_{h}"] = df["date"].shift(-h)

    return optimize_memory(df)
