"""
Phase 4 — Forecasting.

Two products:
  * station_forecast : next-day expected violation load per station, from a
    gradient-boosted model on calendar + lag features. Validated on a held-out
    tail window (the "we predicted the last N days, here's the error" demo).
  * cell_profile     : per-cell expected share by (day-of-week, time-band),
    used by the optimiser to weight beats for a chosen shift.

Gradient boosting via scikit-learn's HistGradientBoostingRegressor (LightGBM is
the drop-in production swap; kept dependency-light here).
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

from .. import config as C


def _station_daily(con) -> pd.DataFrame:
    df = con.execute("""
        SELECT police_station AS station, date, count(*) AS n
        FROM violations WHERE include_in_analysis AND is_parking
        GROUP BY station, date
    """).df()
    df["date"] = pd.to_datetime(df["date"])
    # dense grid: every station x every date in range (fill gaps with 0)
    stations = df["station"].dropna().unique()
    dates = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    grid = pd.MultiIndex.from_product([stations, dates], names=["station", "date"]).to_frame(index=False)
    df = grid.merge(df, on=["station", "date"], how="left").fillna({"n": 0})
    return df.sort_values(["station", "date"]).reset_index(drop=True)


def _features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["dow"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["dom"] = df["date"].dt.day
    df["woy"] = df["date"].dt.isocalendar().week.astype(int)
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["station_code"] = df["station"].astype("category").cat.codes
    g = df.groupby("station", group_keys=False)
    for lag in (1, 2, 3, 7, 14):
        df[f"lag{lag}"] = g["n"].shift(lag)
    # grouped rolling (transform keeps it within station — no cross-station bleed)
    df["roll7"] = g["n"].transform(lambda s: s.shift(1).rolling(7, min_periods=1).mean())
    df["roll14"] = g["n"].transform(lambda s: s.shift(1).rolling(14, min_periods=1).mean())
    df["std7"] = g["n"].transform(lambda s: s.shift(1).rolling(7, min_periods=2).std())
    return df


FEAT_COLS = ["dow", "month", "dom", "woy", "is_weekend", "station_code",
             "lag1", "lag2", "lag3", "lag7", "lag14", "roll7", "roll14", "std7"]


def build_forecast(con) -> tuple[pd.DataFrame, dict]:
    full = _features(_station_daily(con))
    df = full.dropna(subset=["lag14"]).copy()
    cutoff = df["date"].max() - pd.Timedelta(days=C.FORECAST_HOLDOUT_DAYS)
    train, test = df[df["date"] <= cutoff], df[df["date"] > cutoff]

    model = HistGradientBoostingRegressor(max_iter=500, learning_rate=0.05,
                                          max_depth=6, l2_regularization=1.0,
                                          random_state=42)
    model.fit(train[FEAT_COLS], np.log1p(train["n"]))   # log target for count data

    test = test.copy()
    test["model_pred"] = np.expm1(model.predict(test[FEAT_COLS])).clip(min=0)
    # ensemble the learned model with the strong seasonal signal (standard for counts)
    test["pred"] = (0.6 * test["model_pred"] + 0.4 * test["roll7"]).clip(lower=0)
    mae = mean_absolute_error(test["n"], test["pred"])
    model_only = mean_absolute_error(test["n"], test["model_pred"])
    baseline = mean_absolute_error(test["n"], test["roll7"])  # naive 7-day mean
    metrics = {
        "holdout_days": C.FORECAST_HOLDOUT_DAYS,
        "model_mae": round(float(mae), 2),               # the ensemble we ship
        "gbm_only_mae": round(float(model_only), 2),
        "baseline_mae": round(float(baseline), 2),
        "improvement_pct": round(float((baseline - mae) / baseline * 100), 1) if baseline else 0.0,
        "test_rows": int(len(test)),
        "mean_daily_violations": round(float(test["n"].mean()), 1),
    }

    # next-day forecast per station, using the latest observed row's features
    last = full.sort_values("date").groupby("station").tail(1).copy()
    next_date = full["date"].max() + pd.Timedelta(days=1)
    last["dow"] = next_date.dayofweek
    last["month"] = next_date.month
    last["dom"] = next_date.day
    last["woy"] = int(next_date.isocalendar().week)
    last["is_weekend"] = int(next_date.dayofweek >= 5)
    last["model_pred"] = np.expm1(model.predict(last[FEAT_COLS])).clip(min=0)
    last["forecast"] = (0.6 * last["model_pred"] + 0.4 * last["roll7"]).clip(lower=0).round(1)
    station_forecast = (last[["station", "forecast"]]
                        .dropna(subset=["station"])
                        .sort_values("forecast", ascending=False)
                        .reset_index(drop=True))
    station_forecast["forecast_date"] = next_date.date()
    return station_forecast, metrics


def build_cell_profile(con) -> pd.DataFrame:
    """Per-cell expected share by (dow, time_band) — weights beats for a shift."""
    df = con.execute("""
        SELECT h3_r11 AS cell, dow, time_band, count(*) AS n
        FROM violations WHERE include_in_analysis AND is_parking
        GROUP BY cell, dow, time_band
    """).df()
    total = df.groupby("cell")["n"].transform("sum")
    df["share"] = (df["n"] / total).round(4)
    return df
