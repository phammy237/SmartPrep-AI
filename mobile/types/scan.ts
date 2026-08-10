import { IngredientCategory, QuantityUnit } from './common';
import { FreshnessState } from './freshness';

export type ScanMode = 'quick' | 'guided';
export type ScanSection = 'quick' | 'fridge' | 'freezer' | 'pantry';
export type ScanStatus = 'capturing' | 'processing' | 'reviewing' | 'confirmed';

export interface BoundingBox {
  /** All values normalized 0-1 relative to the source image. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuantityEstimate {
  value: number;
  unit: QuantityUnit;
  /** 0-1 model confidence in the estimated quantity. */
  confidence: number;
  /** True when confidence is too low to assert a number - UI should ask the user instead. */
  isLowConfidence: boolean;
}

export interface ScanDetection {
  id: string;
  ingredientId: string;
  name: string;
  imageUri: string;
  category: IngredientCategory;
  boundingBox: BoundingBox;
  /** 0-1 confidence that this ingredient was correctly identified. */
  detectionConfidence: number;
  quantity: QuantityEstimate;
  freshness: FreshnessState;
  isUserAdded?: boolean;
  isRemoved?: boolean;
  /** True once the user has edited the AI's proposed quantity. */
  isQuantityEdited?: boolean;
  /** True once the user has confirmed or edited the AI's proposed freshness. */
  isFreshnessEdited?: boolean;
}

export interface ScanSectionResult {
  section: ScanSection;
  imageUri: string;
  detections: ScanDetection[];
  skipped: boolean;
}

export interface Scan {
  id: string;
  mode: ScanMode;
  status: ScanStatus;
  createdAt: string;
  sections: ScanSectionResult[];
}

export interface ScanConfirmSummary {
  ingredientsAdded: number;
  needsAttentionCount: number;
  quantityCorrectedCount: number;
  mealsPossibleEstimate: number;
}
