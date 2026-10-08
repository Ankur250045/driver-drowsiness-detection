# ML Report — Driver Drowsiness Detection

## 1. Problem statement

Drowsy driving is a major cause of road accidents. The goal is to estimate, in real time and on
commodity hardware (a laptop or phone camera), the probability that a driver is drowsy, and to raise an
alarm early enough to prevent a microsleep from becoming a crash.

We frame it as **binary classification of 10-second windows** (`alert` vs `drowsy`), combined with a hard
rule for microsleeps (continuous eye closure ≥ 1 s), which must never wait for a model.

## 2. Approach overview

| Stage | Method |
|---|---|
| Face landmarks | MediaPipe Face Mesh (Kartynnik et al., 2019): 468 + 10 iris 3D landmarks, ~30 FPS via TF.js WebGL |
| Per-frame features | EAR (both eyes), MAR (3 inner-lip pairs), head pitch / yaw / roll |
| Temporal features | 11 window statistics over 10 s (table below) |
| Classifier | Logistic regression / MLP (deployed); SVM, Random Forest, Gradient Boosting (compared) |
| Post-processing | Exponential moving average (α = 0.35) + hysteresis via drowsy / critical thresholds |
| Complementary DL model | Eye-state CNN on MRL Eye Dataset (`ml/training/train_eye_cnn.py`) |

### 2.1 Per-frame geometry

**Eye Aspect Ratio** (Soukupová & Čech, 2016), with landmarks *p₁…p₆* around each eye:

$$\mathrm{EAR} = \frac{\lVert p_2 - p_6\rVert + \lVert p_3 - p_5\rVert}{2\,\lVert p_1 - p_4\rVert}$$

EAR is roughly constant (~0.25–0.32) while the eye is open and falls towards 0 when it closes. It is
scale-invariant and needs no per-frame image processing.

**Mouth Aspect Ratio** — mean of three vertical inner-lip distances divided by mouth width (more robust
than the single-pair variant to asymmetric mouth opening).

**Head pose** — a face frame is built from the eye line (x-axis) and the forehead→chin line (y-axis) of the
3D mesh; the face normal *n = x × y* gives pitch = atan2(−nᵧ, n_z), yaw = atan2(nₓ, n_z). Pitch is
re-zeroed during calibration to account for camera placement.

### 2.2 Window features (`ml/feature_spec.json`)

| Feature | Rationale |
|---|---|
| `ear_mean`, `ear_std` | Droopy eyelids lower mean EAR; fluctuating closure raises variance |
| `perclos` | % of frames with eyes closed — the most validated fatigue measure (Wierwille et al., 1994) |
| `blink_rate` | Blink frequency changes with fatigue |
| `blink_duration_mean` | Blinks slow down (longer closures) when drowsy |
| `longest_closure` | Microsleep indicator |
| `mar_mean`, `yawn_rate` | Yawning precedes and accompanies drowsiness |
| `pitch_mean`, `pitch_std` | Head dropping / nodding |
| `yaw_std` | Distraction / head instability |

**Calibration** (4 s, eyes open): EAR threshold = 0.75 × median EAR, MAR threshold = median MAR + 0.35,
pitch baseline = median pitch. This personalises the system to eye shape, glasses and camera angle.

## 3. Data

* **Recorded data** — labelled windows collected with the Data Lab (1 window per second, overlapping),
  exported as CSV (one file = one session). Subjects act alert and simulate drowsiness (slow blinks, long
  closures, yawns, nods). *Limitation:* acted drowsiness is not identical to real fatigue; public datasets such as
  NTHU-DDD or UTA-RLDD can be processed with the same feature extractor (`ml/inference/realtime_webcam.py`
  contains a Python implementation) for more realistic training data.
* **Synthetic data** — `ml/preprocessing/synthetic.py` generates class-conditional data with per-subject offsets,
  AR(1) temporal correlation and 5 % label noise. It is used **only** to test the pipeline and must not be reported
  as model performance.
* **MRL Eye Dataset** — ~85 k infrared eye crops labelled open/closed, used for the CNN.

### Preprocessing (`ml/preprocessing/build_dataset.py`)
1. Schema validation against the feature spec.
2. Drop missing / non-finite values and duplicates.
3. Physiological range filter (e.g. EAR ∈ [0, 0.6], PERCLOS ∈ [0, 1]).
4. Drop the first 10 windows of each session (sliding window still filling).

## 4. Evaluation methodology

Overlapping sliding windows are highly correlated, so **random splits leak** and inflate scores. We therefore:

* hold out **entire sessions** for testing (`GroupShuffleSplit`, 20 %);
* tune hyper-parameters with **5-fold `StratifiedGroupKFold`** on the training sessions, optimising ROC-AUC;
* in the browser trainer (single continuous recording) use a **chronological hold-out** of the last 20 % of each class.

Metrics: accuracy, precision, recall, F1, ROC-AUC, PR-AUC, confusion matrix; permutation feature importance.
For a safety system **recall on the drowsy class matters most** (a missed microsleep is worse than a false alarm),
so decision thresholds are exposed in the UI and the microsleep rule provides a recall floor.

## 5. Results

> Run `python -m ml.training.train_classifier` on your recorded data. It writes:
> `ml/evaluation/reports/model_comparison.md`, `roc_pr_curves.png`, `confusion_matrices.png`,
> `feature_importance.png`, and exports the best deployable model to the web app.
> Paste the generated table here — **do not report numbers obtained on synthetic data.**

| model | CV ROC-AUC | test ROC-AUC | F1 | recall |
|---|---|---|---|---|
| *(fill from model_comparison.md)* | | | | |

Eye-state CNN: see `ml/evaluation/reports/eye_cnn_metrics.json` after training.

## 6. Explainability

The live monitor shows **occlusion attributions**: for each feature, the change in predicted probability when
that feature is replaced by its training mean (i.e. its standardised value set to 0). For logistic regression this
reduces to the sign and magnitude of *wᵢ·zᵢ* passed through the sigmoid; the same method works unchanged for the MLP.

## 7. Deployment

* Models are exported to a portable JSON artifact (scaler + dense layers) and executed with a plain forward pass
  in the browser and in the backend — no TF.js / scikit-learn needed at inference time, and identical outputs
  everywhere (verified by `tests/ml/test_pipeline.py`).
* Inference cost is dominated by Face Mesh (~10–30 ms per frame on a laptop GPU); the classifier takes < 0.1 ms.

## 8. Limitations & future work

* Sunglasses, IR-blocking glass and low light degrade landmark quality → fuse with the eye-state CNN.
* Acted drowsiness differs from real fatigue → train on NTHU-DDD / UTA-RLDD or naturalistic data.
* Per-user models improve accuracy but need more data per user → federated or on-device fine-tuning.
* Temporal models (1-D CNN / LSTM over frame sequences) could capture dynamics better than window statistics.
* Real-world validation against a ground-truth sleepiness scale (e.g. Karolinska Sleepiness Scale).

## References

1. T. Soukupová, J. Čech. *Real-Time Eye Blink Detection using Facial Landmarks.* CVWW 2016.
2. W. W. Wierwille et al. *Research on Vehicle-Based Driver Status/Performance Monitoring.* NHTSA DOT HS 808 247, 1994.
3. Y. Kartynnik et al. *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs.* CVPR-W 2019.
4. M. Mitchell et al. *Model Cards for Model Reporting.* FAT* 2019.
5. MRL Eye Dataset, Media Research Lab, VŠB – Technical University of Ostrava.
6. C.-H. Weng et al. *Driver Drowsiness Detection via a Hierarchical Temporal Deep Belief Network* (NTHU-DDD). ACCV-W 2016.
7. R. Ghoddoosian et al. *A Realistic Dataset and Baseline Temporal Model for Early Drowsiness Detection* (UTA-RLDD). CVPR-W 2019.
