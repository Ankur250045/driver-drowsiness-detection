"""Evaluation metrics and report generation (plots + markdown comparison table).

    python -m ml.evaluation.evaluate --model ml/models/logistic_regression.joblib
"""

import argparse
from pathlib import Path

import numpy as np
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

from ml.config import RANDOM_STATE, REPORTS_DIR


def compute_metrics(y_true: np.ndarray, proba: np.ndarray, threshold: float = 0.5) -> dict:
    pred = (proba >= threshold).astype(int)
    return {
        "accuracy": float(accuracy_score(y_true, pred)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        "confusion_matrix": confusion_matrix(y_true, pred, labels=[0, 1]).tolist(),
    }


def write_reports(results: dict, fitted: dict, X_test, y_test, feature_names: list[str], out_dir: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    out_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid")

    # ROC + PR curves for all models
    fig, (ax_roc, ax_pr) = plt.subplots(1, 2, figsize=(12, 5))
    for name, model in fitted.items():
        proba = model.predict_proba(X_test)[:, 1]
        fpr, tpr, _ = roc_curve(y_test, proba)
        prec, rec, _ = precision_recall_curve(y_test, proba)
        ax_roc.plot(fpr, tpr, label=f"{name} (AUC {results[name]['roc_auc']:.3f})")
        ax_pr.plot(rec, prec, label=f"{name} (AP {results[name]['pr_auc']:.3f})")
    ax_roc.plot([0, 1], [0, 1], "k--", lw=1)
    ax_roc.set(xlabel="False positive rate", ylabel="True positive rate", title="ROC curves (held-out sessions)")
    ax_pr.set(xlabel="Recall", ylabel="Precision", title="Precision–recall curves")
    ax_roc.legend(fontsize=8)
    ax_pr.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_dir / "roc_pr_curves.png", dpi=150)
    plt.close(fig)

    # Confusion matrices
    fig, axes = plt.subplots(1, len(fitted), figsize=(3.2 * len(fitted), 3.2))
    for ax, name in zip(np.atleast_1d(axes), fitted):
        sns.heatmap(
            np.array(results[name]["confusion_matrix"]), annot=True, fmt="d", cbar=False, cmap="Blues", ax=ax,
            xticklabels=["alert", "drowsy"], yticklabels=["alert", "drowsy"],
        )
        ax.set(title=name, xlabel="predicted", ylabel="true")
    fig.tight_layout()
    fig.savefig(out_dir / "confusion_matrices.png", dpi=150)
    plt.close(fig)

    # Permutation importance of the best model by test ROC-AUC
    best = max(results, key=lambda n: results[n]["roc_auc"])
    imp = permutation_importance(fitted[best], X_test, y_test, scoring="roc_auc", n_repeats=20, random_state=RANDOM_STATE)
    order = np.argsort(imp.importances_mean)
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.barh(np.array(feature_names)[order], imp.importances_mean[order], xerr=imp.importances_std[order], color="#0891b2")
    ax.set(xlabel="Decrease in ROC-AUC when permuted", title=f"Permutation feature importance — {best}")
    fig.tight_layout()
    fig.savefig(out_dir / "feature_importance.png", dpi=150)
    plt.close(fig)

    # Markdown comparison table
    cols = ["cv_roc_auc", "roc_auc", "pr_auc", "accuracy", "precision", "recall", "f1", "train_seconds"]
    lines = ["| model | " + " | ".join(cols) + " | best params |", "|---" * (len(cols) + 2) + "|"]
    for name, m in sorted(results.items(), key=lambda kv: -kv[1]["roc_auc"]):
        vals = " | ".join(f"{m[c]:.3f}" if isinstance(m[c], float) else str(m[c]) for c in cols)
        lines.append(f"| {name} | {vals} | `{m.get('best_params', {})}` |")
    (out_dir / "model_comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Reports written to {out_dir}")


def main() -> None:
    import joblib
    import pandas as pd

    from ml.config import DATA_PROCESSED, FEATURES, LABEL

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", required=True, type=Path)
    ap.add_argument("--data", type=Path, default=DATA_PROCESSED / "dataset.csv")
    args = ap.parse_args()

    model = joblib.load(args.model)
    df = pd.read_csv(args.data)
    metrics = compute_metrics(df[LABEL].to_numpy(), model.predict_proba(df[FEATURES].to_numpy())[:, 1])
    for k, v in metrics.items():
        print(f"{k:>18}: {v}")


if __name__ == "__main__":
    main()
