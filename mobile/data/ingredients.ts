import { Ingredient } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';

/**
 * Canonical ingredient catalog. Pantry items, scan detections, recipe
 * ingredients, and grocery items all reference these by id, denormalizing
 * name/imageUri/category onto themselves for fast rendering (see `Ingredient`).
 */
const RAW_INGREDIENTS: Omit<Ingredient, 'imageUri'>[] = [
  // Produce
  { id: 'ing-spinach', name: 'Spinach', category: 'produce', defaultUnit: 'bag' },
  { id: 'ing-avocado', name: 'Avocado', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-strawberries', name: 'Strawberries', category: 'produce', defaultUnit: 'container' },
  { id: 'ing-tomato', name: 'Tomato', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-garlic', name: 'Garlic', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-onion', name: 'Onion', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-bell-pepper', name: 'Bell Pepper', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-carrot', name: 'Carrot', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-broccoli', name: 'Broccoli', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-basil', name: 'Basil', category: 'produce', defaultUnit: 'bag' },
  { id: 'ing-lemon', name: 'Lemon', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-cucumber', name: 'Cucumber', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-kale', name: 'Kale', category: 'produce', defaultUnit: 'bag' },
  { id: 'ing-ginger', name: 'Ginger', category: 'produce', defaultUnit: 'item' },
  { id: 'ing-green-onion', name: 'Green Onion', category: 'produce', defaultUnit: 'bag' },
  { id: 'ing-cilantro', name: 'Cilantro', category: 'produce', defaultUnit: 'bag' },
  { id: 'ing-mushroom', name: 'Mushroom', category: 'produce', defaultUnit: 'container' },

  // Protein
  { id: 'ing-eggs', name: 'Eggs', category: 'protein', defaultUnit: 'item' },
  { id: 'ing-chicken-breast', name: 'Chicken Breast', category: 'protein', defaultUnit: 'lb' },
  { id: 'ing-ground-beef', name: 'Ground Beef', category: 'protein', defaultUnit: 'lb' },
  { id: 'ing-salmon', name: 'Salmon Fillet', category: 'protein', defaultUnit: 'item' },
  { id: 'ing-shrimp', name: 'Shrimp', category: 'protein', defaultUnit: 'lb' },
  { id: 'ing-tofu', name: 'Tofu', category: 'protein', defaultUnit: 'package' },
  { id: 'ing-black-beans', name: 'Black Beans', category: 'protein', defaultUnit: 'can' },
  { id: 'ing-chickpeas', name: 'Chickpeas', category: 'protein', defaultUnit: 'can' },
  { id: 'ing-bacon', name: 'Bacon', category: 'protein', defaultUnit: 'package' },

  // Dairy
  { id: 'ing-milk', name: 'Milk', category: 'dairy', defaultUnit: 'L' },
  { id: 'ing-greek-yogurt', name: 'Greek Yogurt', category: 'dairy', defaultUnit: 'container' },
  { id: 'ing-butter', name: 'Butter', category: 'dairy', defaultUnit: 'package' },
  { id: 'ing-cheddar', name: 'Cheddar Cheese', category: 'dairy', defaultUnit: 'package' },
  { id: 'ing-parmesan', name: 'Parmesan', category: 'dairy', defaultUnit: 'package' },
  { id: 'ing-heavy-cream', name: 'Heavy Cream', category: 'dairy', defaultUnit: 'ml' },
  { id: 'ing-mozzarella', name: 'Mozzarella', category: 'dairy', defaultUnit: 'package' },
  { id: 'ing-cream-cheese', name: 'Cream Cheese', category: 'dairy', defaultUnit: 'package' },

  // Pantry
  { id: 'ing-pasta', name: 'Pasta', category: 'pantry', defaultUnit: 'package' },
  { id: 'ing-rice', name: 'Rice', category: 'pantry', defaultUnit: 'bag' },
  { id: 'ing-olive-oil', name: 'Olive Oil', category: 'pantry', defaultUnit: 'bottle' },
  { id: 'ing-canned-tomatoes', name: 'Canned Tomatoes', category: 'pantry', defaultUnit: 'can' },
  { id: 'ing-bread', name: 'Bread', category: 'pantry', defaultUnit: 'item' },
  { id: 'ing-honey', name: 'Honey', category: 'pantry', defaultUnit: 'bottle' },
  { id: 'ing-flour', name: 'Flour', category: 'pantry', defaultUnit: 'kg' },
  { id: 'ing-quinoa', name: 'Quinoa', category: 'pantry', defaultUnit: 'bag' },
  { id: 'ing-soy-sauce', name: 'Soy Sauce', category: 'pantry', defaultUnit: 'bottle' },
  { id: 'ing-vegetable-broth', name: 'Vegetable Broth', category: 'pantry', defaultUnit: 'container' },
  { id: 'ing-tortillas', name: 'Tortillas', category: 'pantry', defaultUnit: 'package' },
  { id: 'ing-panko', name: 'Panko Breadcrumbs', category: 'pantry', defaultUnit: 'bag' },
  { id: 'ing-sesame-oil', name: 'Sesame Oil', category: 'pantry', defaultUnit: 'bottle' },
  { id: 'ing-hot-sauce', name: 'Hot Sauce', category: 'pantry', defaultUnit: 'bottle' },
  { id: 'ing-granola', name: 'Granola', category: 'pantry', defaultUnit: 'bag' },
  { id: 'ing-chili-powder', name: 'Chili Powder', category: 'other', defaultUnit: 'container' },

  // Frozen
  { id: 'ing-frozen-peas', name: 'Frozen Peas', category: 'frozen', defaultUnit: 'bag' },
  { id: 'ing-frozen-berries', name: 'Frozen Mixed Berries', category: 'frozen', defaultUnit: 'bag' },
  { id: 'ing-frozen-corn', name: 'Frozen Corn', category: 'frozen', defaultUnit: 'bag' },
  { id: 'ing-ice-cream', name: 'Ice Cream', category: 'frozen', defaultUnit: 'container' },
  { id: 'ing-frozen-shrimp', name: 'Frozen Shrimp', category: 'frozen', defaultUnit: 'bag' },

  // Other
  { id: 'ing-salt', name: 'Salt', category: 'other', defaultUnit: 'container' },
  { id: 'ing-black-pepper', name: 'Black Pepper', category: 'other', defaultUnit: 'container' },
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
