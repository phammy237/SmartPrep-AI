# Data

No dataset is checked into this repository. `raw/`, `processed/`, and
`splits/` are gitignored (see `ml/.gitignore`) and currently contain nothing
but a `.gitkeep` placeholder each, so the directory structure exists even
though the contents don't.

## Expected raw-data layout

```text
data/raw/
  apple/*.jpg|png
  banana/*.jpg|png
  tomato/*.jpg|png
  onion/*.jpg|png
  potato/*.jpg|png
  carrot/*.jpg|png
  broccoli/*.jpg|png
  spinach/*.jpg|png
  egg/*.jpg|png
  milk/*.jpg|png
  bread/*.jpg|png
  chicken/*.jpg|png
  cheese/*.jpg|png
```

One subdirectory per class, matching `ml/configs/classes.json` **exactly**
(name and set - `scripts/make_manifest.py` / `src/training/train.py` raise a
clear error if a class directory is missing or empty, rather than silently
training on 12 classes instead of 13).

Each image should show **one primary ingredient** (see the ambiguity
assumptions documented in `ml/src/utils/classes.py`) - v0 is a whole-image
classifier, not a detector; an image with several ingredients has no single
correct label and should not go in the v0 dataset.

## The manifest

`src/datasets/manifest.py` scans `raw/` and writes a manifest to
`splits/manifest.csv`:

```text
path,label,split,group
data/raw/apple/apple_session1_01.jpg,apple,train,apple_session1
...
```

- `group` exists to keep near-duplicate images (e.g. several photos from the
  same capture session) in the SAME split - see `default_group_key` in
  `manifest.py`. Splitting happens on groups, not individual images.
- Once a manifest exists at `manifest_path`, it is **not** regenerated on the
  next training run unless `force_resplit: true` is set in the config (or
  `scripts/make_manifest.py --force` is run directly) - this is deliberate,
  so the train/val/test assignment for a given dataset snapshot stays fixed
  across experiments.

## Dataset candidates researched (not yet downloaded)

No bulk download or scraping has happened. These are candidates to evaluate
and license-check individually before pulling any of them in - "permissively
licensed" here still needs a human to read the actual license text for the
specific dataset version before using it, not just its category/label.

| Dataset | Source | License (to verify before use) | Relevant classes | Approx. images | Redistribution allowed? | Derivative/model training allowed? | Known domain mismatch |
|---|---|---|---|---|---|---|---|
| Fruits-360 | https://www.kaggle.com/datasets/moltean/fruits | CC BY-SA 4.0 (per dataset page - verify current terms) | apple, banana | ~90k total across 100+ classes; per-class counts vary | Yes, with attribution/share-alike | Yes | Images are individual fruits on a plain white/uniform background, rotated on a turntable - very unlike a cluttered fridge/pantry photo. Good for a v0 sanity check, not representative of SmartPrep's real input. |
| Food-101 | https://data.vision.ee.ethz.ch/cvl/food-101.html | Free for academic/research use (verify for any commercial use before relying on it) | None directly (it's prepared dishes, e.g. "omelette", not raw ingredients) | 101,000 (1,000/class, 101 classes) | Check license terms | Check license terms | Wrong problem entirely for v0 - dishes, not raw/packaged ingredients. Listed here only because it's a commonly-cited food dataset worth ruling out explicitly. |
| Open Images Dataset (V7) - relevant categories (e.g. Tomato, Carrot, Egg, Bread, Cheese, Potato, Onion, Broccoli) | https://storage.googleapis.com/openimages/web/index.html | CC BY 4.0 (images), CC BY 4.0 (annotations) - verify per-image attribution requirements | Most of our 13 classes have a matching Open Images category | Varies per class, generally hundreds to low thousands after filtering to single-object images | Yes, with attribution | Yes | Mixed - some images are studio/product shots, others are natural scenes; would need per-image review to keep only clear, single-ingredient examples matching v0's "one primary ingredient" assumption. |
| USDA / public-domain government produce photography | Varies (USDA ARS image gallery, similar) | Often public domain (US government work) - verify per-image, not blanket | Most produce classes (apple, banana, tomato, onion, potato, carrot, broccoli, spinach) | Small, would need manual curation | Yes (if genuinely public domain) | Yes | Often idealized/studio produce photography, not fridge/pantry conditions. |
| Milk/egg/bread/cheese/chicken specifically | No single strong permissively-licensed source identified yet | N/A | milk, egg, bread, chicken, cheese | N/A | N/A | N/A | These 5 classes are the weakest link in the "public dataset" plan - packaged/retail items (milk carton, egg carton, bread loaf, cheese block, raw chicken packaging) are less represented in general-purpose object datasets than raw produce. Likely need first-party photography (below) to cover these well even for v0. |

**Conclusion for v0/v1 sourcing:** produce classes (apple, banana, tomato,
onion, potato, carrot, broccoli, spinach) have plausible permissively-licensed
candidates above worth a closer per-image license/quality review. The
remaining five (egg, milk, bread, chicken, cheese) most likely need first-party
photography from day one. No dataset has been downloaded as part of this
task - this table is the research artifact for that decision, not a download
manifest.

## First-party collection strategy (future)

Not started. When pursued, capture conditions should deliberately vary along
the axes SmartPrep's real Scan photos will vary on, since none of the
candidate public datasets above are representative of this:

- **Locations:** fridge shelf, freezer, pantry shelf, countertop, grocery bag.
- **Lighting:** overhead kitchen light, phone flash, natural daylight, dim.
- **Backgrounds:** cluttered (realistic) vs. isolated single-item shots.
- **Devices:** more than one phone/camera, to avoid overfitting to one
  sensor's color/sharpness characteristics.
- **Packaging state:** both packaged (e.g. milk carton, egg carton) and
  unpackaged/loose where realistic (e.g. a banana).

## User data policy (explicit)

**User-uploaded Scan photos may NOT be used for training without explicit,
informed, opt-in consent and a published data-use policy.** No such consent
flow or policy exists yet. Nothing in this workspace reads from or writes to
the mobile app's Supabase project, and nothing here should be wired up to do
so until that policy exists - this is a product and legal decision, not a
technical default this workspace sets on its own.
