"""Small helpers shared by every `scripts/acquire/*.py` acquisition script.

Kept intentionally minimal - only the pieces that were byte-for-byte
identical (or identical modulo a bound `_ML_ROOT`/timeout) across multiple
acquisition scripts live here. Each source's actual fetch mechanism (a
per-file HTTP download, a single-file range-request, or a whole-archive GET)
stays in its own script, since those genuinely differ enough per source
that forcing them through one shared function would just move the
per-source special-casing here instead of removing it.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

USER_AGENT = "smartprep-ml-dataset-acquisition/0.1 (research; see ml/data/README.md)"


def relative_path(path: Path, ml_root: Path) -> str:
    """Paths in a committed provenance CSV must be relative (portable
    across machines, and free of any local username) - never the absolute
    path an acquisition script happens to have used locally. Relative to
    the `ml/` directory, matching the convention documented in
    data/README.md. Falls back to the given path unchanged if it isn't
    actually under `ml_root` (e.g. a test's tmp_path)."""
    try:
        return str(path.resolve().relative_to(ml_root)).replace("\\", "/")
    except ValueError:
        return str(path)


def download_file(url: str, dest: Path, *, timeout: int = 30) -> None:
    """A single anonymous GET, written straight to `dest`."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        dest.write_bytes(resp.read())
