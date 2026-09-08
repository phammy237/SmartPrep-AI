import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Chip, EmptyState, Screen, Stepper, TextField } from '@/components';
import { useBeginReceiptReview, useConfirmReceiptItems } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { toUserSafeAuthMessage } from '@/lib/errors';
import { ConfirmReceiptItemInput } from '@/lib/validation/receiptSchemas';
import { useReceiptSessionStore } from '@/store';
import { IngredientCategory, QuantityUnit, ReceiptIntakeCandidate } from '@/types';

const CATEGORY_OPTIONS: IngredientCategory[] = ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other'];
const UNIT_OPTIONS: QuantityUnit[] = ['item', 'lb', 'oz', 'kg', 'g', 'bag', 'bottle', 'can', 'package', 'ml', 'L'];

interface Row {
  candidateId: string;
  rawText: string;
  selected: boolean;
  displayName: string;
  quantity: number;
  unit: QuantityUnit | undefined;
  category: IngredientCategory;
  confidence: ReceiptIntakeCandidate['confidence'];
  needsReview: boolean;
}

function toRow(c: ReceiptIntakeCandidate): Row {
  return {
    candidateId: c.candidateId,
    rawText: c.rawText,
    selected: c.selected,
    displayName: c.displayName,
    quantity: c.quantity ?? 1,
    unit: c.unit,
    category: c.category,
    confidence: c.confidence,
    needsReview: c.status === 'needs_review',
  };
}

export function ReceiptReviewScreen() {
  const theme = useTheme();
  const ocr = useReceiptSessionStore((s) => s.ocr);
  const candidates = useReceiptSessionStore((s) => s.candidates);
  const clientReceiptId = useReceiptSessionStore((s) => s.clientReceiptId);
  const clear = useReceiptSessionStore((s) => s.clear);

  const begin = useBeginReceiptReview();
  const confirm = useConfirmReceiptItems();

  const [rows, setRows] = useState<Row[]>(() => candidates.map(toRow));
  const [purchaseDate, setPurchaseDate] = useState(ocr?.receiptDate ?? '');
  const [receiptScanId, setReceiptScanId] = useState<string | null>(null);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const beganRef = useRef(false);

  useEffect(() => {
    if (beganRef.current || !clientReceiptId || !ocr) return;
    beganRef.current = true;
    begin.mutate(
      { clientReceiptId, ocr, candidates },
      { onSuccess: (state) => setReceiptScanId(state.receiptScanId) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientReceiptId, ocr]);

  const patch = (id: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.candidateId === id ? { ...r, ...next } : r)));

  const selectedRows = rows.filter((r) => r.selected);
  const missingUnit = selectedRows.some((r) => !r.unit);

  const submit = () => {
    if (!receiptScanId || selectedRows.length === 0 || missingUnit) return;
    const items: ConfirmReceiptItemInput[] = selectedRows.map((r) => ({
      receiptScanId,
      candidateId: r.candidateId,
      rawText: r.rawText.slice(0, 300),
      displayName: r.displayName.trim(),
      category: r.category,
      quantity: r.quantity,
      unit: r.unit as QuantityUnit,
      purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? purchaseDate : undefined,
    }));
    const skippedCandidateIds = rows.filter((r) => !r.selected).map((r) => r.candidateId);

    confirm.mutate(
      { receiptScanId, items, skippedCandidateIds },
      {
        onSuccess: (result) => {
          if (result.failed.length === 0) {
            clear();
            router.replace('/(tabs)/pantry');
            return;
          }
          // Keep ONLY the failed candidates selected so "Add" retries just them.
          const failedIds = new Set(result.failed.map((f) => f.candidateId));
          setRows((rs) => rs.map((r) => ({ ...r, selected: failedIds.has(r.candidateId) })));
          setBatchNote(`${result.created.length} added · ${result.failed.length} still need a retry.`);
        },
        onError: (e) => Alert.alert("Couldn't add items", toUserSafeAuthMessage(e)),
      },
    );
  };

  const totalFound = useMemo(() => candidates.length, [candidates]);

  if (!ocr) {
    return (
      <Screen>
        <EmptyState title="Nothing to review" message="Scan a receipt to get started." />
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Review receipt</Text>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            {[ocr.merchantName, ocr.receiptDate].filter(Boolean).join(' · ') || 'Grocery receipt'} ·{' '}
            {totalFound} possible grocery item{totalFound === 1 ? '' : 's'} found
          </Text>
        </View>
      </View>

      <TextField
        label="Purchase date (applies to every selected item)"
        value={purchaseDate}
        onChangeText={setPurchaseDate}
        placeholder="YYYY-MM-DD"
      />

      {rows.length === 0 ? (
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          No grocery items were picked out. Go back and retake the photo, or add items manually.
        </Text>
      ) : (
        rows.map((r) => (
          <View
            key={r.candidateId}
            style={{
              gap: 8,
              paddingVertical: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              opacity: r.selected ? 1 : 0.55,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => patch(r.candidateId, { selected: !r.selected })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.selected }}
                accessibilityLabel={`Include ${r.displayName}`}
              >
                <Ionicons
                  name={r.selected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={r.selected ? theme.colors.accent : theme.colors.textTertiary}
                />
              </Pressable>
              <View style={{ flex: 1 }}>
                <TextField value={r.displayName} onChangeText={(t) => patch(r.candidateId, { displayName: t })} placeholder="Item name" />
              </View>
            </View>

            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>From receipt: “{r.rawText}”</Text>

            {r.needsReview || r.confidence !== 'high' ? (
              <Text style={[theme.typography.caption, { color: theme.colors.freshness.prioritize }]}>
                Check this item{r.confidence === 'low' ? ' — low OCR confidence' : ''}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flexWrap: 'wrap' }}>
              <Stepper value={r.quantity} onChange={(v) => patch(r.candidateId, { quantity: v })} min={0} step={1} accessibilityLabel={`quantity for ${r.displayName}`} />
              {UNIT_OPTIONS.map((u) => (
                <Chip key={u} label={u} selected={r.unit === u} onPress={() => patch(r.candidateId, { unit: u })} />
              ))}
            </View>
            {r.selected && !r.unit ? (
              <Text style={[theme.typography.caption, { color: theme.colors.freshness.prioritize }]}>Pick a unit before adding.</Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORY_OPTIONS.map((c) => (
                <Chip key={c} label={c} selected={r.category === c} onPress={() => patch(r.candidateId, { category: c })} />
              ))}
            </View>
          </View>
        ))
      )}

      {batchNote ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>{batchNote}</Text>
      ) : null}

      <Button
        label={
          selectedRows.length === 0
            ? 'Select items to add'
            : missingUnit
              ? 'Pick a unit for every selected item'
              : `Add ${selectedRows.length} item${selectedRows.length === 1 ? '' : 's'} to Pantry`
        }
        onPress={submit}
        disabled={selectedRows.length === 0 || missingUnit || !receiptScanId}
        loading={confirm.isPending || begin.isPending}
        fullWidth
      />
    </Screen>
  );
}
