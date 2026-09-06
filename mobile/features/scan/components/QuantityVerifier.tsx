import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Stepper } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { QuantityEstimate } from '@/types';
import { formatQuantity } from '@/utils/format';

interface QuantityVerifierProps {
  quantity: QuantityEstimate;
  onChange: (value: number) => void;
}

/**
 * AI proposes, user confirms: shows the estimate as a claim to accept or
 * correct, rather than presenting it as fact. Low-confidence estimates skip
 * straight to asking the user, since there's no confident guess to confirm.
 */
export function QuantityVerifier({ quantity, onChange }: QuantityVerifierProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(quantity.isLowConfidence);
  const [confirmed, setConfirmed] = useState(false);

  if (!editing) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
          AI estimate: {formatQuantity(quantity.value, quantity.unit)}
        </Text>
        {confirmed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent} />
            <Text style={[theme.typography.footnote, { color: theme.colors.accent }]}>Confirmed</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Correct" size="md" variant="secondary" onPress={() => setConfirmed(true)} />
            <Button label="Change" size="md" variant="ghost" onPress={() => setEditing(true)} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      {quantity.isLowConfidence ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.freshness.useSoon }]}>
          We aren't sure how much is here. Set the amount, then confirm.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Stepper value={quantity.value} onChange={onChange} accessibilityLabel="quantity" />
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{quantity.unit}</Text>
      </View>
      {/* Confirm the current amount without nudging the stepper. */}
      <Button label="This amount is right" size="md" variant="secondary" onPress={() => onChange(quantity.value)} />
    </View>
  );
}
