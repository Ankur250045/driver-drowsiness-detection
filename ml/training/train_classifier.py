"""Train and compare drowsiness classifiers on window-level features.

Methodology
-----------
* Split: whole **sessions** are held out (GroupShuffleSplit, 20 %) so windows from the
  same recording never appear in both train and test — overlapping sliding windows
  would otherwise leak and inflate scores.
* Model selection: 5-fold **StratifiedGroupKFold** cross-validation on the training
  sessions, with a small hyper-parameter grid per model, optimising ROC-AUC.
* Candidates: Logistic Regression, SVM (RBF), Random Forest, Gradient Boosting, MLP.
* Deployment: the best *exportable* model (LogReg / MLP — they run as a plain
  forward pass in the browser and backend) is exported to JSON. All models are
  saved with joblib and compared in ml/evaluation/reports/.

    python -m ml.training.train_classifier                 # uses ml/data/processed/dataset.csv
    python -m ml.training.train_classifier --synthetic     # bootstrap with generated data
"""

import argparse
import json
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, GroupShuffleSplit, StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from ml.config import DATA_PROCESSED, FEATURES, FRONTEND_MODEL, GROUP, LABEL, MODELS_DIR, RANDOM_STATE, REPORTS_DIR
from ml.evaluation.evaluate import compute_metrics, write_reports
from ml.training.export import is_exportable, save_artifact, to_artifact


def candidates() -> dict[str, tuple[object, dict]]:
    return {
        "logistic_regression": (
            LogisticRegression(max_iter=2000, class_weight="balanced"),
            {"clf__C": [0.01, 0.1, 1.0, 10.0]},
        ),
        "svm_rbf": (
            SVC(kernel="rbf", probability=True, class_weight="balanced", random_state=RANDOM_STATE),
            {"clf__C": [0.5, 1.0, 5.0], "clf__gamma": ["scale", 0.05]},
        ),
        "random_forest": (
            RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1),
            {"clf__max_depth": [4, 8, None], "clf__min_samples_leaf": [1, 5]},
        ),
        "gradient_boosting": (
            GradientBoostingClassifier(random_state=RANDOM_STATE),
            {"clf__n_estimators": [100, 200], "clf__max_depth": [2, 3], "clf__learning_rate": [0.05, 0.1]},
        ),
        "mlp": (
            MLPClassifier(max_iter=1000, early_stopping=True, random_state=RANDOM_STATE),
            {"clf__hidden_layer_sizes": [(16, 8), (32, 16)], "clf__alpha": [1e-4, 1e-2]},
        ),
    }


def load_dataset(synthetic: bool) -> pd.DataFrame:
    if synthetic:
        from ml.preprocessing.build_dataset import clean
        from ml.preprocessing.synthetic import generate

        df, _ = clean(generate())
        return df
    path = DATA_PROCESSED / "dataset.csv"
    if not path.exists():
        raise SystemExit(f"{path} not found. Run `python -m ml.preprocessing.build_dataset` first (or pass --synthetic).")
    return pd.read_csv(path)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--synthetic", action="store_true", help="train on generated data (pipeline demo only)")
    ap.add_argument("--no-export", action="store_true", help="don't overwrite the deployed JSON model")
    args = ap.parse_args()

    df = load_dataset(args.synthetic)
    X, y, groups = df[FEATURES].to_numpy(), df[LABEL].to_numpy(), df[GROUP].to_numpy()
    n_groups = len(np.unique(groups))
    if n_groups < 3:
        raise SystemExit(f"Need ≥ 3 recording sessions for grouped evaluation, found {n_groups}.")

    train_idx, test_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_STATE).split(X, y, groups))
    X_tr, X_te, y_tr, y_te, g_tr = X[train_idx], X[test_idx], y[train_idx], y[test_idx], groups[train_idx]
    print(f"Dataset: {len(df)} windows, {n_groups} sessions | train {len(train_idx)} / test {len(test_idx)}")

    cv = StratifiedGroupKFold(n_splits=min(5, len(np.unique(g_tr))), shuffle=True, random_state=RANDOM_STATE)
    results, fitted = {}, {}
    for name, (clf, grid) in candidates().items():
        t0 = time.perf_counter()
        search = GridSearchCV(
            Pipeline([("scaler", StandardScaler()), ("clf", clf)]), grid, scoring="roc_auc", cv=cv, n_jobs=-1
        )
        search.fit(X_tr, y_tr, groups=g_tr)
        best = search.best_estimator_
        proba = best.predict_proba(X_te)[:, 1]
        metrics = compute_metrics(y_te, proba)
        metrics.update(
            cv_roc_auc=float(search.best_score_),
            best_params={k.replace("clf__", ""): v for k, v in search.best_params_.items()},
            train_seconds=round(time.perf_counter() - t0, 2),
        )
        results[name], fitted[name] = metrics, best
        joblib.dump(best, MODELS_DIR / f"{name}.joblib")
        print(f"  {name:<20} CV AUC {search.best_score_:.3f} | test AUC {metrics['roc_auc']:.3f} | F1 {metrics['f1']:.3f}")

    write_reports(results, fitted, X_te, y_te, FEATURES, REPORTS_DIR)

    deployable = {n: m for n, m in results.items() if is_exportable(fitted[n])}
    best_name = max(deployable, key=lambda n: deployable[n]["cv_roc_auc"])
    print(f"\nBest exportable model (by CV ROC-AUC): {best_name}")

    dataset_note = "SYNTHETIC (pipeline demo — not real-world performance)" if args.synthetic else f"{n_groups} recorded sessions"
    metrics = {
        **results[best_name],
        "n_train": int(len(train_idx)),
        "n_test": int(len(test_idx)),
        "dataset": dataset_note,
        "split": "session-level hold-out (GroupShuffleSplit 80/20)",
    }
    artifact = to_artifact(
        fitted[best_name],
        name=f"sklearn-{best_name}",
        metrics=metrics,
        source=f"scikit-learn {best_name} selected by 5-fold StratifiedGroupKFold CV (ROC-AUC) out of "
        f"{len(results)} candidates. Dataset: {dataset_note}.",
    )
    targets = [MODELS_DIR / "drowsiness_model.json"]
    # A synthetic-data model is never auto-deployed to the web app.
    if not args.no_export and not args.synthetic:
        targets.append(FRONTEND_MODEL)
    save_artifact(artifact, *targets)
    (REPORTS_DIR / "model_comparison.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print("Exported →", ", ".join(str(t) for t in targets))


if __name__ == "__main__":
    main()
