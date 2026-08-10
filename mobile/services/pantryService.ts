import { getIngredient } from '@/data';
import { FreshnessState, IngredientCategory, PantryItem, QuantityUnit } from '@/types';
import { deriveFreshnessLabel } from '@/utils/freshness';
import { generateId } from '@/utils/id';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';

export type PantryRemovalReason = 'finished' | 'discarded' | 'removed';

export interface AddPantryItemInput {
  ingredientId: string;
  quantity: number;
  unit: QuantityUnit;
  freshness: FreshnessState;
  source: PantryItem['source'];
}

export interface ManualPantryItemInput {
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
}

async function getPantry(): Promise<PantryItem[]> {
  await delay();
  return clone(db.pantry);
}

async function getPantryItem(id: string): Promise<PantryItem | null> {
  await delay(250);
  const item = db.pantry.find((p) => p.id === id);
  return item ? clone(item) : null;
}

async function updatePantryItem(
  id: string,
  patch: Partial<Pick<PantryItem, 'quantity' | 'unit' | 'category' | 'notes'>>,
): Promise<PantryItem> {
  await delay(350);
  const item = db.pantry.find((p) => p.id === id);
  if (!item) throw new Error(`Pantry item ${id} not found`);
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  return clone(item);
}

async function updatePantryItemFreshness(
  id: string,
  patch: { score?: number; confidence?: number; label?: FreshnessState['label']; estimatedUseBy?: string },
): Promise<PantryItem> {
  await delay(350);
  const item = db.pantry.find((p) => p.id === id);
  if (!item) throw new Error(`Pantry item ${id} not found`);

  const score = patch.score ?? item.freshness.score;
  const confidence = patch.confidence ?? item.freshness.confidence;
  item.freshness = {
    score,
    confidence,
    label: patch.label ?? deriveFreshnessLabel(score, confidence),
    isManualOverride: true,
    estimatedUseBy: patch.estimatedUseBy ?? item.freshness.estimatedUseBy,
  };
  item.updatedAt = new Date().toISOString();
  return clone(item);
}

async function useSomePantryItem(id: string, amountUsed: number): Promise<PantryItem | null> {
  await delay(350);
  const index = db.pantry.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Pantry item ${id} not found`);

  const item = db.pantry[index];
  const remaining = Math.max(0, Math.round((item.quantity - amountUsed) * 100) / 100);
  if (remaining <= 0) {
    db.pantry.splice(index, 1);
    return null;
  }
  item.quantity = remaining;
  item.updatedAt = new Date().toISOString();
  return clone(item);
}

async function removePantryItem(id: string, _reason: PantryRemovalReason = 'removed'): Promise<void> {
  await delay(300);
  db.pantry = db.pantry.filter((p) => p.id !== id);
}

async function addPantryItemsFromScan(inputs: AddPantryItemInput[]): Promise<PantryItem[]> {
  await delay(300);
  const now = new Date().toISOString();
  const added = inputs.map((input): PantryItem => {
    const ingredient = getIngredient(input.ingredientId);
    return {
      id: generateId('pantry'),
      ingredientId: ingredient.id,
      name: ingredient.name,
      imageUri: ingredient.imageUri,
      category: ingredient.category,
      quantity: input.quantity,
      unit: input.unit,
      freshness: input.freshness,
      addedAt: now,
      updatedAt: now,
      source: input.source,
    };
  });
  db.pantry = [...db.pantry, ...added];
  return clone(added);
}

async function addManualPantryItem(input: ManualPantryItemInput): Promise<PantryItem> {
  await delay(300);
  const now = new Date().toISOString();
  const ingredientId = generateId('ing-manual');
  const item: PantryItem = {
    id: generateId('pantry'),
    ingredientId,
    name: input.name,
    imageUri: ingredientPhotoUri(ingredientId, input.name),
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    freshness: { score: 80, confidence: 0.9, label: 'fresh' },
    addedAt: now,
    updatedAt: now,
    source: 'manual',
  };
  db.pantry = [...db.pantry, item];
  return clone(item);
}

export const pantryService = {
  getPantry,
  getPantryItem,
  updatePantryItem,
  updatePantryItemFreshness,
  useSomePantryItem,
  removePantryItem,
  addPantryItemsFromScan,
  addManualPantryItem,
};
