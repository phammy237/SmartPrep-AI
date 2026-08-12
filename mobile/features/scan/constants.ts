import { ScanSection } from '@/types';

export const GUIDED_SECTIONS: Exclude<ScanSection, 'quick'>[] = ['fridge', 'freezer', 'pantry'];

export const SECTION_LABELS: Record<ScanSection, string> = {
  quick: 'Your Kitchen',
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
};
