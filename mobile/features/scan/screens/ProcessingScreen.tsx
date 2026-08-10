import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components';
import { useProcessCapture } from '@/hooks';
import { ScanMode, ScanSection } from '@/types';
import { ProcessingAnimation } from '../components/ProcessingAnimation';

export function ProcessingScreen() {
  const { mode, section, imageUri } = useLocalSearchParams<{ mode: ScanMode; section: ScanSection; imageUri: string }>();
  const processCapture = useProcessCapture();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    processCapture.mutate(
      { mode, section, imageUri },
      {
        onSuccess: () => {
          if (mode === 'guided') {
            router.replace('/scan/sections');
          } else {
            router.replace('/scan/review');
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <ProcessingAnimation />
      </View>
    </Screen>
  );
}
