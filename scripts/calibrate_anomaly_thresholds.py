from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

BASE_DIR   = Path(__file__).resolve().parent.parent
DATA_PATH  = BASE_DIR / "data" / "weather_data.csv"
MODELS_DIR = BASE_DIR / "models"


def normalize_pressure(ps):
    if pd.notna(ps) and ps < 200:
        return ps * 10.0
    return ps


def load():
    df = pd.read_csv(DATA_PATH, low_memory=False)
    df = df.replace(-999, np.nan)

    for c in ["T2M", "RH2M", "WS2M", "PS"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["PS"] = df["PS"].apply(normalize_pressure)

    df = df.dropna(subset=["T2M", "RH2M", "WS2M", "PS"])

    df = df[
        (df["T2M"]  >= -80) & (df["T2M"]  <= 60)  &
        (df["RH2M"] >= 0)   & (df["RH2M"] <= 100) &
        (df["WS2M"] >= 0)   & (df["WS2M"] <= 100) &
        (df["PS"]   >= 500) & (df["PS"]   <= 1100)
    ]

    print(f"Loaded {len(df):,} rows after filtering")
    print(f"T2M  range: {df['T2M'].min():.1f} to {df['T2M'].max():.1f} °C")
    print(f"RH2M range: {df['RH2M'].min():.1f} to {df['RH2M'].max():.1f} %")
    print(f"WS2M range: {df['WS2M'].min():.1f} to {df['WS2M'].max():.1f} m/s")
    print(f"PS   range: {df['PS'].min():.1f} to {df['PS'].max():.1f} hPa")

    return df


def main():
    print("Loading models...")
    model  = joblib.load(MODELS_DIR / "anomaly_model.pkl")
    scaler = joblib.load(MODELS_DIR / "anomaly_scaler.pkl")

    print("\nLoading and filtering training data...")
    df = load()

    features = ["T2M", "RH2M", "WS2M", "PS"]
    X        = scaler.transform(df[features].values)

    print("\nComputing score_samples on training data...")
    scores = model.score_samples(X)

    print("\n=== score_samples distribution ===")
    for p in [1, 2, 5, 10, 25, 50, 75, 90, 95, 98, 99]:
        print(f"  p{p:2d}: {np.percentile(scores, p):.4f}")

    print(f"\n  min:  {scores.min():.4f}")
    print(f"  max:  {scores.max():.4f}")
    print(f"  mean: {scores.mean():.4f}")
    print(f"  std:  {scores.std():.4f}")

    # Calibrated thresholds based on actual distribution
    p1  = float(np.percentile(scores, 1))   # bottom 1%  -> severe
    p5  = float(np.percentile(scores, 5))   # bottom 5%  -> mild
    p50 = float(np.percentile(scores, 50))  # median
    s_min = float(scores.min())
    s_max = float(scores.max())

    print(f"\n=== Recommended thresholds ===")
    print(f"  ANOMALY_THRESHOLD_MILD   = {p5:.4f}  (bottom 5% of training data)")
    print(f"  ANOMALY_THRESHOLD_SEVERE = {p1:.4f}  (bottom 1% of training data)")
    print(f"  ANOMALY_SCORE_MIN        = {s_min:.4f}  (most extreme seen)")
    print(f"  ANOMALY_SCORE_MAX        = {s_max:.4f}  (most normal seen)")

    thresholds = {
        "mild":   round(p5,   4),
        "severe": round(p1,   4),
        "p50":    round(p50,  4),
        "min":    round(s_min, 4),
        "max":    round(s_max, 4),
    }

    out_path = MODELS_DIR / "anomaly_thresholds.json"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w") as f:
        json.dump(thresholds, f, indent=2)

    print(f"\nSaved thresholds to: {out_path}")
    print(json.dumps(thresholds, indent=2))

    # Quick validation: what % of training data would be flagged?
    n_mild   = int((scores < p5).sum())
    n_severe = int((scores < p1).sum())
    total    = len(scores)

    print(f"\n=== Validation ===")
    print(f"  'mild' flags:   {n_mild:,} / {total:,} ({100*n_mild/total:.1f}%)")
    print(f"  'severe' flags: {n_severe:,} / {total:,} ({100*n_severe/total:.1f}%)")


if __name__ == "__main__":
    main()
