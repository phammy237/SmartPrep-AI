"""Per-image validation: corrupt/unreadable files, unsupported formats, and
extreme dimensions - checked BEFORE an image is trusted enough to appear in a
manifest.
"""

from __future__ import annotations

from dataclasses import dataclass

SUPPORTED_FORMATS = ("JPEG", "PNG")
MIN_DIMENSION = 32
MAX_DIMENSION = 8000


@dataclass(frozen=True)
class ImageValidationResult:
    path: str
    ok: bool
    reason: str | None = None
    width: int | None = None
    height: int | None = None
    format: str | None = None


def validate_image(path: str) -> ImageValidationResult:
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(path) as img:
            img.verify()  # raises on structurally corrupt files
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        return ImageValidationResult(path=path, ok=False, reason=f"unreadable: {exc}")

    # img.verify() leaves the file object unusable for further reads - reopen.
    try:
        with Image.open(path) as img:
            width, height = img.size
            fmt = img.format
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        return ImageValidationResult(path=path, ok=False, reason=f"unreadable after verify: {exc}")

    if fmt not in SUPPORTED_FORMATS:
        return ImageValidationResult(
            path=path, ok=False, reason=f"unsupported format {fmt!r}", width=width, height=height, format=fmt
        )
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        return ImageValidationResult(
            path=path,
            ok=False,
            reason=f"dimensions too small ({width}x{height}, min {MIN_DIMENSION})",
            width=width,
            height=height,
            format=fmt,
        )
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        return ImageValidationResult(
            path=path,
            ok=False,
            reason=f"dimensions too large ({width}x{height}, max {MAX_DIMENSION})",
            width=width,
            height=height,
            format=fmt,
        )

    return ImageValidationResult(path=path, ok=True, width=width, height=height, format=fmt)


def validate_images(paths: list[str]) -> list[ImageValidationResult]:
    return [validate_image(p) for p in paths]
