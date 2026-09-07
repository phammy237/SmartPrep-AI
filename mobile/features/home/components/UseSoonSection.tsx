import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, SectionHeader } from '@/components';
import { useTheme } from '@/hooks/useTheme';
import { RecommendationTier, SmartRecipeRecommendation } from '@/types';

interface UseSoonSectionProps {
  recommendations: SmartRecipeRecommendation[];
  isLoading: boolean;
  /** Hide entirely until the pantry has loaded, to avoid a flash of the empty state. */
  ready: boolean;
}

const TIER_META: Record<RecommendationTier, { label: string; tone: 'ready' | 'almost' | 'match' }> = {
  ready_now: { label: 'Ready now', tone: 'ready' },
  almost_ready: { label: 'Almost ready', tone: 'almost' },
  use_soon_match: { label: 'Use-soon match', tone: 'match' },
};

function TierBadge({ tier }: { tier: RecommendationTier }) {
  const theme = useTheme();
  const meta = TIER_META[tier];
  const bg =
    meta.tone === 'ready'
      ? theme.colors.accentMuted
      : meta.tone === 'almost'
        ? theme.colors.freshness.useSoonMuted
        : theme.colors.surfaceMuted;
  const fg =
    meta.tone === 'ready'
      ? theme.colors.accent
      : meta.tone === 'almost'
        ? theme.colors.freshness.useSoon
        : theme.colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[theme.typography.caption, { color: fg }]}>{meta.label}</Text>
    </View>
  );
}

function UseSoonCard({ rec }: { rec: SmartRecipeRecommendation }) {
  const theme = useTheme();
  const primary = rec.reasons.find((r) => r.code === 'uses_expiring_ingredient') ?? rec.reasons[0];
  const secondary = rec.reasons.find(
    (r) => r !== primary && (r.code === 'ready_now' || r.code === 'almost_ready' || r.code === 'missing_several'),
  );

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: `/recipes/${rec.recipeId}`,
          params: primary ? { reason: primary.text } : {},
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${rec.title}. ${rec.reasons.map((r) => r.text).join('. ')}`}
      style={({ pressed }) => [pressed && { opacity: 0.9 }]}
    >
      <Card style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <Text style={[theme.typography.headline, { color: theme.colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {rec.title}
          </Text>
          <TierBadge tier={rec.tier} />
        </View>
        {primary ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="time-outline" size={14} color={theme.colors.freshness.useSoon} />
            <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary, flex: 1 }]}>
              {primary.text}
            </Text>
          </View>
        ) : null}
        {secondary ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{secondary.text}</Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function UseSoonSection({ recommendations, isLoading, ready }: UseSoonSectionProps) {
  const theme = useTheme();
  if (!ready) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader title="Use Soon" subtitle="Cook these to use food before it's wasted" />
      {isLoading ? (
        <View style={{ paddingVertical: theme.spacing.md, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : recommendations.length === 0 ? (
        <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>
          Nothing needs urgent attention right now.
        </Text>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {recommendations.map((rec) => (
            <UseSoonCard key={rec.recipeVersionId} rec={rec} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
});
