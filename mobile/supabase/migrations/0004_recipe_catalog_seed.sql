-- Phase 3: demo recipe catalog seed.
--
-- Seeds the same 16 recipes previously only available from
-- data/mockRecipes.ts as real recipes/recipe_versions/recipe_ingredients
-- rows, so planning/cooking/logging have something real to reference.
--
-- Every row here is clearly demo data, not a live recipe-authoring or
-- external-import feature:
--   - owner_id is null (system/catalog-owned, no real user identity implied)
--   - source_type = 'demo', source_provider = 'smartprep_demo_seed'
--   - trust_label = 'demo' (never source_tested/community_tested - this app
--     has no provenance for these beyond "authored as sample content")
--   - nutrition_status = 'estimated' (never 'verified' - no USDA integration
--     exists yet; the per-serving macros are the same reasonable
--     approximations data/mockRecipes.ts already used)
--   - visibility = 'public' so every authenticated user can see/save/plan/
--     cook them, same as the mock catalog was available to everyone
--
-- This migration is meant to run exactly once, tracked by Supabase's normal
-- migration history (like 0001-0003) - it is not written to be manually
-- re-run against a database that already has it applied (recipe_versions'
-- unique(recipe_id, version_number) would reject a second run). A `supabase
-- db reset` (fresh database, replays every migration from empty) is safe.
--
-- data/mockRecipes.ts, data/mockMealPlan.ts, and the corresponding
-- services/mockDb.ts fields are left in place, unmodified - grocery and
-- kitchen-impact (still fully mock in Phase 3) no longer read them after
-- this phase's changes, but deleting them isn't required and only adds risk.

-- ============================================================================
-- 1. Creamy Spinach Pasta
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-creamy-spinach-pasta')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Creamy Spinach Pasta', 2, 10, 15, array[
    'Bring a large pot of salted water to a boil and cook pasta until al dente.',
    'While the pasta cooks, mince the garlic and dice the tomato.',
    'Melt butter in a large skillet over medium heat and sauté garlic for 1 minute.',
    'Add spinach and cook until just wilted, about 2-3 minutes.',
    'Stir in heavy cream and simmer for 2 minutes until slightly thickened.',
    'Toss in the cooked pasta, diced tomato, and grated Parmesan until well coated.',
    'Season with salt to taste and serve warm.'
  ], 'https://picsum.photos/seed/creamy-spinach-pasta/800/600',
  'estimated', jsonb_build_object('calories', 620, 'proteinG', 22, 'carbsG', 78, 'fatG', 24, 'fiberG', 5, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 6, array['vegetarian','pasta','comfort-food'], array['Italian'],
  array['use_it_before_you_lose_it','cook_right_now','for_you'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses spinach that should be used first'),
    jsonb_build_object('id', 'r2', 'text', '7 of 9 ingredients already in your pantry'),
    jsonb_build_object('id', 'r3', 'text', 'Fits your 15-30 minute cooking window')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Pasta', 200, 'g', 'ing-pasta', false, 0),
  ('Spinach', 0.5, 'bag', 'ing-spinach', false, 1),
  ('Garlic', 2, 'item', 'ing-garlic', false, 2),
  ('Butter', 1, 'package', 'ing-butter', false, 3),
  ('Tomato', 1, 'item', 'ing-tomato', false, 4),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 5),
  ('Salt', 1, 'container', 'ing-salt', true, 6),
  ('Parmesan', 1, 'package', 'ing-parmesan', false, 7),
  ('Heavy Cream', 120, 'ml', 'ing-heavy-cream', false, 8)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 2. Chicken Teriyaki Bowl
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-chicken-teriyaki-bowl')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Chicken Teriyaki Bowl', 2, 10, 20, array[
    'Cook rice according to package instructions.',
    'Cut chicken into bite-size pieces and season lightly.',
    'Sear chicken in a hot pan with olive oil until golden, about 6-8 minutes.',
    'Add garlic and ginger and cook for 1 minute until fragrant.',
    'Stir in soy sauce and honey, and simmer until the sauce thickens.',
    'Add broccoli, carrot, and bell pepper, and cook until crisp-tender.',
    'Serve the chicken and vegetables over rice.'
  ], 'https://picsum.photos/seed/chicken-teriyaki-bowl/800/600',
  'estimated', jsonb_build_object('calories', 580, 'proteinG', 42, 'carbsG', 68, 'fatG', 14, 'fiberG', 4, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 6, array['bowl','meal-prep'], array['Japanese'],
  array['almost_there','quick_meals'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', '8 of 10 ingredients already in your pantry'),
    jsonb_build_object('id', 'r2', 'text', 'Uses broccoli that should be used soon'),
    jsonb_build_object('id', 'r3', 'text', 'Ready in about 30 minutes')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Chicken Breast', 1, 'lb', 'ing-chicken-breast', false, 0),
  ('Rice', 1, 'bag', 'ing-rice', false, 1),
  ('Garlic', 2, 'item', 'ing-garlic', false, 2),
  ('Broccoli', 1, 'item', 'ing-broccoli', false, 3),
  ('Carrot', 2, 'item', 'ing-carrot', false, 4),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 5),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 6),
  ('Honey', 1, 'bottle', 'ing-honey', false, 7),
  ('Soy Sauce', 1, 'bottle', 'ing-soy-sauce', false, 8),
  ('Ginger', 1, 'item', 'ing-ginger', false, 9)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 3. Avocado Toast with Eggs
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-avocado-toast')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Avocado Toast with Eggs', 1, 5, 5, array[
    'Toast the bread until golden and crisp.',
    'Mash the avocado with a squeeze of lemon, salt, and pepper.',
    'Fry or poach the eggs to your liking.',
    'Spread the mashed avocado over the toast and top with eggs.',
    'Finish with a drizzle of olive oil and extra pepper.'
  ], 'https://picsum.photos/seed/avocado-toast/800/600',
  'estimated', jsonb_build_object('calories', 430, 'proteinG', 18, 'carbsG', 32, 'fatG', 26, 'fiberG', 9, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 1, array['breakfast','vegetarian'], array['American'],
  array['use_it_before_you_lose_it','quick_meals','cook_right_now'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses avocado and bread before they turn'),
    jsonb_build_object('id', 'r2', 'text', 'Ready in 10 minutes'),
    jsonb_build_object('id', 'r3', 'text', '6 of 7 ingredients already in your pantry')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Bread', 2, 'item', 'ing-bread', false, 0),
  ('Avocado', 1, 'item', 'ing-avocado', false, 1),
  ('Eggs', 2, 'item', 'ing-eggs', false, 2),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 3),
  ('Salt', 1, 'container', 'ing-salt', true, 4),
  ('Black Pepper', 1, 'container', 'ing-black-pepper', true, 5),
  ('Lemon', 0.5, 'item', 'ing-lemon', false, 6)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 4. Strawberry Greek Yogurt Parfait
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-strawberry-parfait')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Strawberry Greek Yogurt Parfait', 1, 5, 0, array[
    'Slice the strawberries.',
    'Layer Greek yogurt and strawberries in a glass.',
    'Drizzle with honey and top with granola.'
  ], 'https://picsum.photos/seed/strawberry-parfait/800/600',
  'estimated', jsonb_build_object('calories', 310, 'proteinG', 20, 'carbsG', 45, 'fatG', 6, 'fiberG', 4, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 2, array['breakfast','no-cook','vegetarian'], array['American'],
  array['use_it_before_you_lose_it','quick_meals'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses strawberries before they spoil'),
    jsonb_build_object('id', 'r2', 'text', 'No cooking required'),
    jsonb_build_object('id', 'r3', 'text', 'Ready in 5 minutes')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Strawberries', 0.5, 'container', 'ing-strawberries', false, 0),
  ('Greek Yogurt', 1, 'container', 'ing-greek-yogurt', false, 1),
  ('Honey', 1, 'bottle', 'ing-honey', false, 2),
  ('Granola', 0.5, 'bag', 'ing-granola', false, 3)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 5. Black Bean Tacos
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-black-bean-tacos')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Black Bean Tacos', 3, 15, 10, array[
    'Dice the onion and bell pepper.',
    'Sauté onion, bell pepper, and garlic in olive oil until softened.',
    'Add black beans and warm through, mashing some for texture.',
    'Warm the tortillas.',
    'Fill tortillas with the bean mixture and top with cilantro and hot sauce.'
  ], 'https://picsum.photos/seed/black-bean-tacos/800/600',
  'estimated', jsonb_build_object('calories', 340, 'proteinG', 13, 'carbsG', 48, 'fatG', 11, 'fiberG', 9, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 5, array['vegetarian','tacos'], array['Mexican'],
  array['for_you','quick_meals'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses black beans and bell pepper you have on hand'),
    jsonb_build_object('id', 'r2', 'text', 'Fits your favorite Mexican flavors'),
    jsonb_build_object('id', 'r3', 'text', '5 of 8 ingredients already in your pantry')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Black Beans', 1, 'can', 'ing-black-beans', false, 0),
  ('Onion', 1, 'item', 'ing-onion', false, 1),
  ('Garlic', 2, 'item', 'ing-garlic', false, 2),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 3),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 4),
  ('Tortillas', 1, 'package', 'ing-tortillas', false, 5),
  ('Cilantro', 1, 'bag', 'ing-cilantro', false, 6),
  ('Hot Sauce', 1, 'bottle', 'ing-hot-sauce', false, 7)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 6. Beef and Broccoli Stir Fry
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-beef-broccoli')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Beef and Broccoli Stir Fry', 3, 10, 15, array[
    'Cook rice according to package instructions.',
    'Brown the ground beef in a hot skillet, then set aside.',
    'Add olive oil, garlic, and ginger to the pan and cook until fragrant.',
    'Add broccoli and carrot and stir-fry until crisp-tender.',
    'Return beef to the pan and stir in soy sauce and sesame oil.',
    'Serve over rice.'
  ], 'https://picsum.photos/seed/beef-broccoli/800/600',
  'estimated', jsonb_build_object('calories', 480, 'proteinG', 28, 'carbsG', 45, 'fatG', 20, 'fiberG', 4, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'medium', 7, array['stir-fry'], array['Chinese'],
  array['use_it_before_you_lose_it','cook_right_now'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses ground beef and broccoli that need attention'),
    jsonb_build_object('id', 'r2', 'text', 'Pairs well with rice you already have'),
    jsonb_build_object('id', 'r3', 'text', 'Ready in 25 minutes')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Ground Beef', 1, 'lb', 'ing-ground-beef', false, 0),
  ('Broccoli', 1, 'item', 'ing-broccoli', false, 1),
  ('Garlic', 2, 'item', 'ing-garlic', false, 2),
  ('Carrot', 2, 'item', 'ing-carrot', false, 3),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 4),
  ('Rice', 1, 'bag', 'ing-rice', false, 5),
  ('Soy Sauce', 1, 'bottle', 'ing-soy-sauce', false, 6),
  ('Ginger', 1, 'item', 'ing-ginger', false, 7),
  ('Sesame Oil', 1, 'bottle', 'ing-sesame-oil', false, 8)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 7. Veggie Fried Rice
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-veggie-fried-rice')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Veggie Fried Rice', 3, 10, 15, array[
    'Cook rice ahead of time and let it cool (day-old rice works best).',
    'Scramble the eggs in a hot wok or skillet, then set aside.',
    'Sauté onion, garlic, and carrot until softened.',
    'Add rice and frozen peas, breaking up any clumps.',
    'Stir in soy sauce and the scrambled eggs.',
    'Top with sliced green onion and serve.'
  ], 'https://picsum.photos/seed/veggie-fried-rice/800/600',
  'estimated', jsonb_build_object('calories', 410, 'proteinG', 15, 'carbsG', 55, 'fatG', 13, 'fiberG', 4, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 3, array['vegetarian','meal-prep'], array['Chinese'],
  array['cook_right_now','quick_meals','for_you'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses up frozen peas and rice you already have'),
    jsonb_build_object('id', 'r2', 'text', 'A great way to use extra eggs'),
    jsonb_build_object('id', 'r3', 'text', '7 of 9 ingredients already in your pantry')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Rice', 1, 'bag', 'ing-rice', false, 0),
  ('Eggs', 2, 'item', 'ing-eggs', false, 1),
  ('Carrot', 1, 'item', 'ing-carrot', false, 2),
  ('Frozen Peas', 0.5, 'bag', 'ing-frozen-peas', false, 3),
  ('Onion', 1, 'item', 'ing-onion', false, 4),
  ('Garlic', 2, 'item', 'ing-garlic', false, 5),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 6),
  ('Soy Sauce', 1, 'bottle', 'ing-soy-sauce', false, 7),
  ('Green Onion', 1, 'bag', 'ing-green-onion', false, 8)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 8. Classic Beef Chili
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-beef-chili')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Classic Beef Chili', 4, 15, 40, array[
    'Sauté onion, garlic, and bell pepper in olive oil until softened.',
    'Add ground beef and cook until browned.',
    'Stir in chili powder and cook for 1 minute until fragrant.',
    'Add canned tomatoes and black beans, and bring to a simmer.',
    'Simmer uncovered for 30 minutes, stirring occasionally.',
    'Season with salt to taste and serve.'
  ], 'https://picsum.photos/seed/beef-chili/800/600',
  'estimated', jsonb_build_object('calories', 390, 'proteinG', 27, 'carbsG', 32, 'fatG', 16, 'fiberG', 9, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'medium', 2, array['comfort-food','meal-prep'], array['American'],
  array['use_it_before_you_lose_it','something_different','almost_there'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses ground beef before it needs to be used'),
    jsonb_build_object('id', 'r2', 'text', '8 of 9 ingredients already in your pantry'),
    jsonb_build_object('id', 'r3', 'text', 'A hearty make-ahead meal')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Ground Beef', 1, 'lb', 'ing-ground-beef', false, 0),
  ('Black Beans', 1, 'can', 'ing-black-beans', false, 1),
  ('Onion', 1, 'item', 'ing-onion', false, 2),
  ('Garlic', 2, 'item', 'ing-garlic', false, 3),
  ('Canned Tomatoes', 2, 'can', 'ing-canned-tomatoes', false, 4),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 5),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 6),
  ('Salt', 1, 'container', 'ing-salt', true, 7),
  ('Chili Powder', 1, 'container', 'ing-chili-powder', false, 8)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 9. Honey Garlic Salmon
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-honey-garlic-salmon')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Honey Garlic Salmon', 2, 10, 15, array[
    'Whisk together honey, soy sauce, and minced garlic.',
    'Sear salmon fillets skin-side down in olive oil for 4 minutes.',
    'Flip and pour the honey-garlic sauce over the salmon.',
    'Add broccoli to the pan and cook until the sauce thickens and glazes the salmon.',
    'Serve immediately.'
  ], 'https://picsum.photos/seed/honey-garlic-salmon/800/600',
  'estimated', jsonb_build_object('calories', 460, 'proteinG', 32, 'carbsG', 28, 'fatG', 22, 'fiberG', 3, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 9, array['seafood'], array['American'],
  array['something_different','for_you'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'A new way to use broccoli that needs attention'),
    jsonb_build_object('id', 'r2', 'text', 'Fits your 15-30 minute cooking window'),
    jsonb_build_object('id', 'r3', 'text', 'Introduces a new protein to try')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Garlic', 2, 'item', 'ing-garlic', false, 0),
  ('Honey', 1, 'bottle', 'ing-honey', false, 1),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 2),
  ('Broccoli', 1, 'item', 'ing-broccoli', false, 3),
  ('Salmon Fillet', 2, 'item', 'ing-salmon', false, 4),
  ('Soy Sauce', 1, 'bottle', 'ing-soy-sauce', false, 5)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 10. Loaded Veggie Omelet
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-veggie-omelet')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Loaded Veggie Omelet', 2, 5, 10, array[
    'Whisk the eggs in a bowl and season lightly.',
    'Melt butter in a nonstick pan over medium heat.',
    'Sauté onion and bell pepper until softened, then add spinach until wilted.',
    'Pour in the eggs and let set for 1-2 minutes.',
    'Sprinkle cheddar over half the omelet, fold, and cook until the cheese melts.'
  ], 'https://picsum.photos/seed/veggie-omelet/800/600',
  'estimated', jsonb_build_object('calories', 380, 'proteinG', 26, 'carbsG', 8, 'fatG', 27, 'fiberG', 2, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 0, array['breakfast','vegetarian'], array['American'],
  array['cook_right_now','use_it_before_you_lose_it','quick_meals'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'You have everything you need - no shopping required'),
    jsonb_build_object('id', 'r2', 'text', 'Uses spinach that should be used first'),
    jsonb_build_object('id', 'r3', 'text', 'Ready in 15 minutes')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Eggs', 4, 'item', 'ing-eggs', false, 0),
  ('Spinach', 0.5, 'bag', 'ing-spinach', false, 1),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 2),
  ('Onion', 0.5, 'item', 'ing-onion', false, 3),
  ('Cheddar Cheese', 1, 'package', 'ing-cheddar', false, 4),
  ('Butter', 1, 'package', 'ing-butter', false, 5)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 11. Creamy Tomato Soup
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-tomato-soup')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Creamy Tomato Soup', 4, 10, 25, array[
    'Sauté onion and garlic in butter and olive oil until soft.',
    'Add canned tomatoes and vegetable broth, then simmer for 20 minutes.',
    'Blend until smooth using an immersion blender.',
    'Stir in heavy cream and warm through.',
    'Season to taste and serve.'
  ], 'https://picsum.photos/seed/tomato-soup/800/600',
  'estimated', jsonb_build_object('calories', 220, 'proteinG', 5, 'carbsG', 18, 'fatG', 15, 'fiberG', 3, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 4, array['vegetarian','soup'], array['American'],
  array['cook_right_now','something_different'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses canned tomatoes you already have'),
    jsonb_build_object('id', 'r2', 'text', 'A cozy meal built on pantry staples'),
    jsonb_build_object('id', 'r3', 'text', '5 of 7 ingredients already in your pantry')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Canned Tomatoes', 3, 'can', 'ing-canned-tomatoes', false, 0),
  ('Onion', 1, 'item', 'ing-onion', false, 1),
  ('Garlic', 2, 'item', 'ing-garlic', false, 2),
  ('Butter', 1, 'package', 'ing-butter', false, 3),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 4),
  ('Heavy Cream', 100, 'ml', 'ing-heavy-cream', false, 5),
  ('Vegetable Broth', 1, 'container', 'ing-vegetable-broth', false, 6)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 12. Berry Frozen Yogurt Bark
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-berry-bark')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Berry Frozen Yogurt Bark', 4, 10, 0, array[
    'Spread Greek yogurt in a thin layer on a parchment-lined tray.',
    'Scatter frozen berries evenly over the yogurt.',
    'Drizzle with honey.',
    'Freeze for at least 2 hours, then break into pieces.'
  ], 'https://picsum.photos/seed/berry-bark/800/600',
  'estimated', jsonb_build_object('calories', 140, 'proteinG', 9, 'carbsG', 22, 'fatG', 3, 'fiberG', 2, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 0, array['dessert','no-cook','vegetarian'], array['American'],
  array['cook_right_now','quick_meals','use_it_before_you_lose_it'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'You have everything you need'),
    jsonb_build_object('id', 'r2', 'text', 'A great way to use frozen berries'),
    jsonb_build_object('id', 'r3', 'text', 'No cooking required')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Frozen Mixed Berries', 1, 'bag', 'ing-frozen-berries', false, 0),
  ('Greek Yogurt', 1, 'container', 'ing-greek-yogurt', false, 1),
  ('Honey', 1, 'bottle', 'ing-honey', false, 2)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 13. Shrimp and Veggie Stir Fry
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-shrimp-stirfry')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Shrimp and Veggie Stir Fry', 3, 15, 10, array[
    'Peel and devein the shrimp if needed.',
    'Sauté garlic and ginger in olive oil until fragrant.',
    'Add bell pepper and carrot, and stir-fry until crisp-tender.',
    'Add shrimp and cook until pink and opaque, about 3-4 minutes.',
    'Stir in soy sauce and toss to coat before serving.'
  ], 'https://picsum.photos/seed/shrimp-stirfry/800/600',
  'estimated', jsonb_build_object('calories', 260, 'proteinG', 24, 'carbsG', 16, 'fatG', 11, 'fiberG', 3, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'medium', 11, array['seafood','stir-fry'], array['Thai'],
  array['something_different','for_you'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Introduces a new protein you haven''t tried recently'),
    jsonb_build_object('id', 'r2', 'text', 'Uses vegetables you already have'),
    jsonb_build_object('id', 'r3', 'text', 'Fits your favorite Thai-inspired flavors')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Garlic', 2, 'item', 'ing-garlic', false, 0),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 1),
  ('Carrot', 1, 'item', 'ing-carrot', false, 2),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 3),
  ('Shrimp', 1, 'lb', 'ing-shrimp', false, 4),
  ('Soy Sauce', 1, 'bottle', 'ing-soy-sauce', false, 5),
  ('Ginger', 1, 'item', 'ing-ginger', false, 6)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 14. Quinoa Chickpea Salad
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-quinoa-chickpea-salad')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Quinoa Chickpea Salad', 4, 15, 15, array[
    'Cook quinoa according to package instructions and let cool.',
    'Dice the carrot, bell pepper, and cucumber.',
    'Drain and rinse the chickpeas.',
    'Toss quinoa, vegetables, and chickpeas with olive oil and lemon juice.',
    'Season to taste and chill before serving.'
  ], 'https://picsum.photos/seed/quinoa-chickpea-salad/800/600',
  'estimated', jsonb_build_object('calories', 310, 'proteinG', 11, 'carbsG', 42, 'fatG', 12, 'fiberG', 8, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 8, array['vegetarian','salad','healthy'], array['Mediterranean'],
  array['something_different','for_you'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'A healthy new recipe to try'),
    jsonb_build_object('id', 'r2', 'text', 'Uses vegetables you already have'),
    jsonb_build_object('id', 'r3', 'text', 'Fits your Mediterranean cuisine preference')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Carrot', 1, 'item', 'ing-carrot', false, 0),
  ('Bell Pepper', 1, 'item', 'ing-bell-pepper', false, 1),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 2),
  ('Quinoa', 1, 'bag', 'ing-quinoa', false, 3),
  ('Chickpeas', 1, 'can', 'ing-chickpeas', false, 4),
  ('Cucumber', 1, 'item', 'ing-cucumber', false, 5),
  ('Lemon', 1, 'item', 'ing-lemon', false, 6)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 15. Honey Butter Cornbread Skillet
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-cornbread-skillet')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Honey Butter Cornbread Skillet', 6, 10, 25, array[
    'Preheat the oven to 400°F (200°C) with a skillet inside.',
    'Whisk together flour, eggs, milk, and melted butter.',
    'Fold in the frozen corn and half the honey.',
    'Pour batter into the hot skillet and bake for 20-22 minutes.',
    'Drizzle with remaining honey before serving.'
  ], 'https://picsum.photos/seed/cornbread-skillet/800/600',
  'estimated', jsonb_build_object('calories', 230, 'proteinG', 6, 'carbsG', 32, 'fatG', 9, 'fiberG', 2, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 0, array['side-dish','vegetarian'], array['American'],
  array['cook_right_now','something_different'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'You have everything you need'),
    jsonb_build_object('id', 'r2', 'text', 'Uses corn from your freezer'),
    jsonb_build_object('id', 'r3', 'text', 'A comforting side for busy weeknights')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Frozen Corn', 1, 'bag', 'ing-frozen-corn', false, 0),
  ('Flour', 0.3, 'kg', 'ing-flour', false, 1),
  ('Butter', 1, 'package', 'ing-butter', false, 2),
  ('Honey', 1, 'bottle', 'ing-honey', false, 3),
  ('Eggs', 2, 'item', 'ing-eggs', false, 4),
  ('Milk', 0.25, 'L', 'ing-milk', false, 5)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);

-- ============================================================================
-- 16. Caprese-Style Pasta Salad
-- ============================================================================
with r as (
  insert into public.recipes (owner_id, source_type, source_provider, visibility, trust_label, legacy_mock_id)
  values (null, 'demo', 'smartprep_demo_seed', 'public', 'demo', 'recipe-caprese-pasta-salad')
  returning id
), rv as (
  insert into public.recipe_versions (
    recipe_id, version_number, title, servings, prep_time_minutes, cook_time_minutes, instructions, image_uri,
    nutrition_status, nutrition_snapshot, version_reason, difficulty, additional_cost_estimate, tags, cuisines,
    collections, demo_reasons
  )
  select id, 1, 'Caprese-Style Pasta Salad', 4, 15, 10, array[
    'Cook pasta until al dente, then cool under cold water.',
    'Halve the tomatoes and tear the mozzarella into pieces.',
    'Toss pasta with tomato, mozzarella, and torn basil leaves.',
    'Drizzle generously with olive oil and season to taste.',
    'Chill for 15 minutes before serving.'
  ], 'https://picsum.photos/seed/caprese-pasta-salad/800/600',
  'estimated', jsonb_build_object('calories', 380, 'proteinG', 15, 'carbsG', 48, 'fatG', 14, 'fiberG', 3, 'status', 'estimated', 'calculationBasis', 'per_serving'),
  'initial', 'easy', 4, array['vegetarian','salad','pasta'], array['Italian'],
  array['use_it_before_you_lose_it','for_you','quick_meals','almost_there'],
  jsonb_build_array(
    jsonb_build_object('id', 'r1', 'text', 'Uses tomato and basil that need attention'),
    jsonb_build_object('id', 'r2', 'text', 'Fits your Italian cuisine preference'),
    jsonb_build_object('id', 'r3', 'text', '4 of 5 ingredients already in your pantry')
  )
  from r
  returning id
)
insert into public.recipe_ingredients (recipe_version_id, display_name, normalized_name, quantity, unit, catalog_ingredient_id, is_pantry_staple, sort_order)
select id, v.display_name, lower(v.display_name), v.quantity, v.unit, v.catalog_id, v.staple, v.sort_order
from rv, (values
  ('Pasta', 250, 'g', 'ing-pasta', false, 0),
  ('Tomato', 2, 'item', 'ing-tomato', false, 1),
  ('Basil', 1, 'bag', 'ing-basil', false, 2),
  ('Olive Oil', 1, 'bottle', 'ing-olive-oil', true, 3),
  ('Mozzarella', 1, 'package', 'ing-mozzarella', false, 4)
) as v(display_name, quantity, unit, catalog_id, staple, sort_order);
