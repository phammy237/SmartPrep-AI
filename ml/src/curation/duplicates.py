"""Exact and near-duplicate detection.

Exact duplicates: SHA-256 of file bytes - byte-identical files, regardless of
filename/path.

Near duplicates: a simple average-hash (aHash) perceptual hash + Hamming
distance. Deliberately simple (PIL only, no extra dependency) - it is meant
to catch the obvious case this dataset actually has (near-identical frames
from a turntable/burst sequence), not to be a state-of-the-art perceptual
hash. O(n^2) pairwise comparison - fine at v0's curation scale (hundreds to
low thousands of images); would need an indexed approach (e.g. LSH) at real
scale.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path


def compute_file_hash(path: str | Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def find_exact_duplicates(paths: list[str]) -> dict[str, list[str]]:
    """Returns {hash: [paths]} for every hash shared by 2+ files. A hash with
    only one path is not a duplicate and is omitted."""
    by_hash: dict[str, list[str]] = {}
    for path in paths:
        by_hash.setdefault(compute_file_hash(path), []).append(path)
    return {h: p for h, p in by_hash.items() if len(p) > 1}


def compute_average_hash(path: str | Path, hash_size: int = 8) -> int:
    """A basic aHash: shrink to `hash_size`x`hash_size` grayscale, threshold
    each pixel against the mean, pack the bits into an int."""
    from PIL import Image

    with Image.open(path) as img:
        small = img.convert("L").resize((hash_size, hash_size), Image.Resampling.LANCZOS)
        pixels = list(small.getdata())

    mean = sum(pixels) / len(pixels)
    bits = 0
    for pixel in pixels:
        bits = (bits << 1) | (1 if pixel >= mean else 0)
    return bits


def hamming_distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


@dataclass(frozen=True)
class NearDuplicatePair:
    path_a: str
    path_b: str
    distance: int


def find_near_duplicates(
    paths: list[str], hash_size: int = 8, max_distance: int = 5
) -> list[NearDuplicatePair]:
    """Pairwise-compares every path's average hash; returns pairs whose
    Hamming distance is `<= max_distance` (lower = more similar; 0 = the
    grayscale-thumbnail-level content is identical). A file that fails to
    open is silently skipped here - `src/curation/validation.py` is
    responsible for surfacing unreadable files, not this function."""
    hashes: dict[str, int] = {}
    for path in paths:
        try:
            hashes[path] = compute_average_hash(path, hash_size=hash_size)
        except Exception:
            continue

    items = list(hashes.items())
    pairs: list[NearDuplicatePair] = []
    for i in range(len(items)):
        path_a, hash_a = items[i]
        for j in range(i + 1, len(items)):
            path_b, hash_b = items[j]
            distance = hamming_distance(hash_a, hash_b)
            if distance <= max_distance:
                pairs.append(NearDuplicatePair(path_a=path_a, path_b=path_b, distance=distance))
    return pairs


def cluster_near_duplicates(
    paths: list[str], hash_size: int = 8, max_distance: int = 5
) -> dict[str, str]:
    """Conservative specimen/group inference for a source with NO explicit
    grouping metadata (e.g. BanglaVegNet: sequential filenames only, no
    session/specimen id, unlike Fruits-360's per-variety folders).

    Returns {path: group_id} where every path reachable from another via a
    chain of `find_near_duplicates` pairs (Hamming distance <= max_distance)
    shares one group id (union-find over the near-duplicate graph -
    transitive, so if A~B and B~C, all three land in one group even if A and
    C alone would not have been flagged as a pair). A path with no
    near-duplicate partner at all becomes its own singleton group.

    This is deliberately conservative in the direction of NOT undercounting
    duplication: two images end up in the same group whenever there is ANY
    chain of visual similarity between them, on the theory that it is far
    worse to let two views of the same physical specimen leak across a
    train/test split than it is to slightly over-merge two distinct but
    visually similar specimens into one split-safe group (that only costs a
    bit of group diversity, not correctness of the eval numbers).
    """
    pairs = find_near_duplicates(paths, hash_size=hash_size, max_distance=max_distance)

    parent: dict[str, str] = {p: p for p in paths}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path compression
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for pair in pairs:
        union(pair.path_a, pair.path_b)

    # Stable, deterministic group ids: the lexicographically smallest path in
    # each cluster (not a random/opaque token) - so re-running against the
    # same files always produces the same group ids.
    roots_to_members: dict[str, list[str]] = {}
    for p in paths:
        roots_to_members.setdefault(find(p), []).append(p)

    group_id_of_root = {root: min(members) for root, members in roots_to_members.items()}
    return {p: group_id_of_root[find(p)] for p in paths}
