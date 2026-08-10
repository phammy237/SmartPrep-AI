import { FreshnessState, PantryItem } from '@/types';
import { deriveFreshnessLabel } from '@/utils/freshness';
import { getIngredient } from './ingredients';

function freshness(score: number, confidence: number, estimatedUseBy?: string): FreshnessState {
  return { score, confidence, label: deriveFreshnessLabel(score, confidence), estimatedUseBy };
}

function daysAgo(days: number): string {
  const d = new Date('2026-08-09T08:00:00.000Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

interface Seed {
  ingredientId: string;
  quantity: number;
  unit?: PantryItem['unit'];
  score: number;
  confidence: number;
  estimatedUseBy?: string;
  addedDaysAgo: number;
  source?: PantryItem['source'];
}

const seeds: Seed[] = [
  // Produce
  { ingredientId: 'ing-spinach', quantity: 1, score: 22, confidence: 0.84, estimatedUseBy: 'Use today', addedDaysAgo: 5 },
  { ingredientId: 'ing-avocado', quantity: 3, score: 45, confidence: 0.78, estimatedUseBy: 'Use in 1-2 days', addedDaysAgo: 3 },
  { ingredientId: 'ing-strawberries', quantity: 1, score: 52, confidence: 0.75, estimatedUseBy: 'Use in 2-3 days', addedDaysAgo: 2 },
  { ingredientId: 'ing-tomato', quantity: 4, score: 58, confidence: 0.82, estimatedUseBy: 'Use in 2-3 days', addedDaysAgo: 4 },
  { ingredientId: 'ing-garlic', quantity: 1, score: 92, confidence: 0.95, addedDaysAgo: 10 },
  { ingredientId: 'ing-onion', quantity: 3, score: 88, confidence: 0.9, addedDaysAgo: 8 },
  { ingredientId: 'ing-bell-pepper', quantity: 2, score: 72, confidence: 0.83, addedDaysAgo: 3 },
  { ingredientId: 'ing-carrot', quantity: 6, score: 80, confidence: 0.9, addedDaysAgo: 6 },
  { ingredientId: 'ing-broccoli', quantity: 1, score: 55, confidence: 0.79, estimatedUseBy: 'Use in 2-3 days', addedDaysAgo: 3 },
  { ingredientId: 'ing-basil', quantity: 1, score: 40, confidence: 0.5, addedDaysAgo: 4 },

  // Protein
  { ingredientId: 'ing-eggs', quantity: 8, score: 82, confidence: 0.91, addedDaysAgo: 5 },
  { ingredientId: 'ing-chicken-breast', quantity: 1.5, unit: 'lb', score: 62, confidence: 0.85, estimatedUseBy: 'Use in 1-2 days', addedDaysAgo: 2 },
  { ingredientId: 'ing-ground-beef', quantity: 1, unit: 'lb', score: 58, confidence: 0.8, estimatedUseBy: 'Use in 1-2 days', addedDaysAgo: 2 },
  { ingredientId: 'ing-black-beans', quantity: 2, unit: 'can', score: 96, confidence: 0.97, addedDaysAgo: 20 },
  { ingredientId: 'ing-tofu', quantity: 1, score: 60, confidence: 0.8, estimatedUseBy: 'Use in 2-3 days', addedDaysAgo: 3 },

  // Dairy
  { ingredientId: 'ing-milk', quantity: 1, score: 54, confidence: 0.85, estimatedUseBy: 'Use in 2-3 days', addedDaysAgo: 5 },
  { ingredientId: 'ing-greek-yogurt', quantity: 1, score: 75, confidence: 0.88, addedDaysAgo: 4 },
  { ingredientId: 'ing-butter', quantity: 1, score: 95, confidence: 0.95, addedDaysAgo: 12 },
  { ingredientId: 'ing-cheddar', quantity: 1, score: 78, confidence: 0.87, addedDaysAgo: 6 },

  // Pantry
  { ingredientId: 'ing-pasta', quantity: 2, score: 98, confidence: 0.99, addedDaysAgo: 30 },
  { ingredientId: 'ing-rice', quantity: 1, score: 97, confidence: 0.98, addedDaysAgo: 40 },
  { ingredientId: 'ing-olive-oil', quantity: 1, score: 96, confidence: 0.97, addedDaysAgo: 25 },
  { ingredientId: 'ing-canned-tomatoes', quantity: 3, unit: 'can', score: 95, confidence: 0.96, addedDaysAgo: 30 },
  { ingredientId: 'ing-bread', quantity: 1, score: 48, confidence: 0.82, estimatedUseBy: 'Use in 1-2 days', addedDaysAgo: 4 },
  { ingredientId: 'ing-honey', quantity: 1, score: 99, confidence: 0.99, addedDaysAgo: 60 },

  // Frozen
  { ingredientId: 'ing-frozen-peas', quantity: 1, score: 90, confidence: 0.92, addedDaysAgo: 15 },
  { ingredientId: 'ing-frozen-berries', quantity: 1, score: 91, confidence: 0.9, addedDaysAgo: 18 },
  { ingredientId: 'ing-frozen-corn', quantity: 1, score: 89, confidence: 0.9, addedDaysAgo: 15 },

  // Other
  { ingredientId: 'ing-salt', quantity: 1, score: 100, confidence: 0.99, addedDaysAgo: 90 },
  { ingredientId: 'ing-black-pepper', quantity: 1, score: 100, confidence: 0.99, addedDaysAgo: 90 },
];

export const MOCK_PANTRY: PantryItem[] = seeds.map((seed, index) => {
  const ingredient = getIngredient(seed.ingredientId);
  const addedAt = daysAgo(seed.addedDaysAgo);
  return {
    id: `pantry-${index + 1}`,
    ingredientId: ingredient.id,
    name: ingredient.name,
    imageUri: ingredient.imageUri,
    category: ingredient.category,
    quantity: seed.quantity,
    unit: seed.unit ?? ingredient.defaultUnit,
    freshness: freshness(seed.score, seed.confidence, seed.estimatedUseBy),
    addedAt,
    updatedAt: addedAt,
    source: seed.source ?? 'scan',
  };
});
