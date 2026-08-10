import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Chip, ChipGroup, ConfidenceSelector, EmptyState, LoadingState, PrioritySlider, Screen, SectionHeader, TagInput } from '@/components';
import { useKitchenImpact, useUpdatePreferences, useUser } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { CookingTimePreference, DietaryPreference, SmartPrepPriorities } from '@/types';
import { KitchenImpactSection } from '../components/KitchenImpactSection';
import { ProfileHeader } from '../components/ProfileHeader';

const DIETARY_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
  { value: 'none', label: 'None' },
];

const TIME_OPTIONS: { value: CookingTimePreference; label: string }[] = [
  { value: 'under_15', label: 'Under 15 min' },
  { value: '15_30', label: '15-30 min' },
  { value: '30_60', label: '30-60 min' },
  { value: 'no_preference', label: "Doesn't matter" },
];

const PRIORITY_FIELDS: { key: keyof SmartPrepPriorities; label: string }[] = [
  { key: 'useWhatIHave', label: 'Use what I have' },
  { key: 'reduceFoodWaste', label: 'Reduce food waste' },
  { key: 'saveMoney', label: 'Save money' },
  { key: 'eatHealthier', label: 'Eat healthier' },
  { key: 'cookQuickly', label: 'Cook quickly' },
  { key: 'tryNewFoods', label: 'Try new foods' },
];

export function ProfileScreen() {
  const theme = useTheme();
  const userQuery = useUser();
  const impactQuery = useKitchenImpact();
  const updatePreferences = useUpdatePreferences();

  const [localPriorities, setLocalPriorities] = useState<SmartPrepPriorities | null>(null);
  useEffect(() => {
    if (userQuery.data && !localPriorities) {
      setLocalPriorities(userQuery.data.preferences.priorities);
    }
  }, [userQuery.data, localPriorities]);

  if (userQuery.isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading your profile..." />
      </Screen>
    );
  }

  if (!userQuery.data) {
    return (
      <Screen>
        <EmptyState icon="⚠️" title="Couldn't load profile" actionLabel="Retry" onActionPress={() => userQuery.refetch()} />
      </Screen>
    );
  }

  const { data: user } = userQuery;
  const prefs = user.preferences;

  const toggleDietary = (value: string) => {
    const v = value as DietaryPreference;
    const next =
      v === 'none'
        ? prefs.dietary.includes('none')
          ? []
          : (['none'] as DietaryPreference[])
        : (() => {
            const withoutNone = prefs.dietary.filter((d) => d !== 'none');
            return withoutNone.includes(v) ? withoutNone.filter((d) => d !== v) : [...withoutNone, v];
          })();
    updatePreferences.mutate({ dietary: next });
  };

  const toggleAllergy = (value: string) => {
    const next = prefs.allergies.includes(value)
      ? prefs.allergies.filter((a) => a !== value)
      : [...prefs.allergies, value];
    updatePreferences.mutate({ allergies: next });
  };

  const toggleCuisine = (value: string) => {
    const next = prefs.favoriteCuisines.includes(value)
      ? prefs.favoriteCuisines.filter((c) => c !== value)
      : [...prefs.favoriteCuisines, value];
    updatePreferences.mutate({ favoriteCuisines: next });
  };

  const toggleDisliked = (value: string) => {
    const next = prefs.dislikedFoods.includes(value)
      ? prefs.dislikedFoods.filter((f) => f !== value)
      : [...prefs.dislikedFoods, value];
    updatePreferences.mutate({ dislikedFoods: next });
  };

  return (
    <Screen scroll header edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: theme.spacing.xs, gap: theme.spacing.xl }}>
      <ProfileHeader name={user.name} email={user.email} initials={user.avatarInitials} />

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Dietary Preferences" />
        <ChipGroup options={DIETARY_OPTIONS} selected={prefs.dietary} onToggle={toggleDietary} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Allergies" />
        <ChipGroup
          options={prefs.allergies.map((a) => ({ value: a, label: a }))}
          selected={prefs.allergies}
          onToggle={toggleAllergy}
        />
        <TagInput placeholder="Add an allergy" onAdd={toggleAllergy} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Favorite Cuisines" />
        <ChipGroup
          options={prefs.favoriteCuisines.map((c) => ({ value: c, label: c }))}
          selected={prefs.favoriteCuisines}
          onToggle={toggleCuisine}
        />
        <TagInput placeholder="Add a cuisine" onAdd={toggleCuisine} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Foods to Avoid" />
        <ChipGroup
          options={prefs.dislikedFoods.map((f) => ({ value: f, label: f }))}
          selected={prefs.dislikedFoods}
          onToggle={toggleDisliked}
        />
        <TagInput placeholder="Add a food to avoid" onAdd={toggleDisliked} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Cooking Time" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TIME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={prefs.cookingTime === option.value}
              onPress={() => updatePreferences.mutate({ cookingTime: option.value })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Cooking Confidence" />
        <ConfidenceSelector
          value={prefs.cookingConfidence}
          onChange={(value) => updatePreferences.mutate({ cookingConfidence: value })}
        />
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        <SectionHeader title="SmartPrep Priorities" subtitle="Shapes how we recommend meals" />
        {localPriorities
          ? PRIORITY_FIELDS.map((field) => (
              <PrioritySlider
                key={field.key}
                label={field.label}
                value={localPriorities[field.key]}
                onChange={(value) => setLocalPriorities((prev) => (prev ? { ...prev, [field.key]: value } : prev))}
                onCommit={(value) => {
                  const next = { ...(localPriorities as SmartPrepPriorities), [field.key]: value };
                  setLocalPriorities(next);
                  updatePreferences.mutate({ priorities: next });
                }}
              />
            ))
          : null}
      </View>

      {impactQuery.data ? <KitchenImpactSection impact={impactQuery.data} /> : null}

      {!prefs.allergies.length && !prefs.favoriteCuisines.length && !prefs.dislikedFoods.length ? (
        <Text style={[theme.typography.footnote, { color: theme.colors.textTertiary }]}>
          Add allergies, cuisines, and foods to avoid above to fine-tune your recommendations.
        </Text>
      ) : null}
    </Screen>
  );
}
