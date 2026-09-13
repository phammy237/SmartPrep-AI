"""Image validation: corrupt files, unsupported formats, extreme dimensions."""

from __future__ import annotations

from src.curation.validation import validate_image, validate_images


def _make_image(path, size=(64, 64), fmt="PNG", color=(10, 20, 30)):
    from PIL import Image

    Image.new("RGB", size, color).save(path, format=fmt)


def test_valid_image_passes(tmp_path):
    path = tmp_path / "good.png"
    _make_image(path)
    result = validate_image(str(path))
    assert result.ok is True
    assert result.width == 64 and result.height == 64
    assert result.reason is None


def test_corrupt_file_is_rejected(tmp_path):
    path = tmp_path / "corrupt.png"
    path.write_bytes(b"this is not a real image file")
    result = validate_image(str(path))
    assert result.ok is False
    assert "unreadable" in result.reason


def test_nonexistent_file_is_rejected(tmp_path):
    result = validate_image(str(tmp_path / "missing.png"))
    assert result.ok is False


def test_too_small_image_is_rejected(tmp_path):
    path = tmp_path / "tiny.png"
    _make_image(path, size=(4, 4))
    result = validate_image(str(path))
    assert result.ok is False
    assert "too small" in result.reason


def test_too_large_image_is_rejected(tmp_path):
    path = tmp_path / "huge.png"
    _make_image(path, size=(9000, 100))  # both dims well above MIN_DIMENSION - only "too large" should trigger
    result = validate_image(str(path))
    assert result.ok is False
    assert "too large" in result.reason


def test_unsupported_format_is_rejected(tmp_path):
    path = tmp_path / "bad.bmp"
    _make_image(path, fmt="BMP")
    result = validate_image(str(path))
    assert result.ok is False
    assert "unsupported format" in result.reason


def test_validate_images_processes_a_batch(tmp_path):
    good = tmp_path / "good.png"
    corrupt = tmp_path / "corrupt.png"
    _make_image(good)
    corrupt.write_bytes(b"garbage")

    results = validate_images([str(good), str(corrupt)])
    assert results[0].ok is True
    assert results[1].ok is False
