import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { BarChart, Button, Card, Chip, EmptyState, ListRow, LoadingState, MacroBar, ProgressRing, Screen } from '@/components';
import { DAY_LABELS, DAY_ORDER } from '@/features/planner/constants';
import { useCorrectMealLog, useKitchenImpact, useMealLogs, useQuickAddMealLog, useUser, useVoidMealLog } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import { MealLog } from '@/types';
import { generateId } from '@/utils/id';
import { addDaysToIsoDate, todayIsoDateInTimeZone } from '@/utils/expiration';
import { formatNumber } from '@/utils/format';
import { macroPercent } from '@/utils/nutrition';
import { dailyNutritionTotal, localWeekRange, sumNutritionSnapshots } from '@/utils/nutritionSnapshot';
import { CorrectMealLogModal } from '../components/CorrectMealLogModal';
import { QuickAddMealLogModal } from '../components/QuickAddMealLogModal';

type Period = 'today' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const NUTRITION_STATUS_LABEL: Record<string, string> = {
  verified: 'Verified',
  estimated: 'Estimated',
  incomplete: 'Incomplete',
};

function firstOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function daysInMonth(dateIso: string): number {
  const [y, m] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function lastOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-${String(daysInMonth(dateIso)).padStart(2, '0')}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function NutritionProgressScreen() {
  const theme = useTheme();
  const userQuery = useUser();
  const voidLog = useVoidMealLog();
  const quickAdd = useQuickAddMealLog();
  const correctLog = useCorrectMealLog();
  const [period, setPeriod] = useState<Period>('week');
  const impactQuery = useKitchenImpact(period);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [correctingLog, setCorrectingLog] = useState<MealLog | null>(null);

  const timeZone = userQuery.data?.timezone ?? 'UTC';
  const today = todayIsoDateInTimeZone(timeZone);
  const { weekStart, weekEnd } = localWeekRange(new Date(), timeZone);
  const monthStart = firstOfMonth(today);
  const monthEnd = lastOfMonth(today);

  const range =
    period === 'today' ? { start: today, end: today } : period === 'week' ? { start: weekStart, end: weekEnd } : { start: monthStart, end: monthEnd };
  const periodDays = period === 'today' ? 1 : period === 'week' ? 7 : daysInMonth(today);

  const periodLogsQuery = useMealLogs(range.start, range.end);
  // The trend chart is always Mon-Sun regardless of the selected period.
  const weekLogsQuery = useMealLogs(weekStart, weekEnd);

  const activePeriodLogs = useMemo(() => (periodLogsQuery.data ?? []).filter((log) => !log.voidedAt), [periodLogsQuery.data]);
  const activeWeekLogs = useMemo(() => (weekLogsQuery.data ?? []).filter((log) => !log.voidedAt), [weekLogsQuery.data]);

  // activePeriodLogs is already scoped to [range.start, range.end] by the
  // query itself, so summing all of them directly is the period total.
  const consumedTotal = useMemo(
    () => sumNutritionSnapshots(activePeriodLogs.map((log) => log.nutritionSnapshot)),
    [activePeriodLogs],
  );

  const goals = userQuery.data?.preferences.nutritionGoals;
  const goalForPeriod = goals
    ? {
        dailyCalories: goals.dailyCalories * periodDays,
        proteinG: goals.proteinG * periodDays,
        carbsG: goals.carbsG * periodDays,
        fatG: goals.fatG * periodDays,
      }
    : null;

  const percent = goalForPeriod ? Math.min(100, macroPercent(consumedTotal.calories ?? 0, goalForPeriod.dailyCalories)) : 0;

  const chartData = useMemo(
    () =>
      DAY_ORDER.map((day, index) => {
        const date = addDaysToIsoDate(weekStart, index);
        const dayTotal = dailyNutritionTotal(
          activeWeekLogs.map((log) => ({ localDate: log.localDate, nutritionSnapshot: log.nutritionSnapshot })),
          date,
        );
        return { label: DAY_LABELS[day].slice(0, 3), value: dayTotal.calories ?? 0, highlighted: date === today };
      }),
    [activeWeekLogs, weekStart, today],
  );

  const recentLogs = useMemo(
    () => [...activePeriodLogs].sort((a, b) => b.consumedAt.localeCompare(a.consumedAt)).slice(0, 12),
    [activePeriodLogs],
  );

  const isLoading = userQuery.isLoading || periodLogsQuery.isLoading;

  if (isLoading) {
    return (
      <Screen>
        <LoadingState fullscreen message="Loading your nutrition..." />
      </Screen>
    );
  }

  if (!userQuery.data || !goals || !goalForPeriod) {
    return (
      <Screen>
        <EmptyState title="Couldn't load nutrition" actionLabel="Retry" onActionPress={() => userQuery.refetch()} />
      </Screen>
    );
  }

  const handleRemoveLog = (logId: string) => {
    Alert.alert('Remove log?', 'This removes it from your totals. It stays in history as voided, not deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => voidLog.mutate({ mealLogId: logId, reason: 'removed_by_user' }) },
    ]);
  };

  return (
    <Screen scroll edges={['top', 'left', 'right']} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.title1, { color: theme.colors.textPrimary }]}>Nutrition & Progress</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PERIODS.map((option) => (
          <Chip key={option.value} label={option.label} selected={period === option.value} onPress={() => setPeriod(option.value)} />
        ))}
      </View>

      <Card>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <ProgressRing progress={percent} size={96} strokeWidth={9}>
            <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{percent}%</Text>
          </ProgressRing>
          <Text style={[theme.typography.footnote, { color: theme.colors.textSecondary }]}>
            {formatNumber(Math.round(consumedTotal.calories ?? 0))} of {formatNumber(Math.round(goalForPeriod.dailyCalories))} kcal
          </Text>
          {consumedTotal.incompleteFields.length > 0 ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
              Some logged meals have incomplete nutrition - totals may be an undercount.
            </Text>
          ) : null}
        </View>
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          <MacroBar label="Protein" value={consumedTotal.proteinG ?? 0} goal={goalForPeriod.proteinG} />
          <MacroBar label="Carbs" value={consumedTotal.carbsG ?? 0} goal={goalForPeriod.carbsG} color={theme.colors.freshness.useSoon} />
          <MacroBar label="Fat" value={consumedTotal.fatG ?? 0} goal={goalForPeriod.fatG} color={theme.colors.secondary} />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Quick Add" variant="secondary" onPress={() => setQuickAddVisible(true)} fullWidth />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Leftovers" variant="ghost" onPress={() => router.push('/prepared-meals')} fullWidth />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Weekly trend (kcal)</Text>
        <Card>
          <BarChart data={chartData} goal={goals.dailyCalories} />
        </Card>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headline, { color: theme.colors.textPrimary }]}>Recent</Text>
        {recentLogs.length === 0 ? (
          <Card>
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Nothing logged for this period yet.</Text>
          </Card>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: theme.spacing.md }}>
            {recentLogs.map((log, index) => {
              const caloriesLabel = log.nutritionSnapshot.calories != null ? `${Math.round(log.nutritionSnapshot.calories)} kcal` : 'Calories unknown';
              const statusLabel = NUTRITION_STATUS_LABEL[log.nutritionStatus];
              return (
                <ListRow
                  key={log.id}
                  title={`${capitalize(log.mealType)} · ${caloriesLabel}`}
                  subtitle={`${statusLabel}${log.notes ? ` · ${log.notes}` : ''}`}
                  isLast={index === recentLogs.length - 1}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                      <Pressable onPress={() => setCorrectingLog(log)} accessibilityRole="button" accessibilityLabel="Correct log" hitSlop={8}>
                        <Ionicons name="create-outline" size={20} color={theme.colors.textTertiary} />
                      </Pressable>
                      <Pressable onPress={() => handleRemoveLog(log.id)} accessibilityRole="button" accessibilityLabel="Remove log" hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={20} color={theme.colors.textTertiary} />
                      </Pressable>
                    </View>
                  }
                />
              );
            })}
          </Card>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="restaurant-outline" size={22} color={theme.colors.freshness.useSoon} />
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
            {impactQuery.data ? impactQuery.data.cookingSessionsCount : '—'}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Meals cooked</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="basket-outline" size={22} color={theme.colors.accent} />
          <Text style={[theme.typography.title2, { color: theme.colors.textPrimary }]}>
            {impactQuery.data ? impactQuery.data.useEventCount : '—'}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Pantry-use events</Text>
        </Card>
      </View>

      <QuickAddMealLogModal
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        submitting={quickAdd.isPending}
        onAdd={({ mealType, nutrition, notes }) =>
          quickAdd.mutate({ mealType, nutrition, notes, idempotencyKey: generateId('quickadd') })
        }
      />

      <CorrectMealLogModal
        visible={!!correctingLog}
        log={correctingLog}
        onClose={() => setCorrectingLog(null)}
        submitting={correctLog.isPending}
        onSubmit={(input) => {
          if (!correctingLog) return;
          correctLog.mutate(
            { mealLogId: correctingLog.id, newIdempotencyKey: generateId('correct-log'), ...input },
            {
              onSuccess: () => setCorrectingLog(null),
              onError: (error) => {
                const message = error instanceof Error ? error.message : 'Please try again.';
                Alert.alert('Could not save correction', message);
              },
            },
          );
        }}
      />
    </Screen>
  );
}
