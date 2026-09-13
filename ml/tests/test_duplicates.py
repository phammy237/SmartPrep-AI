"""Exact and near-duplicate detection - no network, tiny synthetic images."""

from __future__ import annotations

from pathlib import Path

from src.curation.duplicates import (
    cluster_near_duplicates,
    compute_average_hash,
    compute_file_hash,
    find_exact_duplicates,
    find_near_duplicates,
    hamming_distance,
)


def test_identical_bytes_hash_the_same(tmp_path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"same content")
    b.write_bytes(b"same content")
    assert compute_file_hash(a) == compute_file_hash(b)


def test_different_bytes_hash_differently(tmp_path):
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"content one")
    b.write_bytes(b"content two")
    assert compute_file_hash(a) != compute_file_hash(b)


def test_find_exact_duplicates_groups_byte_identical_files(tmp_path):
    paths = []
    for i, content in enumerate([b"X", b"X", b"Y", b"Z", b"Z"]):
        p = tmp_path / f"f{i}.bin"
        p.write_bytes(content)
        paths.append(str(p))

    dupes = find_exact_duplicates(paths)
    groups = sorted(sorted(g) for g in dupes.values())
    assert groups == sorted([sorted([paths[0], paths[1]]), sorted([paths[3], paths[4]])])


def test_find_exact_duplicates_omits_unique_files(tmp_path):
    p = tmp_path / "unique.bin"
    p.write_bytes(b"only one")
    assert find_exact_duplicates([str(p)]) == {}


def _make_solid_image(path, color, size=32):
    from PIL import Image

    Image.new("RGB", (size, size), color).save(path)


def _make_textured_image(path, color, size=32, seed=0):
    """Like conftest's `_make_tiny_image`: a base color plus per-pixel noise.

    aHash thresholds each pixel against ITS OWN image's mean, so a perfectly
    flat solid-color image has zero internal variance and always collapses to
    an all-1-bits hash regardless of which color it is - a degenerate input
    no real photo ever produces. Adding noise (as every real image has, via
    texture/lighting/sensor grain) gives aHash something real to measure.
    """
    import random

    from PIL import Image

    rng = random.Random(seed)
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for x in range(size):
        for y in range(size):
            noise = rng.randint(-15, 15)
            pixels[x, y] = tuple(max(0, min(255, channel + noise)) for channel in color)
    image.save(path)


def test_average_hash_is_identical_for_identical_images(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    _make_solid_image(a, (100, 50, 25))
    _make_solid_image(b, (100, 50, 25))
    assert compute_average_hash(a) == compute_average_hash(b)


def test_average_hash_differs_for_very_different_images(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    _make_textured_image(a, (255, 255, 255), seed=1)
    _make_textured_image(b, (0, 0, 0), seed=2)
    assert hamming_distance(compute_average_hash(a), compute_average_hash(b)) > 10


def test_hamming_distance_of_identical_hashes_is_zero():
    assert hamming_distance(0b1010, 0b1010) == 0


def test_hamming_distance_counts_differing_bits():
    assert hamming_distance(0b0000, 0b1111) == 4


def test_find_near_duplicates_flags_visually_similar_images(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"  # near-identical: one pixel shade off, same seed
    c = tmp_path / "c.png"  # very different color and texture
    _make_textured_image(a, (120, 120, 120), seed=1)
    _make_textured_image(b, (122, 118, 121), seed=1)
    _make_textured_image(c, (10, 200, 30), seed=2)

    pairs = find_near_duplicates([str(a), str(b), str(c)], max_distance=5)
    flagged = {frozenset((p.path_a, p.path_b)) for p in pairs}
    assert frozenset((str(a), str(b))) in flagged
    assert frozenset((str(a), str(c))) not in flagged
    assert frozenset((str(b), str(c))) not in flagged


def test_find_near_duplicates_skips_unreadable_files_without_raising(tmp_path):
    good = tmp_path / "good.png"
    bad = tmp_path / "bad.png"
    _make_solid_image(good, (10, 20, 30))
    bad.write_bytes(b"not an image")

    pairs = find_near_duplicates([str(good), str(bad)])  # must not raise
    assert all(bad.name not in (p.path_a, p.path_b) for p in pairs)


def test_cluster_near_duplicates_groups_directly_similar_images(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"  # near-identical to a
    c = tmp_path / "c.png"  # very different from both
    _make_textured_image(a, (120, 120, 120), seed=1)
    _make_textured_image(b, (122, 118, 121), seed=1)
    _make_textured_image(c, (10, 200, 30), seed=2)

    groups = cluster_near_duplicates([str(a), str(b), str(c)], max_distance=5)
    assert groups[str(a)] == groups[str(b)]
    assert groups[str(c)] != groups[str(a)]


def test_cluster_near_duplicates_is_transitive_across_a_chain(tmp_path, monkeypatch):
    """A~B and B~C (but A and C alone are NOT within max_distance of each
    other) must still all land in one group - two views of the same
    specimen photographed at slightly different angles/lighting can drift
    far enough apart that only the middle frames overlap pairwise.

    The real aHash on synthetic noise images doesn't walk smoothly enough to
    reliably construct this scenario photographically, so `compute_average_hash`
    is monkeypatched to controlled values that form a genuine chain: each
    consecutive pair differs by 1 bit, but step0 vs step4 differ by 4 bits -
    only transitive union-find (not naive pairwise grouping) unions them all.
    """
    import src.curation.duplicates as duplicates_module

    paths = [str(tmp_path / f"step{i}.png") for i in range(5)]
    for p in paths:
        Path(p).write_bytes(b"placeholder")  # content is irrelevant; hash is mocked below

    controlled_hashes = {
        paths[0]: 0b00000,
        paths[1]: 0b00001,
        paths[2]: 0b00011,
        paths[3]: 0b00111,
        paths[4]: 0b01111,
    }
    monkeypatch.setattr(duplicates_module, "compute_average_hash", lambda path, hash_size=8: controlled_hashes[str(path)])

    # sanity check: the scenario is genuinely non-trivial for pairwise-only logic
    assert hamming_distance(controlled_hashes[paths[0]], controlled_hashes[paths[4]]) == 4

    groups = cluster_near_duplicates(paths, max_distance=1)
    # every step must chain-transitively into ONE group, even though
    # step0 vs step4 alone are 4 bits apart (> max_distance=1).
    assert len(set(groups.values())) == 1


def test_cluster_near_duplicates_gives_unrelated_images_distinct_groups(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    _make_textured_image(a, (255, 255, 255), seed=1)
    _make_textured_image(b, (0, 0, 0), seed=2)

    groups = cluster_near_duplicates([str(a), str(b)], max_distance=5)
    assert groups[str(a)] != groups[str(b)]


def test_cluster_near_duplicates_group_ids_are_deterministic(tmp_path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    _make_textured_image(a, (50, 50, 50), seed=1)
    _make_textured_image(b, (52, 49, 51), seed=1)

    g1 = cluster_near_duplicates([str(a), str(b)], max_distance=5)
    g2 = cluster_near_duplicates([str(a), str(b)], max_distance=5)
    assert g1 == g2
    # the group id is the lexicographically smallest member path, not an
    # opaque/random token
    assert g1[str(a)] == min(str(a), str(b))
