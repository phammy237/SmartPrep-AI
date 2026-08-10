import { QuantityUnit } from '@/types';

const PLURAL_UNITS = new Set<QuantityUnit>(['item', 'container', 'bag', 'bottle', 'can', 'package', 'serving']);

export function formatQuantity(value: number, unit: QuantityUnit): string {
  if (PLURAL_UNITS.has(unit)) {
    const noun = unit === 'item' ? '' : ` ${unit}${value === 1 ? '' : 's'}`;
    return `${formatNumber(value)}${noun}`;
  }
  return `${formatNumber(value)} ${unit}`;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatRelativeDay(isoDate: string): string {
  const target = new Date(isoDate);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(target) - startOfDay(now)) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return target.toLocaleDateString('en-US', { weekday: 'long' });
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
