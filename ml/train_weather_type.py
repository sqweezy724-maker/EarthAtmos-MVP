from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

from shared.features import normalize_pressure_series, compute_pressure_percentile

BASE_DIR     = Path(__file__).resolve().parent.parent
DATA_PATH    = BASE_DIR / "data" / "weather_data.csv"
MODEL_PATH   = BASE_DIR / "models" / "weather_type.pkl"
ENCODER_PATH = BASE_DIR / "models" / "weather_label_encoder.pkl"


# =========================
# DATA LOADING
# =========================

def load() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, low_memory=False)
    df = df.replace(-999, np.nan)

    cols = ["T2M", "RH2M", "WS2M", "PS"]
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["PS"] = normalize_pressure_series(df["PS"])
    df = df.dropna(subset=cols)

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
# VECTORISED LABEL CREATION
# =========================

def create_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Physics-based pseudo-labelling using a vectorised storm-score.

    Uses RELATIVE pressure (percentile within each 2° grid cell) so
    that 950 hPa reads as LOW at coastal cities but NORMAL at high-
    altitude cities.  The percentile is also added as a training
    feature so the classifier can learn the same distinction.

    Target distribution (approximate):
        clear  ~50 %  |  cloudy ~25 %  |  rain ~15 %
        snow    ~5 %  |  storm   ~5 %
    """
    df     = df.copy()
    ps_pct = compute_pressure_percentile(df)   # Series aligned with df

    t   = df["T2M"].values
    rh  = df["RH2M"].values
    ws  = df["WS2M"].values
    pct = ps_pct.values

    # ── Humidity score ─────────────────────────────────────────
    rh_score = np.where(
        rh > 90, 3.0,
        np.where(rh > 80, 2.0,
        np.where(rh > 70, 1.0,
        np.where(rh > 60, 0.3, 0.0)))
    )

    # ── Relative-pressure score ────────────────────────────────
    ps_score = np.where(
        pct < 0.05, 2.5,
        np.where(pct < 0.15, 1.5,
        np.where(pct < 0.30, 0.8,
        np.where(pct < 0.45, 0.3, 0.0)))
    )

    # ── Wind score ─────────────────────────────────────────────
    ws_score = np.where(
        ws > 10, 2.0,
        np.where(ws > 7, 1.5,
        np.where(ws > 5, 0.8,
        np.where(ws > 3, 0.3, 0.0)))
    )

    storm_score = rh_score + ps_score + ws_score

    # ── Classify ───────────────────────────────────────────────
    label = np.where(
        (storm_score >= 5.5) & (ws > 5),             "storm",
        np.where(
            (t <= 0) & (rh > 75) & (storm_score >= 2.5), "snow",
            np.where(
                (storm_score >= 3.5) & (t > 2),      "rain",
                np.where(storm_score >= 2.0,          "cloudy",
                                                      "clear")
            )
        )
    )

    df["label"]  = label
    # Store percentile as a feature so the classifier learns
    # relative-pressure semantics, not just absolute hPa values.
    df["PS_pct"] = ps_pct.values
    return df


# =========================
# MAIN
# =========================

def main():
    print("Loading data...")
    df = load()

    print("\nCreating weather labels (vectorised)...")
    df = create_labels(df)

    print("\n=== Label Distribution ===")
    counts = df["label"].value_counts()
    total  = len(df)
    for label, count in counts.items():
        print(f"  {label:8s}: {count:8,}  ({100 * count / total:.1f} %)")

    # ── Features now include PS_pct to handle altitude ───────────
    features = ["T2M", "RH2M", "WS2M", "PS", "PS_pct"]
    X = df[features]
    y = df["label"]

    le        = LabelEncoder()
    y_encoded = le.fit_transform(y)

    print(f"\nClasses: {list(le.classes_)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded,
        test_size=0.2,
        random_state=42,
        stratify=y_encoded,
    )
    print(f"Train: {len(X_train):,}  |  Test: {len(X_test):,}")

    model = XGBClassifier(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        objective="multi:softprob",
        num_class=len(le.classes_),
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=30,
    )

    print("\nTraining weather classifier...")
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred = model.predict(X_test)
    print("\n=== Classification Report ===")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # ── Sanity checks ─────────────────────────────────────────────
    print("\n=== Sanity Checks ===")
    test_cases = [
        {"T2M": 25, "RH2M": 30,  "WS2M": 2,  "PS": 1015, "PS_pct": 0.70, "expected": "clear"},
        {"T2M": 15, "RH2M": 75,  "WS2M": 3,  "PS": 1005, "PS_pct": 0.40, "expected": "cloudy"},
        {"T2M": 10, "RH2M": 90,  "WS2M": 5,  "PS":  995, "PS_pct": 0.15, "expected": "rain"},
        {"T2M": -5, "RH2M": 85,  "WS2M": 4,  "PS": 1000, "PS_pct": 0.30, "expected": "snow"},
        {"T2M": 20, "RH2M": 95,  "WS2M": 12, "PS":  985, "PS_pct": 0.05, "expected": "storm"},
        {"T2M": 11, "RH2M": 89,  "WS2M": 1,  "PS":  992, "PS_pct": 0.20, "expected": "rain/cloudy"},
    ]

    for tc in test_cases:
        X_tc = pd.DataFrame([{k: tc[k] for k in features}])
        proba    = model.predict_proba(X_tc)[0]
        pred_idx = int(np.argmax(proba))
        pred_cls = le.classes_[pred_idx]
        conf     = proba[pred_idx]
        proba_str = " | ".join(f"{c}:{p:.2f}" for c, p in zip(le.classes_, proba))
        status    = "✓" if tc["expected"].startswith(pred_cls) or pred_cls in tc["expected"] else "✗"
        print(
            f"  {status} T={tc['T2M']:5.0f}°C  RH={tc['RH2M']:4.0f}%  "
            f"WS={tc['WS2M']:4.1f}  PS={tc['PS']:6.0f}  PS_pct={tc['PS_pct']:.2f} → "
            f"{pred_cls} ({conf:.2f})  [{proba_str}]  (expected: {tc['expected']})"
        )

    # ── Save ──────────────────────────────────────────────────────
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump(le,    ENCODER_PATH)
    print(f"\nSaved classifier: {MODEL_PATH}")
    print(f"Saved encoder:    {ENCODER_PATH}")


if __name__ == "__main__":
    main()
