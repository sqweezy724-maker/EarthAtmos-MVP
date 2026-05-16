from __future__ import annotations

import json
import math
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

from shared.features import (
    build_location_features,
    build_feature_columns,
    optimize_memory,
)

# =========================
# PATHS & CONSTANTS
# =========================

BASE_DIR   = Path(__file__).resolve().parent.parent
DATA_DIR   = BASE_DIR / "data"
MASTER_CSV = DATA_DIR / "weather_data.csv"
CACHE_DIR  = DATA_DIR / "point_cache"
MODELS_DIR = BASE_DIR / "models"

HORIZONS     = [1, 2, 3, 4, 5, 6, 7]
MAX_WORKERS  = 20
SUBSAMPLE    = 0.35        # fraction of raw rows used for training
CUTOFF_DATE  = pd.Timestamp("2024-01-01")
BATCH_SIZE   = 50          # locations per ProcessPoolExecutor task


# =========================
# DATA LOADING
# =========================

def load_raw_data() -> pd.DataFrame:
    if MASTER_CSV.exists():
        return pd.read_csv(MASTER_CSV, dtype={"date": str}, low_memory=False)

    cache_files = sorted(CACHE_DIR.glob("*.csv"))
    if not cache_files:
        raise FileNotFoundError("No weather_data.csv and no cache files found.")

    return pd.concat(
        [pd.read_csv(f, dtype={"date": str}, low_memory=False) for f in cache_files],
        ignore_index=True,
    )


# =========================
# PARALLEL FEATURE ENGINEERING
# =========================

def process_batch(group_list: list[pd.DataFrame]) -> list[pd.DataFrame]:
    """Process a batch of location groups in a single worker process."""
    return [build_location_features(g) for g in group_list]


def prepare_features_parallel(df: pd.DataFrame) -> pd.DataFrame:
    groups = [g.copy() for _, g in df.groupby(["lat", "lon"], sort=False)]
    total  = len(groups)

    # Split into batches to reduce pickle overhead per future
    batches = [groups[i : i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]

    print(
        f"Preparing {total} locations in {len(batches)} batches "
        f"using {MAX_WORKERS} workers..."
    )

    processed: list[pd.DataFrame] = []

    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_batch, b): i for i, b in enumerate(batches)}
        done    = 0

        for future in as_completed(futures):
            results = future.result()   # list[pd.DataFrame]
            processed.extend(results)
            done += len(results)
            if done % 50 == 0 or done == total:
                print(f"  Prepared {done}/{total} locations")

    out        = pd.concat(processed, ignore_index=True)
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    return optimize_memory(out)


# =========================
# MODEL TRAINING
# =========================

def train_horizon_models(
    df_feat: pd.DataFrame,
    feat_cols: list[str],
) -> tuple[dict, dict]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    models:  dict = {}
    metrics: dict = {}

    for h in HORIZONS:
        model_path = MODELS_DIR / f"weather_xgb_d{h}.pkl"

        if model_path.exists():
            print(f"\nSKIP horizon +{h} (already trained)")
            models[f"d{h}"] = joblib.load(model_path)
            continue

        target_col      = f"target_{h}"
        target_date_col = f"target_date_{h}"

        usable = df_feat.dropna(subset=feat_cols + [target_col, target_date_col]).copy()
        usable[target_date_col] = pd.to_datetime(usable[target_date_col], errors="coerce")
        usable = usable.dropna(subset=[target_date_col])

        train_df = usable.loc[usable[target_date_col] <  CUTOFF_DATE]
        test_df  = usable.loc[usable[target_date_col] >= CUTOFF_DATE]

        print(f"\nHorizon +{h}: train={len(train_df):,}  test={len(test_df):,}")

        X_train = train_df[feat_cols].astype("float32")
        y_train = train_df[target_col].astype("float32")
        w_train = train_df["sample_weight"].astype("float32")
        X_test  = test_df[feat_cols].astype("float32")
        y_test  = test_df[target_col].astype("float32")

        # Use fewer threads per model so all 7 can train concurrently
        # if called in parallel; fine for sequential use too.
        model = XGBRegressor(
            n_estimators=1400,
            learning_rate=0.025,
            max_depth=10,
            min_child_weight=4,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_alpha=0.1,
            reg_lambda=1.2,
            gamma=0.0,
            tree_method="hist",
            n_jobs=MAX_WORKERS,
            random_state=42,
            objective="reg:squarederror",
            verbosity=1,
            early_stopping_rounds=50,
        )

        print(f"Training horizon +{h}...")
        model.fit(
            X_train,
            y_train,
            sample_weight=w_train,
            eval_set=[(X_test, y_test)],
            verbose=100,
   # stop if val doesn't improve
        )

        preds = model.predict(X_test)
        mae   = mean_absolute_error(y_test, preds)
        rmse  = math.sqrt(mean_squared_error(y_test, preds))

        print(f"Horizon +{h}: MAE={mae:.4f}  RMSE={rmse:.4f}")

        joblib.dump(model, model_path)
        print(f"Saved: {model_path.name}")

        models[f"d{h}"]  = model
        metrics[f"d{h}"] = {
            "mae":        float(mae),
            "rmse":       float(rmse),
            "train_rows": int(len(train_df)),
            "test_rows":  int(len(test_df)),
        }

    return models, metrics


# =========================
# MAIN
# =========================

def main():
    mp.freeze_support()

    print("Loading raw data...")
    df = load_raw_data()
    print(f"Raw shape: {df.shape}")

    # ── Subsample BEFORE feature engineering ─────────────────────
    # This avoids spending time building features for rows that
    # will never be used in training.
    df = df.sample(frac=SUBSAMPLE, random_state=42)
    print(f"After {SUBSAMPLE:.0%} subsample: {df.shape}")

    df = df.sort_values(["lat", "lon", "date"]).reset_index(drop=True)

    print("Building features (parallel)...")
    df_feat = prepare_features_parallel(df)
    print(f"Feature frame shape: {df_feat.shape}")

    feat_cols = build_feature_columns()
    feat_cols = [c for c in feat_cols if c in df_feat.columns]
    print(f"Feature count: {len(feat_cols)}")

    print("Training models...")
    models, metrics = train_horizon_models(df_feat, feat_cols)

    # ── Persist ───────────────────────────────────────────────────
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(models,    MODELS_DIR / "weather_7day_models.pkl")
    joblib.dump(feat_cols, MODELS_DIR / "weather_feature_columns.pkl")

    with open(MODELS_DIR / "weather_7day_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2, default=str)

    print("\nDONE")


if __name__ == "__main__":
    main()
