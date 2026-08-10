import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

const PHRASES = ['Detecting ingredients...', 'Estimating quantities...', 'Checking freshness...'];

export function ProcessingAnimation() {
  const theme = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    const interval = setInterval(() => setPhraseIndex((i) => (i + 1) % PHRASES.length), 900);
    return () => {
      loop.stop();
      clearInterval(interval);
    };
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
      <Animated.View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          borderWidth: 4,
          borderColor: theme.colors.accentMuted,
          borderTopColor: theme.colors.accent,
          transform: [{ rotate }],
        }}
      />
      <Text style={[theme.typography.title3, { color: theme.colors.textPrimary }]}>{PHRASES[phraseIndex]}</Text>
    </View>
  );
}
