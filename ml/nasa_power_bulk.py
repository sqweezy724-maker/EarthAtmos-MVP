from __future__ import annotations

import os
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "point_cache"
MASTER_CSV = DATA_DIR / "weather_data.csv"

START = "20180101"
END = "20241231"

PARAMS = [
    "T2M",
    "RH2M",
    "WS2M",
    "WD2M",
    "PS",
    "ALLSKY_SFC_SW_DWN",
]

LAT_VALUES = list(range(-60, 61, 5))
LON_VALUES = list(range(-180, 181, 5))

EXPECTED_DATES = pd.date_range("2018-01-01", "2024-12-31", freq="D").strftime("%Y%m%d")
EXPECTED_DATE_SET = set(EXPECTED_DATES.tolist())
EXPECTED_DATE_COUNT = len(EXPECTED_DATES)

MAX_WORKERS = 4
REQUEST_TIMEOUT = 100
SLEEP_BETWEEN_BATCHES = 0.2


def coord_tag(value: int) -> str:
    return f"p{abs(value):03d}" if value >= 0 else f"m{abs(value):03d}"


def point_path(lat: int, lon: int) -> Path:
    return CACHE_DIR / f"lat_{coord_tag(lat)}_lon_{coord_tag(lon)}.csv"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=0.7,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def bootstrap_cache_from_master() -> None:
    if any(CACHE_DIR.glob("*.csv")):
        return

    if not MASTER_CSV.exists():
        return

    print("Bootstrapping point cache from existing master CSV...")

    header_cols = list(pd.read_csv(MASTER_CSV, nrows=0).columns)
    usecols = [c for c in ["lat", "lon", "date"] + PARAMS if c in header_cols]

    df = pd.read_csv(MASTER_CSV, usecols=usecols, dtype={"date": str})
    df["lat"] = df["lat"].astype(int)
    df["lon"] = df["lon"].astype(int)

    for (lat, lon), group in df.groupby(["lat", "lon"], sort=False):
        group.to_csv(point_path(lat, lon), index=False)

    print(f"Bootstrapped {df.groupby(['lat', 'lon']).ngroups} point files.")


def point_status(path: Path) -> tuple[bool, list[str], bool]:
    """
    Returns:
      complete_dates, missing_params, file_exists
    """
    if not path.exists():
        return False, PARAMS.copy(), False

    try:
        df = pd.read_csv(path, dtype={"date": str})
    except Exception:
        return False, PARAMS.copy(), True

    missing_params = [p for p in PARAMS if p not in df.columns]
    if "date" not in df.columns:
        return False, missing_params if missing_params else PARAMS.copy(), True

    dates = df["date"].astype(str)
    unique_dates = set(dates.tolist())
    complete_dates = (
        len(unique_dates) == EXPECTED_DATE_COUNT
        and unique_dates == EXPECTED_DATE_SET
        and len(df) >= EXPECTED_DATE_COUNT
    )

    return complete_dates, missing_params, True


def fetch_point(lat: int, lon: int, params: list[str]) -> pd.DataFrame:
    session = make_session()

    url = (
        "https://power.larc.nasa.gov/api/temporal/daily/point"
        f"?parameters={','.join(params)}"
        f"&community=RE"
        f"&longitude={lon}"
        f"&latitude={lat}"
        f"&start={START}"
        f"&end={END}"
        f"&format=JSON"
    )

    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()

    if "properties" not in payload or "parameter" not in payload["properties"]:
        raise ValueError("Unexpected NASA POWER response structure")

    param_block = payload["properties"]["parameter"]

    first_param = next(iter(param_block.values()), None)
    if first_param is None:
        raise ValueError("Empty parameter block from NASA POWER")

    dates = list(first_param.keys())
    rows = []

    for d in dates:
        row = {
            "lat": lat,
            "lon": lon,
            "date": d,
        }
        for p in params:
            row[p] = param_block.get(p, {}).get(d)
        rows.append(row)

    out = pd.DataFrame(rows)
    out["lat"] = out["lat"].astype(int)
    out["lon"] = out["lon"].astype(int)
    out["date"] = out["date"].astype(str)
    return out


def coalesce_merge(existing: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    keys = ["lat", "lon", "date"]
    merged = existing.merge(new, on=keys, how="outer", suffixes=("", "__new"))

    for col in new.columns:
        if col in keys:
            continue

        new_col = f"{col}__new"
        if new_col in merged.columns and col in merged.columns:
            merged[col] = merged[col].combine_first(merged[new_col])
            merged.drop(columns=[new_col], inplace=True)
        elif new_col in merged.columns and col not in merged.columns:
            merged.rename(columns={new_col: col}, inplace=True)

    merged["lat"] = merged["lat"].astype(int)
    merged["lon"] = merged["lon"].astype(int)
    merged["date"] = merged["date"].astype(str)
    merged = merged.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return merged


def save_point(df: pd.DataFrame, path: Path) -> None:
    ordered_cols = ["lat", "lon", "date"] + [c for c in PARAMS if c in df.columns]
    extra_cols = [c for c in df.columns if c not in ordered_cols]
    df = df.reindex(columns=ordered_cols + extra_cols)
    df.to_csv(path, index=False)


def process_point(lat: int, lon: int) -> tuple[int, int, bool, str]:
    path = point_path(lat, lon)

    complete_dates, missing_params, exists = point_status(path)

    if exists and complete_dates and not missing_params:
        return lat, lon, False, "complete"

    if exists and complete_dates and missing_params:
        params_to_fetch = missing_params
    else:
        params_to_fetch = PARAMS.copy()

    try:
        new_df = fetch_point(lat, lon, params_to_fetch)

        if path.exists():
            old_df = pd.read_csv(path, dtype={"date": str})
            merged = coalesce_merge(old_df, new_df)
        else:
            merged = new_df

        save_point(merged, path)
        return lat, lon, True, f"updated ({','.join(params_to_fetch)})"

    except Exception as e:
        return lat, lon, False, f"error: {e}"


def rebuild_master_from_cache() -> None:
    files = sorted(CACHE_DIR.glob("*.csv"))
    if not files:
        print("No cache files to rebuild master CSV.")
        return

    print("Rebuilding master CSV...")

    combined = []
    for f in files:
        df = pd.read_csv(f, dtype={"date": str})
        combined.append(df)

    master = pd.concat(combined, ignore_index=True)
    master["lat"] = master["lat"].astype(int)
    master["lon"] = master["lon"].astype(int)
    master["date"] = master["date"].astype(str)
    master = master.sort_values(["lat", "lon", "date"])

    ordered_cols = ["lat", "lon", "date"] + [c for c in PARAMS if c in master.columns]
    extra_cols = [c for c in master.columns if c not in ordered_cols]
    master = master.reindex(columns=ordered_cols + extra_cols)

    master.to_csv(MASTER_CSV, index=False)
    print(f"Master CSV rebuilt: {MASTER_CSV}")


def main() -> None:
    ensure_dirs()
    bootstrap_cache_from_master()

    grid = [(lat, lon) for lat in LAT_VALUES for lon in LON_VALUES]

    todo = []
    complete = 0

    for lat, lon in grid:
        path = point_path(lat, lon)
        is_complete, missing_params, exists = point_status(path)

        if exists and is_complete and not missing_params:
            complete += 1
            continue

        todo.append((lat, lon))

    print(f"Already complete: {complete}")
    print(f"To update/download: {len(todo)}")

    updated_any = False
    failed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_point, lat, lon): (lat, lon) for lat, lon in todo}

        for i, future in enumerate(as_completed(futures), 1):
            lat, lon = futures[future]
            try:
                _, _, updated, status = future.result()
                if updated:
                    updated_any = True
                else:
                    if status.startswith("error"):
                        failed += 1
                print(f"[{i}/{len(todo)}] {lat},{lon} -> {status}")
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(todo)}] {lat},{lon} -> error: {e}")

            time.sleep(SLEEP_BETWEEN_BATCHES)

    if updated_any:
        rebuild_master_from_cache()
    else:
        print("Nothing changed, master CSV left as is.")

    print(f"Done. Failed points: {failed}")


if __name__ == "__main__":
    main()
