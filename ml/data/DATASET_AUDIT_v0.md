# Dataset Audit — v0 Real Dataset (interim)

Generated from actual runs of `scripts/acquire/fruits360.py`,
`scripts/acquire/bangladeshi_vegetables.py`, and
`scripts/acquire/vegetable_leaf_spinach.py`, plus the curation tools in
`src/curation/` — against real, licensed images, not projected or
hypothetical numbers. Regenerate any time with `python scripts/audit_dataset.py`
(reproduces everything below in one command — see "How to reproduce this
audit").

**Verdict: NOT READY FOR TRAINING. READY FOR FIRST-PARTY COLLECTION.**
See "Quality gate result" at the bottom, and
`data/FIRST_PARTY_COLLECTION_GUIDE.md` for what to shoot next.

## What was acquired

| Source | Classes covered | License | Images | Groups | Acquired via |
|---|---|---|---|---|---|
| Fruits-360 (`fruits-360-100x100`, GitHub, `main` branch) | apple, banana, carrot | CC BY-SA 4.0 | 90 | 6 | `scripts/acquire/fruits360.py` |
| Vegetable Image Dataset for Classification Models: A Bangladeshi Perspective (Mendeley, DOI `10.17632/b9rvg4f2st.4`) | potato, onion, tomato | CC BY 4.0 | 1,051 | 99 | `scripts/acquire/bangladeshi_vegetables.py` |
| An image dataset for classification of vegetable (Mendeley, DOI `10.17632/9c7crxrvmf.1`) | spinach (supplemental - leaf-domain, see below) | CC BY 4.0 | 109 | 17 | `scripts/acquire/vegetable_leaf_spinach.py` |
| BanglaVegNet (Mendeley, DOI `10.17632/rtx9ngb68j.2`) | tomato, onion, potato, broccoli, spinach (targeted) | CC BY 4.0 | 0 — deferred, no longer on the critical path | — | `scripts/acquire/banglavegnet.py` (dormant) |

**7 of 13 classes now have real images**: apple, banana, carrot, potato,
onion, tomato, spinach (spinach is real but leaf-domain only — see below).
**6 of 13 classes still have zero real images**: broccoli, egg, milk,
bread, chicken, cheese.

## BanglaVegNet: deferred, not removed

Per this task's explicit instruction, no further time was spent trying to
reverse-engineer BanglaVegNet's folder UUIDs. The script, its config file,
and its test suite (7 tests) are untouched and still fully working — anyone
who later obtains the 5 folder_ids (see `scripts/acquire/banglavegnet_folders.json`'s
`_readme`) can run it with zero code changes. See git history / the
previous audit pass for the full investigation of why it's blocked. It is
simply no longer the path used to cover tomato/onion/potato/broccoli/
spinach — the Bangladeshi Perspective dataset and the vegetable-leaf dataset
covered three of those five classes far more easily.

## The official ZIP archive: acquired via HTTP range requests, not a full download

"Vegetable Image Dataset for Classification Models: A Bangladeshi
Perspective" (verified 2026-09-13):
- DOI `10.17632/b9rvg4f2st.4` (version 4), CC BY 4.0.
- Authors: Md Jobayer Ahmed, Ratu Saha, Arpon Kishore Dutta, Mayen Uddin
  Mojumdar.
- Published as a **single official ZIP** (`Vegetable_Image.zip`, ~2.0GB,
  confirmed via Mendeley's file-listing API - one file entry, not
  paginated), served from a public S3 object confirmed to support
  `Accept-Ranges: bytes`.
- Rather than downloading all ~2GB to keep 3 of its 12 classes, this
  script fetches the ZIP's central directory via a handful of small Range
  requests (~540KB total), confirms each target class's entries occupy one
  CONTIGUOUS byte span in the archive, then fetches each class's whole span
  in ONE Range GET (~140-152MB each) and extracts individual files with a
  small dependency-free local-header parser that verifies every file's
  CRC32 against the central directory before trusting it (`extract_entry`
  in `bangladeshi_vegetables.py`) - the "checksum/size validation" this
  task asked for. Structure verified directly:
  `Vegetable_Image/Dataset/<ClassName>/<filename>.jpg`, flat, no raw/
  processed split - Potato (365), Onion (357), Tomato (329), exactly
  matching the published per-class counts.
- **A real, exact-duplicate pair was found and correctly caught**: two
  byte-identical files under different names in the Tomato folder
  (`IMG_20250215_223624.jpg` and `IMG_20250215_223624 (1).jpg`) - a genuine
  upload artifact in the source archive, not a bug in our tooling. Both
  ended up correctly clustered into the SAME group by
  `cluster_near_duplicates` (distance 0), so this did not cause any
  cross-split leakage - reported here per the "report rejected/duplicate
  images rather than silently discarding" instruction, not because it
  caused a problem.

## Supplemental spinach: leaf-domain, not grocery-domain

"An image dataset for classification of vegetable" (verified 2026-09-13):
DOI `10.17632/9c7crxrvmf.1`, CC BY 4.0, authors Suzana Sowket Gohona, Afsana
Mimi, Mohammad Manzurul Islam (East West University). Published as one
small (~9MB) ZIP, `Root/<class>/<filename>.jpg`, 606 images across 6 winter
vegetable leaf classes - only `Root/spinach/` (109 images) was acquired.

**This is leaf close-up photography (a leaf-classification dataset), not
whole spinach bunches/bags as they'd appear in a fridge or grocery bag.**
Acquired anyway because the task explicitly allows a small, straightforward
supplemental acquisition, and this one qualified (whole archive ~9MB,
trivial). It gives spinach 109 real images across 17 groups - useful for
exercising the pipeline and for whatever generic leaf-texture signal
transfers, but it does **not** close spinach's domain gap. Treated the same
as Tier D in `data/FIRST_PARTY_COLLECTION_GUIDE.md`: first-party bunches/
bags are still needed.

## Broccoli: researched, not acquired (confirmed domain mismatch)

Two candidate public sources were verified and explicitly rejected as
primary/supplemental sources for broccoli:

- **"Field-Acquired RGB-Depth Image Dataset for Baby Broccoli Detection and
  Size Estimation Under Varying Illumination Conditions"** (Mendeley, CC BY
  4.0) - RGB-D images from a stereo camera mounted on a mobile platform at
  commercial baby-broccoli farms in Victoria, Australia. This is
  **agricultural field imagery of broccoli PLANTS growing in soil**, not
  grocery/fridge produce - a categorically different visual task from
  "identify a broccoli head in a photo of your fridge." Not acquired, not
  even as supplemental, per this task's explicit instruction not to make
  field-crop imagery a primary broccoli source without flagging the
  mismatch (flagged here).
- **"Comprehensive Vegetable Leaf Disease Image Collection"** (Mendeley,
  DOI `10.17632/rh8c5tgg5k.1`, CC BY 4.0) - broccoli LEAF disease images
  (Alternaria leaf spot, Black rot, healthy leaf), not whole broccoli
  heads/crowns and not spinach at all (checked as a candidate spinach
  source too - it doesn't include spinach). Not acquired.

**Broccoli remains a zero-data class.** First-party photography is the
primary source - Tier A in the collection guide (same size target as
egg/milk/bread/chicken/cheese).

## Split stratification fix (found via this real multi-source dataset)

Combining Fruits-360 (1-3 groups/class) with the Bangladeshi Perspective
dataset (11-57 groups/class) into one manifest exposed a real bug:
`assign_splits` used to pool **every class's groups into one shuffled
list** before applying the train/val/test ratio, so a class's actual split
outcome depended on how many groups OTHER classes in the same manifest
happened to contribute - not something a per-class split ratio should ever
depend on. Fixed: `assign_splits` now stratifies **per label** - each
class's own groups are shuffled and split independently
(`src/datasets/manifest.py`, see its docstring). Covered by
`tests/test_manifest_split.py::test_assign_splits_stratifies_per_label_not_globally`,
which reproduces the exact failure shape (a 3-group class alongside a
90-group class) that a global pool gets wrong. This also required bumping
the shared `tiny_raw_data_dir` test fixture from 2 to 4 sessions/class,
since a stratified 3-way split needs at least 4 groups to reliably populate
val AND test for a class that small (2 or 3 groups can round one split to
zero depending on ratio/seed, independent of any bug - see that fixture's
own comment in `tests/conftest.py`).

## Full per-class results (real, current)

| Class | Images | Groups | train | val | test | Source(s) | Status |
|---|---|---|---|---|---|---|---|
| apple | 45 | 3 | 30 | 0 | 15 | fruits360 | FAILS MINIMUM (0 val) |
| banana | 30 | 2 | 15 | 0 | 15 | fruits360 | FAILS MINIMUM (0 val) |
| carrot | 15 | 1 | 15 | 0 | 0 | fruits360 | FAILS MINIMUM (0 val, 0 test) |
| tomato | 329 | 31 | 318 | 6 | 5 | bangladeshi_vegetables | OK (all 3 splits non-empty) |
| onion | 357 | 11 | 324 | 32 | 1 | bangladeshi_vegetables | OK |
| potato | 365 | 57 | 343 | 11 | 11 | bangladeshi_vegetables | OK |
| spinach | 109 | 17 | 14 | 3 | 92 | vegetable_leaf_spinach (supplemental, leaf-domain) | OK on splits, FAILS domain |
| broccoli | 0 | 0 | 0 | 0 | 0 | none | NO DATA |
| egg | 0 | 0 | 0 | 0 | 0 | none | NO DATA |
| milk | 0 | 0 | 0 | 0 | 0 | none | NO DATA |
| bread | 0 | 0 | 0 | 0 | 0 | none | NO DATA |
| chicken | 0 | 0 | 0 | 0 | 0 | none | NO DATA |
| cheese | 0 | 0 | 0 | 0 | 0 | none | NO DATA |

Overall: 1,250 total images, split counts `{train: 1059, val: 52, test: 139}`
(70/15/15 ratio, seed 42). **Class imbalance ratio: 24.3** (potato 365 vs.
carrot 15) - a real, new finding from combining sources of very different
sizes; not blocking on its own but worth correcting via first-party
collection targets that don't further favor the already-large classes (see
the collection guide).

Note the OK/FAILS split for tomato/onion/potato is real but uneven at the
**image** level even though it's fine at the **group** level - e.g. potato's
train/val/test SPLIT-BY-GROUP is close to 70/15/15, but because groups vary
a lot in size, the resulting image counts (343/11/11) skew further toward
train than the configured ratio. This is an expected, documented property
of group-based (leakage-safe) splitting, not a bug - see
`src/datasets/manifest.py::assign_splits`'s docstring.

## Leakage audit (`src/curation/leakage.py::audit_manifest_leakage`, all 7 classes with data)

```json
{
  "group_split_violations": {},
  "cross_split_exact_duplicates": 0,
  "cross_split_near_duplicates": 84
}
```

- **`group_split_violations: {}`** and **`cross_split_exact_duplicates: 0`**
  — clean. No group was ever scattered across splits, and no byte-identical
  file appears in two different splits.
- **`cross_split_near_duplicates: 84`** — investigated, not just reported:
  every single one of these 84 pairs is between two DIFFERENT Fruits-360
  apple varieties (`Apple Golden 1` vs. `Apple Granny Smith 1`), never the
  same physical specimen. Root cause: `compute_average_hash` converts to
  **grayscale** before hashing, so two apple varieties that differ mainly in
  *color* (Golden = yellow, Granny Smith = green) but have similar
  shape/lighting/white-background composition can collide at a low Hamming
  distance once color is discarded. This is a genuine, documented
  **limitation of the simple aHash near-duplicate detector** (not
  discriminative enough across classes/varieties that differ mainly in
  hue), not evidence of real train/test leakage - two different apple
  varieties are, by definition, different physical specimens, correctly
  kept in different groups. `find_cross_split_near_duplicates` was also
  fixed to only ever compare same-label pairs going forward (a near-dup
  check across two DIFFERENT ingredient classes can never indicate specimen
  leakage in the first place, and testing that showed thousands of
  meaningless cross-class hash collisions before the fix - see
  `src/curation/leakage.py`'s docstring). **Treated as a tooling limitation
  to flag for follow-up (e.g. a color-aware or perceptual-hash-library-based
  detector), not a quality-gate failure** - the gate's exact/group checks,
  which have no such limitation, are what's authoritative for leakage.

## Domain-diversity audit

**Zero of SmartPrep's 13 classes have any SmartPrep-realistic (fridge/
pantry/countertop/grocery-bag/cluttered) imagery.** Every acquired source so
far is single-domain in its own way:
- Fruits-360 (apple/banana/carrot): studio turntable, plain white
  background.
- Bangladeshi Perspective dataset (potato/onion/tomato): mobile-phone
  photos, but still a "market/isolated produce" style, not fridge/pantry.
- Vegetable-leaf dataset (spinach): leaf close-ups, not whole produce at
  all.
- Broccoli, egg, milk, bread, chicken, cheese: no images of any kind yet.

`data/FIRST_PARTY_COLLECTION_GUIDE.md` is the concrete plan to close this
for every one of the 13 classes, sized differently per class based on
exactly this table.

## Quality gate result

| Gate | Result |
|---|---|
| Every class in `configs/classes.json` has ≥1 real image | ❌ FAIL — 6/13 classes have zero (broccoli, egg, milk, bread, chicken, cheese) |
| Every class has enough distinct groups for a 3-way split | ❌ FAIL — apple/banana/carrot still don't; tomato/onion/potato/spinach now do |
| No group split across train/val/test | ✅ PASS |
| No cross-split exact duplicate | ✅ PASS |
| No cross-split near duplicate | ⚠️ 84 found, investigated and attributed to a detector limitation (grayscale hash across different apple varieties), not real leakage — see above |
| No corrupt/unreadable/wrong-format images | ✅ PASS (0 rejected across 1,250 images) |
| Domain diversity adequate for target use case | ❌ FAIL — zero SmartPrep-domain imagery for any class |

**Overall: NOT READY FOR TRAINING.**
**READY FOR FIRST-PARTY COLLECTION** — see `data/FIRST_PARTY_COLLECTION_GUIDE.md`
for exactly what to shoot, `scripts/import_first_party.py` for how to bring
photos in once taken, and `scripts/audit_dataset.py` for a one-command
re-check afterward.

## How to reproduce this audit

```bash
cd ml
python scripts/acquire/fruits360.py               # idempotent
python scripts/acquire/bangladeshi_vegetables.py   # idempotent (~430MB via range requests, one-time)
python scripts/acquire/vegetable_leaf_spinach.py   # idempotent (~9MB)
python -m pytest -q                                # all tests, no network required
python scripts/audit_dataset.py                    # full per-class + leakage report, reusing the same tooling as above
```
