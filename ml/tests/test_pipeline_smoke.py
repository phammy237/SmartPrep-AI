"""End-to-end pipeline smoke test: dataset -> preprocessing -> training ->
validation -> test evaluation -> saved checkpoint -> reproducible inference,
entirely on tiny synthetic fixtures.

THIS TEST DOES NOT PROVE MODEL QUALITY. It proves the pipeline runs to
completion and produces well-formed artifacts. See
PIPELINE_VERIFIED_NOT_TRAINED.md - no assertion here checks that accuracy is
"good," only that it is a valid, well-shaped number.

pretrained=False so this test never depends on network access to download
real ImageNet weights.
"""

from __future__ import annotations

from src.evaluation.evaluate import run_evaluation
from src.inference.predict import predict
from src.training.config import TrainingConfig
from src.training.train import run_training


def test_full_pipeline_runs_end_to_end_on_synthetic_data(tmp_path, tiny_raw_data_dir, tiny_class_map, monkeypatch):
    import json

    classes_path = tmp_path / "classes.json"
    classes_path.write_text(json.dumps(tiny_class_map.to_dict()))

    cfg = TrainingConfig(
        run_name="smoke-test",
        seed=0,
        classes_path=str(classes_path),
        data_dir=str(tiny_raw_data_dir),
        manifest_path=str(tmp_path / "manifest.csv"),
        force_resplit=False,
        image_size=32,
        batch_size=3,
        epochs=2,
        learning_rate=1e-3,
        optimizer="adamw",
        weight_decay=0.0,
        pretrained=False,  # no network access in tests
        backbone="resnet18",
        num_workers=0,
        device="cpu",
        output_dir=str(tmp_path / "outputs"),
    )
    cfg.split.train, cfg.split.val, cfg.split.test = 0.5, 0.25, 0.25
    cfg.early_stopping.enabled = False

    # --- training ---
    summary = run_training(cfg)
    from pathlib import Path

    run_dir = Path(summary["run_dir"])
    assert (run_dir / "best_model.pt").exists()
    assert (run_dir / "config.json").exists()
    assert (run_dir / "class_map.json").exists()
    assert (run_dir / "history.json").exists()
    assert (run_dir / "metrics.json").exists()
    assert len(summary["history"]) == cfg.epochs
    assert 0.0 <= summary["best_val_accuracy"] <= 1.0

    # --- test-set evaluation (held-out split, only used here) ---
    metrics = run_evaluation(str(run_dir / "best_model.pt"), cfg.manifest_path, device_pref="cpu", top_k=2)
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert 0.0 <= metrics["macro_f1"] <= 1.0
    assert len(metrics["confusion_matrix"]) == len(tiny_class_map)
    assert metrics["num_test_examples"] > 0
    assert "2" in metrics["top_k_accuracy"]

    # --- reproducible inference from the saved checkpoint alone ---
    from src.datasets.manifest import read_manifest, rows_for_split

    test_row = rows_for_split(read_manifest(cfg.manifest_path), "test")[0]
    result = predict(test_row.path, str(run_dir / "best_model.pt"), device_pref="cpu", top_k=2)

    assert set(result.keys()) == {"predicted_class", "confidence", "top_k"} | {"model_version"}
    assert result["predicted_class"] in set(tiny_class_map)
    assert 0.0 <= result["confidence"] <= 1.0
    assert len(result["top_k"]) == 2
    assert result["model_version"] == "ingredient-classifier-smoke-test"

    # Inference is deterministic given the same checkpoint + image (eval mode,
    # no dropout/augmentation randomness in this backbone's eval path).
    result_again = predict(test_row.path, str(run_dir / "best_model.pt"), device_pref="cpu", top_k=2)
    assert result == result_again


def test_training_respects_manifest_reuse_across_two_runs(tmp_path, tiny_raw_data_dir, tiny_class_map):
    """Two training runs pointed at the same manifest path must train on the
    IDENTICAL split, even with different seeds - proving force_resplit=False
    (the default) actually prevents resplitting mid-project."""
    import json

    classes_path = tmp_path / "classes.json"
    classes_path.write_text(json.dumps(tiny_class_map.to_dict()))
    manifest_path = tmp_path / "manifest.csv"

    def make_cfg(run_name: str, seed: int) -> TrainingConfig:
        cfg = TrainingConfig(
            run_name=run_name,
            seed=seed,
            classes_path=str(classes_path),
            data_dir=str(tiny_raw_data_dir),
            manifest_path=str(manifest_path),
            force_resplit=False,
            image_size=32,
            batch_size=3,
            epochs=1,
            pretrained=False,
            num_workers=0,
            device="cpu",
            output_dir=str(tmp_path / "outputs"),
        )
        cfg.split.train, cfg.split.val, cfg.split.test = 0.5, 0.25, 0.25
        cfg.early_stopping.enabled = False
        return cfg

    run_training(make_cfg("run-a", seed=1))
    from src.datasets.manifest import read_manifest

    manifest_after_first = read_manifest(manifest_path)

    run_training(make_cfg("run-b", seed=999))
    manifest_after_second = read_manifest(manifest_path)

    assert manifest_after_first == manifest_after_second
