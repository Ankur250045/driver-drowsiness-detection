"""ML pipeline: synthetic data, cleaning, export fidelity (sklearn == portable JSON)."""

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.neural_network import MLPClassifier  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from ml.config import FEATURES, FRONTEND_MODEL, GROUP, LABEL  # noqa: E402
from ml.evaluation.evaluate import compute_metrics  # noqa: E402
from ml.inference.predict import PortableModel  # noqa: E402
from ml.preprocessing.build_dataset import clean  # noqa: E402
from ml.preprocessing.synthetic import generate  # noqa: E402
from ml.training.export import to_artifact  # noqa: E402


@pytest.fixture(scope="module")
def dataset():
    df, report = clean(generate(n_sessions=6, minutes=2, seed=0))
    return df, report


def test_synthetic_has_expected_schema(dataset):
    df, report = dataset
    assert list(df.columns[: len(FEATURES) + 1]) == ["timestamp_ms", *FEATURES]
    assert set(df[LABEL]) == {0, 1}
    assert report["sessions"] == 6
    assert (df["perclos"].between(0, 1)).all()


def test_clean_drops_invalid_rows_and_warmup():
    df = generate(n_sessions=1, minutes=1, seed=1)
    df.loc[20, "ear_mean"] = np.nan
    df.loc[21, "perclos"] = 5.0
    cleaned, report = clean(df, warmup=10)
    assert report["after_dropna"] == len(df) - 1
    assert report["after_range_filter"] == len(df) - 2
    assert len(cleaned) == report["after_range_filter"] - 10


@pytest.mark.parametrize(
    "clf",
    [LogisticRegression(max_iter=1000), MLPClassifier(hidden_layer_sizes=(8, 4), max_iter=500, random_state=0)],
)
def test_exported_artifact_matches_sklearn(dataset, clf):
    df, _ = dataset
    X, y = df[FEATURES].to_numpy(), df[LABEL].to_numpy()
    pipe = Pipeline([("scaler", StandardScaler()), ("clf", clf)]).fit(X, y)
    artifact = to_artifact(pipe, "test", metrics={}, source="test")
    portable = PortableModel(json.loads(json.dumps(artifact)))
    np.testing.assert_allclose(portable.predict_proba(X[:50]), pipe.predict_proba(X[:50])[:, 1], atol=1e-6)


def test_learns_signal_on_held_out_sessions(dataset):
    df, _ = dataset
    test_mask = df[GROUP] == df[GROUP].unique()[-1]
    pipe = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))])
    pipe.fit(df.loc[~test_mask, FEATURES], df.loc[~test_mask, LABEL])
    metrics = compute_metrics(df.loc[test_mask, LABEL].to_numpy(), pipe.predict_proba(df.loc[test_mask, FEATURES])[:, 1])
    assert metrics["roc_auc"] > 0.75  # synthetic classes overlap; well above chance


def test_bundled_frontend_model_is_loadable():
    model = PortableModel.load(FRONTEND_MODEL)
    assert model.a["features"] == FEATURES
    p = model.predict_proba(np.zeros((1, len(FEATURES))) + np.array(model.a["scaler"]["mean"]))
    assert 0 < p[0] < 1
