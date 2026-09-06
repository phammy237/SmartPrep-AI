import { Ingredient } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';

/**
 * Canonical ingredient catalog. Pantry items, scan detections, recipe
 * ingredients, and grocery items all reference these by id, denormalizing
 * name/imageUri/category onto themselves for fast rendering (see `Ingredient`).
 *
 * `nutritionPerServing` figures are reasonable approximations for a fixed
 * reference serving (see `servingDescription`), not lab-measured values.
 *
 * Phase 4 fields (`aliases`, `gramsPerUnit`, `densityGPerMl`,
 * `nutritionPer100g`, `fdcId`) are authored conservatively for a subset of
 * common ingredients so quantities can be normalized to grams and nutrition
 * resolved. `nutritionPer100g` values here are approximations from public
 * USDA reference data and carry status 'estimated' - authoritative /
 * USDA-verified references live server-side (`canonical_ingredient_nutrition`).
 * An ingredient WITHOUT these fields simply resolves as "unresolved" for
 * grams/nutrition rather than being guessed.
 */
type RawIngredient = Omit<Ingredient, 'imageUri' | 'normalizedName'>;

const RAW_INGREDIENTS: RawIngredient[] = [
  // Produce
  { id: 'ing-spinach', name: 'Spinach', category: 'produce', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 7, proteinG: 0.9, carbsG: 1.1, fatG: 0.1, fiberG: 0.7 } },
  { id: 'ing-avocado', name: 'Avocado', category: 'produce', defaultUnit: 'item', servingDescription: '1/2 avocado', nutritionPerServing: { calories: 120, proteinG: 1.5, carbsG: 6, fatG: 11, fiberG: 5 },
    aliases: ['avocados', 'hass avocado'], gramsPerUnit: { item: 150 },
    nutritionPer100g: { calories: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7, fiberG: 6.7, sugarG: 0.7, sodiumMg: 7 } },
  { id: 'ing-strawberries', name: 'Strawberries', category: 'produce', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 49, proteinG: 1, carbsG: 12, fatG: 0.5, fiberG: 3 } },
  { id: 'ing-tomato', name: 'Tomato', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.5 },
    aliases: ['tomatoes', 'fresh tomato', 'roma tomato'], gramsPerUnit: { item: 123 },
    nutritionPer100g: { calories: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, fiberG: 1.2, sugarG: 2.6, sodiumMg: 5 } },
  { id: 'ing-garlic', name: 'Garlic', category: 'produce', defaultUnit: 'item', servingDescription: '1 clove', nutritionPerServing: { calories: 4, proteinG: 0.2, carbsG: 1, fatG: 0, fiberG: 0.1 },
    aliases: ['garlic clove', 'garlic cloves', 'fresh garlic'], gramsPerUnit: { item: 3, clove: 3 },
    nutritionPer100g: { calories: 149, proteinG: 6.4, carbsG: 33, fatG: 0.5, fiberG: 2.1, sugarG: 1, sodiumMg: 17 } },
  { id: 'ing-onion', name: 'Onion', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 44, proteinG: 1.2, carbsG: 10, fatG: 0.1, fiberG: 1.9 },
    aliases: ['onions', 'yellow onion', 'brown onion'], gramsPerUnit: { item: 110 },
    nutritionPer100g: { calories: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, fiberG: 1.7, sugarG: 4.2, sodiumMg: 4 } },
  { id: 'ing-bell-pepper', name: 'Bell Pepper', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 24, proteinG: 1, carbsG: 6, fatG: 0.2, fiberG: 2 },
    aliases: ['bell peppers', 'capsicum', 'red bell pepper'], gramsPerUnit: { item: 119 },
    nutritionPer100g: { calories: 31, proteinG: 1, carbsG: 6, fatG: 0.3, fiberG: 2.1, sugarG: 4.2, sodiumMg: 4 } },
  { id: 'ing-carrot', name: 'Carrot', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 25, proteinG: 0.6, carbsG: 6, fatG: 0.1, fiberG: 1.7 },
    aliases: ['carrots'], gramsPerUnit: { item: 61 },
    nutritionPer100g: { calories: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2, fiberG: 2.8, sugarG: 4.7, sodiumMg: 69 } },
  { id: 'ing-broccoli', name: 'Broccoli', category: 'produce', defaultUnit: 'item', servingDescription: '1 cup', nutritionPerServing: { calories: 31, proteinG: 2.5, carbsG: 6, fatG: 0.3, fiberG: 2.4 },
    aliases: ['broccoli florets'],
    nutritionPer100g: { calories: 34, proteinG: 2.8, carbsG: 6.6, fatG: 0.4, fiberG: 2.6, sugarG: 1.7, sodiumMg: 33 } },
  { id: 'ing-basil', name: 'Basil', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 1, proteinG: 0.2, carbsG: 0.2, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-lemon', name: 'Lemon', category: 'produce', defaultUnit: 'item', servingDescription: '1 whole', nutritionPerServing: { calories: 17, proteinG: 0.6, carbsG: 5, fatG: 0.2, fiberG: 1.6 },
    aliases: ['lemons'], gramsPerUnit: { item: 84 },
    nutritionPer100g: { calories: 29, proteinG: 1.1, carbsG: 9.3, fatG: 0.3, fiberG: 2.8, sugarG: 2.5, sodiumMg: 2 } },
  { id: 'ing-cucumber', name: 'Cucumber', category: 'produce', defaultUnit: 'item', servingDescription: '1/2 cup', nutritionPerServing: { calories: 8, proteinG: 0.3, carbsG: 2, fatG: 0.1, fiberG: 0.3 } },
  { id: 'ing-kale', name: 'Kale', category: 'produce', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 33, proteinG: 2.9, carbsG: 6, fatG: 0.6, fiberG: 1.3 } },
  { id: 'ing-ginger', name: 'Ginger', category: 'produce', defaultUnit: 'item', servingDescription: '1 tbsp', nutritionPerServing: { calories: 5, proteinG: 0.1, carbsG: 1, fatG: 0, fiberG: 0.1 },
    aliases: ['fresh ginger', 'ginger root'],
    nutritionPer100g: { calories: 80, proteinG: 1.8, carbsG: 18, fatG: 0.8, fiberG: 2, sugarG: 1.7, sodiumMg: 13 } },
  { id: 'ing-green-onion', name: 'Green Onion', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 8, proteinG: 0.5, carbsG: 1.8, fatG: 0, fiberG: 0.7 }, aliases: ['scallion', 'scallions', 'spring onion'] },
  { id: 'ing-cilantro', name: 'Cilantro', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 1, proteinG: 0.1, carbsG: 0.1, fatG: 0, fiberG: 0.1 }, aliases: ['coriander', 'fresh cilantro'] },
  { id: 'ing-mushroom', name: 'Mushroom', category: 'produce', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 15, proteinG: 2.2, carbsG: 2.3, fatG: 0.2, fiberG: 0.7 }, aliases: ['mushrooms', 'button mushrooms', 'cremini mushrooms'] },

  // Protein
  { id: 'ing-eggs', name: 'Eggs', category: 'protein', defaultUnit: 'item', servingDescription: '1 large', nutritionPerServing: { calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 5, fiberG: 0 },
    aliases: ['egg', 'large egg', 'large eggs'], gramsPerUnit: { item: 50, piece: 50 }, fdcId: 748967,
    nutritionPer100g: { calories: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5, fiberG: 0, sugarG: 0.4, sodiumMg: 142 } },
  { id: 'ing-chicken-breast', name: 'Chicken Breast', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 128, proteinG: 26, carbsG: 0, fatG: 2.7, fiberG: 0 },
    aliases: ['chicken breasts', 'boneless skinless chicken breast', 'skinless chicken breast', 'chicken'],
    gramsPerUnit: { item: 174, piece: 174 }, fdcId: 171077,
    nutritionPer100g: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0, sugarG: 0, sodiumMg: 74 } },
  { id: 'ing-ground-beef', name: 'Ground Beef', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 213, proteinG: 22, carbsG: 0, fatG: 13, fiberG: 0 },
    aliases: ['ground beef 80/20', 'minced beef', 'hamburger meat', 'lean ground beef'],
    nutritionPer100g: { calories: 254, proteinG: 17.2, carbsG: 0, fatG: 20, fiberG: 0, sugarG: 0, sodiumMg: 66 } },
  { id: 'ing-salmon', name: 'Salmon Fillet', category: 'protein', defaultUnit: 'item', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 175, proteinG: 19, carbsG: 0, fatG: 10, fiberG: 0 },
    aliases: ['salmon', 'salmon fillets'], gramsPerUnit: { item: 170 },
    nutritionPer100g: { calories: 208, proteinG: 20, carbsG: 0, fatG: 13, fiberG: 0, sugarG: 0, sodiumMg: 59 } },
  { id: 'ing-shrimp', name: 'Shrimp', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 84, proteinG: 18, carbsG: 0, fatG: 0.9, fiberG: 0 },
    aliases: ['prawns', 'raw shrimp'],
    nutritionPer100g: { calories: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3, fiberG: 0, sugarG: 0, sodiumMg: 111 } },
  { id: 'ing-tofu', name: 'Tofu', category: 'protein', defaultUnit: 'package', servingDescription: '1/2 cup', nutritionPerServing: { calories: 94, proteinG: 10, carbsG: 2.3, fatG: 6, fiberG: 0.4 },
    aliases: ['firm tofu', 'extra firm tofu'],
    nutritionPer100g: { calories: 144, proteinG: 15.8, carbsG: 2.8, fatG: 8.7, fiberG: 2.3, sugarG: 0.6, sodiumMg: 14 } },
  { id: 'ing-black-beans', name: 'Black Beans', category: 'protein', defaultUnit: 'can', servingDescription: '1/2 cup cooked', nutritionPerServing: { calories: 114, proteinG: 7.6, carbsG: 20, fatG: 0.5, fiberG: 7.5 }, aliases: ['canned black beans'] },
  { id: 'ing-chickpeas', name: 'Chickpeas', category: 'protein', defaultUnit: 'can', servingDescription: '1/2 cup cooked', nutritionPerServing: { calories: 134, proteinG: 7, carbsG: 21, fatG: 2, fiberG: 6 }, aliases: ['garbanzo beans', 'canned chickpeas'] },
  { id: 'ing-bacon', name: 'Bacon', category: 'protein', defaultUnit: 'package', servingDescription: '2 slices cooked', nutritionPerServing: { calories: 90, proteinG: 6, carbsG: 0.3, fatG: 7, fiberG: 0 }, aliases: ['bacon strips'], gramsPerUnit: { slice: 12, item: 12 } },

  // Dairy
  { id: 'ing-milk', name: 'Milk', category: 'dairy', defaultUnit: 'L', servingDescription: '1 cup', nutritionPerServing: { calories: 122, proteinG: 8, carbsG: 12, fatG: 5, fiberG: 0 },
    aliases: ['whole milk', 'dairy milk', '2% milk'], densityGPerMl: 1.03, fdcId: 746782,
    nutritionPer100g: { calories: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, fiberG: 0, sugarG: 5.1, sodiumMg: 43 } },
  { id: 'ing-greek-yogurt', name: 'Greek Yogurt', category: 'dairy', defaultUnit: 'container', servingDescription: '1 cup plain', nutritionPerServing: { calories: 146, proteinG: 25, carbsG: 8, fatG: 0.7, fiberG: 0 },
    aliases: ['plain greek yogurt', 'nonfat greek yogurt'], densityGPerMl: 1.03,
    nutritionPer100g: { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0.4, fiberG: 0, sugarG: 3.2, sodiumMg: 36 } },
  { id: 'ing-butter', name: 'Butter', category: 'dairy', defaultUnit: 'package', servingDescription: '1 tbsp', nutritionPerServing: { calories: 102, proteinG: 0.1, carbsG: 0, fatG: 11.5, fiberG: 0 },
    aliases: ['unsalted butter', 'salted butter'], densityGPerMl: 0.911,
    nutritionPer100g: { calories: 717, proteinG: 0.85, carbsG: 0.06, fatG: 81, fiberG: 0, sugarG: 0.06, sodiumMg: 11 } },
  { id: 'ing-cheddar', name: 'Cheddar Cheese', category: 'dairy', defaultUnit: 'package', servingDescription: '1 oz', nutritionPerServing: { calories: 113, proteinG: 7, carbsG: 0.4, fatG: 9, fiberG: 0 },
    aliases: ['cheddar', 'sharp cheddar', 'shredded cheddar'],
    nutritionPer100g: { calories: 403, proteinG: 24.9, carbsG: 1.3, fatG: 33.1, fiberG: 0, sugarG: 0.5, sodiumMg: 621 } },
  { id: 'ing-parmesan', name: 'Parmesan', category: 'dairy', defaultUnit: 'package', servingDescription: '2 tbsp grated', nutritionPerServing: { calories: 43, proteinG: 3.8, carbsG: 0.4, fatG: 2.9, fiberG: 0 },
    aliases: ['parmesan cheese', 'parmigiano reggiano', 'grated parmesan'],
    nutritionPer100g: { calories: 431, proteinG: 38.5, carbsG: 4.1, fatG: 29, fiberG: 0, sugarG: 0.9, sodiumMg: 1529 } },
  { id: 'ing-heavy-cream', name: 'Heavy Cream', category: 'dairy', defaultUnit: 'ml', servingDescription: '2 tbsp', nutritionPerServing: { calories: 102, proteinG: 0.6, carbsG: 0.8, fatG: 11, fiberG: 0 },
    aliases: ['heavy whipping cream', 'whipping cream', 'double cream'], densityGPerMl: 1.0,
    nutritionPer100g: { calories: 340, proteinG: 2.8, carbsG: 2.8, fatG: 36, fiberG: 0, sugarG: 2.9, sodiumMg: 27 } },
  { id: 'ing-mozzarella', name: 'Mozzarella', category: 'dairy', defaultUnit: 'package', servingDescription: '1 oz', nutritionPerServing: { calories: 85, proteinG: 6.3, carbsG: 0.6, fatG: 6.3, fiberG: 0 },
    aliases: ['mozzarella cheese', 'fresh mozzarella'],
    nutritionPer100g: { calories: 300, proteinG: 22.2, carbsG: 2.2, fatG: 22.4, fiberG: 0, sugarG: 1, sodiumMg: 627 } },
  { id: 'ing-cream-cheese', name: 'Cream Cheese', category: 'dairy', defaultUnit: 'package', servingDescription: '2 tbsp', nutritionPerServing: { calories: 99, proteinG: 1.7, carbsG: 1.6, fatG: 9.9, fiberG: 0 } },

  // Pantry
  { id: 'ing-pasta', name: 'Pasta', category: 'pantry', defaultUnit: 'package', servingDescription: '2 oz dry', nutritionPerServing: { calories: 200, proteinG: 7, carbsG: 42, fatG: 1, fiberG: 2 },
    aliases: ['dry pasta', 'spaghetti', 'penne', 'noodles'],
    nutritionPer100g: { calories: 371, proteinG: 13, carbsG: 74.7, fatG: 1.5, fiberG: 3.2, sugarG: 2.7, sodiumMg: 6 } },
  { id: 'ing-rice', name: 'Rice', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup dry', nutritionPerServing: { calories: 170, proteinG: 3.5, carbsG: 37, fatG: 0.4, fiberG: 0.6 },
    aliases: ['white rice', 'long grain rice', 'jasmine rice'],
    nutritionPer100g: { calories: 365, proteinG: 7.1, carbsG: 80, fatG: 0.7, fiberG: 1.3, sugarG: 0.1, sodiumMg: 5 } },
  { id: 'ing-olive-oil', name: 'Olive Oil', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5, fiberG: 0 },
    aliases: ['extra virgin olive oil', 'evoo', 'e.v.o.o.'], densityGPerMl: 0.913, fdcId: 748608,
    nutritionPer100g: { calories: 884, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, sugarG: 0, sodiumMg: 2 } },
  { id: 'ing-canned-tomatoes', name: 'Canned Tomatoes', category: 'pantry', defaultUnit: 'can', servingDescription: '1/2 cup', nutritionPerServing: { calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.2 }, aliases: ['diced tomatoes', 'crushed tomatoes', 'canned diced tomatoes'] },
  { id: 'ing-bread', name: 'Bread', category: 'pantry', defaultUnit: 'item', servingDescription: '1 slice', nutritionPerServing: { calories: 79, proteinG: 3.9, carbsG: 14, fatG: 1, fiberG: 1.9 },
    aliases: ['sliced bread', 'sandwich bread', 'white bread'], gramsPerUnit: { item: 28, slice: 28 },
    nutritionPer100g: { calories: 265, proteinG: 9, carbsG: 49, fatG: 3.2, fiberG: 2.7, sugarG: 5, sodiumMg: 491 } },
  { id: 'ing-honey', name: 'Honey', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 64, proteinG: 0.1, carbsG: 17, fatG: 0, fiberG: 0 },
    aliases: ['raw honey'], densityGPerMl: 1.42,
    nutritionPer100g: { calories: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0, fiberG: 0.2, sugarG: 82.1, sodiumMg: 4 } },
  { id: 'ing-flour', name: 'Flour', category: 'pantry', defaultUnit: 'kg', servingDescription: '1/4 cup', nutritionPerServing: { calories: 114, proteinG: 3, carbsG: 24, fatG: 0.3, fiberG: 0.9 },
    aliases: ['all-purpose flour', 'plain flour', 'white flour'], densityGPerMl: 0.53,
    nutritionPer100g: { calories: 364, proteinG: 10.3, carbsG: 76.3, fatG: 1, fiberG: 2.7, sugarG: 0.3, sodiumMg: 2 } },
  { id: 'ing-quinoa', name: 'Quinoa', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup dry', nutritionPerServing: { calories: 172, proteinG: 6, carbsG: 30, fatG: 2.7, fiberG: 3 },
    aliases: ['dry quinoa'],
    nutritionPer100g: { calories: 368, proteinG: 14.1, carbsG: 64.2, fatG: 6.1, fiberG: 7, sugarG: 0, sodiumMg: 5 } },
  { id: 'ing-soy-sauce', name: 'Soy Sauce', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 8, proteinG: 1.3, carbsG: 0.8, fatG: 0, fiberG: 0.1 },
    aliases: ['light soy sauce', 'tamari'], densityGPerMl: 1.13,
    nutritionPer100g: { calories: 53, proteinG: 8.1, carbsG: 4.9, fatG: 0.6, fiberG: 0.8, sugarG: 0.4, sodiumMg: 5493 } },
  { id: 'ing-vegetable-broth', name: 'Vegetable Broth', category: 'pantry', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 12, proteinG: 0.4, carbsG: 2.4, fatG: 0, fiberG: 0 },
    aliases: ['vegetable stock', 'veggie broth'], densityGPerMl: 1.0,
    nutritionPer100g: { calories: 5, proteinG: 0.2, carbsG: 1, fatG: 0, fiberG: 0, sugarG: 0.4, sodiumMg: 340 } },
  { id: 'ing-tortillas', name: 'Tortillas', category: 'pantry', defaultUnit: 'package', servingDescription: '1 tortilla', nutritionPerServing: { calories: 96, proteinG: 2.5, carbsG: 16, fatG: 2.4, fiberG: 1 },
    aliases: ['flour tortillas', 'corn tortillas', 'tortilla'], gramsPerUnit: { item: 45, piece: 45 } },
  { id: 'ing-panko', name: 'Panko Breadcrumbs', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 55, proteinG: 2, carbsG: 10, fatG: 0.5, fiberG: 0.5 }, aliases: ['panko', 'breadcrumbs', 'bread crumbs'] },
  { id: 'ing-sesame-oil', name: 'Sesame Oil', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 120, proteinG: 0, carbsG: 0, fatG: 13.6, fiberG: 0 },
    aliases: ['toasted sesame oil'], densityGPerMl: 0.917,
    nutritionPer100g: { calories: 884, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, sugarG: 0, sodiumMg: 0 } },
  { id: 'ing-hot-sauce', name: 'Hot Sauce', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tsp', nutritionPerServing: { calories: 1, proteinG: 0.1, carbsG: 0.2, fatG: 0, fiberG: 0 }, aliases: ['sriracha', 'chili sauce'] },
  { id: 'ing-granola', name: 'Granola', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 220, proteinG: 5, carbsG: 33, fatG: 8, fiberG: 4 } },
  { id: 'ing-chili-powder', name: 'Chili Powder', category: 'other', defaultUnit: 'container', servingDescription: '1 tsp', nutritionPerServing: { calories: 8, proteinG: 0.4, carbsG: 1.4, fatG: 0.4, fiberG: 0.9 } },

  // Frozen
  { id: 'ing-frozen-peas', name: 'Frozen Peas', category: 'frozen', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 62, proteinG: 4, carbsG: 11, fatG: 0.2, fiberG: 4 },
    aliases: ['peas', 'green peas'],
    nutritionPer100g: { calories: 81, proteinG: 5.4, carbsG: 14.5, fatG: 0.4, fiberG: 5.1, sugarG: 5.7, sodiumMg: 5 } },
  { id: 'ing-frozen-berries', name: 'Frozen Mixed Berries', category: 'frozen', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 70, proteinG: 1, carbsG: 17, fatG: 0.5, fiberG: 4 }, aliases: ['mixed berries', 'frozen berries'] },
  { id: 'ing-frozen-corn', name: 'Frozen Corn', category: 'frozen', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 66, proteinG: 2.4, carbsG: 15, fatG: 0.6, fiberG: 1.9 }, aliases: ['corn', 'sweetcorn'] },
  { id: 'ing-ice-cream', name: 'Ice Cream', category: 'frozen', defaultUnit: 'container', servingDescription: '1/2 cup', nutritionPerServing: { calories: 137, proteinG: 2.3, carbsG: 16, fatG: 7.3, fiberG: 0.5 } },
  { id: 'ing-frozen-shrimp', name: 'Frozen Shrimp', category: 'frozen', defaultUnit: 'bag', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 84, proteinG: 18, carbsG: 0, fatG: 0.9, fiberG: 0 } },

  // Other
  { id: 'ing-salt', name: 'Salt', category: 'other', defaultUnit: 'container', servingDescription: '1/4 tsp', nutritionPerServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }, aliases: ['table salt', 'sea salt', 'kosher salt'] },
  { id: 'ing-black-pepper', name: 'Black Pepper', category: 'other', defaultUnit: 'container', servingDescription: '1/4 tsp', nutritionPerServing: { calories: 1, proteinG: 0, carbsG: 0.3, fatG: 0, fiberG: 0.1 }, aliases: ['pepper', 'ground black pepper'] },
];

/** lowercase, trim, collapse internal whitespace - the key for exact identity matching. */
export function normalizeIngredientName(name: string): string {
  return typeof name === 'string' ? name.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

export const INGREDIENTS: Ingredient[] = RAW_INGREDIENTS.map((ingredient) => ({
  ...ingredient,
  normalizedName: normalizeIngredientName(ingredient.name),
  nutritionStatus: ingredient.nutritionStatus ?? (ingredient.nutritionPer100g ? 'estimated' : undefined),
  imageUri: ingredientPhotoUri(ingredient.id, ingredient.name),
}));

export const INGREDIENTS_BY_ID: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]),
);

const INGREDIENTS_BY_NORMALIZED_NAME: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((ingredient) => [ingredient.normalizedName, ingredient]),
);

const INGREDIENTS_BY_ALIAS: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.flatMap((ingredient) =>
    (ingredient.aliases ?? []).map((alias) => [normalizeIngredientName(alias), ingredient] as const),
  ),
);

export function getIngredient(id: string): Ingredient {
  const ingredient = INGREDIENTS_BY_ID[id];
  if (!ingredient) {
    throw new Error(`Unknown ingredient id: ${id}`);
  }
  return ingredient;
}

/**
 * Conservative canonical-identity resolution: exact catalog id, then exact
 * normalized name, then exact (normalized) alias. NO fuzzy / AI matching -
 * "chicken breast", "Chicken Breast", and "boneless skinless chicken breast"
 * resolve to `ing-chicken-breast` only because that exact alias is authored.
 * Anything else returns null (unresolved) rather than a guess.
 */
export function resolveCanonicalIngredient(query: string): Ingredient | null {
  if (typeof query !== 'string') return null;
  if (INGREDIENTS_BY_ID[query]) return INGREDIENTS_BY_ID[query];

  const norm = normalizeIngredientName(query);
  if (!norm) return null;

  return INGREDIENTS_BY_NORMALIZED_NAME[norm] ?? INGREDIENTS_BY_ALIAS[norm] ?? null;
}
