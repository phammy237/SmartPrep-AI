"""Reproducible seeding across random, numpy, and (if installed) torch/CUDA.

Import of torch is deferred and guarded so this module - and anything that
only needs deterministic Python/numpy behavior (e.g. the manifest splitter) -
works even in an environment where torch is not installed yet.
"""

from __future__ import annotations

import os
import random

import numpy as np


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import torch
    except ImportError:
        return
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # Deterministic cuDNN convolution algorithms - slower, but reproducible
    # runs matter more than raw speed for a v0 baseline meant to prove the
    # pipeline, not to be tuned for throughput.
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
