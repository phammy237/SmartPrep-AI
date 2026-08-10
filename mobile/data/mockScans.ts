import { BoundingBox, FreshnessState, QuantityEstimate, Scan, ScanDetection } from '@/types';
import { deriveFreshnessLabel } from '@/utils/freshness';
import { placeholderPhotoUri } from '@/utils/ingredientPhoto';
import { getIngredient } from './ingredients';

function gridBoxes(count: number): BoundingBox[] {
  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gap = 0.035;
  const cellW = (1 - gap * (cols + 1)) / cols;
  const cellH = (1 - gap * (rows + 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      x: gap + col * (cellW + gap),
      y: gap + row * (cellH + gap),
      width: cellW,
      height: cellH,
    };
  });
}

function freshnessOf(score: number, confidence: number, estimatedUseBy?: string): FreshnessState {
  return { score, confidence, label: deriveFreshnessLabel(score, confidence), estimatedUseBy };
}

function quantityOf(value: number, unit: QuantityEstimate['unit'], confidence: number): QuantityEstimate {
  return { value, unit, confidence, isLowConfidence: confidence < 0.6 };
}

interface DetectionSeed {
  ingredientId: string;
  detectionConfidence: number;
  quantity: QuantityEstimate;
  freshness: FreshnessState;
}

function buildDetections(prefix: string, seeds: DetectionSeed[]): ScanDetection[] {
  const boxes = gridBoxes(seeds.length);
  return seeds.map((seed, index) => {
    const ingredient = getIngredient(seed.ingredientId);
    return {
      id: `${prefix}-det-${index + 1}`,
      ingredientId: ingredient.id,
      name: ingredient.name,
      imageUri: ingredient.imageUri,
      category: ingredient.category,
      boundingBox: boxes[index],
      detectionConfidence: seed.detectionConfidence,
      quantity: seed.quantity,
      freshness: seed.freshness,
    };
  });
}

/** Single-photo Quick Scan demo detections - mirrors the spec's worked example. */
export const QUICK_SCAN_DETECTIONS: ScanDetection[] = buildDetections('quick', [
  {
    ingredientId: 'ing-avocado',
    detectionConfidence: 0.94,
    quantity: quantityOf(3, 'item', 0.82),
    freshness: freshnessOf(45, 0.78, 'Use in 1-2 days'),
  },
  {
    ingredientId: 'ing-eggs',
    detectionConfidence: 0.91,
    quantity: quantityOf(8, 'item', 0.9),
    freshness: freshnessOf(82, 0.91),
  },
  {
    ingredientId: 'ing-spinach',
    detectionConfidence: 0.86,
    quantity: quantityOf(1, 'bag', 0.42),
    freshness: freshnessOf(50, 0.48),
  },
  {
    ingredientId: 'ing-milk',
    detectionConfidence: 0.88,
    quantity: quantityOf(1, 'L', 0.85),
    freshness: freshnessOf(54, 0.85, 'Use in 2-3 days'),
  },
  {
    ingredientId: 'ing-strawberries',
    detectionConfidence: 0.79,
    quantity: quantityOf(1, 'container', 0.71),
    freshness: freshnessOf(52, 0.75, 'Use in 2-3 days'),
  },
]);

/** Guided Full Kitchen Scan demo detections, keyed by section. */
export const GUIDED_SCAN_SECTIONS: Record<'fridge' | 'freezer' | 'pantry', ScanDetection[]> = {
  fridge: buildDetections('fridge', [
    {
      ingredientId: 'ing-spinach',
      detectionConfidence: 0.86,
      quantity: quantityOf(1, 'bag', 0.42),
      freshness: freshnessOf(24, 0.8, 'Use today'),
    },
    {
      ingredientId: 'ing-avocado',
      detectionConfidence: 0.94,
      quantity: quantityOf(3, 'item', 0.82),
      freshness: freshnessOf(45, 0.78, 'Use in 1-2 days'),
    },
    {
      ingredientId: 'ing-eggs',
      detectionConfidence: 0.91,
      quantity: quantityOf(8, 'item', 0.9),
      freshness: freshnessOf(82, 0.91),
    },
    {
      ingredientId: 'ing-milk',
      detectionConfidence: 0.88,
      quantity: quantityOf(1, 'L', 0.85),
      freshness: freshnessOf(54, 0.85, 'Use in 2-3 days'),
    },
    {
      ingredientId: 'ing-bell-pepper',
      detectionConfidence: 0.9,
      quantity: quantityOf(2, 'item', 0.8),
      freshness: freshnessOf(74, 0.85),
    },
    {
      ingredientId: 'ing-tomato',
      detectionConfidence: 0.85,
      quantity: quantityOf(4, 'item', 0.76),
      freshness: freshnessOf(60, 0.8, 'Use in 2-3 days'),
    },
    {
      ingredientId: 'ing-greek-yogurt',
      detectionConfidence: 0.77,
      quantity: quantityOf(1, 'container', 0.68),
      freshness: freshnessOf(75, 0.85),
    },
  ]),
  freezer: buildDetections('freezer', [
    {
      ingredientId: 'ing-frozen-peas',
      detectionConfidence: 0.89,
      quantity: quantityOf(1, 'bag', 0.85),
      freshness: freshnessOf(90, 0.9),
    },
    {
      ingredientId: 'ing-frozen-berries',
      detectionConfidence: 0.87,
      quantity: quantityOf(1, 'bag', 0.83),
      freshness: freshnessOf(91, 0.88),
    },
    {
      ingredientId: 'ing-ice-cream',
      detectionConfidence: 0.72,
      quantity: quantityOf(1, 'container', 0.55),
      freshness: freshnessOf(50, 0.5),
    },
  ]),
  pantry: buildDetections('pantry', [
    {
      ingredientId: 'ing-pasta',
      detectionConfidence: 0.95,
      quantity: quantityOf(2, 'package', 0.9),
      freshness: freshnessOf(98, 0.97),
    },
    {
      ingredientId: 'ing-rice',
      detectionConfidence: 0.93,
      quantity: quantityOf(1, 'bag', 0.88),
      freshness: freshnessOf(97, 0.95),
    },
    {
      ingredientId: 'ing-olive-oil',
      detectionConfidence: 0.9,
      quantity: quantityOf(1, 'bottle', 0.86),
      freshness: freshnessOf(96, 0.93),
    },
    {
      ingredientId: 'ing-canned-tomatoes',
      detectionConfidence: 0.88,
      quantity: quantityOf(3, 'can', 0.84),
      freshness: freshnessOf(95, 0.92),
    },
    {
      ingredientId: 'ing-bread',
      detectionConfidence: 0.84,
      quantity: quantityOf(1, 'item', 0.8),
      freshness: freshnessOf(48, 0.8, 'Use in 1-2 days'),
    },
    {
      ingredientId: 'ing-honey',
      detectionConfidence: 0.81,
      quantity: quantityOf(1, 'bottle', 0.78),
      freshness: freshnessOf(99, 0.9),
    },
  ]),
};

const historyImage = (seed: string) => placeholderPhotoUri(seed, 900, 1200);

export const MOCK_SCAN_HISTORY: Scan[] = [
  {
    id: 'scan-history-1',
    mode: 'guided',
    status: 'confirmed',
    createdAt: '2026-07-28T16:20:00.000Z',
    sections: [
      { section: 'fridge', imageUri: historyImage('scan-history-fridge'), detections: GUIDED_SCAN_SECTIONS.fridge, skipped: false },
      { section: 'freezer', imageUri: historyImage('scan-history-freezer'), detections: GUIDED_SCAN_SECTIONS.freezer, skipped: false },
      { section: 'pantry', imageUri: historyImage('scan-history-pantry'), detections: GUIDED_SCAN_SECTIONS.pantry, skipped: false },
    ],
  },
];
