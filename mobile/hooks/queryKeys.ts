export const queryKeys = {
  pantry: ['pantry'] as const,
  pantryItem: (id: string) => ['pantry', id] as const,
  recipes: ['recipes'] as const,
  recipe: (id: string) => ['recipes', id] as const,
  recipeCollections: ['recipes', 'collections'] as const,
  readyToCookCount: ['recipes', 'ready-to-cook-count'] as const,
  mealPlan: ['mealPlan'] as const,
  groceryList: ['groceryList'] as const,
  scanHistory: ['scans', 'history'] as const,
  user: ['user'] as const,
  kitchenImpact: ['kitchenImpact'] as const,
};
