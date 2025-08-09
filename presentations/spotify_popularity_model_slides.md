### Slide 1 — Project Overview
- **Goal**: Predict Spotify track popularity (0–100) using audio features + metadata
- **Dataset**: `/Users/anooptejthotapalli/Downloads/dataset-3-1.csv` (~114k rows)
- **Target**: `popularity`
- **Key numeric features**: `danceability`, `energy`, `key`, `loudness`, `mode`, `speechiness`, `acousticness`, `instrumentalness`, `liveness`, `valence`, `tempo`, `duration_ms`, `time_signature`
- **Categorical**: `track_genre`
- **Outputs**: Model metrics, feature importance, SHAP, PDP; saved model at `models/best_spotify_popularity_model.pkl`

### Slide 2 — Data Prep & Features
- **Header normalization**: fix wrapped names (e.g., `danceabi lity`→`danceability`, `mod e`→`mode`, `time_signatur e`→`time_signature`)
- **Cleanup**: drop unnamed index column; preserve text/meta fields for feature engineering only
- **Feature engineering**:
  - `num_artists`: count of `;`-separated artists
  - `title_len`: character length of `track_name`
  - `title_has_feat`: 1 if `feat`/`ft.`/`with` in `track_name`, else 0
  - One-hot encode `track_genre` (low-cardinality categorical)
- **Final feature set**: all engineered + numeric features; exclude `track_id`, `artists`, `album_name`, `track_name`, and `popularity`
- **Split**: 80/20 train-test with `random_state=42`

### Slide 3 — Modeling, Evaluation, Explainability
- **Models**:
  - LinearRegression (baseline)
  - RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1)
  - Best selected by highest R² on test set
- **Evaluation**: MAE, RMSE, R²; plots for Predicted vs Actual and residuals
- **Visuals**:
  - Correlation heatmap (numeric features)
  - Popularity distribution
  - Feature importances (for tree model)
  - SHAP summary plot (TreeExplainer or KernelExplainer fallback)
  - Partial Dependence Plots: `danceability`, `energy`, `acousticness`, `valence`, `tempo`
- **Artifact**: saved to `models/best_spotify_popularity_model.pkl`
- **Next steps**: hyperparameter tuning, additional models (XGBoost/LightGBM), cross-validation, leakage checks