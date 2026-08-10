import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** No-ops on web; real devices/simulators otherwise get subtle confirmation feedback. */
export const haptics = {
  tap: () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  success: () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
