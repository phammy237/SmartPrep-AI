"""CPU/CUDA device resolution, shared by training, evaluation, and inference so
none of them duplicate the "auto" fallback logic."""

from __future__ import annotations


def get_device(prefer: str = "auto"):
    """`prefer` is one of "auto" (default), "cpu", or "cuda". "cuda" raises if no
    CUDA device is actually available, rather than silently falling back to CPU -
    a caller who explicitly asked for GPU should know if they didn't get one."""
    import torch

    if prefer == "cpu":
        return torch.device("cpu")
    if prefer == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested (device: cuda) but no CUDA device is available.")
        return torch.device("cuda")
    if prefer != "auto":
        raise ValueError(f"Unknown device preference {prefer!r}. Use 'auto', 'cpu', or 'cuda'.")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")
