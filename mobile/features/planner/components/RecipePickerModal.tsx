import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { IngredientAvatar, LoadingState, Screen } from '@/components';
import { useRecipes } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';

interface RecipePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (recipeId: string) => void;
}

export function RecipePickerModal({ visible, onClose, onSelect }: RecipePickerModalProps) {
  const theme = useTheme();
  const recipesQuery = useRecipes();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen edges={['top', 'left', 'right']}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: theme.spacing.lg,
          }}
        >
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>Choose a Recipe</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        {recipesQuery.isLoading ? (
          <LoadingState fullscreen message="Loading recipes..." />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, gap: 4 }}>
            {recipesQuery.data?.map((recipe) => (
              <Pressable
                key={recipe.id}
                onPress={() => {
                  onSelect(recipe.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={recipe.title}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.sm, borderRadius: theme.radius.md },
                  pressed && { backgroundColor: theme.colors.surfaceMuted },
                ]}
              >
                <IngredientAvatar imageUri={recipe.imageUri} variant="row" />
                <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textPrimary, flex: 1 }]}>
                  {recipe.title}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                  {recipe.smartMatchScore} Match
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Screen>
    </Modal>
  );
}
