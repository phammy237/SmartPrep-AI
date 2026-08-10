import { GroceryList, GroceryListItem } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { getIngredient } from './ingredients';

/**
 * Seeded as "required for this week's plan - pantry inventory = missing",
 * computed by hand here; plannerService/groceryService will do this
 * subtraction for real once recipes/plan change.
 */
interface Seed {
  ingredientId?: string;
  name?: string;
  category: GroceryListItem['category'];
  quantity: number;
  unit: GroceryListItem['unit'];
  isChecked?: boolean;
  sourceRecipeIds?: string[];
  isManuallyAdded?: boolean;
}

const seeds: Seed[] = [
  { ingredientId: 'ing-lemon', category: 'produce', quantity: 3, unit: 'item', sourceRecipeIds: ['recipe-avocado-toast'] },
  { ingredientId: 'ing-cilantro', category: 'produce', quantity: 1, unit: 'bag', sourceRecipeIds: ['recipe-black-bean-tacos'] },
  { ingredientId: 'ing-ginger', category: 'produce', quantity: 1, unit: 'item', sourceRecipeIds: ['recipe-beef-broccoli', 'recipe-chicken-teriyaki-bowl'], isChecked: true },
  { ingredientId: 'ing-green-onion', category: 'produce', quantity: 1, unit: 'bag', sourceRecipeIds: ['recipe-veggie-fried-rice'] },
  { ingredientId: 'ing-basil', category: 'produce', quantity: 1, unit: 'bag', isManuallyAdded: true },
  { ingredientId: 'ing-parmesan', category: 'dairy', quantity: 1, unit: 'package', sourceRecipeIds: ['recipe-creamy-spinach-pasta'] },
  { ingredientId: 'ing-heavy-cream', category: 'dairy', quantity: 1, unit: 'ml', sourceRecipeIds: ['recipe-creamy-spinach-pasta', 'recipe-tomato-soup'] },
  { ingredientId: 'ing-mozzarella', category: 'dairy', quantity: 1, unit: 'package', sourceRecipeIds: ['recipe-caprese-pasta-salad'], isChecked: true },
  { ingredientId: 'ing-greek-yogurt', category: 'dairy', quantity: 1, unit: 'container', isManuallyAdded: true },
  { ingredientId: 'ing-soy-sauce', category: 'pantry', quantity: 1, unit: 'bottle', sourceRecipeIds: ['recipe-beef-broccoli', 'recipe-chicken-teriyaki-bowl', 'recipe-veggie-fried-rice'] },
  { ingredientId: 'ing-sesame-oil', category: 'pantry', quantity: 1, unit: 'bottle', sourceRecipeIds: ['recipe-beef-broccoli'] },
  { ingredientId: 'ing-tortillas', category: 'pantry', quantity: 1, unit: 'package', sourceRecipeIds: ['recipe-black-bean-tacos'], isChecked: true },
  { ingredientId: 'ing-hot-sauce', category: 'pantry', quantity: 1, unit: 'bottle', sourceRecipeIds: ['recipe-black-bean-tacos'] },
  { ingredientId: 'ing-chili-powder', category: 'other', quantity: 1, unit: 'container', sourceRecipeIds: ['recipe-beef-chili'] },
  { ingredientId: 'ing-vegetable-broth', category: 'pantry', quantity: 1, unit: 'container', sourceRecipeIds: ['recipe-tomato-soup'] },
  { name: 'Coffee', category: 'other', quantity: 1, unit: 'bag', isManuallyAdded: true },
];

export const MOCK_GROCERY_LIST: GroceryList = {
  id: 'grocery-current',
  createdAt: '2026-08-08T18:00:00.000Z',
  items: seeds.map((seed, index) => {
    const ingredient = seed.ingredientId ? getIngredient(seed.ingredientId) : undefined;
    return {
      id: `grocery-item-${index + 1}`,
      ingredientId: seed.ingredientId,
      name: seed.name ?? ingredient!.name,
      imageUri: ingredient?.imageUri ?? ingredientPhotoUri(`grocery-${index}`, seed.name ?? 'groceries'),
      category: seed.category,
      quantity: seed.quantity,
      unit: seed.unit,
      isChecked: seed.isChecked ?? false,
      sourceRecipeIds: seed.sourceRecipeIds,
      isManuallyAdded: seed.isManuallyAdded,
    };
  }),
};
