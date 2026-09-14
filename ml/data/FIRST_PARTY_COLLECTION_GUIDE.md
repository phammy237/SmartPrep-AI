# First-Party Collection Guide — SmartPrep Ingredient Model v0

A practical guide for taking the photos yourself. Read "How this maps to
the manifest" once before you start — everything else is a per-class
checklist you can follow on your phone while shooting.

**This is a realistic, bounded target, not "take thousands of photos."**
Total across all 13 classes: **roughly 330–480 photos**, spread over
**as few as 4–6 sessions** if you group multiple classes per session
(e.g. one "fridge shelf" session can cover milk, cheese, spinach, and
carrot in one sitting). See "Suggested session plan" at the end.

## Why the target differs by class

Not every class needs the same amount of first-party work — it depends on
what the public sources acquired so far (`data/DATASET_AUDIT_v0.md`)
already give us:

| Tier | Classes | Why | 
|---|---|---|
| **A — Primary source** (public data: none usable) | egg, milk, bread, chicken, cheese, broccoli | Zero real images from any source. First-party IS the dataset for these. |
| **B — Needs more groups** (public data: images exist, groups don't) | apple, banana, carrot | Fruits-360 gave images but only 1–3 *groups* (physical specimens) per class — too few for a real train/val/test split no matter how many images. First-party's job here is adding distinct specimens, not photo volume. |
| **C — Domain adaptation only** (public data: good group coverage, wrong domain) | tomato, onion, potato | 11–57 groups each already from a real second source — plenty of specimens, just all in one "market/studio" domain. First-party's job is purely injecting some real fridge/pantry-style shots. |
| **D — Wrong sub-domain** (public data: leaf close-ups, not whole produce) | spinach | 17 groups exist, but they're leaf-classification close-ups, not bunches/bags as they'd appear in a fridge photo — a genuinely different visual task. Needs a real grocery-domain first-party set, similar in size to Tier B. |

## Per-class targets

### Tier A — egg, milk, bread, chicken, cheese, broccoli

| | Minimum | Preferred |
|---|---|---|
| Distinct physical specimens/products | 10 | 12–15 |
| Photos per specimen | 4 | 5–6 |
| Sessions | 2 | 3 |
| **Total photos for this class** | **~40** | **~65–90** |

### Tier B — apple, banana, carrot

| | Minimum | Preferred |
|---|---|---|
| Distinct physical specimens | 6 | 8 |
| Photos per specimen | 3 | 4 |
| Sessions | 1 | 2 |
| **Total photos for this class** | **~18** | **~32** |

### Tier C — tomato, onion, potato

| | Minimum | Preferred |
|---|---|---|
| Distinct physical specimens | 4 | 6 |
| Photos per specimen | 3 | 4 |
| Sessions | 1 | 1 |
| **Total photos for this class** | **~12** | **~24** |

### Tier D — spinach

| | Minimum | Preferred |
|---|---|---|
| Distinct physical specimens (bunches/bags — NOT leaf close-ups) | 6 | 8 |
| Photos per specimen | 3 | 4 |
| Sessions | 1 | 2 |
| **Total photos for this class** | **~18** | **~32** |

**"Specimen" always means one physical product/item** — one specific milk
carton, one specific apple, one specific loaf. Taking 20 angles of the SAME
carton is 20 photos of **one** specimen, not 20 specimens — see "The one
rule that matters most" below.

## What to vary, per class

For every class, across your different specimens (not necessarily every
single one — mix it up across your whole session):

- **Locations:** fridge shelf, pantry shelf, countertop, grocery bag/cart —
  hit at least 3 of these 4 across a class's specimens.
- **Lighting:** overhead kitchen light, phone flash, natural daylight,
  dim/evening light — hit at least 2–3.
- **Backgrounds:** both cluttered (other items partially in frame — but
  keep exactly ONE ingredient class as the clear primary subject; v0 is a
  whole-image classifier, not a detector, so a photo with no single
  identifiable primary ingredient doesn't belong in the dataset) and
  isolated/clean shots.
- **Packaged vs. unpackaged:**
  - milk: always packaged — vary carton/jug size and brand instead.
  - egg: both a full/partial carton AND a few loose eggs.
  - bread: both a bagged loaf AND a few unwrapped/sliced pieces.
  - cheese: both a packaged block/wedge AND sliced/unwrapped.
  - chicken: packaged raw only (food-safety — don't unwrap raw poultry for
    a photo op); vary cut/packaging style instead.
  - broccoli, spinach, tomato, onion, potato, carrot, apple, banana: both
    loose/unpackaged and, where realistic, a produce bag.
- **Occlusion:** include a few photos per class where the item is partially
  behind or next to something else (realistic fridge clutter) alongside
  fully-unoccluded shots — don't make every photo a perfect isolated shot.
- **Distance/angle:** vary both — a close-up, a medium "just opened the
  fridge" distance, and at least one off-angle (not straight-on) shot per
  specimen where practical.
- **Devices:** use a second phone/camera for at least a few specimens per
  class if you have access to one — avoids the whole dataset overfitting to
  one sensor's color/sharpness signature.

## The one rule that matters most: specimens vs. photos

**Do NOT take 20 angles of one milk carton and count it as 20 independent
examples.** All photos of the same physical carton/loaf/bunch/item are one
`group` — `assign_splits` will keep that whole group in ONE split
(train, val, or test), same as every other source in this dataset. This is
exactly what went wrong with Fruits-360's carrot data (15 images, but only
1 physical specimen = 1 group = impossible to give it a real train/val/test
split) — first-party collection is how we avoid repeating that mistake, not
where we reintroduce it.

## Group ID convention

```text
fp_<class>_<specimen>_<session>
```

Examples:
- `fp_milk_03_kitchen-night` — the 3rd milk specimen, photographed during a
  session you've labeled "kitchen-night."
- `fp_egg_07_pantry-day1` — the 7th egg specimen, "pantry-day1" session.

**Every photo of the same physical item, in the same session, shares one
group.** If you photograph the SAME physical item again in a LATER session
(e.g., a carton that's still around a week later), give it a **new**
specimen number rather than reusing the old group id — a week later,
lighting/background/state has likely changed enough that treating it as a
fresh specimen is the safer, more conservative choice (same principle as
`cluster_near_duplicates` erring toward NOT assuming two things are
identical just because they're the same category).

Specimen numbers don't need to be globally sequential across sessions —
`fp_milk_01_...` through `fp_milk_05_...` in one session and
`fp_milk_06_...` onward in the next is fine, as is restarting numbering
per session as long as the session tag differs (e.g. `fp_milk_01_session2`)
so the two "01"s never collide.

## How this maps to the manifest (once you're done shooting)

You don't need to build the manifest CSV by hand. Drop photos into an inbox
folder and run `scripts/import_first_party.py` (see
`ml/data/README.md` and that script's own `--help`) — it validates each
image, assigns/preserves the group id from the filename or folder
convention you used, tags `first_party=true`, and writes provenance
automatically. See that script's docstring for the exact inbox layout it
expects.

After importing, run `scripts/audit_dataset.py` (or the equivalent ad-hoc
statistics/leakage calls documented in `data/DATASET_AUDIT_v0.md`) to see
per-class counts, group counts, and whether every class now clears the
split/group minimum — before assuming the dataset is ready for a training
run.

## Suggested session plan (one realistic way to batch this)

You do not have to shoot one class at a time — a single realistic session
naturally contains several classes at once (a real fridge has milk, cheese,
carrots, and spinach in it together). A plan that keeps total sessions low:

1. **Fridge session (day 1):** milk, cheese, spinach, carrot, tomato,
   onion — whatever's actually in your fridge, shot in place.
2. **Pantry/counter session (day 1 or 2):** bread, egg, potato, onion,
   garlic-adjacent staples (apple/banana if you keep them on the counter).
3. **Grocery-bag / just-got-home session:** re-shoot a subset of the above
   fresh out of a bag — this single session naturally covers the
   "grocery bag" background requirement for many classes at once.
4. **Chicken / broccoli session:** these may need a dedicated grocery trip
   if not already on hand - do both together (raw meat handling means this
   is worth being its own careful session).
5. **A second session per class, later** (different day/lighting) to reach
   the "sessions ≥2" targets above and get real day-to-day lighting
   variation, not just one moment in time.

This keeps the total number of distinct outings to roughly **4–6**, not one
per class.
