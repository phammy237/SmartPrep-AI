import { Ingredient } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';

/**
 * Canonical ingredient catalog. Pantry items, scan detections, recipe
 * ingredients, and grocery items all reference these by id, denormalizing
 * name/imageUri/category onto themselves for fast rendering (see `Ingredient`).
 * Nutrition figures are reasonable approximations for a fixed reference
 * serving (see `servingDescription`), not lab-measured values.
 */
const RAW_INGREDIENTS: Omit<Ingredient, 'imageUri'>[] = [
  // Produce
  { id: 'ing-spinach', name: 'Spinach', category: 'produce', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 7, proteinG: 0.9, carbsG: 1.1, fatG: 0.1, fiberG: 0.7 } },
  { id: 'ing-avocado', name: 'Avocado', category: 'produce', defaultUnit: 'item', servingDescription: '1/2 avocado', nutritionPerServing: { calories: 120, proteinG: 1.5, carbsG: 6, fatG: 11, fiberG: 5 } },
  { id: 'ing-strawberries', name: 'Strawberries', category: 'produce', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 49, proteinG: 1, carbsG: 12, fatG: 0.5, fiberG: 3 } },
  { id: 'ing-tomato', name: 'Tomato', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.5 } },
  { id: 'ing-garlic', name: 'Garlic', category: 'produce', defaultUnit: 'item', servingDescription: '1 clove', nutritionPerServing: { calories: 4, proteinG: 0.2, carbsG: 1, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-onion', name: 'Onion', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 44, proteinG: 1.2, carbsG: 10, fatG: 0.1, fiberG: 1.9 } },
  { id: 'ing-bell-pepper', name: 'Bell Pepper', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 24, proteinG: 1, carbsG: 6, fatG: 0.2, fiberG: 2 } },
  { id: 'ing-carrot', name: 'Carrot', category: 'produce', defaultUnit: 'item', servingDescription: '1 medium', nutritionPerServing: { calories: 25, proteinG: 0.6, carbsG: 6, fatG: 0.1, fiberG: 1.7 } },
  { id: 'ing-broccoli', name: 'Broccoli', category: 'produce', defaultUnit: 'item', servingDescription: '1 cup', nutritionPerServing: { calories: 31, proteinG: 2.5, carbsG: 6, fatG: 0.3, fiberG: 2.4 } },
  { id: 'ing-basil', name: 'Basil', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 1, proteinG: 0.2, carbsG: 0.2, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-lemon', name: 'Lemon', category: 'produce', defaultUnit: 'item', servingDescription: '1 whole', nutritionPerServing: { calories: 17, proteinG: 0.6, carbsG: 5, fatG: 0.2, fiberG: 1.6 } },
  { id: 'ing-cucumber', name: 'Cucumber', category: 'produce', defaultUnit: 'item', servingDescription: '1/2 cup', nutritionPerServing: { calories: 8, proteinG: 0.3, carbsG: 2, fatG: 0.1, fiberG: 0.3 } },
  { id: 'ing-kale', name: 'Kale', category: 'produce', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 33, proteinG: 2.9, carbsG: 6, fatG: 0.6, fiberG: 1.3 } },
  { id: 'ing-ginger', name: 'Ginger', category: 'produce', defaultUnit: 'item', servingDescription: '1 tbsp', nutritionPerServing: { calories: 5, proteinG: 0.1, carbsG: 1, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-green-onion', name: 'Green Onion', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 8, proteinG: 0.5, carbsG: 1.8, fatG: 0, fiberG: 0.7 } },
  { id: 'ing-cilantro', name: 'Cilantro', category: 'produce', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 1, proteinG: 0.1, carbsG: 0.1, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-mushroom', name: 'Mushroom', category: 'produce', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 15, proteinG: 2.2, carbsG: 2.3, fatG: 0.2, fiberG: 0.7 } },

  // Protein
  { id: 'ing-eggs', name: 'Eggs', category: 'protein', defaultUnit: 'item', servingDescription: '1 large', nutritionPerServing: { calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 5, fiberG: 0 } },
  { id: 'ing-chicken-breast', name: 'Chicken Breast', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 128, proteinG: 26, carbsG: 0, fatG: 2.7, fiberG: 0 } },
  { id: 'ing-ground-beef', name: 'Ground Beef', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 213, proteinG: 22, carbsG: 0, fatG: 13, fiberG: 0 } },
  { id: 'ing-salmon', name: 'Salmon Fillet', category: 'protein', defaultUnit: 'item', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 175, proteinG: 19, carbsG: 0, fatG: 10, fiberG: 0 } },
  { id: 'ing-shrimp', name: 'Shrimp', category: 'protein', defaultUnit: 'lb', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 84, proteinG: 18, carbsG: 0, fatG: 0.9, fiberG: 0 } },
  { id: 'ing-tofu', name: 'Tofu', category: 'protein', defaultUnit: 'package', servingDescription: '1/2 cup', nutritionPerServing: { calories: 94, proteinG: 10, carbsG: 2.3, fatG: 6, fiberG: 0.4 } },
  { id: 'ing-black-beans', name: 'Black Beans', category: 'protein', defaultUnit: 'can', servingDescription: '1/2 cup cooked', nutritionPerServing: { calories: 114, proteinG: 7.6, carbsG: 20, fatG: 0.5, fiberG: 7.5 } },
  { id: 'ing-chickpeas', name: 'Chickpeas', category: 'protein', defaultUnit: 'can', servingDescription: '1/2 cup cooked', nutritionPerServing: { calories: 134, proteinG: 7, carbsG: 21, fatG: 2, fiberG: 6 } },
  { id: 'ing-bacon', name: 'Bacon', category: 'protein', defaultUnit: 'package', servingDescription: '2 slices cooked', nutritionPerServing: { calories: 90, proteinG: 6, carbsG: 0.3, fatG: 7, fiberG: 0 } },

  // Dairy
  { id: 'ing-milk', name: 'Milk', category: 'dairy', defaultUnit: 'L', servingDescription: '1 cup', nutritionPerServing: { calories: 122, proteinG: 8, carbsG: 12, fatG: 5, fiberG: 0 } },
  { id: 'ing-greek-yogurt', name: 'Greek Yogurt', category: 'dairy', defaultUnit: 'container', servingDescription: '1 cup plain', nutritionPerServing: { calories: 146, proteinG: 25, carbsG: 8, fatG: 0.7, fiberG: 0 } },
  { id: 'ing-butter', name: 'Butter', category: 'dairy', defaultUnit: 'package', servingDescription: '1 tbsp', nutritionPerServing: { calories: 102, proteinG: 0.1, carbsG: 0, fatG: 11.5, fiberG: 0 } },
  { id: 'ing-cheddar', name: 'Cheddar Cheese', category: 'dairy', defaultUnit: 'package', servingDescription: '1 oz', nutritionPerServing: { calories: 113, proteinG: 7, carbsG: 0.4, fatG: 9, fiberG: 0 } },
  { id: 'ing-parmesan', name: 'Parmesan', category: 'dairy', defaultUnit: 'package', servingDescription: '2 tbsp grated', nutritionPerServing: { calories: 43, proteinG: 3.8, carbsG: 0.4, fatG: 2.9, fiberG: 0 } },
  { id: 'ing-heavy-cream', name: 'Heavy Cream', category: 'dairy', defaultUnit: 'ml', servingDescription: '2 tbsp', nutritionPerServing: { calories: 102, proteinG: 0.6, carbsG: 0.8, fatG: 11, fiberG: 0 } },
  { id: 'ing-mozzarella', name: 'Mozzarella', category: 'dairy', defaultUnit: 'package', servingDescription: '1 oz', nutritionPerServing: { calories: 85, proteinG: 6.3, carbsG: 0.6, fatG: 6.3, fiberG: 0 } },
  { id: 'ing-cream-cheese', name: 'Cream Cheese', category: 'dairy', defaultUnit: 'package', servingDescription: '2 tbsp', nutritionPerServing: { calories: 99, proteinG: 1.7, carbsG: 1.6, fatG: 9.9, fiberG: 0 } },

  // Pantry
  { id: 'ing-pasta', name: 'Pasta', category: 'pantry', defaultUnit: 'package', servingDescription: '2 oz dry', nutritionPerServing: { calories: 200, proteinG: 7, carbsG: 42, fatG: 1, fiberG: 2 } },
  { id: 'ing-rice', name: 'Rice', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup dry', nutritionPerServing: { calories: 170, proteinG: 3.5, carbsG: 37, fatG: 0.4, fiberG: 0.6 } },
  { id: 'ing-olive-oil', name: 'Olive Oil', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5, fiberG: 0 } },
  { id: 'ing-canned-tomatoes', name: 'Canned Tomatoes', category: 'pantry', defaultUnit: 'can', servingDescription: '1/2 cup', nutritionPerServing: { calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.2 } },
  { id: 'ing-bread', name: 'Bread', category: 'pantry', defaultUnit: 'item', servingDescription: '1 slice', nutritionPerServing: { calories: 79, proteinG: 3.9, carbsG: 14, fatG: 1, fiberG: 1.9 } },
  { id: 'ing-honey', name: 'Honey', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 64, proteinG: 0.1, carbsG: 17, fatG: 0, fiberG: 0 } },
  { id: 'ing-flour', name: 'Flour', category: 'pantry', defaultUnit: 'kg', servingDescription: '1/4 cup', nutritionPerServing: { calories: 114, proteinG: 3, carbsG: 24, fatG: 0.3, fiberG: 0.9 } },
  { id: 'ing-quinoa', name: 'Quinoa', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup dry', nutritionPerServing: { calories: 172, proteinG: 6, carbsG: 30, fatG: 2.7, fiberG: 3 } },
  { id: 'ing-soy-sauce', name: 'Soy Sauce', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 8, proteinG: 1.3, carbsG: 0.8, fatG: 0, fiberG: 0.1 } },
  { id: 'ing-vegetable-broth', name: 'Vegetable Broth', category: 'pantry', defaultUnit: 'container', servingDescription: '1 cup', nutritionPerServing: { calories: 12, proteinG: 0.4, carbsG: 2.4, fatG: 0, fiberG: 0 } },
  { id: 'ing-tortillas', name: 'Tortillas', category: 'pantry', defaultUnit: 'package', servingDescription: '1 tortilla', nutritionPerServing: { calories: 96, proteinG: 2.5, carbsG: 16, fatG: 2.4, fiberG: 1 } },
  { id: 'ing-panko', name: 'Panko Breadcrumbs', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/4 cup', nutritionPerServing: { calories: 55, proteinG: 2, carbsG: 10, fatG: 0.5, fiberG: 0.5 } },
  { id: 'ing-sesame-oil', name: 'Sesame Oil', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tbsp', nutritionPerServing: { calories: 120, proteinG: 0, carbsG: 0, fatG: 13.6, fiberG: 0 } },
  { id: 'ing-hot-sauce', name: 'Hot Sauce', category: 'pantry', defaultUnit: 'bottle', servingDescription: '1 tsp', nutritionPerServing: { calories: 1, proteinG: 0.1, carbsG: 0.2, fatG: 0, fiberG: 0 } },
  { id: 'ing-granola', name: 'Granola', category: 'pantry', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 220, proteinG: 5, carbsG: 33, fatG: 8, fiberG: 4 } },
  { id: 'ing-chili-powder', name: 'Chili Powder', category: 'other', defaultUnit: 'container', servingDescription: '1 tsp', nutritionPerServing: { calories: 8, proteinG: 0.4, carbsG: 1.4, fatG: 0.4, fiberG: 0.9 } },

  // Frozen
  { id: 'ing-frozen-peas', name: 'Frozen Peas', category: 'frozen', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 62, proteinG: 4, carbsG: 11, fatG: 0.2, fiberG: 4 } },
  { id: 'ing-frozen-berries', name: 'Frozen Mixed Berries', category: 'frozen', defaultUnit: 'bag', servingDescription: '1 cup', nutritionPerServing: { calories: 70, proteinG: 1, carbsG: 17, fatG: 0.5, fiberG: 4 } },
  { id: 'ing-frozen-corn', name: 'Frozen Corn', category: 'frozen', defaultUnit: 'bag', servingDescription: '1/2 cup', nutritionPerServing: { calories: 66, proteinG: 2.4, carbsG: 15, fatG: 0.6, fiberG: 1.9 } },
  { id: 'ing-ice-cream', name: 'Ice Cream', category: 'frozen', defaultUnit: 'container', servingDescription: '1/2 cup', nutritionPerServing: { calories: 137, proteinG: 2.3, carbsG: 16, fatG: 7.3, fiberG: 0.5 } },
  { id: 'ing-frozen-shrimp', name: 'Frozen Shrimp', category: 'frozen', defaultUnit: 'bag', servingDescription: '3 oz cooked', nutritionPerServing: { calories: 84, proteinG: 18, carbsG: 0, fatG: 0.9, fiberG: 0 } },

  // Other
  { id: 'ing-salt', name: 'Salt', category: 'other', defaultUnit: 'container', servingDescription: '1/4 tsp', nutritionPerServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 } },
  { id: 'ing-black-pepper', name: 'Black Pepper', category: 'other', defaultUnit: 'container', servingDescription: '1/4 tsp', nutritionPerServing: { calories: 1, proteinG: 0, carbsG: 0.3, fatG: 0, fiberG: 0.1 } },
];

export const INGREDIENTS: Ingredient[] = RAW_INGREDIENTS.map((ingredient) => ({
  ...ingredient,
  imageUri: ingredientPhotoUri(ingredient.id, ingredient.name),
}));

export const INGREDIENTS_BY_ID: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]),
);

export function getIngredient(id: string): Ingredient {
  const ingredient = INGREDIENTS_BY_ID[id];
  if (!ingredient) {
    throw new Error(`Unknown ingredient id: ${id}`);
  }
  return ingredient;
}
