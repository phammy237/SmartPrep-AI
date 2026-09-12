"""Small filesystem helpers for run directories, JSON, and checkpoints - shared
so training/evaluation/inference agree on one on-disk layout without copying
this logic into each script."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def create_run_dir(base_output_dir: str | Path, run_name: str, run_id: str | None = None) -> Path:
    """`<base_output_dir>/<run_name>-<run_id>/`, created if missing. `run_id`
    defaults to a UTC timestamp so repeated runs never collide or silently
    overwrite each other's outputs."""
    resolved_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(base_output_dir) / f"{run_name}-{resolved_id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def save_json(obj: Any, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, sort_keys=True)
        f.write("\n")


def load_json(path: str | Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
