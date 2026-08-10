import { MOCK_KITCHEN_IMPACT } from '@/data';
import { KitchenImpact } from '@/types';
import { clone, delay } from './apiSimulation';

async function getKitchenImpact(): Promise<KitchenImpact> {
  await delay(300);
  return clone(MOCK_KITCHEN_IMPACT);
}

export const impactService = {
  getKitchenImpact,
};
