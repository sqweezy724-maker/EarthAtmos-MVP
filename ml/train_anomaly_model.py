from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from shared.features import normalize_pressure_series, compute_pressure_percentile

BASE_DIR        = Path(__file__).resolve().parent.parent
DATA_PATH       = BASE_DIR / "data" / "weather_data.csv"
MODEL_PATH      = BASE_DIR / "models" / "anomaly_model.pkl"
SCALER_PATH     = BASE_DIR / "models" / "anomaly_scaler.pkl"
THRESHOLD_PATH  = BASE_DIR / "models" / "anomaly_thresholds.json"


# =========================
# DATA LOADING
# =========================

def load() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, low_memory=False)
    df = df.replace(-999, np.nan)

    features = ["T2M", "RH2M", "WS2M", "PS"]
    for c in features:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["PS"] = normalize_pressure_series(df["PS"])
    df = df.dropna(subset=features)

    df = df[
        (df["T2M"]  >= -80) & (df["T2M"]  <= 60)  &
        (df["RH2M"] >= 0)   & (df["RH2M"] <= 100) &
        (df["WS2M"] >= 0)   & (df["WS2M"] <= 100) &
        (df["PS"]   >= 500) & (df["PS"]   <= 1100)
    ]

    print(f"Loaded {len(df):,} rows after filtering")
    print(f"T2M:  [{df['T2M'].min():.1f}, {df['T2M'].max():.1f}] °C")
    print(f"RH2M: [{df['RH2M'].min():.1f}, {df['RH2M'].max():.1f}] %")
    print(f"WS2M: [{df['WS2M'].min():.1f}, {df['WS2M'].max():.1f}] m/s")
    print(f"PS:   [{df['PS'].min():.1f}, {df['PS'].max():.1f}] hPa")

    return df


# =========================
# MAIN
# =========================

def main():
    df = load()

    # ── Add relative-pressure feature ────────────────────────────
    # Prevents high-altitude stations from being permanently flagged
    # as anomalous just because their absolute pressure is low.
    print("\nComputing relative pressure percentile...")
    df["PS_pct"] = compute_pressure_percentile(df)

    features = ["T2M", "RH2M", "WS2M", "PS", "PS_pct"]
    X        = df[features].values

    # ── Scale ─────────────────────────────────────────────────────
    print("Fitting StandardScaler...")
    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    print("Feature means (scaled):", np.round(scaler.mean_, 3))
    print("Feature stds  (scaled):", np.round(scaler.scale_, 3))

    # ── Train ─────────────────────────────────────────────────────
    print("\nTraining IsolationForest...")
    model = IsolationForest(
        n_estimators=500,
        contamination=0.03,
        max_samples="auto",
        max_features=1.0,
        bootstrap=False,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # ── Validate ──────────────────────────────────────────────────
    scores      = model.score_samples(X_scaled)
    predictions = model.predict(X_scaled)
    n_anomalies = (predictions == -1).sum()

    print("\nAnomaly score distribution:")
    print(f"  min:    {scores.min():.4f}")
    print(f"  p1:     {np.percentile(scores, 1):.4f}")
    print(f"  p5:     {np.percentile(scores, 5):.4f}")
    print(f"  median: {np.median(scores):.4f}")
    print(f"  p95:    {np.percentile(scores, 95):.4f}")
    print(f"  max:    {scores.max():.4f}")
    print(
        f"\nFlagged anomalies: {n_anomalies:,} / {len(df):,} "
        f"({100 * n_anomalies / len(df):.2f} %)"
    )

    # ── Calibrate thresholds from score distribution ──────────────
    mild_threshold   = float(np.percentile(scores, 5))
    severe_threshold = float(np.percentile(scores, 1))
    score_min        = float(scores.min())
    score_max        = float(scores.max())

    thresholds = {
        "mild":   mild_threshold,
        "severe": severe_threshold,
        "min":    score_min,
        "max":    score_max,
    }

    print(f"\nCalibrated thresholds:")
    print(f"  mild   (p5):  {mild_threshold:.4f}")
    print(f"  severe (p1):  {severe_threshold:.4f}")

    # ── Save ──────────────────────────────────────────────────────
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,  MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    with open(THRESHOLD_PATH, "w") as f:
        json.dump(thresholds, f, indent=2)

    print(f"\nSaved anomaly model:      {MODEL_PATH}")
    print(f"Saved anomaly scaler:     {SCALER_PATH}")
    print(f"Saved anomaly thresholds: {THRESHOLD_PATH}")


if __name__ == "__main__":
    main()
