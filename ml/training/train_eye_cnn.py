"""Eye-state CNN (open vs closed) on the MRL Eye Dataset.

A complementary deep-learning model to the landmark-based features: it classifies
cropped eye images directly, which is more robust when landmark-based EAR is
unreliable (e.g. glasses, partial occlusion, extreme angles).

Architecture: 3 × [Conv-BN-ReLU-MaxPool] → GlobalAveragePooling → Dropout → Dense(sigmoid)
Input: 64×64 grayscale eye crop. Augmentation: random flip, rotation, zoom, contrast.
Split: by **subject** (sXXXX folder) to avoid identity leakage.

    python -m ml.training.train_eye_cnn --data ml/data/mrl_eye --epochs 15
    # optional browser export:
    pip install tensorflowjs && tensorflowjs_converter --input_format=keras \
        ml/models/eye_cnn.keras frontend/public/models/eye_cnn
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np

from ml.config import MODELS_DIR, RANDOM_STATE, REPORTS_DIR

IMG_SIZE = 64


def list_images(root: Path) -> tuple[list[str], list[int], list[str]]:
    paths, labels, subjects = [], [], []
    for p in root.rglob("*.png"):
        parts = p.stem.split("_")
        if len(parts) < 5:
            continue
        paths.append(str(p))
        labels.append(int(parts[4]))  # 0 = closed, 1 = open
        subjects.append(parts[0])
    if not paths:
        raise SystemExit(f"No MRL images found under {root}. See ml/data/README.md.")
    return paths, labels, subjects


def subject_split(subjects: list[str], test_frac=0.15, val_frac=0.15):
    uniq = sorted(set(subjects))
    random.Random(RANDOM_STATE).shuffle(uniq)
    n_test, n_val = int(len(uniq) * test_frac), int(len(uniq) * val_frac)
    test, val = set(uniq[:n_test]), set(uniq[n_test : n_test + n_val])
    return [("test" if s in test else "val" if s in val else "train") for s in subjects]


def build_model():
    import tensorflow as tf
    from tensorflow.keras import layers

    aug = tf.keras.Sequential(
        [
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.08),
            layers.RandomZoom(0.1),
            layers.RandomContrast(0.2),
        ],
        name="augmentation",
    )

    def block(x, filters):
        x = layers.Conv2D(filters, 3, padding="same", use_bias=False)(x)
        x = layers.BatchNormalization()(x)
        x = layers.ReLU()(x)
        return layers.MaxPooling2D()(x)

    inputs = layers.Input((IMG_SIZE, IMG_SIZE, 1))
    x = aug(inputs)
    x = layers.Rescaling(1 / 255.0)(x)
    for f in (32, 64, 128):
        x = block(x, f)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(1, activation="sigmoid", name="p_open")(x)
    model = tf.keras.Model(inputs, outputs, name="eye_state_cnn")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )
    return model


def make_ds(paths, labels, training: bool, batch=128):
    import tensorflow as tf

    def load(path, label):
        img = tf.io.decode_png(tf.io.read_file(path), channels=1)
        img = tf.image.resize(img, (IMG_SIZE, IMG_SIZE))
        return img, tf.cast(label, tf.float32)

    ds = tf.data.Dataset.from_tensor_slices((paths, labels))
    if training:
        ds = ds.shuffle(len(paths), seed=RANDOM_STATE)
    return ds.map(load, num_parallel_calls=tf.data.AUTOTUNE).batch(batch).prefetch(tf.data.AUTOTUNE)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("ml/data/mrl_eye"))
    ap.add_argument("--epochs", type=int, default=15)
    args = ap.parse_args()

    import tensorflow as tf

    tf.random.set_seed(RANDOM_STATE)
    paths, labels, subjects = list_images(args.data)
    split = subject_split(subjects)
    sets = {
        k: ([p for p, s in zip(paths, split) if s == k], [l for l, s in zip(labels, split) if s == k])
        for k in ("train", "val", "test")
    }
    for k, (p, l) in sets.items():
        print(f"{k:>5}: {len(p):6d} images, {np.mean(l):.2%} open")

    model = build_model()
    model.summary()
    history = model.fit(
        make_ds(*sets["train"], training=True),
        validation_data=make_ds(*sets["val"], training=False),
        epochs=args.epochs,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=4, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2),
        ],
    )

    results = model.evaluate(make_ds(*sets["test"], training=False), return_dict=True)
    print("Test:", results)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODELS_DIR / "eye_cnn.keras")
    (REPORTS_DIR / "eye_cnn_metrics.json").write_text(
        json.dumps({"test": results, "history": history.history}, indent=2, default=float), encoding="utf-8"
    )
    print(f"Saved {MODELS_DIR / 'eye_cnn.keras'}")


if __name__ == "__main__":
    main()
